import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'
const secret=Buffer.from('synthetic-inkwell-31')
const bindings={MAIL_INBOUND_DOMAIN:'replies.harbour.example',MAIL_INBOUND_SECRET:'whsec_'+secret.toString('base64'),MAIL_INBOUND_API_KEY:'synthetic-inkwell-32'}
async function pdf(){const p=await PDFDocument.create();p.addPage([612,792]).drawText('Synthetic vendor NDA');return Buffer.from(await p.save())}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
async function receive(h,to,from,body,{attachment,eventId=crypto.randomUUID(),timestamp=String(Math.floor(Date.now()/1000)),status=200}={}){
 const mid=crypto.randomUUID(),aid=crypto.randomUUID();if(attachment)h.attachment(aid,{bytes:attachment,metadata:{id:aid,filename:'source.pdf',content_type:'application/pdf',size:attachment.length,expires_at:new Date(Date.now()+60000).toISOString(),download_url:`https://inbound-cdn.resend.com/${mid}/attachments/${aid}`}})
 h.inbound({id:mid,from,to:[to],subject:'Vendor NDA',text:body,headers:{},attachments:attachment?[{id:aid,filename:'source.pdf',content_type:'application/pdf',size:attachment.length}]:[],message_id:'<'+mid+'@clients.example>'})
 const event={type:'email.received',data:{email_id:mid}},raw=JSON.stringify(event),signature=createHmac('sha256',secret).update(`${eventId}.${timestamp}.${raw}`).digest('base64')
 await h.post('/api/inkwell/mail/replies',event,'',status,{'svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature});return{eventId,mid}
}
const view=async(h,id,cookie=h.owner)=>(await h.post(`/api/inkwell/envelopes/${id}/information`,undefined,cookie)).value
const envelope=async(h,id,cookie=h.owner)=>(await h.post('/api/inkwell/envelopes/'+id,undefined,cookie)).value.envelope
const question=async(h,id,kind,email,extra={})=>(await h.post('/api/inkwell/information',{id,kind,email,approveContact:true,...extra})).value
const replyAddress=async(h,email)=>{const message=await h.mail(email,'Information needed:');assert.ok(message,'the specific question reached the approved person');return message.reply_to}

test('Missing information: approved specific questions merge title and W-9 with authenticated sources; material terms are flagged and private custody survives restore',async()=>{
 const h=await harness({bindings}),original=await pdf()
 try{
  const id=(await h.command('envelope.prepare',{title:'Synthetic NDA',filename:'nda.pdf',pdfBase64:original.toString('base64'),signers:[{name:'Client Signer',email:'client@clients.example'}],fields:[{id:'sig',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.7,width:.4,height:.06},{id:'title',label:'Signer title',type:'title',signer:0,page:0,x:.1,y:.5,width:.4,height:.05},{id:'price',label:'Price',type:'text',prefill:{value:'1500',source:'Sender'},signer:0,page:0,x:.1,y:.4,width:.4,height:.05}]})).result.id
  assert.deepEqual((await view(h,id)).missing,[{kind:'title',fieldId:'title',signer:0},{kind:'w9'}])
  const outsider=await h.invite('unshared@harbour.example','member'),outsiderId=(await h.post('/api/inkwell',undefined,outsider)).value.actor.id;await h.command('member.role',{operatorId:outsiderId,role:'sender'});await h.post('/api/inkwell/information',{id,kind:'w9',email:'finance@harbour.example',approveContact:true},outsider,403)
  const viewer=await h.invite('reader@harbour.example','member'),bearer=(await h.command('agent.issue')).result.token
  await h.post('/api/inkwell/information',{id,kind:'title',email:'client@clients.example',fieldId:'title',approveContact:true},viewer,403)
  await h.post('/api/inkwell/information',{id,kind:'title',email:'client@clients.example',fieldId:'title',approveContact:true},h.owner,403,{authorization:'Bearer '+bearer})
  await h.post('/api/inkwell/information',{id,kind:'title',email:'client@clients.example',fieldId:'title'},h.owner,400)
  await h.post('/api/inkwell/information',{id,kind:'title',email:'wrong@clients.example',fieldId:'title',approveContact:true},h.owner,400)
  assert.equal(h.attempted().filter(m=>m.subject.startsWith('Information needed:')).length,0)
  await question(h,id,'title','client@clients.example',{fieldId:'title'});let address=await replyAddress(h,'client@clients.example');assert.match((await h.mail('client@clients.example')).text,/signing title/)
  await receive(h,address,'outsider@clients.example','Director',{status:403});await receive(h,address,'outsider@clients.example, Person <client@clients.example>','Director',{status:403});await receive(h,address,'client@clients.example','Director',{timestamp:String(Math.floor(Date.now()/1000)-600),status:401})
  const answer=await receive(h,address,'client@clients.example','Director'),same=answer.eventId
  await receive(h,address,'client@clients.example','CEO',{eventId:same,status:409});await receive(h,address,'client@clients.example','CEO',{status:403})
  const title=(await envelope(h,id)).fields.find(f=>f.id==='title').prefill;assert.equal(title.value,'Director');assert.equal(title.source,`Authenticated email ${answer.mid} from client@clients.example`)
  await question(h,id,'w9','finance@harbour.example');address=await replyAddress(h,'finance@harbour.example');assert.match((await h.mail('finance@harbour.example')).text,/W-9.*PDF/)
  const priceReply=await receive(h,address,'finance@harbour.example','Change the price to $2000 instead.',{attachment:original})
  assert.equal((await envelope(h,id)).fields.find(f=>f.id==='price').prefill.value,'1500');assert.equal((await view(h,id)).requests.at(-1).state,'flagged')
  assert.ok((await envelope(h,id)).events.some(e=>e.action==='agent.material_change_flagged'))
  await question(h,id,'w9','finance@harbour.example');address=await replyAddress(h,'finance@harbour.example');const w9=await pdf(),w9Reply=await receive(h,address,'finance@harbour.example','Attached.',{attachment:w9})
  const e=await envelope(h,id);assert.equal(e.supplements,undefined,'the W-9 is never exposed as a signer supplement');const privateW9=(await view(h,id)).attachments;assert.equal(privateW9.length,1);assert.equal(privateW9[0].sha256,digest(w9));assert.equal(digest((await h.post(`/api/inkwell/envelopes/${id}/information/attachments/${privateW9[0].id}`,undefined)).bytes),digest(w9));await h.post(`/api/inkwell/envelopes/${id}/information/attachments/${privateW9[0].id}`,undefined,viewer,403);assert.equal(e.originalSha256,digest(original));assert.deepEqual((await view(h,id)).missing,[])
  const sources=(await view(h,id)).requests;assert.deepEqual(sources.map(r=>r.state),['merged','flagged','merged']);assert.equal(sources[2].answer.providerMessageId,w9Reply.mid);assert.equal(sources[2].answer.attachments[0].sha256,digest(w9));assert.equal(sources[1].answer.providerMessageId,priceReply.mid)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/information`,undefined,viewer)).status,403)
  const exported=(await h.post('/api/inkwell/exports',{scope:'selected',ids:[id]})).value,tar=await h.post(`/api/inkwell/exports/${exported.id}/download`,undefined);assert.ok(Buffer.from(tar.bytes).includes(Buffer.from('Change the price')));assert.ok(!Buffer.from(tar.bytes).includes(Buffer.from(address)))
  const archive=(await h.post('/api/inkwell/archive',undefined)).value,serialized=JSON.stringify(archive);assert.ok(serialized.includes('Change the price'));assert.ok(!serialized.includes(address.match(/agent\+([^@]+)/)[1]))
  const restored=await harness({bindings});try{await restored.post('/api/inkwell/archive/restore',{archive});assert.equal((await view(restored,id)).requests.length,3);assert.equal((await restored.db.prepare('SELECT COUNT(*) n FROM iw_agent_work_caps').first()).n,0);await receive(restored,address,'finance@harbour.example','Attached.',{attachment:w9,status:403})}finally{await restored.close()}
  for(const output of [JSON.stringify(h.logs()),JSON.stringify((await h.post('/api/inkwell/audit',undefined)).value),JSON.stringify(e.events)])assert.ok(!output.includes('Change the price'))
  await h.command('envelope.void',{id,reason:'Synthetic record cleanup'});await h.post('/api/inkwell/information',{id,kind:'w9',email:'finance@harbour.example',approveContact:true},h.owner,409);await h.command('envelope.hold',{id,reason:'Synthetic custody review'});await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'},h.owner,409);await h.command('envelope.lift_hold',{id,reason:'Synthetic review completed'});await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'});assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM iw_agent_requests WHERE envelope_id=?').bind(id).first()).n,0);await h.post('/api/inkwell/archive/restore',{archive},h.owner,400);await h.post(`/api/inkwell/exports/${exported.id}/download`,undefined,h.owner,410)
 }finally{await h.close()}
})

test('Inbound agreements: authenticated forward selects the granted business-role signer; human approval and signing precede a once-only grant-bound executed return',async()=>{
 const h=await harness({bindings}),bytes=await pdf()
 try{
  const signer=await h.invite('procurement@harbour.example','member'),me=(await h.post('/api/inkwell',undefined,signer)).value.actor;await h.command('member.role',{operatorId:me.id,role:'sender'})
  const config={approve:true,role:'Procurement signer',memberId:me.id,forwarder:'owner@harbour.example',returnTo:'vendor@clients.example',allowReturn:false}
  await h.post('/api/inkwell/inbound-grant',config,signer,403)
  let grant=(await h.post('/api/inkwell/inbound-grant',config)).value
  await h.post('/api/inkwell/mail/replies',{type:'email.received'},'',401)
  await receive(h,grant.address,'unknown@clients.example','Forwarded NDA',{attachment:bytes,status:403})
  const received=await receive(h,grant.address,'owner@harbour.example','Forwarded NDA',{attachment:bytes})
  await receive(h,grant.address,'owner@harbour.example','Forwarded NDA',{attachment:bytes,eventId:received.eventId,status:409})
  const list=(await h.post('/api/inkwell/envelopes',undefined,signer)).value.envelopes;assert.equal(list.length,1);const id=list[0].id,e=await envelope(h,id,signer)
  assert.equal(e.status,'prepared');assert.deepEqual(e.signers.map(s=>s.email),['procurement@harbour.example']);assert.equal(e.originalSha256,digest(bytes));assert.equal(e.events.find(e=>e.action==='agent.inbound_prepared').detail.role,'Procurement signer');assert.equal(await h.mail('procurement@harbour.example','Please sign:'),undefined);assert.equal(await h.mail('vendor@clients.example'),undefined)
  await h.post('/api/inkwell/inbound-return',{id},h.owner,409)
  await h.command('envelope.approve',{id,eligible:true},signer)
  const opened=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()},signer),path='/api'+new URL(opened.value.result.signing.url).pathname;await h.agree(path,opened.cookie);await h.post(path+'/sign',{values:{'internal-signature':'procurement'},consent:true,commandId:crypto.randomUUID()},opened.cookie)
  assert.equal((await envelope(h,id)).status,'completed');await h.post('/api/inkwell/inbound-return',{id},h.owner,403);assert.equal(await h.mail('vendor@clients.example'),undefined)
  // A separate fresh grant permits return for a separately prepared agreement.
  grant=(await h.post('/api/inkwell/inbound-grant',{...config,allowReturn:true})).value
  await receive(h,grant.address,'owner@harbour.example','Another NDA',{attachment:bytes})
  const id2=(await h.post('/api/inkwell/envelopes',undefined,signer)).value.envelopes.find(e=>e.id!==id).id
  await h.command('envelope.approve',{id:id2,eligible:true},signer)
  const opened2=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id:id2},commandId:crypto.randomUUID()},signer),path2='/api'+new URL(opened2.value.result.signing.url).pathname;await h.agree(path2,opened2.cookie);await h.post(path2+'/sign',{values:{'internal-signature':'procurement'},consent:true,commandId:crypto.randomUUID()},opened2.cookie)
  await h.post('/api/inkwell/inbound-return',{id:id2},signer,403);const returns=await Promise.all([h.send('/api/inkwell/inbound-return',{id:id2},h.owner),h.send('/api/inkwell/inbound-return',{id:id2},h.owner)]);assert.deepEqual(returns.map(r=>r.status).sort(),[200,409]);assert.equal(returns.find(r=>r.status===200).value.outcome,'sent')
  const returned=await h.mail('vendor@clients.example','Executed agreement:');assert.deepEqual(returned.attachments.map(a=>a.filename),['executed-agreement.pdf','certificate.pdf']);assert.equal(digest(Buffer.from(returned.attachments[0].content,'base64')),digest((await h.post(`/api/inkwell/envelopes/${id2}/artifacts/signed`,undefined)).bytes))
  await h.post('/api/inkwell/inbound-return',{id:id2},h.owner,409);assert.equal(h.attempted().filter(m=>m.to.includes('vendor@clients.example')).length,1)
  await h.post('/api/inkwell/inbound-grant',{revoke:true});await receive(h,grant.address,'owner@harbour.example','Revoked',{attachment:bytes,status:403})
  const renewed=(await h.post('/api/inkwell/inbound-grant',{...config,allowReturn:true})).value;await h.command('member.role',{operatorId:me.id,role:'viewer'});await h.command('member.role',{operatorId:me.id,role:'sender'});await receive(h,renewed.address,'owner@harbour.example','Restored role',{attachment:bytes,status:403})
  const audit=(await h.post('/api/inkwell/audit',undefined)).value;assert.ok(JSON.stringify(audit).includes('agent.inbound_granted'));assert.ok(!JSON.stringify(audit).includes('Forwarded NDA'));
  const archive=(await h.post('/api/inkwell/archive',undefined)).value;assert.ok(JSON.stringify(archive).includes('Forwarded NDA'));assert.ok(!JSON.stringify(archive).includes(grant.address.match(/agent\+([^@]+)/)[1]));assert.ok(!JSON.stringify(h.logs()).includes('Forwarded NDA'))
 }finally{await h.close()}
})
