// Manual scale proof for the Dropbox import job. Run outside push Verify, on committed HEAD.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { harness } from '../harness.mjs'
import { remoteImportFake } from '../fixtures/remote-import.mjs'
const address=(name,domain='example.test')=>[name,domain].join('@')

const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}),'','commit the candidate before scale proof')
const total=18000,base=Date.parse('2026-06-01T00:00:00.000Z'),fixture=await remoteImportFake('dropbox')
let clock=base,forcedLimit=false
const windows=new Map(),resources=new Map()
const sourceId=index=>'synthetic-inkwell-'+index
const edge=async request=>{
 const url=new URL(request.url)
 if(url.hostname!=='api.hellosign.com')return
 const window=Math.floor(clock/60000),used=(windows.get(window)??0)+1;windows.set(window,used)
 assert.ok(used<=100,'the provider receives no more than its advertised calls in a minute')
 const headers={'x-ratelimit-remaining':String(100-used),'x-ratelimit-reset':String((window+1)*60)}
 const json=value=>Response.json(value,{headers}),path=url.pathname.replace('/v3','')
 if(!forcedLimit&&used===37){forcedLimit=true;return new Response('synthetic-inkwell-limit',{status:429,headers:{...headers,'retry-after':'60'}})}
 if(path==='/account')return json({account:{account_id:'synthetic-inkwell-scale'}})
 if(path==='/signature_request/list'){
  const page=Number(url.searchParams.get('page')),start=(page-1)*20
  return json({signature_requests:Array.from({length:Math.min(20,total-start)},(_,i)=>({signature_request_id:sourceId(start+i)})),list_info:{num_pages:total/20}})
 }
 if(path==='/template/list')return json({templates:[],list_info:{num_pages:1}})
 const identity=path.replace('/signature_request/files/','').replace('/signature_request/',''),index=Number(identity.slice('synthetic-inkwell-'.length))
 assert.ok(Number.isInteger(index)&&index>=0&&index<total,'only fixture resources are requested')
 const resource=path+url.search,previous=resources.get(resource)
 if(previous!==undefined)assert.ok(clock-previous>=15*60000,'an interrupted resource is not polled twice within 15 minutes')
 resources.set(resource,clock)
 if(path.startsWith('/signature_request/files/'))return new Response(fixture.pdf,{headers:{...headers,'content-type':'application/pdf'}})
 return json({signature_request:{signature_request_id:identity,title:'Scale request '+index,requester_email_address:index%2?[address('second')]:address('first'),is_complete:true,signatures:[{signer_name:'Synthetic client',signer_email_address:address('client'),signed_at:1767225600}]}})
}
const h=await harness({networkEdge:edge,now:clock}),route='/api/inkwell/remote-import/jobs/'
try {
 // Keep this scale fixture authorized while its simulated provider windows advance over several days.
 await h.db.prepare('UPDATE oa_sessions SET expires_at=?').bind(base+30*86400000).run()
 const senders=[]
 for(const email of [address('first'),address('second')]){const cookie=await h.invite(email,'member'),actor=(await h.send('/api/inkwell',undefined,cookie)).value.actor;await h.command('member.role',{operatorId:actor.id,role:'sender'});senders.push(cookie)}
 await h.db.prepare('UPDATE oa_sessions SET expires_at=?').bind(base+30*86400000).run()
 const call=async(action,input={},status=200)=>(await h.post(route+action,input,h.owner,status)).value
 const j=await call('start',{provider:'dropbox',fallbackAdmin:address('owner','harbour.example')}),input={jobId:j.id,credential:'synthetic-inkwell-99'}
 let state=j,pauses=0
 while(state.state==='reviewing'){
  const response=await h.send(route+'review',input,h.owner)
  if(response.status===429){pauses++;state=await call('status',{jobId:j.id});assert.ok(state.nextAt>clock);clock=state.nextAt+1;h.advanceTo(clock)}
  else{assert.equal(response.status,200,JSON.stringify(response.value));state=response.value}
  if(state.pages&&state.pages%100===0)console.log('Reviewed pages',state.pages,'of',total/20)
 }
 assert.equal(state.state,'ready');assert.equal(state.agreements,total);assert.equal(state.templates,0)
 assert.deepEqual(state.senders,{[address('first')]:{agreements:9000,templates:0},[address('second')]:{agreements:9000,templates:0}})
 assert.equal(state.items.length,total);assert.equal(new Set(state.items.map(i=>i.id)).size,total)
 assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.total,0)
 await call('approve',{jobId:j.id,fingerprint:state.fingerprint,approved:true})
 // Simulate death after the first committed record of a batch, then resume its same checkpoint.
 const interrupted=state.items[1].id
 await h.db.prepare(`CREATE TRIGGER interrupt_scale BEFORE INSERT ON iw_envelopes WHEN NEW.id='${interrupted}' BEGIN SELECT RAISE(ABORT,'synthetic-inkwell-interruption'); END`).run()
 await call('advance',{jobId:j.id},500)
 assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.total,1)
 await h.db.prepare('DROP TRIGGER interrupt_scale').run()
 for(let page=0;page<total/20;page++){
  state=await call('advance',{jobId:j.id})
  if((page+1)%100===0)console.log('Imported pages',page+1,'of',total/20)
 }
 assert.equal(state.state,'complete');assert.equal(state.applied,total/20)
 await call('advance',{jobId:j.id})
 const all=await h.send('/api/inkwell/envelopes?limit=100',undefined,h.owner)
 assert.equal(all.value.total,total);assert.equal(all.value.counts.imported,total)
 const seen=new Set()
 for(const [i,cookie] of senders.entries()){
  let cursor=null,count=0
  do{
   const page=(await h.send('/api/inkwell/envelopes?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''),undefined,cookie)).value
   assert.equal(page.total,9000)
   for(const e of page.envelopes){assert.equal(Number(e.source.id.slice('synthetic-inkwell-'.length))%2,i);assert.ok(!seen.has(e.id),'no duplicate public record');seen.add(e.id);count++}
   cursor=page.next
  }while(cursor)
  assert.equal(count,9000)
 }
 assert.equal(seen.size,total);assert.ok(forcedLimit&&pauses>0)
 console.log(JSON.stringify({run:'remote-import-scale-'+sha,sha,records:seen.size,perSender:[9000,9000],duplicates:0,pauses,maximumCallsPerMinute:Math.max(...windows.values()),minimumResourceRetryMinutes:15,checkpointResume:true}))
}finally{await h.close()}
