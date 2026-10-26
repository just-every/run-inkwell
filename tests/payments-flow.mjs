import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'
import { paymentEdge } from './payment-edge.mjs'

export async function paymentFlowCases(){
 const provider=paymentEdge(),h=await harness({bindings:{STRIPE_PAYMENTS_SECRET_KEY:'synthetic-inkwell-1',STRIPE_PAYMENTS_TEST_MODE:'true'},networkEdge:provider.edge})
 const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Harbour Studio consulting agreement',{x:40,y:720});const bytes=Buffer.from(await pdf.save()).toString('base64')
 const field={id:'signature',label:'Client signature',type:'signature',signer:0,page:0,x:.1,y:.6,width:.4,height:.06},deposit={kind:'deposit',amount:50000,currency:'usd',method:'card'}
 const template=requirement=>({title:'Harbour consulting deposit',filename:'consulting.pdf',pdfBase64:bytes,roles:[{role:'Client',payment:requirement,paymentConsent:true}],fields:[field]})
 const read=async id=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
 const open=async(email,requirement=deposit)=>{
  const t=(await h.command('template.save',template(requirement))).result
  const id=(await h.command('template.use',{id:t.id,recipients:[{name:'Mara Quinn',email}]})).result.id
  await h.command('envelope.approve',{id,eligible:true})
  const token=new URL((await h.mail(email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1),path='/api/sign/'+token
  await h.post(path+'/code',{},'');const cookie=(await h.post(path+'/verify',{code:(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie
  await h.agree(path,cookie);return{id,path,cookie,token,template:t.id}
 }
 const sign=async(session,status=200)=>h.post(session.path+'/sign',{values:{signature:'Mara Quinn'},adoption:{method:'typed',style:'serif'},consent:true,commandId:crypto.randomUUID()},session.cookie,status)
 try{
  const sender=await h.invite('payments-sender@harbour.example','member'),person=(await h.send('/api/inkwell',undefined,sender)).value.actor
  await h.command('member.role',{operatorId:person.id,role:'sender'})
  await h.command('template.save',template(deposit),sender,403)
  const paid=await open('deposit@harbour.example')
  assert.deepEqual((await read(paid.id)).signers[0].payment,deposit)
  await sign(paid,409)
  await h.post(paid.path+'/payment/start',{consent:true},'',401)
  await h.post(paid.path+'/payment/start',{},paid.cookie,400)
  const checkout=(await h.post(paid.path+'/payment/start',{consent:true},paid.cookie)).value
  assert.equal((await h.post(paid.path+'/payment/start',{consent:true},paid.cookie)).value.reference,checkout.reference,'opening again resumes the same Stripe obligation')
  provider.decline(checkout.reference)
  assert.equal((await h.post(paid.path+'/payment/check',{},paid.cookie)).value.outcome,'failed')
  await sign(paid,409)
  let waiting=await read(paid.id);assert.equal(waiting.status,'awaiting_signature');assert.equal(waiting.signers[0].signedAt,undefined);assert.equal(waiting.signers[0].values,undefined);assert.equal(waiting.signers[0].adoption,undefined)
  assert.equal((await h.send('/api/inkwell/envelopes/'+paid.id+'/artifacts/signed',undefined,h.owner)).status,404)
  provider.succeed(checkout.reference)
  assert.equal((await h.post(paid.path+'/payment/check',{},paid.cookie)).value.outcome,'succeeded')
  await sign(paid)
  const completed=await read(paid.id);assert.equal(completed.status,'completed');assert.equal(completed.signers[0].paymentReceipt.reference,checkout.reference);assert.ok(completed.signers[0].paymentReceipt.paymentIntent)
  const certificate=await h.send('/api/inkwell/envelopes/'+paid.id+'/artifacts/certificate',undefined,h.owner);assert.equal(certificate.status,200)
  const copy=(await h.command('envelope.copy',{id:paid.id})).result.id;assert.deepEqual((await read(copy)).signers[0].payment,deposit);assert.equal((await read(copy)).signers[0].paymentReceipt,undefined)
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  assert.ok(!archive.ndjson.includes(checkout.url),'active Checkout URL does not enter archive custody')
  const restored=await harness()
  try{await restored.post('/api/inkwell/archive/restore',{archive});assert.equal((await restored.send('/api/inkwell/envelopes/'+paid.id,undefined,restored.owner)).value.envelope.signers[0].paymentReceipt.paymentIntent,completed.signers[0].paymentReceipt.paymentIntent)}finally{await restored.close()}
  for(const [kind,requirement] of [['payment',{kind:'payment',amount:10000,currency:'usd',method:'card'}],['saved_card',{kind:'saved_card',currency:'usd'}],['ach_mandate',{kind:'ach_mandate',currency:'usd'}]]){
   const session=await open(kind+'@harbour.example',requirement),started=(await h.post(session.path+'/payment/start',{consent:true},session.cookie)).value
   provider.succeed(started.reference);await h.post(session.path+'/payment/check',{},session.cookie);await sign(session)
   const record=await read(session.id);assert.equal(record.status,'completed');assert.ok(record.signers[0].paymentReceipt[kind==='payment'?'paymentIntent':'setupIntent']);if(kind==='ach_mandate')assert.ok(record.signers[0].paymentReceipt.mandate)
  }
  const malformed=await open('different-amount@harbour.example'),bad=(await h.post(malformed.path+'/payment/start',{consent:true},malformed.cookie)).value;provider.succeed(bad.reference);provider.sessions.get(bad.reference).amount_total=1
  await sign(malformed,503);assert.equal((await read(malformed.id)).signers[0].signedAt,undefined)
  // Stripe can answer after an origin is revoked; the signature transaction must still refuse.
  const race=await open('revoked-embed-payment@harbour.example'),origin='https://portal.harbour.example'
  await h.post('/api/inkwell/embed-origins',{origin,enabled:true,consent:true})
  const launch=(await h.post('/api/inkwell/embeds',{origin,mode:'sign',token:race.token,consent:true})).value.url,entry=await h.send(new URL(launch).pathname),sessionId=entry.headers.get('location').split('/').at(-1),embedded='/api/embed/'+sessionId+race.path,cookies=entry.cookie+'; '+race.cookie
  const r=(await h.post(embedded+'/payment/start',{consent:true},cookies)).value;provider.succeed(r.reference)
  const block=provider.blockNext(),pending=h.send(embedded+'/sign',{values:{signature:'Mara Quinn'},adoption:{method:'typed',style:'serif'},consent:true,commandId:crypto.randomUUID()},cookies)
  await block.ready;await h.post('/api/inkwell/embed-origins',{origin,enabled:false});block.release()
  assert.ok([403,409].includes((await pending).status));assert.equal((await read(race.id)).signers[0].signedAt,undefined,'revocation during provider verification fences the signature transaction')
  console.log('Payments: template authority, deposit decline and success, payment, saved card, ACH mandate, provider binding, explicit signature, copies, archive custody and concurrent embedded revocation passed.')
 }finally{await h.close()}
}
if(process.argv[1]?.endsWith('/payments-flow.mjs'))await paymentFlowCases()
