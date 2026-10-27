import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'
import { hubspotEdge } from './hubspot-edge.mjs'

const bindings={HUBSPOT_ACCESS_TOKEN:'synthetic-inkwell-1',HUBSPOT_ACCOUNT_ID:'7249'}
const field=(id,type,y)=>({id,label:id,type,signer:0,page:0,x:.1,y,width:.65,height:.05})
async function template(h,extra={}){const pdf=await PDFDocument.create();pdf.addPage([612,792]);return (await h.command('template.save',{title:'synthetic-inkwell-2',filename:'synthetic-inkwell-2.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Client'}],fields:[field('signature','signature',.2),field('company','text',.3),field('amount','number',.4)],...extra})).result.id}
const read=async(h,id,cookie=h.owner)=>(await h.send('/api/inkwell/envelopes/'+id,undefined,cookie)).value.envelope
const current=async(h,scope)=>((await h.send('/api/inkwell/send-policies',undefined,h.owner)).value.policies).find(p=>p.source==='integration'&&(!scope||p.scope===scope))
async function policy(h,change,cookie=h.owner,status=200){return h.command('account.send_policy',{source:'integration',expectedVersion:(await current(h)).version,...change},cookie,status)}
const request=(templateId,extra={})=>({commandId:crypto.randomUUID(),consent:true,recordType:'deals',recordId:'901',contactId:'101',templateId,mappings:[{field:'company',object:'deals',property:'company',readOnly:true},{field:'amount',object:'deals',property:'amount',readOnly:true}],...extra})
async function launch(h,t,extra={},cookie=h.owner,status=200){return (await h.post('/api/inkwell/hubspot/prepare',request(t,extra),cookie,status)).value}
const writeback=async(h,id,body={})=>(await h.post(`/api/inkwell/hubspot/envelopes/${id}/writeback`,{commandId:crypto.randomUUID(),...body})).value
async function finish(h,id){
 const e=await read(h,id),email=e.signers[0].email,message=await h.mail(email,'Please sign:');assert.ok(message,'integration queues and dispatches the recipient invitation')
 const path='/api'+new URL(message.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
 await h.post(path+'/code',{},'');const code=(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(path+'/verify',{code},'')).cookie
 await h.post(path+'/sign',{values:{signature:'synthetic-inkwell-3'},consent:true,commandId:crypto.randomUUID()},cookie,403)
 await h.agree(path,cookie)
 await h.post(path+'/sign',{values:{signature:'synthetic-inkwell-3'},consent:false,commandId:crypto.randomUUID()},cookie,400)
 await h.post(path+'/progress',{values:{amount:'1.00'}},cookie,400)
 await h.post(path+'/sign',{values:{signature:'synthetic-inkwell-3',amount:'1.00'},consent:true,commandId:crypto.randomUUID()},cookie,400)
 await h.post(path+'/sign',{values:{signature:'synthetic-inkwell-3'},consent:true,commandId:crypto.randomUUID()},cookie)
 assert.equal((await read(h,id)).status,'completed')
}

test('INTEG-001 PREP-008 AGENT-003: selected native consent, admin admission, eligible owner defaults and provenance custody grant no new access or follow-up',async()=>{
 const edge=hubspotEdge(),h=await harness({bindings,networkEdge:edge.networkEdge})
 try {
  const t=await template(h),admin=await h.invite('synthetic-inkwell-4@example.test','admin'),sender=await h.invite('synthetic-inkwell-5@example.test','member'),viewer=await h.invite('synthetic-inkwell-6@example.test','member')
  const senderId=(await h.send('/api/inkwell',undefined,sender)).value.actor.id
  await h.command('member.role',{operatorId:senderId,role:'sender'})
  for(const cookie of ['',sender,viewer])await launch(h,t,{},cookie,cookie?403:401)
  await launch(h,t,{consent:false},h.owner,403)
  const token=(await h.command('agent.issue')).result.token
  assert.equal((await h.send('/api/inkwell/hubspot/prepare',request(t),h.owner,{authorization:'Bearer '+token})).status,403,'a preparation token cannot use the native connector even beside an owner cookie')
  assert.equal((await h.send('/api/inkwell/hubspot/prepare',request(t),h.owner,{origin:'https://elsewhere.example'})).status,403,'preparation requires the native origin')
  assert.equal(edge.calls().length,0,'refused preparation reads no CRM data')
  const result=await launch(h,t,{},admin),e=await read(h,result.id),owner=(await h.send('/api/inkwell',undefined,h.owner)).value.actor.id
  await h.post(`/api/inkwell/hubspot/envelopes/${e.id}/writeback`,{commandId:crypto.randomUUID()},admin,409)
  assert.equal(e.fields.find(f=>f.id==='amount').prefill.value,'48600.00');assert.equal(e.fields.find(f=>f.id==='amount').readOnly,true)
  assert.equal(e.fields.find(f=>f.id==='company').prefill.source,'HubSpot 7249 deals 901.company')
  const native=e.events.find(event=>event.action==='hubspot.record_prepared')
  assert.equal(native.detail.followupGranted,false);assert.equal(native.detail.noAccessGranted,true)
  assert.equal(native.detail.authorization.actor,(await h.send('/api/inkwell',undefined,admin)).value.actor.id)
  assert.deepEqual(native.detail.authorization.mappings,[{field:'company',object:'deals',property:'company',readOnly:true},{field:'amount',object:'deals',property:'amount',readOnly:true}])
  assert.equal(native.detail.authorization.version,1);assert.match(native.detail.authorization.statement,/write completion status/)
  const follow=(await h.send(`/api/inkwell/envelopes/${e.id}/followup`,undefined,h.owner)).value
  assert.equal(follow.defaultEscalationOwner,owner);assert.equal(follow.grant,null)
  const contactTemplate=await template(h,{fields:[field('signature','signature',.2),field('company','text',.3)]})
  await policy(h,{mode:'autonomous',templates:[t,contactTemplate]})
  const contactLaunch=await launch(h,contactTemplate,{recordType:'contacts',recordId:'101',mappings:[{field:'company',object:'contacts',property:'company',readOnly:true}],send:true},admin)
  const contactEnvelope=await read(h,contactLaunch.id)
  assert.equal(contactEnvelope.status,'awaiting_signature');assert.equal(contactEnvelope.sendOrigin.source,'integration')
  assert.deepEqual(contactEnvelope.signers.map(s=>({name:s.name,email:s.email})),[{name:'Nadia Park',email:'nadia@brightwater.example'}])
  assert.equal(contactEnvelope.fields.find(f=>f.id==='company').prefill.source,'HubSpot 7249 contacts 101.company')
  assert.equal(contactEnvelope.fields.find(f=>f.id==='company').prefill.value,'Brightwater Medical')
  assert.equal((await h.send(`/api/inkwell/envelopes/${contactEnvelope.id}/followup`,undefined,h.owner)).value.grant,null)
  assert.equal((await h.send('/api/inkwell/envelopes/'+e.id,undefined,sender)).status,403)
  edge.owners.set('777',{id:'777',email:'synthetic-inkwell-5@example.test',archived:false})
  const ineligible=await launch(h,t),other=await read(h,ineligible.id)
  assert.equal(other.events.find(event=>event.action==='hubspot.record_prepared').detail.escalationOwner,undefined)
  assert.equal((await h.send(`/api/inkwell/envelopes/${other.id}/followup`,undefined,h.owner)).value.grant,null)
  assert.equal((await h.send('/api/inkwell/envelopes/'+other.id,undefined,sender)).status,403)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_effective_shares WHERE operator_id=?').bind(senderId).first()).n,0)
  const audit=(await h.send('/api/inkwell/audit',undefined,h.owner)).value.entries.find(entry=>entry.action==='hubspot.record.authorized'&&entry.target===e.id)
  assert.deepEqual(audit.after.scope.mappings,native.detail.authorization.mappings);assert.equal(audit.after.scope.recordId,'901');assert.equal(audit.after.scope.version,1)
  assert.ok(!JSON.stringify(audit).includes('48600.00'),'operational audit retains scope without imported field values')
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  assert.ok(!JSON.stringify(archive).includes('synthetic-inkwell-1'),'credentials never export')
  const restored=await harness()
  try {
   await restored.post('/api/inkwell/archive/restore',{archive},restored.owner)
   const imported=await read(restored,e.id);assert.deepEqual(imported.fields,e.fields);assert.deepEqual(imported.events,e.events)
   assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM iw_hubspot_envelopes').first()).n,0)
   assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM iw_hubspot_send_bindings').first()).n,0)
   assert.equal((await restored.send(`/api/inkwell/hubspot/envelopes/${e.id}/writeback`,undefined,restored.owner)).status,404)
  }finally{await restored.close()}
 }finally{await h.close()}
})

test('INTEG-001 ADMIN-004 SEND-001 A1-A5 A9: integration policy defaults off, records principal and credential, and intersects account group and profile scope',async()=>{
 const edge=hubspotEdge(),h=await harness({bindings,networkEdge:edge.networkEdge})
 try {
  const t=await template(h),owner=(await h.send('/api/inkwell',undefined,h.owner)).value.actor.id
  const before=(await h.db.prepare('SELECT COUNT(*) AS n FROM iw_envelopes').first()).n
  const off=await launch(h,t,{send:true},h.owner,403);assert.equal(off.code,'send_policy_off')
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_envelopes').first()).n,before,'off integration send creates zero envelopes')
  const sender=await h.invite('synthetic-inkwell-7@example.test','member');await policy(h,{mode:'autonomous'},sender,403)
  await h.db.prepare('UPDATE oa_sessions SET created_at=? WHERE operator_id=?').bind(Date.now()-20*60_000,owner).run()
  await policy(h,{mode:'autonomous'},h.owner,403)
  const admin=await h.invite('synthetic-inkwell-8@example.test','admin')
  await policy(h,{mode:'autonomous',templates:[t]},admin)
  const group=(await h.post('/api/inkwell/send-policy-scopes',{commandId:crypto.randomUUID(),kind:'group',name:'synthetic-inkwell-9',members:[owner],expectedVersion:0},admin)).value.scope
  const profile=(await h.post('/api/inkwell/send-policy-scopes',{commandId:crypto.randomUUID(),kind:'profile',name:'synthetic-inkwell-10',members:[owner],expectedVersion:0},admin)).value.scope
  await h.command('account.send_policy',{source:'integration',scope:'group',scopeId:group.id,expectedVersion:0,mode:'off'},admin)
  await launch(h,t,{send:true},h.owner,403)
  await h.command('account.send_policy',{source:'integration',scope:'group',scopeId:group.id,expectedVersion:1,mode:'autonomous',templates:[t]},admin)
  await h.command('account.send_policy',{source:'integration',scope:'profile',scopeId:profile.id,expectedVersion:0,mode:'autonomous',templates:[]},admin)
  const narrowed=await launch(h,t,{send:true},h.owner,403);assert.equal(narrowed.code,'send_policy_template')
  await h.command('account.send_policy',{source:'integration',scope:'profile',scopeId:profile.id,expectedVersion:1,mode:'autonomous',templates:[t]},admin)
  const sent=await launch(h,t,{send:true}),e=await read(h,sent.id),record=e.events.find(event=>event.action==='envelope.approved').detail.sendPolicy
  assert.equal(e.sendOrigin.source,'integration');assert.equal(record.source,'integration');assert.equal(record.principal,owner)
  assert.equal(record.credential.kind,'hubspot');assert.equal(record.credential.version,1);assert.ok(record.credential.memberVersion>0)
  assert.deepEqual(record.policies.map(p=>[p.scope,p.version]).sort(),[['account',1],['group',2],['profile',2]])
  assert.deepEqual(record.templates,[t]);assert.equal(record.mode,'autonomous')
  await assert.rejects(h.db.prepare("UPDATE iw_send_policy_versions SET mode='off' WHERE source='integration'").run(),/append-only/)
  const history=(await h.send('/api/inkwell/send-policies',undefined,h.owner)).value.history.filter(p=>p.source==='integration')
  assert.equal(history.length,5);assert.equal(history[0].before.mode,'off')
 }finally{await h.close()}
})

test('INTEG-001 MANAGE-002: completion properties, custom metadata, one timeline event and exact executed PDF reconcile uncertain provider results and durable replay',async()=>{
 const edge=hubspotEdge(),h=await harness({bindings,networkEdge:edge.networkEdge})
 try {
  const t=await template(h,{customFields:[{name:'Cost center',value:'Client services',required:true}]});await policy(h,{mode:'autonomous',templates:[t]})
  await launch(h,t,{customFields:[]},h.owner,400)
  for(const [index,stage] of ['properties','file','note'].entries()){
   const dealId=`synthetic-inkwell-${20+index}`;edge.deals.set(dealId,{company:'synthetic-inkwell-23',amount:'48600.00'})
   const command=request(t,{recordId:dealId,send:true}),sent=(await h.post('/api/inkwell/hubspot/prepare',command)).value
   assert.deepEqual((await h.post('/api/inkwell/hubspot/prepare',command)).value,sent,'launch replay returns the same envelope')
   edge.failNext(stage,'after')
   await finish(h,sent.id)
   const held=(await h.send(`/api/inkwell/hubspot/envelopes/${sent.id}/writeback`,undefined,h.owner)).value;assert.equal(held.status,'held');assert.equal(held.uncertain,stage)
   if(stage==='file'){
    const remote=edge.files().find(file=>file.name.startsWith(sent.id+'-')),original=remote.bytes
    remote.bytes=Buffer.from('synthetic-inkwell-conflicting-pdf')
    assert.equal((await writeback(h,sent.id)).status,'held','a recovered path with different bytes never counts as the executed PDF')
    assert.equal(edge.notes().filter(note=>note.recordId===dealId).length,0)
    remote.bytes=original
   }
   const concurrent=await Promise.all([writeback(h,sent.id),writeback(h,sent.id)])
   assert.ok(concurrent.some(result=>result.status==='completed'),'one concurrent reconciliation completes')
   const recovered=(await h.send(`/api/inkwell/hubspot/envelopes/${sent.id}/writeback`,undefined,h.owner)).value;assert.equal(recovered.status,'completed');assert.equal(recovered.propertiesUpdated,true);assert.ok(recovered.fileId);assert.ok(recovered.noteId)
   const beforeCalls=edge.calls().length;await writeback(h,sent.id);assert.equal(edge.calls().length,beforeCalls,'completed replay performs no provider operation')
   const patches=edge.patches().filter(p=>p.id===dealId),notes=edge.notes().filter(n=>n.recordId===dealId)
   assert.equal(patches.length,1);assert.equal(notes.length,1)
   assert.equal(patches[0].properties.inkwell_status,'completed');assert.equal(patches[0].properties.inkwell_envelope_id,sent.id)
   assert.deepEqual(JSON.parse(patches[0].properties.inkwell_custom_fields),[{name:'Cost center',value:'Client services',required:true}])
   assert.deepEqual(JSON.parse(patches[0].properties.inkwell_key_fields),{company:'synthetic-inkwell-23',amount:'48600.00'})
   const file=edge.files().find(file=>file.id===recovered.fileId),signed=(await h.send(`/api/inkwell/envelopes/${sent.id}/artifacts/signed`,undefined,h.owner)).bytes
   assert.deepEqual(file.bytes,Buffer.from(signed));assert.equal(notes[0].properties.hs_attachment_ids,file.id)
   assert.match(notes[0].properties.hs_note_body,new RegExp(sent.id));assert.equal(patches[0].properties.inkwell_signed_sha256,(await read(h,sent.id)).signedSha256)
   assert.ok(edge.calls().some(call=>call.method==='GET'&&call.path==='/files/v3/files/search'))
  }
  assert.equal(edge.files().length,3);assert.equal(edge.notes().length,3);assert.equal(edge.patches().length,3)
  assert.ok(!JSON.stringify(h.logs()).includes('synthetic-inkwell-1'),'credentials never enter operational logs')
 }finally{await h.close()}
})

const sendAt=()=>({at:new Date(Date.now()+2*86_400_000).toISOString().slice(0,16),timeZone:'Pacific/Honolulu'})
test('INTEG-001 SEND-001 A1 A2 A6-A8: internal approval remains additional, deferred integration sends recheck current policy credential principal and template, and held drafts require explicit recovery',async()=>{
 const edge=hubspotEdge(),h=await harness({bindings,networkEdge:edge.networkEdge})
 try {
  const t=await template(h),admin=await h.invite('synthetic-inkwell-30@example.test','admin'),adminActor=(await h.send('/api/inkwell',undefined,admin)).value.actor
  await h.command('account.internal_approval',{rule:{approver:adminActor.id}})
  await policy(h,{mode:'autonomous',templates:[t],requireInternalApproval:true})
  const pending=await launch(h,t,{send:true}),waiting=await read(h,pending.id)
  assert.equal(waiting.internalApproval.state,'pending');assert.equal(await h.mail('nadia@brightwater.example','Please sign:'),undefined)
  await h.command('envelope.internal_decide',{id:pending.id,decision:'approve'},admin)
  assert.equal((await read(h,pending.id)).status,'awaiting_signature')
  await h.command('account.internal_approval',{rule:null})
  await policy(h,{requireInternalApproval:false,deferredRelease:false})
  const count=(await h.db.prepare('SELECT COUNT(*) AS n FROM iw_envelopes').first()).n
  const refused=await launch(h,t,{send:true,sendAt:sendAt()},h.owner,403);assert.equal(refused.code,'send_policy_deferred')
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_envelopes').first()).n,count)
  await policy(h,{deferredRelease:true})
  const scheduled=await launch(h,t,{send:true,sendAt:sendAt()}),planned=await read(h,scheduled.id)
  assert.equal(planned.sendOrigin.source,'integration');assert.ok(planned.scheduled)
  await policy(h,{mode:'off'});await h.scheduled(Date.parse(planned.scheduled.at)+1000)
  let held=await read(h,planned.id);assert.equal(held.status,'prepared');assert.ok(held.sendHold);assert.equal(held.events.at(-1).detail.code,'send_policy_off')
  await policy(h,{mode:'autonomous'});await h.scheduled(Date.parse(planned.scheduled.at)+2000)
  assert.equal((await read(h,planned.id)).status,'prepared','restored policy does not release a held draft')
  await h.command('envelope.approve',{id:planned.id,eligible:true});assert.equal((await read(h,planned.id)).status,'awaiting_signature');assert.equal((await read(h,planned.id)).sendOrigin,undefined)
  const credential=await launch(h,t,{send:true,sendAt:sendAt()}),credentialBefore=await read(h,credential.id)
  await h.db.prepare("UPDATE iw_hubspot_credentials SET active=0 WHERE id='hubspot'").run()
  await h.scheduled(Date.parse(credentialBefore.scheduled.at)+1000)
  held=await read(h,credential.id);assert.equal(held.status,'prepared');assert.equal(held.events.at(-1).detail.code,'send_credential')
  await h.db.prepare("UPDATE iw_hubspot_credentials SET active=1 WHERE id='hubspot'").run();await h.scheduled(Date.parse(credentialBefore.scheduled.at)+2000)
  assert.equal((await read(h,credential.id)).status,'prepared')
  const principal=await launch(h,t,{send:true,sendAt:sendAt()},admin),principalBefore=await read(h,principal.id)
  await h.db.prepare("UPDATE oa_operators SET role='member' WHERE id=?").bind(adminActor.id).run()
  await h.scheduled(Date.parse(principalBefore.scheduled.at)+1000)
  assert.equal((await read(h,principal.id)).status,'prepared');assert.equal((await read(h,principal.id)).events.at(-1).detail.code,'send_credential')
  await h.db.prepare("UPDATE oa_operators SET role='admin' WHERE id=?").bind(adminActor.id).run()
  await h.scheduled(Date.parse(principalBefore.scheduled.at)+2000);assert.equal((await read(h,principal.id)).status,'prepared')
  const changed=await launch(h,t,{send:true,sendAt:sendAt()}),changedBefore=await read(h,changed.id)
  await h.command('template.remove',{id:t});await h.scheduled(Date.parse(changedBefore.scheduled.at)+1000)
  assert.equal((await read(h,changed.id)).status,'prepared');assert.ok((await read(h,changed.id)).sendHold)
 }finally{await h.close()}
})
