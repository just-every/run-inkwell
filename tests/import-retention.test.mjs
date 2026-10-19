import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHmac, randomBytes } from 'node:crypto'
import { harness } from './harness.mjs'
import { unstable_splitSqlQuery } from 'wrangler'

const day=86_400_000
const fixture=()=>readFile('tests/fixtures/docuseal/archive.json','utf8').then(JSON.parse)
async function apply(h,archive) {
 const before=(await h.send('/api/inkwell/import/jobs',undefined,h.owner)).value.jobs.length
 const preview=(await h.post('/api/inkwell/import/preview',{archive})).value
 assert.equal((await h.send('/api/inkwell/import/jobs',undefined,h.owner)).value.jobs.length,before,'preview creates no import custody or scheduled record')
 return (await h.post('/api/inkwell/import/apply',{archive,fingerprint:preview.fingerprint})).value.job
}
async function records(h) {return (await h.send('/api/inkwell/import/records',undefined,h.owner)).value.records}
async function envelope(h,id) {return (await h.send(`/api/inkwell/envelopes/${id}`,undefined,h.owner)).value.envelope}

// Imported-envelope fixtures enter the same native store a portability restore uses.
async function imported(h,{title,source,createdAt='2001-01-01T00:00:00.000Z'}) {
 const archive=await fixture(), pdf=archive.files[0].base64
 const id=(await h.command('envelope.prepare',{title,filename:'imported.pdf',pdfBase64:pdf,signers:[{name:'Original party',email:'party@example.test'}],fields:[{id:'sig',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.1,width:.3,height:.1}]})).result.id
 const value=await envelope(h,id)
 Object.assign(value,{status:'imported',imported:true,createdAt,source})
 await h.db.prepare('UPDATE iw_envelopes SET data=? WHERE id=?').bind(JSON.stringify(value),id).run()
 return id
}

test('RECORD-005: imported envelopes use terminal or durable import time, label the missing source time, and retain legal holds',async()=>{
 const h=await harness()
 try {
  const terminal='2026-04-01T00:00:00.000Z',due=Date.parse('2033-04-01T00:00:00.000Z')
  const known=await imported(h,{title:'Known source end',source:{terminalAt:terminal,importedAt:'2026-06-01T00:00:00.000Z'}})
  const fallback=await imported(h,{title:'Missing source end',source:{importedAt:terminal}})
  const held=await imported(h,{title:'Held import',source:{terminalAt:terminal}})
  await h.command('account.retention',{years:7})
  await h.command('envelope.hold',{id:held,reason:'Preserve for litigation'})
  await h.post('/api/inkwell/erase',{id:held,confirmation:'ERASE'},h.owner,409)
  await h.scheduled(due-31*day)
  assert.equal((await envelope(h,known)).events.filter(e=>e.action==='envelope.retention_warned').length,0)
  await h.scheduled(due-30*day)
  const warning=(await envelope(h,fallback)).events.find(e=>e.action==='envelope.retention_warned')
  assert.equal(warning.detail.basis,'terminal time not in the source')
  assert.equal(warning.detail.endedAt,terminal)
  assert.equal((await envelope(h,fallback)).messages.find(m=>m.kind==='retention').status,'sent','native imported warnings use the shared delivery status presentation')
  assert.match((await h.mail('owner@harbour.example','Missing source end')).text,/terminal time not in the source/)
  assert.ok(!(await envelope(h,held)).events.some(e=>e.action==='envelope.retention_warned'))
  await h.scheduled(due-1)
  assert.ok(await envelope(h,known))
  await h.scheduled(due)
  for(const id of [known,fallback]) assert.equal((await h.send(`/api/inkwell/envelopes/${id}`,undefined,h.owner)).status,404)
  assert.ok(await envelope(h,held))
  await h.command('envelope.lift_hold',{id:held})
  await h.scheduled(due)
  await h.scheduled(due+30*day-1)
  assert.ok(await envelope(h,held))
  await h.scheduled(due+30*day)
  assert.equal((await h.send(`/api/inkwell/envelopes/${held}`,undefined,h.owner)).status,404)
 } finally {await h.close()}
})

test('RECORD-005: DocuSeal shared archives follow the latest end, warn owners/admins, honor holds, preserve undo and fence resurrection without an owner session',async()=>{
 const h=await harness()
 try {
  const admin=await h.invite('retention.admin@example.test','admin')
  const archive=await fixture(), first=archive.submissions[0]
  first.completed_at='2026-02-01T00:00:00.000Z'
  const second=structuredClone(first);second.id+=100;second.name='Latest archive envelope';second.completed_at='2026-05-01T00:00:00.000Z';archive.submissions.push(second)
  const job=await apply(h,archive),originalRecords=await records(h)
  assert.equal(originalRecords.length,2)
  // Apply the forward migration's backfill to pre-existing custody, including chunked plans.
  await h.db.prepare('DELETE FROM iw_import_retention').run()
  const migration=await readFile('migrations/core/0032_retention_imports.sql','utf8')
  await h.db.batch(unstable_splitSqlQuery(migration.slice(migration.indexOf('INSERT INTO iw_import_retention'),migration.indexOf('-- Native imported'))).map(sql=>h.db.prepare(sql)))
  await h.post('/api/inkwell/import/undo',{id:job.id})
  assert.equal((await records(h)).length,0,'ordinary owner undo remains available')
  // A distinct source identity leaves a live archive and retains the undone archive custody too.
  archive.submissions.forEach(s=>s.id+=1000)
  const liveJob=await apply(h,archive),live=await records(h)
  const beforePurge=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  const held=live[0].id,due=Date.parse('2033-05-01T00:00:00.000Z')
  await h.command('account.retention',{years:7})
  await h.scheduled(Date.parse('2033-02-01T00:00:00.000Z'))
  assert.ok(!(await h.mail('owner@harbour.example','Latest archive envelope')),'the earlier source end cannot bring a shared archive forward')
  await h.post('/api/inkwell/import/hold',{id:held,reason:'Preserve the whole archive'},admin)
  await h.post('/api/inkwell/import/erase',{id:held,confirmation:'ERASE'},h.owner,409)
  await h.post('/api/inkwell/import/erase',{id:live[1].id,confirmation:'ERASE'},h.owner,409)
  await h.post('/api/inkwell/import/undo',{id:liveJob.id},h.owner,409)
  await h.scheduled(due-30*day)
  assert.equal((await records(h)).length,2)
  assert.ok(!(await h.mail('owner@harbour.example','Latest archive envelope')),'held archives are not warned')
  await h.post('/api/inkwell/import/lift-hold',{id:held},admin)
  assert.deepEqual((await records(h)).find(r=>r.id===held).holdHistory.map(e=>e.action),['hold','lift-hold'])
  await h.scheduled(due-30*day)
  assert.match((await h.mail('retention.admin@example.test','Latest archive envelope')).text,/2033-05-01/)
  assert.match((await h.mail('owner@harbour.example','Latest archive envelope')).text,/7-year/)
  const feed=await h.send('/api/inkwell/notices',undefined,admin)
  assert.equal(feed.status,200)
  await h.scheduled(due-1)
  assert.equal((await records(h)).length,2,'earlier envelope shares the latest archive due date')
  // Revoke every session: Cron authority must come solely from the durable retention conditions.
  await h.db.prepare("UPDATE oa_sessions SET revoked_at=?").bind(Date.now()).run()
  await h.db.prepare("CREATE TRIGGER hold_during_purge BEFORE DELETE ON iw_imported_archives BEGIN INSERT INTO iw_import_holds VALUES(OLD.id,'Concurrent hold','admin','2033-05-01T00:00:00.000Z'); END").run()
  const interrupted=await (await h.mf.getWorker()).scheduled({scheduledTime:new Date(due),cron:'17 * * * *'})
  assert.equal(interrupted.outcome,'exception','a hold introduced during native effects aborts the same erasure transaction')
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_imported_archives').first()).n,2)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_import_holds').first()).n,0,'the failed batch leaves no partial hold or native deletion')
  await h.db.prepare('DROP TRIGGER hold_during_purge').run()
  await h.scheduled(due)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_imported_archives').first()).n,0)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_retention_purges').first()).n,4,'undo retained custody until its lawful retention purge')
  assert.ok((await h.db.prepare('SELECT COUNT(*) AS n FROM ik_d1_erasure_journal').first()).n>=4)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_import_retention_mail').first()).n,0)
  assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM ik_originals WHERE bytes IS NOT NULL").first()).n,0,'whole source originals are withdrawn')
  await h.db.prepare('UPDATE oa_sessions SET revoked_at=NULL').run()
  await h.post('/api/inkwell/import/undo',{id:liveJob.id})
  assert.equal((await records(h)).length,0,'owner undo after purge cannot resurrect erased targets')
  const later=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  const destination=await harness()
  try {const refused=await destination.post('/api/inkwell/archive/restore',{archive:beforePurge,laterJournal:later},destination.owner,400);assert.match(refused.value.error,/erasure_epoch/)} finally {await destination.close()}
 } finally {await h.close()}
})


test('RECORD-005: imported-record erasure requires the owner and confirmation, removes private evidence, and preserves safe undo',async()=>{
 const h=await harness()
 try {
  const archive=await fixture(),job=await apply(h,archive),record=(await records(h))[0]
  const admin=await h.invite('archive.admin@example.test','admin')
  await h.post('/api/inkwell/import/hold',{id:record.id,reason:'Hold'},'',401)
  await h.post('/api/inkwell/import/erase',{id:record.id,confirmation:'ERASE'},admin,403)
  await h.post('/api/inkwell/import/erase',{id:record.id,confirmation:'no'},h.owner,400)
  await h.post('/api/inkwell/import/erase',{id:record.id,confirmation:'ERASE'})
  assert.equal((await records(h)).length,0)
  assert.equal((await h.send(record.artifacts[0].url,undefined,h.owner)).status,404)
  await h.post('/api/inkwell/import/undo',{id:job.id})
  assert.equal((await records(h)).length,0)
 } finally {await h.close()}
})


test('RECORD-005 + DELIV-001: archive warnings expose signed delivery status and an uncertain warning is never sent again',async()=>{
 const secret=randomBytes(24),h=await harness({bindings:{MAIL_WEBHOOK_KEY:'whsec_'+secret.toString('base64')}})
 try {
  const archive=await fixture();archive.submissions[0].completed_at='2026-04-01T00:00:00.000Z'
  await apply(h,archive)
  await h.command('account.retention',{years:7})
  const warningAt=Date.parse('2033-04-01T00:00:00.000Z')-30*day
  await h.scheduled(warningAt)
  const current=async()=> (await records(h)).find(r=>r.sourceId.endsWith(':'+archive.submissions[0].id))
  let message=(await current()).messages.find(m=>m.recipient==='owner@harbour.example')
  assert.equal(message.status,'sent');assert.ok(message.sentAt);assert.ok(message.createdAt)
  const sent=await h.mail('owner@harbour.example','Will be purged:'),deliveredAt=Date.now()-1000
  const event=(emailId,to='owner@harbour.example')=>{
   const body=JSON.stringify({type:'email.delivered',created_at:new Date(deliveredAt).toISOString(),data:{email_id:emailId,to:[to],subject:sent.subject}})
   const id='msg_'+randomBytes(8).toString('hex'),timestamp=String(Math.floor(Date.now()/1000))
   return {body:JSON.parse(body),headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+createHmac('sha256',secret).update(`${id}.${timestamp}.${body}`).digest('base64')}}
  }
  const known=event(sent.id)
  await h.post('/api/inkwell/mail/events',known.body,'',200,known.headers)
  message=(await current()).messages.find(m=>m.id===message.id)
  assert.equal(message.status,'delivered');assert.equal(message.deliveredAt,new Date(deliveredAt).toISOString())
  const wrong=event(sent.id,'somebody.else@example.test')
  await h.post('/api/inkwell/mail/events',wrong.body,'',403,wrong.headers)
  const second=await fixture();second.submissions[0].id+=1000;second.submissions[0].completed_at='2026-04-02T00:00:00.000Z'
  await apply(h,second)
  const before=h.attempted().length
  h.failSends(1)
  const result=await (await h.mf.getWorker()).scheduled({scheduledTime:new Date(warningAt+day),cron:'17 * * * *'})
  assert.equal(result.outcome,'exception','uncertain delivery is reported by the scheduled pass')
  const uncertain=()=>records(h).then(rows=>rows.find(r=>r.sourceId.endsWith(':'+second.submissions[0].id)).messages.find(m=>m.recipient==='owner@harbour.example'))
  assert.equal((await uncertain()).status,'uncertain')
  assert.equal(h.attempted().length,before+1)
  await h.scheduled(warningAt+day+60_000)
  assert.equal(h.attempted().length,before+1,'a repeated scheduled pass never resends the uncertain warning')
  assert.equal((await uncertain()).status,'uncertain')
  const deliveredRecord=await current()
  await h.post('/api/inkwell/import/erase',{id:deliveredRecord.id,confirmation:'ERASE'})
  await h.post('/api/inkwell/mail/events',known.body,'',403,known.headers)
  assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM rer_mail_event_receipts WHERE provider='resend' AND json_extract(event_json,'$.providerMessageId')=?").bind(sent.id).first()).n,0,'owner erasure removes the signed warning receipt')
  assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM rer_mail_event_states WHERE provider='resend' AND provider_message_id=?").bind(sent.id).first()).n,0,'owner erasure removes warning delivery state')
 } finally {await h.close()}
})
