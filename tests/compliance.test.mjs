import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac, randomBytes } from 'node:crypto'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { harness } from './harness.mjs'

test('COMPLY-002: healthcare signing keeps content out of operational/provider logs, preserves signed evidence and reviews every member across public doors', async () => {
  const webhookSecret = randomBytes(24)
  const h = await harness({ bindings: { MAIL_WEBHOOK_KEY: 'whsec_' + webhookSecret.toString('base64') } })
  try {
    assert.equal((await h.send('/api/inkwell', undefined, h.owner)).value.settings.healthcare, false)
    await h.command('account.healthcare', { enabled: true })
    const admin = await h.invite('operations@harbour.example', 'admin'), viewer = await h.invite('reviewer@harbour.example', 'member')
    await h.post('/auth/invite', { email: 'invited@harbour.example', displayName: 'Awaiting colleague', role: 'member' }, h.owner, 202)
    const who = async cookie => (await h.send('/api/inkwell', undefined, cookie)).value.actor
    const viewerId = (await who(viewer)).id
    const departed = await h.invite('departed@harbour.example', 'member'), departedId = (await who(departed)).id
    await h.post('/auth/operator/status', { operatorId: departedId, status: 'inactive' })
    assert.equal((await h.send('/api/inkwell', undefined, departed)).status, 401)
    await h.command('account.healthcare', { enabled: false }, viewer, 403)
    assert.equal((await h.send('/api/inkwell/compliance/access-review', undefined, viewer)).status, 403)
    assert.equal((await h.send('/api/inkwell/compliance/access-review')).status, 401)
    const review = async () => (await h.send('/api/inkwell/compliance/access-review', undefined, admin)).value
    const last = async id => (await review()).members.find(member => member.id === id).lastAccessAt
    // Auth management bypasses requireActor: it must still record successful member access.
    const beforeAuth = await last(viewerId), accessAt = Date.now()
    assert.equal((await h.send('/auth/session', undefined, viewer)).status, 200)
    assert.ok(Date.parse(await last(viewerId)) >= accessAt)
    assert.ok(await last(viewerId) > beforeAuth)
    const beforeRefused = await last(viewerId)
    assert.equal((await h.send('/api/inkwell/compliance/access-review', undefined, viewer)).status, 403)
    assert.equal(await last(viewerId), beforeRefused, 'a refused endpoint does not advance successful access')
    assert.equal((await h.send('/api/inkwell', undefined, viewer + '-invalid')).status, 401)
    assert.equal(await last(viewerId), beforeRefused)
    const adminId = (await who(admin)).id, importAt = Date.now()
    assert.equal((await h.send('/api/inkwell/import/jobs', undefined, h.owner)).status, 200)
    const report = await review()
    assert.equal(report.enabled, true)
    assert.equal(report.members.length, 5, 'every member, including the invited person, is listed')
    assert.equal(report.members.find(member => member.email === 'invited@harbour.example').lastAccessAt, null)
    assert.equal(report.members.find(member => member.id === departedId).status, 'inactive')
    assert.ok(report.members.find(member => member.id === departedId).lastAccessAt)
    for (const member of report.members.filter(member => member.status === 'active')) assert.ok(Number.isFinite(Date.parse(member.lastAccessAt)), member.email)
    assert.ok(Date.parse(report.members.find(member => member.role === 'owner').lastAccessAt) >= importAt)
    assert.ok(report.members.some(member => member.id === adminId && member.role === 'admin'))

    const documentText = 'Patient-specific treatment provision QX7291', fieldValue = 'Confidential care instruction ZK5832'
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.addPage([612, 792]).drawText(documentText, { x: 60, y: 730, font, size: 12 })
    const fields = [{ id: 'signature', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .7, width: .5, height: .05 }, { id: 'care', label: 'Care instruction', type: 'text', signer: 0, page: 0, x: .1, y: .5, width: .5, height: .05 }]
    const recipient = 'patient@harbour.example'
    const id = (await h.command('envelope.prepare', { title: 'Care agreement', filename: 'care.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers: [{ name: 'Morgan River', email: recipient }], fields })).result.id
    await h.command('envelope.approve', { id, eligible: true })
    const invitation = await h.mail(recipient, 'Please sign:'), token = new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1), path = '/api/sign/' + token
    await h.post(path + '/code', {}, '')
    const verified = await h.post(path + '/verify', { code: (await h.mail(recipient, 'verification code')).text.match(/\b\d{6}\b/)[0] }, '')
    await h.agree(path, verified.cookie)
    assert.equal((await h.send(path + '/document', undefined, verified.cookie)).status, 200)
    await h.post(path + '/sign', { values: { signature: 'Morgan River', care: fieldValue }, consent: true, commandId: crypto.randomUUID() }, verified.cookie)
    const detail = (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
    assert.equal(detail.status, 'completed')
    assert.equal(detail.signers[0].values.care, fieldValue, 'signed business evidence is preserved')
    for (const kind of ['signed', 'certificate', 'audit']) assert.equal((await h.send(`/api/inkwell/envelopes/${id}/artifacts/${kind}`, undefined, h.owner)).status, 200)
    assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`, undefined, h.owner)).value.ok, true)
    // A real signed provider webhook can carry arbitrary content; only normalized delivery facts are retained.
    const event = JSON.stringify({ type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: invitation.id, to: invitation.to, subject: documentText, extra: fieldValue } })
    const eventId = 'msg_' + randomBytes(8).toString('hex'), timestamp = String(Math.floor(Date.now() / 1000)), signature = createHmac('sha256', webhookSecret).update(`${eventId}.${timestamp}.${event}`).digest('base64')
    const response = await h.mf.dispatchFetch(h.origin + '/api/inkwell/mail/events', { method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + signature }, body: event })
    assert.equal(response.status, 200)
    const receipts = (await h.db.prepare('SELECT * FROM rer_mail_event_receipts').all()).results
    assert.ok(receipts.length > 0)
    const logs = h.logs().join('\n')
    assert.match(logs, /inkwell.request/, 'the journey produced actual operational logs')
    assert.match(logs, /signing/, 'signing requests were logged')
    for (const content of [documentText, fieldValue, token]) {
      assert.ok(!logs.includes(content), 'no content or private link in runtime logs')
      assert.ok(!JSON.stringify(receipts).includes(content), 'no raw payload in provider receipt logs')
    }
    const originalAt = await last(viewerId)
    await h.command('account.healthcare', { enabled: false }, admin)
    await Promise.all([h.send('/api/inkwell', undefined, viewer), h.send('/auth/session', undefined, viewer)])
    assert.ok(await last(viewerId) > originalAt, 'access tracking continues with profile off and concurrent requests')
  } finally { await h.close() }
})


test('Signature controls: explicit owner/admin consent, fresh per-signature email proof, bounded attempts and printed immutable manifestations', async () => {
 const h=await harness()
 try {
  const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Synthetic qualification agreement',{x:50,y:700,size:14})
  const source={title:'Qualification agreement',filename:'qualification.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[{name:'Morgan River',email:'morgan@harbour.example',order:1},{name:'Jordan Lake',email:'jordan@harbour.example',order:1}],fields:[{id:'one',label:'First signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.05},{id:'two',label:'Second signature',type:'signature',signer:1,page:0,x:.1,y:.7,width:.4,height:.05}]}
  const id=(await h.command('envelope.prepare',source)).result.id
  const sender=await h.invite('sender@harbour.example','member'),senderId=(await h.send('/api/inkwell',undefined,sender)).value.actor.id
  await h.command('member.role',{operatorId:senderId,role:'sender'})
  await h.command('envelope.part11',{id,confirm:true},sender,403)
  await h.command('envelope.part11',{id,confirm:false},h.owner,400)
  const enabled=(await h.command('envelope.part11',{id,confirm:true})).result.part11
  await h.command('envelope.update',{id,...source})
  let detail=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  assert.deepEqual(detail.part11,enabled,'saving a draft never relaxes the requirement')
  await h.command('envelope.update',{id,...source,allowPaperSigning:true},h.owner,409)
  await h.command('envelope.approve',{id,eligible:true})
  const sessions=[]
  for(const email of ['morgan@harbour.example','jordan@harbour.example']){
   const invitation=await h.mail(email,'Please sign:'),path='/api/sign/'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
   await h.post(path+'/signature-code',{},'',401)
   await h.post(path+'/code',{},'')
   const initialCode=(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(path+'/verify',{code:initialCode},'')).cookie
   await h.agree(path,cookie)
   assert.equal((await h.send(path,undefined,cookie)).value.part11,true)
   sessions.push({path,cookie,email,initialCode})
  }
  const [one,two]=sessions,first={values:{one:'Morgan River'},consent:true,signingReason:'Approval',commandId:crypto.randomUUID()}
  await h.post(one.path+'/sign',{...first,signatureCode:one.initialCode},one.cookie,401)
  await h.post(one.path+'/signature-code',{},one.cookie)
  await h.post(one.path+'/signature-code',{},one.cookie,429)
  const code=(await h.mail(one.email,'signature code')).text.match(/\b\d{6}\b/)[0]
  await h.post(one.path+'/sign',{...first,signatureCode:code,signingReason:''},one.cookie,400)
  const wrong=code==='000000'?'000001':'000000'
  await h.post(one.path+'/sign',{...first,signatureCode:wrong},one.cookie,401)
  await h.post(one.path+'/sign',{...first,signatureCode:code},one.cookie)
  await h.post(one.path+'/sign',{...first,signatureCode:wrong},one.cookie)
  detail=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  assert.equal(detail.events.filter(e=>e.action==='signer.signed').length,1,'retrying the same operation adds no second signature')
  assert.equal(detail.signers[0].part11.reason,'Approval')
  assert.equal(detail.signers[0].part11.name,'Morgan River')
  assert.equal(detail.events.find(e=>e.action==='signer.signed').detail.part11.method,'single-use emailed code')
  await h.command('envelope.part11',{id,confirm:true},h.owner,409)
  await h.post(two.path+'/signature-code',{},two.cookie)
  const secondCode=(await h.mail(two.email,'signature code')).text.match(/\b\d{6}\b/)[0]
  const second={values:{two:'Jordan Lake'},consent:true,signingReason:'Review',commandId:crypto.randomUUID()}
  await h.post(two.path+'/sign',{...second,signatureCode:secondCode},two.cookie)
  const signed=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,h.owner)).bytes
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),document=await getDocument({data:new Uint8Array(signed),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
  let text='';for(let n=1;n<=document.numPages;n++)text+=(await(await document.getPage(n)).getTextContent()).items.map(i=>i.str).join(' ')+' '
  assert.equal(document.numPages,3)
  for(const value of ['Signature manifestation','Printed name: Morgan River','Printed name: Jordan Lake','Meaning: Approval','Meaning: Review','Signed at (UTC):','Re-authenticated (UTC):'])assert.ok(text.includes(value),value)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,true)
  const publicCheck=await h.mf.dispatchFetch(h.origin+'/api/verify',{method:'POST',headers:{'content-type':'application/pdf'},body:signed});assert.equal((await publicCheck.json()).match,true)
  const copy=(await h.command('envelope.copy',{id})).result.id
  const copied=(await h.send('/api/inkwell/envelopes/'+copy,undefined,h.owner)).value.envelope
  assert.deepEqual(copied.part11,enabled)
  assert.ok(copied.signers.every(s=>!s.part11&&!s.signedAt),'copies reset every signature proof')
  const template=(await h.command('template.from_envelope',{id})).result.id
  const used=(await h.command('template.use',{id:template,recipients:[{name:'New signer',email:'new@harbour.example'},{name:'Next signer',email:'next@harbour.example'}]})).result.id
  assert.deepEqual((await h.send('/api/inkwell/envelopes/'+used,undefined,h.owner)).value.envelope.part11,enabled)
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,destination=await harness({mailProvider:null})
  try{
   await destination.post('/api/inkwell/archive/restore',{archive})
   const restored=(await destination.send('/api/inkwell/envelopes/'+id,undefined,destination.owner)).value.envelope
   assert.deepEqual(restored.signers.map(s=>s.part11),(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope.signers.map(s=>s.part11))
   assert.equal(restored.signers[1].part11.reason,'Review')
   assert.deepEqual((await destination.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,destination.owner)).bytes,signed)
   assert.equal((await destination.send(`/api/inkwell/envelopes/${id}/verify`,undefined,destination.owner)).value.ok,true)
  }finally{await destination.close()}
  // A separate recipient exhausts the attempt limit; a valid code then fails closed.
  await h.command('envelope.approve',{id:copy,eligible:true})
  const invitation=await h.mail(one.email,'Please sign:'),path='/api/sign/'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  await h.post(path+'/code',{},'');const cookie=(await h.post(path+'/verify',{code:(await h.mail(one.email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie;await h.agree(path,cookie)
  await h.post(path+'/signature-code',{},cookie)
  const lockedCode=(await h.mail(one.email,'signature code')).text.match(/\b\d{6}\b/)[0],bad=lockedCode==='000000'?'000001':'000000'
  for(let n=0;n<5;n++)await h.post(path+'/sign',{...first,commandId:crypto.randomUUID(),signatureCode:bad},cookie,401)
  await h.post(path+'/sign',{...first,signatureCode:lockedCode},cookie,401)
 }finally{await h.close()}
})

test('Signature controls: signed-in, link-only, signing-group and hosted doors cannot bypass fresh recipient proof',async()=>{
 const h=await harness()
 try{
  const pdf=await PDFDocument.create();pdf.addPage([612,792]);const bytes=Buffer.from(await pdf.save()).toString('base64'),field={id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.5,height:.05}
  const host=await h.invite('host@harbour.example','admin'),members=[{name:'Ada Park',email:'ada@harbour.example'},{name:'Ben Ortiz',email:'ben@harbour.example'}],group=(await h.command('account.signing_group',{name:'Qualified approvers',members})).result.groups[0]
  for(const mode of ['member','link','group','hosted']){
   const person=mode==='member'?{name:'Harbour Owner',email:'owner@harbour.example'}:mode==='group'?{group:group.id}:mode==='hosted'?{name:'Hosted signer',email:'hosted@harbour.example',inPerson:true}:{name:'Link signer',email:'link@harbour.example',linkOnly:true}
   const id=(await h.command('envelope.prepare',{title:'Signature profile '+mode,filename:'agreement.pdf',pdfBase64:bytes,signers:[person],fields:[field]})).result.id
   await h.command('envelope.part11',{id,confirm:true},mode==='hosted'?host:h.owner);await h.command('envelope.approve',{id,eligible:true})
   let path,cookie,email=mode==='group'?members[1].email:person.email
   if(mode==='member'||mode==='hosted'){
    const opened=await h.post('/api/inkwell/commands',{command:mode==='member'?'envelope.open_signing':'envelope.host',input:{id,...(mode==='hosted'?{signer:0,confirmed:true,method:'personally-known',screen:{width:1440,height:900}}:{})},commandId:crypto.randomUUID()},mode==='member'?h.owner:host)
    path='/api'+new URL(opened.value.result.signing.url).pathname;cookie=opened.cookie
   }else{
    const invitation=await h.mail(email,'Please sign:'),link=new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]);path='/api'+link.pathname
    if(mode==='link')cookie=(await h.post(path+'/open',{},'')).cookie
    else{await h.post(path+'/code',{},'');cookie=(await h.post(path+'/verify',{code:(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie}
   }
   await h.agree(path,cookie)
   const body={values:{signature:mode==='group'?members[1].name:person.name},consent:true,signingReason:'Authorship',commandId:crypto.randomUUID()}
   await h.post(path+'/sign',body,cookie,400)
   await h.post(path+'/signature-code',{},cookie)
   let code=(await h.mail(email,'signature code')).text.match(/\b\d{6}\b/)[0]
   if(mode==='member'){
    const oldPath=path,oldCookie=cookie,opened=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()})
    path='/api'+new URL(opened.value.result.signing.url).pathname;cookie=opened.cookie
    assert.equal((await h.send(oldPath,undefined,oldCookie)).status,404,'the old link is invalid after a new native session')
    await h.post(path+'/sign',{...body,signatureCode:code},cookie,401)
    await h.post(path+'/signature-code',{},cookie)
    code=(await h.mail(email,'signature code')).text.match(/\b\d{6}\b/)[0]
   }
   await h.post(path+'/sign',{...body,signatureCode:code},cookie)
   const record=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
   assert.equal(record.status,'completed',mode);assert.equal(record.signers[0].part11.reason,'Authorship',mode)
   if(mode==='group')assert.equal(record.signers[0].group.signedBy,1)
   assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,true,mode)
  }
 }finally{await h.close()}
})
