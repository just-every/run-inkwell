import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

test('ADMIN-005: template, role, integration and native member changes have atomic before and after history, authorized search and CSV, without credential exposure', async () => {
 const h=await harness();try {
 const pdf=await PDFDocument.create();pdf.addPage([612,792]);const original=await pdf.save(),fields=[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.3,width:.4,height:.05}]
 const sender=async email=>{const cookie=await h.invite(email,'member'),id=(await h.send('/api/inkwell',undefined,cookie)).value.actor.id;await h.command('member.role',{operatorId:id,role:'sender'});return{cookie,id}}
 const ownerId=(await h.send('/api/inkwell',undefined,h.owner)).value.actor.id,admin=await h.invite('auditor@harbour.example','admin'),person=await sender('audit.sender@harbour.example'),viewer=await h.invite('audit.viewer@harbour.example','member')
 const audit=async(params='',cookie=h.owner)=>{const r=await h.send('/api/inkwell/audit'+(params?'?'+params:''),undefined,cookie);assert.equal(r.status,200,JSON.stringify(r.value));return r.value}
 for(const path of ['/api/inkwell/audit','/api/inkwell/audit.csv']) {assert.equal((await h.send(path)).status,401);assert.equal((await h.send(path,undefined,person.cookie)).status,403);assert.equal((await h.send(path,undefined,viewer)).status,403)}
 const definition={title:'Harbour account audit NDA',filename:'nda.pdf',pdfBase64:Buffer.from(original).toString('base64'),roles:[{role:'Client',order:1}],fields:[fields[0]]}
 const template=(await h.command('template.save',definition)).result.id
 await h.command('template.update',{...definition,id:template,title:'Harbour account audit NDA revised'},admin)
 await h.command('member.role',{operatorId:person.id,role:'viewer'},admin)
 await h.command('member.role',{operatorId:person.id,role:'sender'},h.owner)
 const url='https://hooks.slack.com/services/synthetic-inkwell-11/synthetic-inkwell-12/synthetic-inkwell-13'
 await h.post('/api/inkwell/notices/settings',{connect:{channel:'slack',url}})
 await h.post('/api/inkwell/notices/settings',{connect:{channel:'slack',url:'https://hooks.slack.com/services/synthetic-inkwell-14/synthetic-inkwell-15/synthetic-inkwell-16'}})
 await h.post('/auth/display-name',{displayName:'Harbour Audit Owner'})
 await h.command('account.completed_copies',{delivery:'attachment'})
 const agent=(await h.command('agent.issue')).result;await h.command('agent.revoke',{id:agent.id})
 const all=(await audit('limit=200')).entries,templateChanges=(await audit('q='+encodeURIComponent(template))).entries
 assert.ok(templateChanges.some(e=>e.before?.version===1&&e.after?.version===2),'template version before and after')
 assert.ok(templateChanges.some(e=>e.before?.title==='Harbour account audit NDA'&&e.after?.title==='Harbour account audit NDA revised'))
 assert.ok(all.some(e=>e.target==='member-role:'+person.id&&e.before?.role==='viewer'&&e.after?.role==='sender'&&e.actorId===ownerId))
 assert.ok(all.some(e=>e.before?.displayName==='Harbour Owner'&&e.after?.displayName==='Harbour Audit Owner'&&e.actorId===ownerId),'native profile mutation uses its authenticated actor')
 const connections=all.filter(e=>e.action.startsWith('notice_channel.'));assert.ok(connections.length>=2);assert.ok(connections.some(e=>e.before!==null&&e.after!==null),'integration replacement has before and after')
 assert.doesNotMatch(JSON.stringify(all),/synthetic-inkwell-1[1-6]|token_hash|sealed|pdfBase64/,'audit contains no connection secrets, token hashes or document bytes')
 assert.ok(!JSON.stringify(all).includes(agent.token),'one-time preparation key is never logged')
 assert.ok(all.every(e=>e.id&&e.at&&e.actorId&&e.action&&e.target))
 const first=await audit('limit=2'),second=await audit('limit=2&cursor='+encodeURIComponent(first.nextCursor));assert.equal(new Set([...first.entries,...second.entries].map(e=>e.id)).size,4,'timestamp ties do not repeat or lose page rows')
 const csv=await h.send('/api/inkwell/audit.csv?q='+encodeURIComponent(template),undefined,admin);assert.equal(csv.status,200);assert.match(csv.value,/Harbour account audit NDA revised/);assert.match(csv.value,/Harbour account audit NDA/)
 const unchanged=(await audit('target='+encodeURIComponent('member-role:'+person.id))).entries.length;await h.command('member.role',{operatorId:person.id,role:'sender'});assert.equal((await audit('target='+encodeURIComponent('member-role:'+person.id))).entries.length,unchanged,'setting the same role creates no fictitious change')
 const memberTarget='member:'+ownerId
 const originalEntries=(await audit('target='+encodeURIComponent(memberTarget))).entries
 await h.db.prepare('INSERT INTO iw_account_audit_redactions(target,at,actor_id) VALUES(?,?,?)').bind(memberTarget,'2026-10-26T14:00:00.000Z',ownerId).run()
 const redacted=(await audit('target='+encodeURIComponent(memberTarget))).entries
 assert.deepEqual(redacted.map(e=>e.id),originalEntries.map(e=>e.id),'Redaction retains the original event identities')
 assert.ok(!JSON.stringify(redacted).includes('Harbour Audit Owner'))
 assert.equal((await audit('q='+encodeURIComponent('Harbour Audit Owner'))).entries.length,0,'Search does not match redacted values')
 const redactedCsv=await h.send('/api/inkwell/audit.csv?target='+encodeURIComponent(memberTarget),undefined,h.owner)
 assert.ok(!redactedCsv.value.includes('Harbour Audit Owner'))


 }finally{await h.close()}
})

test('Account audit adopts earlier policy history and appends new policy and credential changes without rewriting records', async () => {
 const at='2026-09-20T12:00:00.000Z',legacy='synthetic-inkwell-21'
 const h=await harness({beforeMigration:async(db,file)=>{
  if(file!=='0067_account_audit.sql')return
  await db.prepare('UPDATE iw_freeform_policy SET enabled=1,version=1,actor=?,at=? WHERE id=1').bind(legacy,at).run()
  await db.prepare('INSERT INTO iw_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)').bind('envelope_defaults',JSON.stringify({expiryDays:90,reminders:null,version:1,actor:legacy,at}),at,legacy).run()
  await db.prepare('INSERT INTO iw_freeform_history VALUES(?,?,?,?,?)').bind(1,legacy,at,0,1).run()
  await db.prepare('INSERT INTO iw_envelope_default_versions VALUES(?,?,?,?,?)').bind(1,legacy,at,JSON.stringify({expiryDays:120,reminders:null,version:0}),JSON.stringify({expiryDays:90,reminders:null,version:1})).run()
  await db.prepare('INSERT INTO iw_send_policy_versions(scope,source,version,mode,templates,require_internal_approval,deferred_release,actor,at,reason,before_value) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind('account','api',1,'off',null,0,1,legacy,at,'Earlier API restriction',JSON.stringify({mode:'off',templates:null,requireInternalApproval:false,deferredRelease:true,version:0})).run()
 }})
 try {
  const audit=async q=>(await h.send('/api/inkwell/audit?limit=200'+(q?'&q='+encodeURIComponent(q):''),undefined,h.owner)).value.entries
  const adopted=await audit(legacy)
  assert.equal(adopted.length,3)
  assert.ok(adopted.every(e=>e.actorId===legacy&&e.at===at))
  assert.ok(adopted.some(e=>e.before?.expiryDays===120&&e.after?.expiryDays===90))
  assert.ok(adopted.some(e=>e.before?.enabled===false&&e.after?.enabled===true))
  assert.ok(adopted.some(e=>e.after?.reason==='Earlier API restriction'&&e.before?.version===0&&e.after?.version===1))
  const owner=(await h.send('/api/inkwell',undefined,h.owner)).value.actor
  await h.command('account.freeform',{enabled:false,expectedVersion:1})
  await h.command('account.send_policy',{source:'api',mode:'off',expectedVersion:1,reason:'Keep automation off'})
  await h.command('account.envelope_defaults',{expectedVersion:1,expiryDays:60,reminders:null})
  const issued=(await h.post('/api/inkwell/api-keys',{memberId:owner.id,name:'Harbour audit client',scopes:['envelopes:read'],commandId:crypto.randomUUID()})).value
  await h.post(`/api/inkwell/api-keys/${issued.key.id}/revoke`,{commandId:crypto.randomUUID()})
  const entries=await audit()
  assert.ok(entries.some(e=>e.action==='freeform.changed'&&e.actorId===owner.id&&e.before.enabled===true&&e.after.enabled===false))
  assert.ok(entries.some(e=>e.action==='send_policy.changed'&&e.actorId===owner.id&&e.before.version===1&&e.after.version===2&&e.after.reason==='Keep automation off'))
  assert.ok(entries.some(e=>e.action==='envelope_defaults.changed'&&e.actorId===owner.id&&e.before.expiryDays===90&&e.after.expiryDays===60))
  assert.ok(entries.some(e=>e.action==='api_key.issued'&&e.target===`api-key:${issued.key.id}`&&e.actorId===owner.id))
  assert.ok(entries.some(e=>e.action==='api_key.revoked'&&e.before.revokedAt===null&&e.after.revokedAt))
  assert.ok(!JSON.stringify(entries).includes(issued.token))
  for(const sql of ["UPDATE iw_account_audit SET action='changed'","DELETE FROM iw_account_audit"]){await assert.rejects(h.db.prepare(sql).run(),/append only/)}
  assert.deepEqual((await audit(legacy)).map(e=>e.id).sort(),adopted.map(e=>e.id).sort())
 }finally{await h.close()}
})
