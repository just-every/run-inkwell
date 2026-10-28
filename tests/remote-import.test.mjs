import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { remoteImportFake } from './fixtures/remote-import.mjs'
const day=86400000,at=Date.parse('2026-06-01T00:00:00.000Z')
for(const provider of ['acrobat','dropbox'])test(`${provider}: reviewed API imports preserve sender custody, usable templates and retention through erasure and restore`,async()=>{
 const fake=await remoteImportFake(provider),h=await harness({networkEdge:fake.edge,now:at})
 try {
  const first=await h.invite('first@example.test','member'),second=await h.invite('second@example.test','member')
  for(const cookie of [first,second]){const actor=(await h.send('/api/inkwell',undefined,cookie)).value.actor;await h.command('member.role',{operatorId:actor.id,role:'sender'})}
  const a=first,b=second
  const input={provider,credential:'synthetic-inkwell-99',fallbackAdmin:'owner@harbour.example'}
  await h.post('/api/inkwell/remote-import/preview',input,'',401)
  await h.post('/api/inkwell/remote-import/preview',input,a,403)
  await h.post('/api/inkwell/remote-import/preview',input,h.owner,403,{origin:'https://foreign.example.test'})
  await h.post('/api/inkwell/remote-import/preview',input,h.owner,403,{authorization:'Bearer synthetic-inkwell-99'})
  fake.failOnce()
  const limited=await h.post('/api/inkwell/remote-import/preview',input,h.owner,429)
  assert.equal(limited.headers.get('retry-after'),'120')
  assert.ok(!JSON.stringify(limited.value).includes('synthetic-inkwell-provider-failure'),'provider errors stay private')
  fake.unmapped()
  await h.post('/api/inkwell/remote-import/preview',{...input,fallbackAdmin:'first@example.test'},h.owner,400)
  const unmapped=(await h.post('/api/inkwell/remote-import/preview',input)).value
  assert.deepEqual(unmapped.items.filter(v=>v.kind==='envelope').map(v=>v.owner),['owner@harbour.example','owner@harbour.example'])
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
   assert.equal(shared.items.find(v=>v.kind==='template').owner,'owner@harbour.example','shared access does not identify a template creator')
   assert.ok(shared.unmapped.some(v=>v.sourceId==='template'&&v.reason.includes('assigned to')))
   fake.shared(false)
  }
  const preview=(await h.post('/api/inkwell/remote-import/preview',input)).value
  assert.deepEqual(preview.counts,{agreements:2,templates:1})
  assert.deepEqual(preview.items.map(v=>[v.kind,v.owner]),[['envelope','first@example.test'],['envelope','second@example.test'],['template','first@example.test']])
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
  await h.command('template.use',{id:template.id,recipients:[{name:'New client',email:'new.client@example.test'},{name:'Reviewer',email:'reviewer@example.test'}]},b,404)
  const sent=await h.command('template.use',{id:template.id,recipients:[{name:'New client',email:'new.client@example.test'},{name:'Reviewer',email:'reviewer@example.test'}]},a)
  const prepared=(await h.send(`/api/inkwell/envelopes/${sent.result.id}`,undefined,a)).value.envelope
  assert.equal(prepared.status,'prepared')
  assert.deepEqual(prepared.fields.map(f=>[f.id,f.type,f.signer,f.page]),[['signature','signature',0,0],['reference','text',0,0],['review','signature',1,0]],'documented provider fields survive template use with the correct recipient')
  assert.equal(prepared.fields[0].y,provider==='acrobat'?(prepared.pageSizes[0].height-80-40)/prepared.pageSizes[0].height:80/prepared.pageSizes[0].height,'provider coordinate origin is preserved')
  await h.command('envelope.approve',{id:sent.result.id,eligible:true},a)
  assert.match((await h.mail('new.client@example.test','Please sign:')).text,/sign/)
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
  assert.match((await h.mail('owner@harbour.example',provider+' second agreement')).text,/terminal time not in the source/)
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
 if(provider==='acrobat')await accountJobProof()
})

async function accountJobProof(){
 const fake=await remoteImportFake('acrobat')
 let expire=true,limit=true
 const calls=[]
 const edge=async request=>{
  const path=new URL(request.url).pathname.replace('/api/rest/v6','');calls.push(path)
  if(path==='/agreements/second'&&expire){expire=false;return new Response(null,{status:401})}
  if(path==='/agreements')return Response.json(new URL(request.url).searchParams.has('cursor')?{userAgreementList:[{id:'third'}],page:{}}:{userAgreementList:[{id:'first'},{id:'second'},{id:'open'}],page:{nextCursor:'next'}})
  const response=await fake.edge(request)
  if(path==='/agreements/first/combinedDocument'&&limit){limit=false;return new Response(response.body,{headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':'60'}})}
  return response
 }
 const h=await harness({networkEdge:edge,now:at})
 try {
  const sender=await h.invite('first@example.test','member'),other=await h.invite('second@example.test','member')
  for(const cookie of [sender,other]){const actor=(await h.send('/api/inkwell',undefined,cookie)).value.actor;await h.command('member.role',{operatorId:actor.id,role:'sender'})}
  const start={action:'start',provider:'acrobat',region:'na1',credential:'synthetic-inkwell-99',fallbackAdmin:'owner@harbour.example'}
  const action=(body,status=200,cookie=h.owner)=>h.post('/api/inkwell/remote-import/job',body,cookie,status)
  await action(start,401,'');await action(start,403,sender)
  const job=(await action(start)).value,id=job.id
  const view=async()=>(await h.send('/api/inkwell/remote-import/jobs?id='+id,undefined,h.owner)).value
  await h.send('/api/inkwell/remote-import/jobs?id='+id,undefined,sender).then(r=>assert.equal(r.status,403))
  await action({action:'approve',id,fingerprint:'wrong'},409)
  await h.scheduled(at)
  assert.equal((await view()).state,'rate_limited')
  const before=calls.length
  await h.scheduled(at+1000);assert.equal(calls.length,before,'limit headers prevent the next provider call')
  await action({action:'pause',id});h.advanceTo(at+60_000);await view();await h.scheduled(at+60_000)
  assert.equal(calls.length,before,'paused jobs do no background work')
  await action({action:'resume',id});await h.scheduled(at+60_000)
  assert.equal((await view()).state,'grant_required')
  await action({action:'resume',id},400)
  await action({action:'resume',id,credential:'synthetic-inkwell-100'})
  await h.db.prepare("CREATE TRIGGER stop_preview BEFORE INSERT ON iw_remote_job_pages BEGIN SELECT RAISE(ABORT,'synthetic-inkwell-preview-interruption'); END").run()
  await h.scheduled(at+60_000)
  const interrupted=await view();assert.equal(interrupted.state,'failed');assert.equal(interrupted.pages,0);assert.deepEqual(interrupted.counts,{agreements:0,templates:0},'a failed preview checkpoint cannot advance the reviewed account')
  await h.db.prepare('DROP TRIGGER stop_preview').run()
  await action({action:'resume',id})
  await h.scheduled(at+60_000)
  const preview=await view()
  assert.equal(preview.state,'previewing')
  await h.scheduled(at+60_000)
  Object.assign(preview,await view())
  assert.equal(preview.state,'review')
  assert.equal(preview.pages,2)
  const secondPage=(await h.send('/api/inkwell/remote-import/jobs?id='+id+'&page=1',undefined,h.owner)).value
  assert.deepEqual(secondPage.preview.items.map(item=>item.title),['acrobat third agreement'])
  assert.deepEqual(preview.counts,{agreements:3,templates:1})
  assert.deepEqual(preview.owners,{'first@example.test':{agreements:1,templates:1},'second@example.test':{agreements:2,templates:0}})
  assert.equal(calls.filter(p=>p==='/agreements/first').length,1,'grant renewal resumes successful resource checkpoints')
  assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,0,'complete preview remains side effect free')
  await action({action:'approve',id,fingerprint:'wrong'},409)
  await action({action:'approve',id,fingerprint:preview.fingerprint})
  await h.db.prepare("CREATE TRIGGER stop_job BEFORE INSERT ON iw_envelopes WHEN json_extract(NEW.data,'$.source.id')='second' BEGIN SELECT RAISE(ABORT,'synthetic-inkwell-interruption'); END").run()
  await h.scheduled(at+60_000);assert.equal((await view()).state,'failed')
  assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,1)
  await h.db.prepare('DROP TRIGGER stop_job').run()
  await action({action:'resume',id});await h.scheduled(at+60_000)
  assert.equal((await view()).state,'applying')
  await h.scheduled(at+60_000)
  assert.equal((await view()).state,'completed')
  assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.envelopes.length,3,'restart does not duplicate the first committed record')
  assert.equal((await h.db.prepare('SELECT sealed FROM iw_remote_jobs WHERE id=?').bind(id).first()).sealed,null)
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM iw_remote_preview_parts').first()).n,0,'completion drops all staged document bytes')
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  assert.ok(!archive.ndjson.includes('synthetic-inkwell-99')&&!archive.ndjson.includes('synthetic-inkwell-100'),'active grants stay outside business archives')
  const cancelled=(await action(start)).value
  await action({action:'cancel',id:cancelled.id});const stopped=calls.length;await h.scheduled(at+60_000);assert.equal(calls.length,stopped)
  await action({action:'resume',id:cancelled.id},409)
 }finally{await h.close()}
}
