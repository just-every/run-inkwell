import { id, insist, text, now, sha256, canonical, type Env, type Actor } from './model'
import { atomic, roleGuard, type Guard } from './storage'
import { seal, unseal } from './seal'
import { ApiRateLimit } from './api-limits'
import { previewRemoteImport, applyRemoteImport } from './remote-import'
import { readBytes } from './body'

interface Data { provider:'acrobat';region:string;fallbackAdmin:string;account?:string;cursor?:string|null;templateCursor?:string|null;continuation?:boolean;pages:number;applied:number;counts:{agreements:number;templates:number};states:Record<string,number>;consent:{actor:string;at:string;version:string};owners:Record<string,{agreements:number;templates:number}>;fingerprint?:string;startedAt:number;calls:number;reviewHash?:string;message?:string }
interface Job { id:string;owner_id:string;owner_version:number;version:number;state:string;phase:string;data:string;sealed:string|null;next_at:number;claim:string|null;lease_until:number }
const consentVersion='acrobat-read-account-v1'
const audit=(env:Env,actor:string,jobId:string,action:string,detail:unknown)=>env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,NULL,?)').bind(id().replaceAll('-',''),now(),actor,'remote_import.'+action,'remote-import:'+jobId,canonical(detail))
const terminal=['completed','cancelled','authority_lost']
const live=['previewing','applying','rate_limited']
const bound=(job:Job):Guard=>({sql:'EXISTS(SELECT 1 FROM iw_remote_jobs WHERE id=? AND version=? AND claim=? AND state IN (\'previewing\',\'applying\',\'rate_limited\') AND EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=owner_id AND o.version=owner_version AND o.role=\'owner\' AND o.status=\'active\'))',values:[job.id,job.version,job.claim]})
async function load(env:Env,actor:Actor,jobId:unknown) {const row=await env.DB.prepare('SELECT * FROM iw_remote_jobs WHERE id=? AND owner_id=?').bind(text(jobId,'the job ID'),actor.id).first<Job>();insist(row,'Import job not found.',404);return row}
async function clearPrivate(env:Env,jobId:string,keepReport=false) {
 const pages=(await env.DB.prepare('SELECT id AS preview_id FROM iw_remote_previews WHERE id GLOB ?').bind(jobId+'-*').all<{preview_id:string}>()).results
 for(const page of pages)await env.DB.prepare(keepReport?'DELETE FROM iw_remote_preview_parts WHERE preview_id=?':'DELETE FROM iw_remote_previews WHERE id=?').bind(page.preview_id).run()
 await env.DB.prepare('DELETE FROM iw_remote_response_parts WHERE job_id=?').bind(jobId).run()
 await env.DB.prepare('UPDATE iw_remote_jobs SET sealed=NULL WHERE id=?').bind(jobId).run()
}
export async function remoteJobView(env:Env,actor:Actor,jobId?:string,page=0) {
 insist(actor.role==='owner'&&actor.sessionId&&!actor.agentId&&!actor.apiKeyId,'A signed-in owner must read import jobs.',403)
 if(!jobId){const jobs=(await env.DB.prepare('SELECT id,state FROM iw_remote_jobs WHERE owner_id=? ORDER BY rowid DESC LIMIT 20').bind(actor.id).all()).results;return {jobs}}
 insist(Number.isSafeInteger(page)&&page>=0,'Choose a valid preview page.')
 const job=await load(env,actor,jobId),data=JSON.parse(job.data) as Data
 const row=await env.DB.prepare('SELECT p.data FROM iw_remote_job_pages j JOIN iw_remote_previews p ON p.id=j.preview_id WHERE j.job_id=? AND j.page=?').bind(job.id,page).first<{data:string}>()
 const elapsed=Math.max(1,Date.now()-data.startedAt),estimatedFinishAt=data.pages&&data.applied?Date.now()+elapsed/data.applied*(data.pages-data.applied):null
 return {id:job.id,state:job.state,phase:job.phase,nextAt:job.next_at,...data,estimatedFinishAt,page,preview:row?JSON.parse(row.data).summary:null}
}
export async function remoteJobAction(env:Env,actor:Actor,input:Record<string,unknown>) {
 insist(actor.role==='owner'&&actor.sessionId&&!actor.agentId&&!actor.apiKeyId,'A signed-in owner must manage imports.',403)
 if(input.action==='start') {
  insist(input.consent===true,'Authorize account reading and sealed grant custody before starting.',400)
  insist(input.provider==='acrobat','Background imports currently support Acrobat Sign only.')
  const region=String(input.region??'na1');insist(['na1','na2','na3','na4','eu1','eu2','au1','jp1','in1','sg1'].includes(region),'Choose an Acrobat region.')
  const credential=text(input.credential,'the provider credential',4096);insist(!/[\r\n]/.test(credential),'Invalid credential.')
  const jobId=id(),data:Data={provider:'acrobat',region,fallbackAdmin:text(input.fallbackAdmin,'the fallback admin email',254).toLowerCase(),pages:0,applied:0,counts:{agreements:0,templates:0},states:{},consent:{actor:actor.id,at:now(),version:consentVersion},owners:{},startedAt:Date.now(),calls:0}
  await atomic(env.DB,[roleGuard(actor,['owner'])],[env.DB.prepare("INSERT INTO iw_remote_jobs(id,owner_id,owner_version,state,phase,data,sealed) VALUES(?,?,?,'previewing','previewing',?,?)").bind(jobId,actor.id,actor.version,JSON.stringify(data),await seal(env,'remote-import',jobId,credential)),audit(env,actor.id,jobId,'started',{provider:data.provider,region:data.region,consent:data.consent,permission:'Read account for this reviewed import only; no provider writes or signing invitations.'})])
  return remoteJobView(env,actor,jobId)
 }
 const job=await load(env,actor,input.id),data=JSON.parse(job.data) as Data,action=input.action
 insist(!terminal.includes(job.state),'This import job has ended.',409)
 let state=job.state,phase=job.phase,sealed=job.sealed
 if(action==='pause'){insist(live.includes(state),'This job is not running.',409);state='paused'}
 else if(action==='cancel'){state='cancelled';sealed=null}
 else if(action==='approve'){insist(state==='review'&&input.fingerprint===data.fingerprint,'Review and approve the complete account fingerprint.',409);state=phase='applying'}
 else if(action==='resume'){
  insist(['paused','failed','grant_required'].includes(state),'This job cannot be resumed.',409)
  if(state==='grant_required'){
   const resource=await sha256(`https://api.${data.region}.adobesign.com/api/rest/v6/users/me`);await env.DB.prepare('DELETE FROM iw_remote_response_parts WHERE job_id=? AND resource=?').bind(job.id,resource).run();sealed=await seal(env,'remote-import',job.id,text(input.credential,'a renewed provider grant',4096))}
  state=phase
 }else insist(false,'Unknown job action.')
 await atomic(env.DB,[roleGuard(actor,['owner']),{sql:'EXISTS(SELECT 1 FROM iw_remote_jobs WHERE id=? AND version=?)',values:[job.id,job.version]}],[env.DB.prepare('UPDATE iw_remote_jobs SET state=?,phase=?,sealed=?,claim=NULL,lease_until=0,version=version+1 WHERE id=?').bind(state,phase,sealed,job.id),audit(env,actor.id,job.id,String(action),{from:job.state,to:state,version:job.version+1})])
 if(state==='cancelled')await clearPrivate(env,job.id)
 return remoteJobView(env,actor,job.id)
}
/** Persist each successful read before continuing. Retries reuse bytes and never repoll a completed resource. */
function jobFetch(env:Env,job:Job,data:Data):typeof fetch {
 return async(input,init)=>{
  const url=String(input),resource=await sha256(url)
  const cached=(await env.DB.prepare('SELECT data FROM iw_remote_response_parts WHERE job_id=? AND resource=? ORDER BY part').bind(job.id,resource).all<{data:string}>()).results
  if(cached.length){const encoded=cached.map(p=>p.data).join('');return new Response(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)))}
  const at=Date.now(),scope='acrobat:'+data.region
  await env.DB.prepare('INSERT OR IGNORE INTO iw_remote_limits VALUES(?,?,0,0)').bind(scope,at).run()
  await env.DB.prepare('UPDATE iw_remote_limits SET window_at=?,calls=0 WHERE scope=? AND window_at<=?').bind(at,scope,at-60_000).run()
  const admitted=await env.DB.prepare('UPDATE iw_remote_limits SET calls=calls+1 WHERE scope=? AND calls<60 AND next_at<=? RETURNING calls').bind(scope,at).first()
  if(!admitted){const limit=await env.DB.prepare('SELECT window_at,next_at FROM iw_remote_limits WHERE scope=?').bind(scope).first<{window_at:number;next_at:number}>();throw new ApiRateLimit(Math.max(1,Math.ceil((Math.max(limit!.window_at+60_000,limit!.next_at)-at)/1000)))}
  await atomic(env.DB,[bound(job)],[env.DB.prepare('UPDATE iw_remote_jobs SET data=? WHERE id=?').bind(JSON.stringify({...data,calls:++data.calls}),job.id)])
  const response=await fetch(input,init)
  const retry=response.headers.get('retry-after'),remaining=response.headers.get('x-ratelimit-remaining'),reset=response.headers.get('x-ratelimit-reset')
  const resetAt=reset&&Number.isFinite(Number(reset))?(Number(reset)>1e12?Number(reset):Number(reset)>1e9?Number(reset)*1000:at+Number(reset)*1000):at+60_000
  const retryAt=retry?(Number.isFinite(Number(retry))?at+Math.max(1,Number(retry))*1000:Date.parse(retry)):at+60_000
  if(response.status===429||remaining!==null&&Number(remaining)===0){const until=response.status===429?(Number.isFinite(retryAt)?retryAt:at+60_000):resetAt;await env.DB.prepare('UPDATE iw_remote_limits SET next_at=max(next_at,?) WHERE scope=?').bind(until,scope).run();if(response.status===429)throw new ApiRateLimit(Math.max(1,Math.ceil((until-at)/1000)))}
  if(response.status===401||response.status===403)throw new Error('grant_required')
  insist(response.ok,'The provider refused this resource. Resume after checking the source grant.',502)
  const bytes=await readBytes(new Request('https://import.invalid',{method:'POST',body:response.body,duplex:'half'} as RequestInit),2*1024*1024)
  if(new URL(url).pathname.endsWith('/users/me')){
   const identity=JSON.parse(new TextDecoder().decode(bytes)),account=text(identity.accountId??identity.userId,'the source account ID')
   insist(!data.account||account===data.account,'The renewed grant belongs to another source account.',409)
   data.account=account
  }
  let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.slice(i,i+16384))
  const encoded=btoa(raw),writes:D1PreparedStatement[]=[]
  for(let offset=0,part=0;offset<encoded.length;offset+=50000,part++)writes.push(env.DB.prepare('INSERT INTO iw_remote_response_parts VALUES(?,?,?,?)').bind(job.id,resource,part,encoded.slice(offset,offset+50000)))
  if(writes.length)await atomic(env.DB,[bound(job)],[...writes,env.DB.prepare('UPDATE iw_remote_jobs SET data=? WHERE id=?').bind(JSON.stringify(data),job.id)])
  return new Response(bytes)
 }
}
export async function processRemoteJobs(env:Env,at=Date.now()) {
 const rows=(await env.DB.prepare("SELECT * FROM iw_remote_jobs WHERE state IN ('previewing','applying','rate_limited') AND next_at<=? AND lease_until<=? ORDER BY rowid LIMIT 1").bind(at,at).all<Job>()).results
 for(const row of rows){
  const claim=id(),job={...row,claim},data=JSON.parse(row.data) as Data
  const claimed=await env.DB.prepare('UPDATE iw_remote_jobs SET claim=?,lease_until=? WHERE id=? AND version=? AND lease_until<=? RETURNING id').bind(claim,at+5*60_000,row.id,row.version,at).first();if(!claimed)continue
  const principal=await env.DB.prepare("SELECT id,email,display_name AS name,version,role FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active'").bind(job.owner_id,job.owner_version).first<Actor>()
  if(!principal){await env.DB.prepare("UPDATE iw_remote_jobs SET state='authority_lost',sealed=NULL,claim=NULL WHERE id=? AND claim=?").bind(job.id,claim).run();await clearPrivate(env,job.id);continue}
  try {
   let state=job.phase,nextAt=0
   if(job.phase==='previewing') {
    const credential=await unseal(env,'remote-import',job.id,job.sealed);if(!credential)throw new Error('grant_required')
    const preview=await previewRemoteImport(env,principal,{...data,credential},{fetcher:jobFetch(env,job,data),previewId:job.id+'-'+data.pages,guards:[bound(job)],account:data.account})
    insist(!data.account||data.account===preview.account,'The renewed grant belongs to another source account.',409)
    data.account=preview.account
    data.reviewHash=await sha256(canonical([data.reviewHash??null,preview.fingerprint]))
    for(const item of preview.items){const key=item.owner,counts=data.owners[key]??={agreements:0,templates:0};counts[item.kind==='envelope'?'agreements':'templates']++}
    for(const [state,count] of Object.entries(preview.states as Record<string,number>))data.states[state]=(data.states[state]??0)+count
    data.counts.agreements+=preview.counts.agreements;data.counts.templates+=preview.counts.templates
    const page=data.pages++;Object.assign(data,preview.next,{continuation:true})
    const more=Object.values(preview.next).some(Boolean)
    if(!more){state='review';data.fingerprint=await sha256(canonical({job:job.id,account:data.account,pages:data.pages,counts:data.counts,owners:data.owners,chain:data.reviewHash}))}
    await atomic(env.DB,[roleGuard(principal,['owner']),bound(job)],[env.DB.prepare('INSERT INTO iw_remote_job_pages VALUES(?,?,?,?)').bind(job.id,page,preview.previewId,preview.fingerprint),env.DB.prepare('UPDATE iw_remote_jobs SET state=?,data=?,claim=NULL,lease_until=0,next_at=? WHERE id=?').bind(state,JSON.stringify(data),nextAt,job.id),env.DB.prepare('DELETE FROM iw_remote_response_parts WHERE job_id=?').bind(job.id)])
   } else {
    const page=await env.DB.prepare('SELECT preview_id,fingerprint FROM iw_remote_job_pages WHERE job_id=? AND page=?').bind(job.id,data.applied).first<{preview_id:string;fingerprint:string}>()
    insist(page,'The reviewed account page is no longer available. Start a new preview.',409)
   if(page)await applyRemoteImport(env,principal,{previewId:page.preview_id,fingerprint:page.fingerprint},[bound(job)])
    if(page)data.applied++
    if(data.applied>=data.pages)state='completed'
    await atomic(env.DB,[roleGuard(principal,['owner']),bound(job)],[env.DB.prepare('UPDATE iw_remote_jobs SET state=?,data=?,claim=NULL,lease_until=0,next_at=0 WHERE id=?').bind(state,JSON.stringify(data),job.id)])
    if(state==='completed')await clearPrivate(env,job.id,true)
   }
  }catch(error){
   const durable=await env.DB.prepare('SELECT data FROM iw_remote_jobs WHERE id=? AND claim=?').bind(job.id,claim).first<{data:string}>()
   if(!durable)continue
   const checkpoint=JSON.parse(durable.data) as Data
   const state=error instanceof ApiRateLimit?'rate_limited':String(error).includes('grant_required')?'grant_required':'failed'
   checkpoint.message=state==='rate_limited'?'Waiting for the provider limit window.':state==='grant_required'?'Renew the source grant to continue from the durable checkpoint.':'This batch did not finish. Check the source and resume; completed records remain checkpointed.'
   const next=error instanceof ApiRateLimit?at+error.retryAfter*1000:0
   await env.DB.prepare('UPDATE iw_remote_jobs SET state=?,data=?,next_at=?,claim=NULL,lease_until=0 WHERE id=? AND claim=?').bind(state,JSON.stringify(checkpoint),next,job.id,claim).run()
  }
 }
}
