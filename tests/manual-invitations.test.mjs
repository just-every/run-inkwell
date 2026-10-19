import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

for (const mailProvider of ['development', undefined]) {
 test(`suppressed mail (${mailProvider ?? 'unconfigured'}) supports private ordered signing and revocation`, async () => {
  // Explicit null selects an installation with no mail provider.
  const h = await harness({ mailProvider: mailProvider ?? null })
  try {
   const pdf = await PDFDocument.create(); pdf.addPage([595,842])
   const signers = [{name:'Priya Shah',email:'priya@harbour.example'},{name:'Alex Morgan',email:'alex@harbour.example'}]
   const fields = signers.map((_,signer)=>({id:`signature-${signer}`,label:'Signature',type:'signature',signer,page:0,x:.1,y:.5+signer*.15,width:.4,height:.07}))
   const id = (await h.command('envelope.prepare',{title:'Harbour studio agreement',filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers,fields})).result.id
   const commandId = crypto.randomUUID()
   const approved = await h.command('envelope.approve',{id,eligible:true},h.owner,200,commandId)
   const [first] = approved.result.invitations
   assert.equal(first.recipient,signers[0].email)
   const path = '/api'+new URL(first.url).pathname
   assert.equal((await h.send(path)).value.mailSuppressed,true)
   assert.equal((await h.send(path+'/document')).status,401)
   await h.post(path+'/code',{},'',409)
   await h.post(path+'/verify',{code:first.code==='000000'?'111111':'000000'},'',401)
   const verified = await h.post(path+'/verify',{code:first.code},'')
   await h.post(path+'/verify',{code:first.code},'',401)
   await h.agree(path,verified.cookie)
   assert.equal((await h.send(path+'/document',undefined,verified.cookie)).status,200)
   const replay = await h.command('envelope.approve',{id,eligible:true},h.owner,200,commandId)
   assert.equal(replay.result.invitations,undefined,'command replay cannot recover secrets')
   await h.command('envelope.invite',{id},'',401)
   const [renewed] = (await h.command('envelope.invite',{id})).result.invitations
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
   const [next] = (await h.command('envelope.invite',{id})).result.invitations
   assert.equal(next.recipient,signers[1].email)
   const nextPath='/api'+new URL(next.url).pathname
   const second = await h.post(nextPath+'/verify',{code:next.code},'')
   await h.agree(nextPath,second.cookie)
   await h.post(nextPath+'/sign',{values:{'signature-1':'Alex Morgan'},consent:true,commandId:crypto.randomUUID()},second.cookie)
   const envelope = (await h.send('/api/inkwell',undefined,h.owner)).value.envelopes.find(e=>e.id===id)
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
  } finally { await h.close() }
 })
}
