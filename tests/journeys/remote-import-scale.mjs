// Account-size proof runs separately from push Verify through the production HTTP and timer doors.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { harness } from '../harness.mjs'
import { remoteImportFake } from '../fixtures/remote-import.mjs'

const total=Number(process.env.INKWELL_IMPORT_SCALE_COUNT??18000)
assert.ok(Number.isSafeInteger(total)&&total>0)
const started=Date.now(),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
const fake=await remoteImportFake('acrobat'),minute=60000,initial=Date.parse('2026-06-01T00:00:00Z')
let clock=initial,limited=false,interrupted=false,providerCalls=0
const resources=new Map(),windows=new Map()
const edge=async request=>{
 const url=new URL(request.url),path=url.pathname.replace('/api/rest/v6','')
 if(url.hostname!=='api.na1.adobesign.com')return
 providerCalls++
 const window=Math.floor((clock-initial)/minute)
 windows.set(window,(windows.get(window)??0)+1)
 if(path==='/agreements'){
  if(!limited&&Number(url.searchParams.get('cursor')??0)>=20){limited=true;return new Response(null,{status:429,headers:{'retry-after':'120'}})}
  const offset=Number(url.searchParams.get('cursor')??0),end=Math.min(total,offset+20)
  return Response.json({userAgreementList:Array.from({length:end-offset},(_,i)=>({id:'synthetic-inkwell-'+(offset+i)})),page:{...(end<total?{nextCursor:String(end)}:{})}})
 }
 if(path==='/libraryDocuments')return Response.json({libraryDocumentList:[],page:{}})
 if(/^\/agreements\/[^/]+(?:\/.*)?$/.test(path)){
  const previous=resources.get(path)
  assert.ok(previous===undefined||clock-previous>=15*minute,'completed source resources are not polled again within fifteen minutes')
  resources.set(path,clock)
  const index=Number(path.split('/')[2].split('-').at(-1))
  if(/^\/agreements\/[^/]+$/.test(path))return Response.json({id:'synthetic-inkwell-'+index,name:'Imported agreement '+index,senderEmail:(index%2?'second':'first')+String.fromCharCode(64)+'example.test',status:'SIGNED'})
  if(path.endsWith('/members'))return Response.json({participantSets:[{memberInfos:[{name:'Client signer',email:'client'+String.fromCharCode(64)+'example.test'}]}]})
  if(path.endsWith('/events'))return Response.json({events:[{type:'ACTION_COMPLETED',date:'2026-01-01T00:00:00Z'}]})
  if(path.endsWith('/combinedDocument'))return new Response(fake.pdf)
  if(path.endsWith('/auditTrail'))return new Response(fake.audit)
 }
 return fake.edge(request)
}
const h=await harness({networkEdge:edge,now:clock})
try {
 for(const name of ['first','second']){const cookie=await h.invite(name+String.fromCharCode(64)+'example.test','member');const actor=(await h.send('/api/inkwell',undefined,cookie)).value.actor;await h.command('member.role',{operatorId:actor.id,role:'sender'})}
 const job=(await h.post('/api/inkwell/remote-import/job',{action:'start',consent:true,provider:'acrobat',credential:'synthetic-inkwell-99',fallbackAdmin:'owner'+String.fromCharCode(64)+'harbour.example'})).value
 const view=async()=>(await h.send('/api/inkwell/remote-import/jobs?id='+job.id,undefined,h.owner)).value
 async function tick(){clock+=minute;h.advanceTo(clock);await view();const result=await(await h.mf.getWorker()).scheduled({scheduledTime:new Date(clock),cron:'* * * * *'});assert.equal(result.outcome,'ok')}
 let state=await view(),ticks=0
 while(state.state!=='review'){
  assert.ok(['previewing','rate_limited'].includes(state.state),JSON.stringify(state))
  if(state.state==='rate_limited'&&state.nextAt>clock){const before=providerCalls;await tick();if(clock<state.nextAt)assert.equal(providerCalls,before,'no source requests before its reset')}
  else await tick()
  state=await view()
  assert.ok(++ticks<total*2,'account preview makes bounded progress')
  if(state.pages&&state.pages%100===0)console.log(JSON.stringify({head,phase:'preview',pages:state.pages,agreements:state.counts.agreements,providerCalls}))
 }
 assert.equal(state.counts.agreements,total)
 assert.equal((await h.db.prepare('SELECT count(*) AS n FROM iw_envelopes').first()).n,0,'complete account review precedes all native writes')
 await h.post('/api/inkwell/remote-import/job',{action:'approve',id:job.id,fingerprint:state.fingerprint})
 await h.db.prepare("CREATE TRIGGER interrupt_scale BEFORE INSERT ON iw_envelopes WHEN json_extract(NEW.data,'$.source.id')='synthetic-inkwell-7' BEGIN SELECT RAISE(ABORT,'synthetic-inkwell-interruption'); END").run()
 await tick();state=await view();assert.equal(state.state,'failed')
 assert.equal((await h.db.prepare('SELECT count(*) AS n FROM iw_envelopes').first()).n,7,'mid-batch interruption preserves earlier atomic checkpoints')
 interrupted=true
 await h.db.prepare('DROP TRIGGER interrupt_scale').run()
 await h.post('/api/inkwell/remote-import/job',{action:'resume',id:job.id})
 const beforeApplyCalls=providerCalls
 while(state.state!=='completed'){
  await tick();state=await view();assert.ok(['applying','completed'].includes(state.state),JSON.stringify(state))
  if(state.applied&&state.applied%100===0)console.log(JSON.stringify({head,phase:'apply',pages:state.applied}))
 }
 assert.equal(providerCalls,beforeApplyCalls,'apply and interrupted retry use durable reviewed bytes')
 const counts=(await h.db.prepare("SELECT count(*) AS n,count(DISTINCT id) AS unique_ids,count(DISTINCT json_extract(data,'$.createdBy')) AS owners FROM iw_envelopes").first())
 assert.deepEqual(counts,{n:total,unique_ids:total,owners:2})
 assert.ok(limited&&interrupted)
 assert.ok([...windows.values()].every(n=>n<=60),'the source call log respects the importer minute budget')
 assert.equal((await h.db.prepare('SELECT count(*) AS n FROM iw_remote_preview_parts').first()).n,0)
 assert.equal((await h.db.prepare('SELECT sealed FROM iw_remote_jobs WHERE id=?').bind(job.id).first()).sealed,null)
 console.log(JSON.stringify({run:'sx-inkwell-x-move-003-scale',head,conclusion:'success',agreements:total,owners:counts.owners,providerCalls,limited,interrupted,durationMs:Date.now()-started}))
}finally{await h.close()}
