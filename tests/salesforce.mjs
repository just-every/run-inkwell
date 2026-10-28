import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'
import { salesforceEdge,salesforceBindings,salesforceAddress } from './salesforce-edge.mjs'
export async function salesforceSanity(){
 const edge=salesforceEdge(),h=await harness({bindings:salesforceBindings,networkEdge:edge.networkEdge})
 try{
  const pdf=await PDFDocument.create();pdf.addPage([612,792])
  const field=(id,type,y)=>({id,label:id,type,signer:0,page:0,x:.1,y,width:.5,height:.05})
  const template=(await h.command('template.save',{title:'synthetic-inkwell-8',filename:'synthetic-inkwell-8.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Client'}],fields:[field('signature','signature',.5),field('amount','number',.3)]})).result.id
  const read=async id=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const prepare=(extra={},cookie=h.owner,status=200)=>h.post('/api/inkwell/salesforce/prepare',{commandId:crypto.randomUUID(),consent:true,recordType:'Opportunity',recordId:'synthetic-inkwell-3',templateId:template,recipients:[{name:'Synthetic signer',email:salesforceAddress(6)}],mappings:[{field:'amount',property:'Amount',readOnly:true}],...extra},cookie,status)
  const viewer=await h.invite(salesforceAddress(9),'member'),sender=await h.invite(salesforceAddress(10),'member')
  const senderId=(await h.send('/api/inkwell',undefined,sender)).value.actor.id
  await h.command('member.role',{operatorId:senderId,role:'sender'})
  for(const [cookie,status] of [['',401],[viewer,403],[sender,403]])await prepare({},cookie,status)
  await prepare({consent:false},h.owner,403)
  const token=(await h.command('agent.issue')).result.token
  assert.equal((await h.send('/api/inkwell/salesforce/prepare',{},h.owner,{authorization:'Bearer '+token})).status,403)
  assert.equal((await h.send('/api/inkwell/salesforce/prepare',{},h.owner,{origin:'https://elsewhere.example'})).status,403)
  assert.equal(edge.calls.length,0,'refused native doors read no Salesforce data')
  const before=(await h.db.prepare('SELECT count(*) n FROM iw_envelopes').first()).n
  await prepare({send:true},h.owner,403)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM iw_envelopes').first()).n,before,'policy-off send creates no envelope')
  const current=(await h.send('/api/inkwell/send-policies',undefined,h.owner)).value.policies.find(p=>p.source==='salesforce')
  await h.command('account.send_policy',{source:'salesforce',expectedVersion:current.version,mode:'autonomous',templates:[template]})
  for(const [type,key,property] of [['Account','synthetic-inkwell-5','AnnualRevenue'],['Contact','synthetic-inkwell-6','Phone']]){
   if(type==='Contact')edge.records.get('Contact:'+key).Phone='48600'
   const value=(await prepare({recordType:type,recordId:key,mappings:[{field:'amount',property,readOnly:true}]})).value
   const e=await read(value.id);assert.equal(e.status,'prepared');assert.equal(e.fields.find(f=>f.id==='amount').prefill.source,`Salesforce synthetic-inkwell-2 ${type} ${key}.${property}`)
  }
  edge.records.get('Contact:synthetic-inkwell-6').Phone=null
  for(const stage of ['properties','file']){
   const command={commandId:crypto.randomUUID(),send:true},sent=(await prepare(command)).value,e=await read(sent.id)
   assert.equal((await prepare(command)).value.id,sent.id,'preparation replay returns the same envelope')
   assert.equal(e.status,'awaiting_signature');assert.equal(e.sendOrigin.credential.kind,'salesforce')
   const amount=e.fields.find(f=>f.id==='amount');assert.equal(amount.prefill.value,'48600.00');assert.equal(amount.readOnly,true);assert.equal(amount.prefill.source,'Salesforce synthetic-inkwell-2 Opportunity synthetic-inkwell-3.Amount')
   assert.equal((await h.send('/api/inkwell/envelopes/'+e.id,undefined,sender)).status,403,'CRM ownership grants no reader access')
   let follow=(await h.send(`/api/inkwell/envelopes/${e.id}/followup`,undefined,h.owner)).value
   assert.equal(follow.grant,null);assert.equal(follow.defaultEscalationOwner,e.createdBy)
   await h.command('envelope.followup',{id:e.id,enabled:true})
   follow=(await h.send(`/api/inkwell/envelopes/${e.id}/followup`,undefined,h.owner)).value;assert.equal(follow.grant.state,'active');assert.equal(follow.grant.escalationOwner,e.createdBy)
   await h.command('envelope.followup',{id:e.id,enabled:false})
   const mail=await h.mail(salesforceAddress(6),'Please sign:'),path='/api'+new URL(mail.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
   await h.post(path+'/code',{},'');const code=(await h.mail(salesforceAddress(6),'verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(path+'/verify',{code},'')).cookie
   await h.agree(path,cookie)
   await h.post(path+'/progress',{values:{amount:'1'}},cookie,400)
   await h.post(path+'/sign',{commandId:crypto.randomUUID(),consent:true,values:{signature:'Synthetic signer',amount:'1'}},cookie,400)
   edge.failNext(stage)
   const sign={commandId:crypto.randomUUID(),consent:true,values:{signature:'Synthetic signer'}}
   await h.post(path+'/sign',sign,cookie)
   const wb=`/api/inkwell/salesforce/envelopes/${e.id}/writeback`
   let progress=(await h.send(wb,undefined,h.owner)).value;assert.equal(progress.status,'held');assert.equal(progress.uncertain,stage)
   const calls=edge.calls.length
   for(const [who,status] of [['',401],[viewer,403],[sender,403]]){assert.equal((await h.send(wb,undefined,who)).status,status);await h.post(wb,{},who,status)}
   assert.equal(edge.calls.length,calls,'refused progress and retry calls do not contact Salesforce')
   if(stage==='file'){
    const bytes=edge.files.at(-1).bytes;edge.files.at(-1).bytes=Buffer.from('synthetic-inkwell-wrong-bytes')
    assert.equal((await h.post(wb,{})).value.status,'held','different bytes never count as the executed PDF');edge.files.at(-1).bytes=bytes
   }
   progress=(await h.post(wb,{})).value;assert.equal(progress.status,'completed');assert.equal(progress.propertiesUpdated,true);assert.ok(progress.fileId)
   const completed=await read(e.id),patches=edge.patches.filter(p=>p.fields.Inkwell_Envelope_Id__c===e.id),files=edge.files.filter(f=>f.Title.startsWith(e.id))
   assert.equal(patches.length,1);assert.equal(files.length,1);assert.equal(patches[0].fields.Inkwell_Status__c,'completed');assert.equal(patches[0].fields.Inkwell_Signed_SHA256__c,completed.signedSha256);assert.deepEqual(JSON.parse(patches[0].fields.Inkwell_Key_Fields__c),{amount:'48600.00'})
   assert.equal(files[0].FirstPublishLocationId,'synthetic-inkwell-3');assert.deepEqual(files[0].bytes,Buffer.from((await h.send(`/api/inkwell/envelopes/${e.id}/artifacts/signed`,undefined,h.owner)).bytes))
   const writes=edge.patches.length+edge.files.length;await h.post(wb,{});await h.post(path+'/sign',sign,cookie);assert.equal(edge.patches.length+edge.files.length,writes,'capture and completion replay duplicate nothing')
  }
  const definition={accountId:'synthetic-inkwell-2',scope:{kind:'all'},properties:['FirstName','LastName','Email','Account.Name'],mappings:{name:'full_name',email:'Email',company:'Account.Name'},destination:'shared_contacts',updateBehavior:'preserve_local_edits',cadence:'daily'}
  const sync=(body,cookie=h.owner,status=200)=>h.post('/api/inkwell/salesforce/sync',body,cookie,status)
  await sync({operation:'authorize',definition,consent:false},h.owner,400)
  await sync({operation:'authorize',definition,consent:true},sender,403)
  const auth=(await sync({operation:'authorize',definition,consent:true})).value
  const run=(await sync({operation:'start',authorizationId:auth.id,requestId:crypto.randomUUID()})).value;assert.equal(run.records,1);assert.equal(run.remaining,'more_pages')
  assert.equal((await sync({operation:'continue',runId:run.id})).value.status,'completed')
  const book=(await h.send('/api/inkwell/contacts?q=Synthetic',undefined,sender)).value
  assert.ok(book.contacts.some(c=>c.email===salesforceAddress(6)&&c.name==='Synthetic Signer'&&c.company==='Synthetic company'),'a provider contact is visible in the native sender contact book')
  await h.post('/api/inkwell/contacts',{name:'Local edit',email:salesforceAddress(6),company:'Local company'})
  edge.records.get('Contact:synthetic-inkwell-6').FirstName='Provider update'
  const repeated=(await sync({operation:'start',authorizationId:auth.id,requestId:crypto.randomUUID()})).value
  let progress=(await h.send('/api/inkwell/salesforce/progress',undefined,h.owner)).value;assert.equal(progress.conflicts.length,1);assert.equal(progress.conflicts[0].local.name,'Local edit')
  await sync({operation:'resolve',conflictId:progress.conflicts[0].id,choice:'keep_local'})
  await sync({operation:'revoke',authorizationId:auth.id})
  const calls=edge.calls.length;await sync({operation:'continue',runId:repeated.id},h.owner,403);assert.equal(edge.calls.length,calls,'revocation refuses the next page before reading')
  const ownerRecord=edge.records.get('User:synthetic-inkwell-4');ownerRecord.Email=salesforceAddress(10)
  const capture={commandId:crypto.randomUUID()},ineligible=(await prepare(capture)).value,ie=await read(ineligible.id);assert.equal(ie.events.find(e=>e.action==='salesforce.record_prepared').detail.escalationOwner,undefined);assert.equal((await h.send('/api/inkwell/envelopes/'+ie.id,undefined,sender)).status,403)
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  assert.ok(!JSON.stringify(archive).includes(salesforceBindings.SALESFORCE_ACCESS_TOKEN),'archive excludes installation credentials')
  const restored=await harness({bindings:salesforceBindings,networkEdge:edge.networkEdge})
  try{await restored.post('/api/inkwell/archive/restore',{archive});assert.deepEqual((await restored.send('/api/inkwell/envelopes/'+ie.id,undefined,restored.owner)).value.envelope.fields,ie.fields);assert.equal((await restored.db.prepare('SELECT count(*) n FROM iw_salesforce_envelopes').first()).n,0);await restored.post(`/api/inkwell/salesforce/envelopes/${ie.id}/writeback`,{},restored.owner,404)}finally{await restored.close()}
  await h.post('/api/inkwell/erase',{id:ie.id,confirmation:'ERASE'})
  assert.equal((await h.db.prepare('SELECT count(*) n FROM iw_salesforce_envelopes WHERE envelope_id=?').bind(ie.id).first()).n,0)
  const erasedCalls=edge.calls.length;await prepare(capture,h.owner,410);assert.equal(edge.calls.length,erasedCalls,'erased preparation replay reads and writes nothing')
  const laterJournal=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  const fenced=await harness()
  try{await fenced.post('/api/inkwell/archive/restore',{archive,laterJournal},fenced.owner,400)}finally{await fenced.close()}
  const logs=JSON.stringify(h.logs())+(await h.send('/api/inkwell/audit.csv',undefined,h.owner)).value
  for(const value of ['48600','Local company','Provider update','Bearer '+salesforceBindings.SALESFORCE_ACCESS_TOKEN])assert.equal(logs.includes(value),false,'logs exclude provider values and credentials')
  const newAuth=(await sync({operation:'authorize',definition,consent:true})).value
  const newRun=(await sync({operation:'start',authorizationId:newAuth.id,requestId:crypto.randomUUID()})).value
  await h.db.prepare("UPDATE iw_salesforce_credentials SET active=0 WHERE id='salesforce'").run()
  const stopped=edge.calls.length;await sync({operation:'continue',runId:newRun.id},h.owner,403);assert.equal(edge.calls.length,stopped)
 }finally{await h.close()}
}
