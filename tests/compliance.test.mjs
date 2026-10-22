import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac, randomBytes } from 'node:crypto'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { harness } from './harness.mjs'

const accounts = new WeakMap()
async function enrolledSigner(h, email, name) {
 let cache=accounts.get(h);if(!cache){cache=new Map();accounts.set(h,cache)}
 if(cache.has(email))return cache.get(email)
 const cookie=email==='owner@harbour.example'?h.owner:await h.invite(email,'member')
 const operatorId=(await h.send('/api/inkwell',undefined,cookie)).value.actor.id
 const verifier=email==='owner@harbour.example'?await h.invite('identity-verifier@harbour.example','admin'):h.owner
 const verified=(await h.command('account.part11_identity',{operatorId,name,method:'Synthetic supervised government photo ID review',confirm:true},verifier)).result
 const password='synthetic-inkwell-'+crypto.randomUUID()
 await h.post('/api/inkwell/compliance/password',{activationToken:verified.activationToken,password},cookie)
 const result={cookie,password,operatorId};cache.set(email,result);return result
}
async function identify(h, path, cookie, email, name) {
 const person=await enrolledSigner(h,email,name)
 const proof=await h.post(path+'/identity',{password:person.password},cookie)
 return cookie+'; '+proof.cookie
}

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
  await h.command('account.part11_record',{kind:'meaning',meaning:'Batch release by qualified reviewer'})
  await h.command('account.part11_record',{kind:'fda-certification',date:'2026-10-22',reference:'synthetic-inkwell-1',confirm:true})
  await h.command('envelope.approve',{id,eligible:true})
  const sessions=[]
  for(const email of ['morgan@harbour.example','jordan@harbour.example']){
   const invitation=await h.mail(email,'Please sign:'),path='/api/sign/'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
   await h.post(path+'/signature-code',{},'',401)
   await h.post(path+'/code',{},'')
   const initialCode=(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(path+'/verify',{code:initialCode},'')).cookie
   await h.agree(path,cookie)
   assert.equal((await h.send(path,undefined,cookie)).value.part11,true)
   await h.post(path+'/signature-code',{},cookie,403)
   const strong=await identify(h,path,cookie,email,email.startsWith('morgan')?'Morgan River':'Jordan Lake')
   sessions.push({path,cookie:strong,email,initialCode})
  }
  const [one,two]=sessions,first={values:{one:'Morgan River'},consent:true,signingReason:'Responsibility',commandId:crypto.randomUUID()}
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
  assert.equal(detail.signers[0].part11.reason,'Responsibility')
  assert.equal(detail.signers[0].part11.name,'Morgan River')
  assert.equal(detail.events.find(e=>e.action==='signer.signed').detail.part11.method,'verified identity and single-use emailed code')
  await h.command('envelope.part11',{id,confirm:true},h.owner,409)
  await h.post(two.path+'/signature-code',{},two.cookie)
  const secondCode=(await h.mail(two.email,'signature code')).text.match(/\b\d{6}\b/)[0]
  const second={values:{two:'Jordan Lake'},consent:true,signingReason:'Batch release by qualified reviewer',commandId:crypto.randomUUID()}
  await h.post(two.path+'/sign',{...second,signatureCode:secondCode},two.cookie)
  const signed=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,h.owner)).bytes
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),document=await getDocument({data:new Uint8Array(signed),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
  let text='';for(let n=1;n<=document.numPages;n++)text+=(await(await document.getPage(n)).getTextContent()).items.map(i=>i.str).join(' ')+' '
  assert.equal(document.numPages,3)
  for(const value of ['Signature manifestation','Printed name: Morgan River','Printed name: Jordan Lake','Meaning: Responsibility','Meaning: Batch release by qualified reviewer','Signed at (UTC):','Re-authenticated (UTC):'])assert.ok(text.includes(value),value)
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
   assert.equal(restored.signers[1].part11.reason,'Batch release by qualified reviewer')
   assert.deepEqual((await destination.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,destination.owner)).bytes,signed)
   assert.equal((await destination.send(`/api/inkwell/envelopes/${id}/verify`,undefined,destination.owner)).value.ok,true)
  }finally{await destination.close()}
  // A separate recipient exhausts the attempt limit; a valid code then fails closed.
  await h.command('envelope.approve',{id:copy,eligible:true})
  const invitation=await h.mail(one.email,'Please sign:'),path='/api/sign/'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  await h.post(path+'/code',{},'');const cookie=(await h.post(path+'/verify',{code:(await h.mail(one.email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie;await h.agree(path,cookie)
  const strong=cookie+'; '+one.cookie.split('; ').at(-1) // Same continuous identity session; a fresh email code is still required.
  await h.post(path+'/signature-code',{},strong)
  const lockedCode=(await h.mail(one.email,'signature code')).text.match(/\b\d{6}\b/)[0],bad=lockedCode==='000000'?'000001':'000000'
  for(let n=0;n<5;n++)await h.post(path+'/sign',{...first,commandId:crypto.randomUUID(),signatureCode:bad},strong,401)
  await h.post(path+'/sign',{...first,signatureCode:lockedCode},strong,401)
  const alerts=(await h.send('/api/inkwell/compliance/part11',undefined,h.owner)).value
  assert.equal(alerts.alerts.filter(a=>a.envelopeId===copy&&a.cause==='signature-code-attempts').length,1)
  const alert=await h.mail('owner@harbour.example','Inkwell security alert:')
  assert.ok(alert)
  const emittedAt=Date.parse(alert.text.match(/Time \(UTC\): ([^\n]+)/)[1])
  assert.ok(Date.now()-emittedAt<60_000,'security contact receives the fifth-attempt alert within one minute')
  assert.ok(alerts.records.some(r=>r.kind==='fda-certification'&&r.data.reference==='synthetic-inkwell-1'))
  assert.equal((await h.send('/api/inkwell/compliance/part11')).status,401)
  assert.equal((await h.send('/api/inkwell/compliance/part11',undefined,sender)).status,403)
  assert.ok(!JSON.stringify(alerts).includes('activation_hash')&&!JSON.stringify(alerts).includes('password_hash'))

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
   await h.post(path+'/sign',body,cookie,403)
   await h.post(path+'/signature-code',{},cookie,403)
   cookie=await identify(h,path,cookie,email,mode==='group'?members[1].name:person.name)
   await h.post(path+'/sign',body,cookie,400)
   await h.post(path+'/signature-code',{},cookie)
   let code=(await h.mail(email,'signature code')).text.match(/\b\d{6}\b/)[0]
   if(mode==='member'){
    const oldPath=path,oldCookie=cookie,opened=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()})
    path='/api'+new URL(opened.value.result.signing.url).pathname;cookie=await identify(h,path,opened.cookie,email,person.name)
    await h.agree(path,cookie)
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

test('Verified signer credentials: private one-use enrollment, separate continuous sessions, immediate revocation and no mailbox-only downgrade',async()=>{
 const h=await harness()
 try{
  const person=await enrolledSigner(h,'credential@harbour.example','Verified Morgan River'),viewer=await h.invite('unverified@harbour.example','member')
  const viewerId=(await h.send('/api/inkwell',undefined,viewer)).value.actor.id
  await h.command('account.part11_identity',{operatorId:viewerId,name:'Unverified member',method:'Synthetic review',confirm:true},viewer,403)
  await h.post('/api/inkwell/compliance/password',{activationToken:'synthetic-inkwell-1',password:'synthetic-inkwell-password'},viewer,403)
  await h.post('/api/inkwell/compliance/password',{activationToken:'synthetic-inkwell-1',password:'synthetic-inkwell-password'},person.cookie,403)
  const admin=await h.invite('security@harbour.example','admin')
  const adminId=(await h.send('/api/inkwell',undefined,admin)).value.actor.id
  await h.command('account.part11_identity',{operatorId:adminId,name:'Self verification refused',method:'Synthetic review',confirm:true},admin,403)
  await h.command('account.part11_record',{kind:'meaning',meaning:'Not owner defined'},admin,403)
  await h.command('account.part11_record',{kind:'fda-certification',date:'2026-02-30',reference:'synthetic-inkwell-2',confirm:true},admin,400)
  const pdf=await PDFDocument.create();pdf.addPage([612,792])
  const make=async title=>{
   const id=(await h.command('envelope.prepare',{title,filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[{name:'Sender supplied name',email:'credential@harbour.example',linkOnly:true}],fields:[{id:'s',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.5,height:.05}]})).result.id
   await h.command('envelope.part11',{id,confirm:true});await h.command('envelope.approve',{id,eligible:true})
   const invitation=await h.mail('credential@harbour.example','Please sign:'),path='/api'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
   const cookie=(await h.post(path+'/open',{},'')).cookie;await h.agree(path,cookie)
   return {id,path,cookie}
  }
  const one=await make('Independent component one')
  await h.post(one.path+'/signature-code',{},one.cookie+'; '+person.cookie,403)
  const start=await h.post(one.path+'/identity',{password:person.password},one.cookie),strong=one.cookie+'; '+start.cookie
  assert.equal((await h.send('/api/inkwell',undefined,start.cookie)).status,401,'a signer identity session grants no application access')
  await h.post(one.path+'/signature-code',{},strong)
  const code=(await h.mail('credential@harbour.example','signature code')).text.match(/\b\d{6}\b/)[0]
  await h.post(one.path+'/sign',{values:{s:'Verified Morgan River'},consent:true,signingReason:'Responsibility',signatureCode:code,commandId:crypto.randomUUID()},one.cookie+'; '+person.cookie,403)
  await h.post(one.path+'/sign',{values:{s:'Verified Morgan River'},consent:true,signingReason:'Responsibility',signatureCode:code,commandId:crypto.randomUUID()},strong)
  const signed=(await h.send('/api/inkwell/envelopes/'+one.id,undefined,h.owner)).value.envelope
  assert.equal(signed.signers[0].part11.name,'Verified Morgan River','manifestation uses the admin-verified name, not sender-supplied name')
  const two=await make('Independent component two'),continuous=two.cookie+'; '+start.cookie
  await h.post(two.path+'/signature-code',{},continuous)
  const next=(await h.mail('credential@harbour.example','signature code')).text.match(/\b\d{6}\b/)[0],body={values:{s:'Verified Morgan River'},consent:true,signingReason:'Approval',signatureCode:next,commandId:crypto.randomUUID()}
  await h.post(two.path+'/identity/end',{},continuous)
  await h.post(two.path+'/sign',body,continuous,403)
  const restarted=await h.post(two.path+'/identity',{password:person.password},two.cookie),current=two.cookie+'; '+restarted.cookie
  const reverification=(await h.command('account.part11_identity',{operatorId:person.operatorId,name:'Verified Morgan River',method:'Synthetic identity recheck',confirm:true},admin)).result
  await h.post(two.path+'/sign',body,current,403)
  await h.post(two.path+'/identity',{password:person.password},two.cookie,403)
  await h.post('/api/inkwell/compliance/password',{activationToken:reverification.activationToken,password:person.password},person.cookie)
  const resumed=await h.post(two.path+'/identity',{password:person.password},two.cookie)
  const data=(await h.send('/api/inkwell/compliance/part11',undefined,admin)).value
  assert.ok(!JSON.stringify(data).includes(reverification.activationToken))
  await h.post('/auth/operator/status',{operatorId:person.operatorId,status:'inactive'})
  await h.post(two.path+'/sign',body,two.cookie+'; '+resumed.cookie,403)
  await h.post('/auth/operator/status',{operatorId:person.operatorId,status:'active'})
  await h.post(two.path+'/identity',{password:person.password},two.cookie,403)
 }finally{await h.close()}
})

test('Verified OIDC signer: public provider linking and sign-in require fresh signature code; provider-off immediately refuses the next signature',async()=>{
 const issuer='https://identity.harbour.example',clientId='synthetic-inkwell-oidc-client',email='oidc@harbour.example'
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'synthetic-inkwell-1',alg:'ES256',use:'sig'}
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
 let nonce
 const networkEdge=async request=>{
  const url=new URL(request.url);if(url.origin!==issuer)return
  if(url.pathname==='/.well-known/openid-configuration')return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],id_token_signing_alg_values_supported:['ES256'],token_endpoint_auth_methods_supported:['private_key_jwt'],token_endpoint_auth_signing_alg_values_supported:['ES256'],code_challenge_methods_supported:['S256'],authorization_response_iss_parameter_supported:true,rer_interfaces:['oidc-provider@1.0.0']})
  if(url.pathname==='/.well-known/rer-provider')return Response.json({issuer,interface:'oidc-provider@1',version:1,initiate:issuer+'/link/initiate',redeem:issuer+'/link/redeem',deregister:issuer+'/link/deregister'})
  if(url.pathname==='/link/redeem'){
   const body=await request.json(),proof=JSON.parse(Buffer.from(body.client_assertion.split('.')[1],'base64url').toString())
   return Response.json({issuer,interface:body.interface,sector_id:proof.sector_id,origin:body.origin,callback:body.callback,client_id:clientId})
  }
  if(url.pathname==='/jwks')return Response.json({keys:[jwk]})
  if(url.pathname==='/token'){
   const form=new URLSearchParams(await request.text());assert.equal(form.get('client_id'),clientId);assert.ok(form.get('code_verifier'));assert.ok(form.get('client_assertion'))
   const at=Math.floor(Date.now()/1000),message=encode({alg:'ES256',kid:jwk.kid,typ:'JWT'})+'.'+encode({iss:issuer,sub:'synthetic-inkwell-oidc-user',aud:clientId,iat:at,exp:at+600,nonce,email,email_verified:true,email_verified_at:at,amr:['pwd']})
   const signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(message))).toString('base64url')
   return Response.json({id_token:message+'.'+signature})
  }
  throw new Error('Unexpected synthetic identity-provider request')
 }
 const h=await harness({networkEdge})
 try{
  const person=await enrolledSigner(h,email,'Verified OIDC Signer')
  await h.post('/auth/step-up',{action:'providers:relink'},h.owner,202)
  const step=await h.mail('owner@harbour.example',"Confirm it's you"),token=new URL(step.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  await h.post('/auth/confirm',{token},h.owner,303)
  await h.post('/auth/dependencies/relink',{issuer},h.owner)
  await h.post('/.well-known/rer-link/callback',{issuer,code:'synthetic-inkwell-1'},h.owner)
  await h.post('/auth/settings/identity',{idpSignIn:true},h.owner)
  const started=await h.post('/auth/oidc/auth/start',{returnTo:'/app'},'',303),authorization=new URL(started.headers.get('location'))
  nonce=authorization.searchParams.get('nonce')
  const callback=await h.send('/auth/oidc/auth/callback?'+new URLSearchParams({code:'synthetic-inkwell-2',state:authorization.searchParams.get('state'),iss:issuer}),undefined,started.cookie)
  assert.equal(callback.status,303)
  const oidcCookie=callback.cookie
  assert.equal((await h.send('/api/inkwell',undefined,oidcCookie)).value.actor.id,person.operatorId)
  const pdf=await PDFDocument.create();pdf.addPage([612,792])
  const open=async title=>{
   const id=(await h.command('envelope.prepare',{title,filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[{name:'Sender supplied',email}],fields:[{id:'s',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.5,height:.05}]})).result.id
   await h.command('envelope.part11',{id,confirm:true});await h.command('envelope.approve',{id,eligible:true})
   const invitation=await h.mail(email,'Please sign:'),path='/api'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
   await h.post(path+'/code',{},'');const verified=await h.post(path+'/verify',{code:(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')
   const cookie=verified.cookie+'; '+oidcCookie;await h.agree(path,cookie)
   return {id,path,cookie}
  }
  const first=await open('OIDC qualified signature'),body={values:{s:'Verified OIDC Signer'},consent:true,signingReason:'Approval',commandId:crypto.randomUUID()}
  await h.post(first.path+'/sign',body,first.cookie,400)
  await h.post(first.path+'/signature-code',{},first.cookie)
  await h.post(first.path+'/sign',{...body,signatureCode:(await h.mail(email,'signature code')).text.match(/\b\d{6}\b/)[0]},first.cookie)
  const signed=(await h.send('/api/inkwell/envelopes/'+first.id,undefined,h.owner)).value.envelope
  assert.equal(signed.signers[0].part11.identity.component,'OIDC')
  assert.equal(signed.signers[0].part11.name,'Verified OIDC Signer')
  const next=await open('OIDC authority revoked');await h.post(next.path+'/signature-code',{},next.cookie)
  const code=(await h.mail(email,'signature code')).text.match(/\b\d{6}\b/)[0]
  await h.post('/auth/settings/identity',{idpSignIn:false},h.owner)
  await h.post(next.path+'/sign',{...body,commandId:crypto.randomUUID(),signatureCode:code},next.cookie,403)
 }finally{await h.close()}
})
