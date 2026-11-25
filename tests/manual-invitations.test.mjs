import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

for (const mailProvider of ['development', 'none']) {
 test(`suppressed mail (${mailProvider}) supports private ordered signing and revocation`, async () => {
  const h = await harness({ mailProvider })
  try {
   if (mailProvider === 'none') {
    // Seed the grant that rer signin writes through the deploy account's D1 API.
    const token = randomBytes(32).toString('base64url')
    const digest = createHash('sha256').update('owner-signin\0' + token).digest('hex')
    const at = Date.now()
    await h.db.prepare(`INSERT INTO oa_owner_signins(id, token_hash, operator_id, operator_version, created_at, expires_at)
      SELECT ?, ?, id, version, ?, ? FROM oa_operators WHERE role='owner'`).bind(crypto.randomUUID(), digest, at, at + 60_000).run()
    const preview = await h.send('/auth/owner-signin?token=' + token)
    assert.equal(preview.status, 200)
    assert.equal(preview.cookie, undefined)
    const signedIn = await h.post('/auth/owner-signin', { token }, '', 303, { 'cf-connecting-ip': '192.0.2.1' })
    const session = await h.send('/auth/session', undefined, signedIn.cookie)
    assert.equal(session.value.operator.role, 'owner')
    await h.post('/auth/owner-signin', { token }, '', 400, { 'cf-connecting-ip': '192.0.2.1' })
    h.owner = signedIn.cookie
   }
   const pdf = await PDFDocument.create(); pdf.addPage([595,842])
   const signers = [{name:'Priya Shah',email:'priya@harbour.example'},{name:'Alex Morgan',email:'alex@harbour.example'}]
   const fields = signers.map((_,signer)=>({id:`signature-${signer}`,label:'Signature',type:'signature',signer,page:0,x:.1,y:.5+signer*.15,width:.4,height:.07}))
   const id = (await h.command('envelope.prepare',{title:'Harbour studio agreement',filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers,fields},h.owner)).result.id
   const commandId = crypto.randomUUID()
   const approved = await h.command('envelope.approve',{id,eligible:true},h.owner,200,commandId)
   const [first] = approved.result.invitations
   assert.equal(first.recipient,signers[0].email)
   const path = '/api'+new URL(first.url).pathname
   assert.equal((await h.send(path)).value.mailSuppressed,true)
   assert.equal((await h.send(path+'/document')).status,401)
   const refused = await h.post(path+'/code',{},'',409)
   if (mailProvider === 'none') {
    assert.equal(refused.value.code, 'mail_off')
    assert.equal((await h.command('envelope.resend', { id, signer: 0 }, h.owner, 409)).code, 'mail_off')
   }
   await h.post(path+'/verify',{code:first.code==='000000'?'111111':'000000'},'',401)
   const verified = await h.post(path+'/verify',{code:first.code},'')
   await h.post(path+'/verify',{code:first.code},'',401)
   await h.agree(path,verified.cookie)
   assert.equal((await h.send(path+'/document',undefined,verified.cookie)).status,200)
   const replay = await h.command('envelope.approve',{id,eligible:true},h.owner,200,commandId)
   assert.equal(replay.result.invitations,undefined,'command replay cannot recover secrets')
   await h.command('envelope.invite',{id},'',401)
   const [renewed] = (await h.command('envelope.invite',{id},h.owner)).result.invitations
   assert.notEqual(renewed.url,first.url)
   assert.equal(renewed.expiresAt,first.expiresAt,'reissue preserves the original invitation deadline')
   assert.equal((await h.send(path)).status,404)
   assert.equal((await h.send(path+'/document',undefined,verified.cookie)).status,404)
   await h.post(path+'/sign',{values:{'signature-0':'Priya Shah'},consent:true,commandId:crypto.randomUUID()},verified.cookie,404)
   const current = '/api'+new URL(renewed.url).pathname
   const session = await h.post(current+'/verify',{code:renewed.code},'')
   await h.agree(current,session.cookie)
   await h.post(current+'/sign',{values:{'signature-1':'Alex Morgan'},consent:true,commandId:crypto.randomUUID()},session.cookie,400)
   await h.post(current+'/sign',{values:{'signature-0':'Priya Shah'},consent:false,commandId:crypto.randomUUID()},session.cookie,400)
   await h.post(current+'/sign',{values:{'signature-0':'Priya Shah'},consent:true,commandId:crypto.randomUUID()},session.cookie)
   const [next] = (await h.command('envelope.invite',{id},h.owner)).result.invitations
   assert.equal(next.recipient,signers[1].email)
   const nextPath='/api'+new URL(next.url).pathname
   const second = await h.post(nextPath+'/verify',{code:next.code},'')
   await h.agree(nextPath,second.cookie)
   await h.post(nextPath+'/sign',{values:{'signature-1':'Alex Morgan'},consent:true,commandId:crypto.randomUUID()},second.cookie)
   const envelope = (await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
   assert.equal(envelope.status,'completed')
   assert.equal(envelope.manualInvitationAvailable,false)
   assert.ok(envelope.signers.every(s=>s.signedAt))
   assert.equal((await h.send(nextPath+'/artifacts/signed',undefined,second.cookie)).status,200)
   await h.command('envelope.invite',{id},h.owner,409)
   const persisted = JSON.stringify(await h.db.prepare('SELECT * FROM iw_signers').all()) + JSON.stringify(await h.db.prepare('SELECT * FROM iw_commands').all()) + JSON.stringify(envelope)
   for (const invitation of [first,renewed,next]) {
    assert.ok(!persisted.includes(new URL(invitation.url).pathname.split('/').at(-1)),'raw signing tokens are never persisted')
    assert.ok(!persisted.includes(invitation.code),'raw codes are never persisted')
   }
   assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_mail').first()).n,0,'suppressed mail is never captured')
   assert.equal(h.sent(), 0)
  } finally { await h.close() }
 })
}
