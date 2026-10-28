import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { remoteImportFake } from './fixtures/remote-import.mjs'
const address=(name,domain='example.test')=>[name,domain].join('@')

const day=86400000,at=Date.parse('2026-06-01T00:00:00.000Z')
for(const provider of ['acrobat','dropbox'])test(`${provider}: reviewed API imports preserve sender custody, usable templates and retention through erasure and restore`,async()=>{
 const fake=await remoteImportFake(provider),h=await harness({networkEdge:fake.edge,now:at-120_000})
 try {
  const first=await h.invite(address('first'),'member'),second=await h.invite(address('second'),'member')
  for(const cookie of [first,second]){const actor=(await h.send('/api/inkwell',undefined,cookie)).value.actor;await h.command('member.role',{operatorId:actor.id,role:'sender'})}
  const a=first,b=second
  const input={provider,credential:'synthetic-inkwell-99',fallbackAdmin:address('owner','harbour.example')}
  await h.post('/api/inkwell/remote-import/preview',input,'',401)
  await h.post('/api/inkwell/remote-import/preview',input,a,403)
  await h.post('/api/inkwell/remote-import/preview',input,h.owner,403,{origin:'https://foreign.example.test'})
  await h.post('/api/inkwell/remote-import/preview',input,h.owner,403,{authorization:'Bearer synthetic-inkwell-99'})
  fake.failOnce()
  const limited=await h.post('/api/inkwell/remote-import/preview',input,h.owner,429)
  assert.equal(limited.headers.get('retry-after'),'120')
  const refusedCalls=fake.calls.length
  await h.post('/api/inkwell/remote-import/preview',input,h.owner,429)
  assert.equal(fake.calls.length,refusedCalls,'the provider reset also blocks a fresh preview')
  h.advanceTo(at)
  assert.ok(!JSON.stringify(limited.value).includes('synthetic-inkwell-provider-failure'),'provider errors stay private')
  fake.unmapped()
  await h.post('/api/inkwell/remote-import/preview',{...input,fallbackAdmin:address('first')},h.owner,400)
  const unmapped=(await h.post('/api/inkwell/remote-import/preview',input)).value
  assert.deepEqual(unmapped.items.filter(v=>v.kind==='envelope').map(v=>v.owner),[address('owner','harbour.example'),address('owner','harbour.example')])
  assert.deepEqual(unmapped.unmapped.filter(v=>v.reason.includes('assigned to')).map(v=>v.sourceId),['first','second'])
  fake.mapped()
  fake.unsupported(true)
  const unsupported=(await h.post('/api/inkwell/remote-import/preview',input)).value
  assert.deepEqual(unsupported.counts,{agreements:2,templates:0})
  assert.ok(unsupported.unmapped.some(v=>v.sourceId==='template'&&v.reason.includes('skipped')))
  fake.unsupported(false)
  if(provider==='dropbox'){
   fake.shared(true)
   const shared=(await h.post('/api/inkwell/remote-import/preview',input)).value
   assert.equal(shared.items.find(v=>v.kind==='template').owner,address('owner','harbour.example'),'shared access does not identify a template creator')
   assert.ok(shared.unmapped.some(v=>v.sourceId==='template'&&v.reason.includes('assigned to')))
   fake.shared(false)
  }
  const preview=(await h.post('/api/inkwell/remote-import/preview',input)).value
  assert.deepEqual(preview.counts,{agreements:2,templates:1})
  assert.deepEqual(preview.items.map(v=>[v.kind,v.owner]),[['envelope',address('first')],['envelope',address('second')],['template',address('first')]])
  assert.ok(preview.unmapped.some(v=>v.sourceId==='open'))
  assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,0,'preview creates no business record')
  await h.post('/api/inkwell/remote-import/apply',{previewId:preview.previewId,fingerprint:'wrong'},h.owner,409)
  const apply={previewId:preview.previewId,fingerprint:preview.fingerprint}
  await h.post('/api/inkwell/remote-import/apply',apply,a,403)
  const [known,fallback,template]=preview.items
  await h.db.prepare(`CREATE TRIGGER interrupt_remote_import BEFORE INSERT ON iw_envelopes WHEN NEW.id='${fallback.id}' BEGIN SELECT RAISE(ABORT,'synthetic-inkwell-interruption'); END`).run()
  await h.post('/api/inkwell/remote-import/apply',apply,h.owner,500)
  assert.equal((await h.send(`/api/inkwell/envelopes/${known.id}`,undefined,a)).status,200,'the first record and its checkpoint survive interruption')
  assert.equal((await h.send(`/api/inkwell/envelopes/${fallback.id}`,undefined,b)).status,404)
  await h.db.prepare('DROP TRIGGER interrupt_remote_import').run()
  const callsBeforeResume=fake.calls.length
  await h.post('/api/inkwell/remote-import/apply',apply)
  await h.post('/api/inkwell/remote-import/apply',apply)
  assert.equal(fake.calls.length,callsBeforeResume,'resuming an approved batch never refetches a provider resource')
  assert.deepEqual((await h.send('/api/inkwell/envelopes',undefined,a)).value.envelopes.map(e=>e.id),[known.id])
  assert.deepEqual((await h.send('/api/inkwell/envelopes',undefined,b)).value.envelopes.map(e=>e.id),[fallback.id])
  assert.equal((await h.send(`/api/inkwell/envelopes/${known.id}`,undefined,b)).status,403)
  assert.equal((await h.send(`/api/inkwell/envelopes/${fallback.id}/artifacts/signed`,undefined,a)).status,403)
  assert.deepEqual((await h.send(`/api/inkwell/envelopes/${known.id}/artifacts/signed`,undefined,a)).bytes,new Uint8Array(fake.pdf))
  assert.deepEqual((await h.send(`/api/inkwell/envelopes/${known.id}/artifacts/certificate`,undefined,a)).bytes,new Uint8Array(fake.audit))
  assert.deepEqual((await h.send('/api/inkwell/templates',undefined,a)).value.templates.map(t=>t.id),[template.id])
  assert.deepEqual((await h.send('/api/inkwell/templates',undefined,b)).value.templates,[])
  await h.command('template.use',{id:template.id,recipients:[{name:'New client',email:address('new.client')},{name:'Reviewer',email:address('reviewer')}]},b,404)
  const sent=await h.command('template.use',{id:template.id,recipients:[{name:'New client',email:address('new.client')},{name:'Reviewer',email:address('reviewer')}]},a)
  const prepared=(await h.send(`/api/inkwell/envelopes/${sent.result.id}`,undefined,a)).value.envelope
  assert.equal(prepared.status,'prepared')
  assert.deepEqual(prepared.fields.map(f=>[f.id,f.type,f.signer,f.page]),[['signature','signature',0,0],['reference','text',0,0],['review','signature',1,0]],'documented provider fields survive template use with the correct recipient')
  assert.equal(prepared.fields[0].y,provider==='acrobat'?(prepared.pageSizes[0].height-80-40)/prepared.pageSizes[0].height:80/prepared.pageSizes[0].height,'provider coordinate origin is preserved')
  await h.command('envelope.approve',{id:sent.result.id,eligible:true},a)
  assert.match((await h.mail(address('new.client'),'Please sign:')).text,/sign/)
  const read=async id=>(await h.send(`/api/inkwell/envelopes/${id}`,undefined,h.owner)).value.envelope
  assert.equal((await read(known.id)).source.terminalAt,'2026-01-01T00:00:00.000Z')
  assert.equal((await read(fallback.id)).source.importedAt,new Date(at).toISOString())
  assert.equal((await read(fallback.id)).source.basis,'terminal time not in the source')
  const archived=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  assert.ok(!archived.ndjson.includes('synthetic-inkwell-99'),'credential excluded from archive')
  const restored=await harness()
  try {await restored.post('/api/inkwell/archive/restore',{archive:archived});assert.equal((await restored.send(`/api/inkwell/envelopes/${known.id}`,undefined,restored.owner)).value.envelope.source.terminalAt,'2026-01-01T00:00:00.000Z')}finally{await restored.close()}
  await h.command('account.retention',{years:7})
  await h.command('envelope.hold',{id:known.id,reason:'Preserve imported evidence'})
  await h.post('/api/inkwell/erase',{id:known.id,confirmation:'ERASE'},h.owner,409)
  await h.scheduled(Date.parse('2033-01-01T00:00:00.000Z'))
  assert.ok(!(await read(known.id)).events.some(e=>e.action==='envelope.retention_warned'))
  const due=Date.parse('2033-06-01T00:00:00.000Z')
  await h.scheduled(due-31*day)
  assert.ok(!(await read(fallback.id)).events.some(e=>e.action==='envelope.retention_warned'))
  await h.scheduled(due-30*day)
  const warning=(await read(fallback.id)).events.find(e=>e.action==='envelope.retention_warned')
  assert.equal(warning.detail.basis,'terminal time not in the source')
  assert.equal(warning.detail.endedAt,new Date(at).toISOString())
  assert.match((await h.mail(address('owner','harbour.example'),provider+' second agreement')).text,/terminal time not in the source/)
  await h.scheduled(due-1);assert.ok(await read(fallback.id))
  await h.scheduled(due)
  assert.equal((await h.send(`/api/inkwell/envelopes/${fallback.id}`,undefined,h.owner)).status,404)
  assert.ok(await read(known.id),'legal hold survives purge')
  await h.command('envelope.lift_hold',{id:known.id})
  await h.scheduled(due)
  const terminalWarning=(await read(known.id)).events.find(e=>e.action==='envelope.retention_warned')
  assert.equal(terminalWarning.detail.endedAt,'2026-01-01T00:00:00.000Z')
  assert.equal(terminalWarning.detail.due,'2033-01-01T00:00:00.000Z')
  await h.post('/api/inkwell/erase',{id:known.id,confirmation:'ERASE'})
  assert.equal((await h.send(`/api/inkwell/envelopes/${known.id}/artifacts/certificate`,undefined,h.owner)).status,404)
  const later=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,destination=await harness()
  try{const refused=await destination.post('/api/inkwell/archive/restore',{archive:archived,laterJournal:later},destination.owner,400);assert.match(refused.value.error,/erasure_epoch/)}finally{await destination.close()}
  const repeated=(await h.post('/api/inkwell/remote-import/preview',input)).value
  assert.deepEqual(repeated.counts,{agreements:0,templates:0},'erased source records never resurrect on reimport')
  assert.ok(!h.logs().join('\n').includes('synthetic-inkwell-99'))
 }finally{await h.close()}
 if(provider==='dropbox')await accountImportJourney()
})

async function accountImportJourney(){
 const fake=await remoteImportFake('dropbox');fake.paginate()
 const h=await harness({networkEdge:fake.edge,now:at})
 try {
  const sender=await h.invite(address('first'),'member'),route='/api/inkwell/remote-import/jobs/'
  const call=async(action,input={},status=200,cookie=h.owner)=>(await h.post(route+action,input,cookie,status)).value
  await call('start',{provider:'dropbox',fallbackAdmin:address('owner','harbour.example')},403,sender)
  const j=await call('start',{provider:'dropbox',fallbackAdmin:address('owner','harbour.example')}),input={jobId:j.id,credential:'synthetic-inkwell-99'}
  let result=await call('review',input)
  assert.equal(result.state,'reviewing');assert.deepEqual([result.pages,result.agreements,result.templates],[1,2,1])
  assert.deepEqual(result.senders,{[address('first')]:{agreements:1,templates:1},[address('owner','harbour.example')]:{agreements:1,templates:0}})
  assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,0)
  const page=await h.db.prepare('SELECT p.id,p.fingerprint FROM iw_remote_previews p JOIN iw_remote_job_pages b ON b.preview_id=p.id WHERE b.job_id=?').bind(j.id).first()
  await h.post('/api/inkwell/remote-import/apply',{previewId:page.id,fingerprint:page.fingerprint},h.owner,409)
  await call('approve',{jobId:j.id,approved:true,fingerprint:'wrong'},409)
  await call('pause',input);const calls=fake.calls.length
  await call('review',input,409);await h.scheduled(at);assert.equal(fake.calls.length,calls)
  await call('resume',input);fake.expireOnce();await call('review',input,409)
  result=await call('status',input);assert.equal(result.pages,1);assert.match(result.reason,/grant expired/)
  h.advanceTo(at+16*60_000);fake.otherAccount(true);await call('review',input,409)
  assert.equal((await call('status',input)).pages,1)
  fake.otherAccount(false);h.advanceTo(at+32*60_000);fake.exhaustOnce((at+92*60_000)/1000);await call('review',input,429)
  const throttledCalls=fake.calls.length;await call('review',input,429);await h.post('/api/inkwell/remote-import/preview',{provider:'dropbox',credential:input.credential,fallbackAdmin:address('owner','harbour.example')},h.owner,429);assert.equal(fake.calls.length,throttledCalls)
  h.advanceTo(at+94*60_000);fake.limitAfter(5);await call('review',input,429)
  assert.equal((await call('status',input)).pages,1,'partial source reads never advance an unfinished page')
  h.advanceTo(at+110*60_000);result=await call('review',input)
  assert.equal(fake.calls.filter(path=>path==='/v3/signature_request/third').length,1,'a resumed page reuses its successful source reads')
  assert.equal(result.state,'ready');assert.deepEqual([result.pages,result.agreements,result.templates],[2,3,1]);assert.equal(result.items.length,4)
  await call('approve',{jobId:j.id,fingerprint:result.fingerprint,approved:true})
  await call('pause',input);await h.scheduled(at);assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,0)
  await call('resume',input)
  const interrupted=result.items.find(item=>item.kind==='envelope'&&item.owner===address('owner','harbour.example'))
  await h.db.prepare(`CREATE TRIGGER interrupt_account_job BEFORE INSERT ON iw_envelopes WHEN NEW.id='${interrupted.id}' BEGIN SELECT RAISE(ABORT,'synthetic-inkwell-interruption'); END`).run()
  await call('advance',input,500)
  assert.equal((await call('status',input)).applied,0)
  assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,1,'a killed batch retains its first committed record')
  await h.db.prepare('DROP TRIGGER interrupt_account_job').run()
  await h.scheduled(at,'* * * * *')
  assert.equal((await call('status',input)).applied,1)
  await h.scheduled(at,'* * * * *');result=await call('status',input)
  assert.equal(result.state,'complete');assert.equal(result.applied,2)
  await h.scheduled(at);assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,3)
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  assert.ok(!archive.ndjson.includes(j.id));assert.ok(!archive.ndjson.includes('synthetic-inkwell-99'))
  fake.otherAccount(true)
  const cancel=await call('start',{provider:'dropbox',fallbackAdmin:address('owner','harbour.example')})
  await h.db.prepare(`CREATE TRIGGER pause_during_review AFTER INSERT ON iw_remote_previews BEGIN UPDATE iw_remote_jobs SET version=version+1,data=json_set(data,'$.version',version+1,'$.state','paused','$.resume','reviewing') WHERE id='${cancel.id}'; END`).run()
  await call('review',{...input,jobId:cancel.id},409)
  const paused=await call('status',{jobId:cancel.id})
  assert.equal(paused.state,'paused','a checkpoint conflict must never overwrite a concurrent owner pause')
  assert.equal(paused.pages,0,'an uncommitted account page must not advance the cursor')
  await h.db.prepare('DROP TRIGGER pause_during_review').run()
  await call('resume',{jobId:cancel.id});h.advanceTo(at+126*60_000)
  const staged=await call('review',{...input,jobId:cancel.id})
  assert.equal(staged.agreements,2)
  const activeArchive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  assert.ok(!activeArchive.ndjson.includes(cancel.id),'active review state is excluded too')
  const restored=await harness()
  try{await restored.post('/api/inkwell/archive/restore',{archive:activeArchive});assert.deepEqual((await restored.post(route+'jobs',{})).value.jobs,[])}finally{await restored.close()}
  await call('cancel',{jobId:cancel.id})
  assert.equal((await call('status',{jobId:cancel.id})).state,'cancelled')
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_remote_job_pages WHERE job_id=?').bind(cancel.id).first()).n,0)
  assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,3,'cancellation preserves previously imported records')
  await call('resume',{jobId:cancel.id},409);await call('status',input,403,sender)
  const revoked=await call('start',{provider:'dropbox',fallbackAdmin:address('owner','harbour.example')})
  const owner=(await h.send('/api/inkwell',undefined,h.owner)).value.actor
  await h.db.prepare('UPDATE oa_operators SET version=version+1 WHERE id=?').bind(owner.id).run()
  await call('review',{jobId:revoked.id,credential:input.credential},401)
  await h.db.prepare('UPDATE oa_sessions SET operator_version=operator_version+1 WHERE operator_id=?').bind(owner.id).run()
  await call('review',{jobId:revoked.id,credential:input.credential},409)
  assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,3,'restored authority never revives an old job')
 }finally{await h.close()}
}
