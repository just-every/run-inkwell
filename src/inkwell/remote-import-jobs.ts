import { canonical, id, insist, Refusal, sha256, text, type Actor, type Env } from './model'
import { atomic, roleGuard, type Guard } from './storage'
import { fromBase64 } from './blobs'
import { ApiRateLimit } from './api-limits'
import { applyRemoteImport, previewRemoteImport } from './remote-import'

type State = 'reviewing'|'ready'|'importing'|'paused'|'complete'|'cancelled'
interface Job { id:string; owner:string; ownerVersion:number; provider:string; fallbackAdmin:string; region:string; account?:string; state:State; resume?:State; version:number; next:Record<string,unknown>; pages:number; applied:number; agreements:number; templates:number; senders:Record<string,{agreements:number;templates:number}>; nextAt:number; reason?:string; fingerprint?:string }
interface Row { data:string; version:number }
const guard=(j:Job):Guard=>({sql:'EXISTS(SELECT 1 FROM iw_remote_jobs WHERE id=? AND version=?)',values:[j.id,j.version]})
async function load(env:Env,actor:Actor,jobId:unknown) {
 const row=await env.DB.prepare('SELECT data,version FROM iw_remote_jobs WHERE id=? AND owner_id=?').bind(text(jobId,'the job ID'),actor.id).first<Row>()
 insist(row,'Import job not found.',404);const job=JSON.parse(row.data) as Job
 insist(job.ownerVersion===actor.version,'The authorizing owner changed. Start a new account review.',409);return job
}
async function save(env:Env,actor:Actor,j:Job,writes:D1PreparedStatement[]=[]) {
 const previous=j.version,next=previous+1
 await atomic(env.DB,[roleGuard(actor,['owner']),{sql:'EXISTS(SELECT 1 FROM iw_remote_jobs WHERE id=? AND version=?)',values:[j.id,previous]}],[...writes,env.DB.prepare('UPDATE iw_remote_jobs SET version=?,data=? WHERE id=?').bind(next,JSON.stringify({...j,version:next}),j.id)])
 j.version=next
}
async function view(env:Env,j:Job,details=true) {
 if(!details)return {...j,items:[],unmapped:[],estimatedFinishAt:null}
 const pages=(await env.DB.prepare('SELECT p.data FROM iw_remote_job_pages b JOIN iw_remote_previews p ON p.id=b.preview_id WHERE b.job_id=? ORDER BY b.page').bind(j.id).all<{data:string}>()).results.map(p=>JSON.parse(p.data).summary)
 return {...j,items:pages.flatMap(p=>p.items),unmapped:pages.flatMap(p=>p.unmapped),estimatedFinishAt:j.state==='importing'?new Date(Math.max(Date.now(),j.nextAt)+(j.pages-j.applied)*60_000).toISOString():null}
}
/** Review remains interactive: no provider credential is ever stored or used by the scheduler. */
export async function remoteImportJob(env:Env,actor:Actor,action:string,input:Record<string,unknown>) {
 if(action==='jobs')return {jobs:(await env.DB.prepare('SELECT data FROM iw_remote_jobs WHERE owner_id=? ORDER BY rowid DESC LIMIT 20').bind(actor.id).all<{data:string}>()).results.map(r=>JSON.parse(r.data))}
 if(action==='start') {
  insist(['acrobat','dropbox'].includes(String(input.provider)),'Choose an import provider.')
  const j:Job={id:id(),owner:actor.id,ownerVersion:actor.version,provider:String(input.provider),fallbackAdmin:text(input.fallbackAdmin,'the fallback admin email',254).toLowerCase(),region:String(input.region??'na1'),state:'reviewing',version:1,next:{},pages:0,applied:0,agreements:0,templates:0,senders:{},nextAt:0}
  await atomic(env.DB,[roleGuard(actor,['owner'])],[env.DB.prepare('INSERT INTO iw_remote_jobs VALUES(?,?,?,?)').bind(j.id,actor.id,j.version,JSON.stringify(j))]);return view(env,j)
 }
 const j=await load(env,actor,input.jobId)
 if(action==='status')return view(env,j)
 if(action==='pause'){insist(['reviewing','ready','importing'].includes(j.state),'This job cannot be paused.',409);j.resume=j.state;j.state='paused';await save(env,actor,j);return view(env,j)}
 if(action==='resume'){insist(j.state==='paused','This job is not paused.',409);j.state=j.resume!;delete j.resume;await save(env,actor,j);return view(env,j)}
 if(action==='cancel') {
  insist(!['complete','cancelled'].includes(j.state),'This job has ended.',409);j.state='cancelled'
  const pages=(await env.DB.prepare('SELECT preview_id FROM iw_remote_job_pages WHERE job_id=?').bind(j.id).all<{preview_id:string}>()).results
  await save(env,actor,j,[env.DB.prepare('DELETE FROM iw_remote_read_cache WHERE job_id=?').bind(j.id),env.DB.prepare('DELETE FROM iw_remote_job_sources WHERE job_id=?').bind(j.id),env.DB.prepare('DELETE FROM iw_remote_job_pages WHERE job_id=?').bind(j.id),...pages.map(p=>env.DB.prepare('DELETE FROM iw_remote_previews WHERE id=?').bind(p.preview_id))])
  return view(env,j)
 }
 if(action==='review') {
  insist(j.state==='reviewing','This job is not accepting source pages.',409)
  if(j.nextAt>Date.now())throw new ApiRateLimit(Math.ceil((j.nextAt-Date.now())/1000))
  // Claim before outbound work, so racing requests cannot poll the same page.
  j.nextAt=Date.now()+15*60_000;await save(env,actor,j)
  try {
   const bound=await env.DB.prepare('SELECT account FROM iw_remote_job_sources WHERE job_id=?').bind(j.id).first<{account:string}>()
   const preview=await previewRemoteImport(env,actor,{provider:j.provider,region:j.region,fallbackAdmin:j.fallbackAdmin,credential:input.credential,...j.next},{account:bound?.account??j.account,guard:guard(j),identified:async account=>{
    await atomic(env.DB,[roleGuard(actor,['owner']),guard(j),{sql:'NOT EXISTS(SELECT 1 FROM iw_remote_job_sources WHERE job_id=? AND account<>?)',values:[j.id,account]}],[env.DB.prepare('INSERT OR IGNORE INTO iw_remote_job_sources VALUES(?,?)').bind(j.id,account)])
   },cached:async path=>{
    if(path==='/account'||path==='/users/me')return
    const parts=(await env.DB.prepare('SELECT part,data FROM iw_remote_read_cache WHERE job_id=? AND path=? ORDER BY part').bind(j.id,path).all<{part:number;data:string}>()).results
    if(!parts.length)return
    insist(parts.every((part,i)=>part.part===i),'The saved source response is incomplete.',409)
    return fromBase64(parts.map(p=>p.data).join(''))
   },cache:async(path,bytes)=>{
    if(path==='/account'||path==='/users/me')return
    let encoded='';for(let offset=0;offset<bytes.length;offset+=16384)encoded+=String.fromCharCode(...bytes.slice(offset,offset+16384))
    const data=btoa(encoded),writes:D1PreparedStatement[]=[]
    for(let offset=0,part=0;offset<data.length;offset+=50000,part++)writes.push(env.DB.prepare('INSERT OR REPLACE INTO iw_remote_read_cache VALUES(?,?,?,?)').bind(j.id,path,part,data.slice(offset,offset+50000)))
    await atomic(env.DB,[roleGuard(actor,['owner']),guard(j)],writes)
   }})
   j.account=preview.account;j.pages++;j.agreements+=preview.counts.agreements;j.templates+=preview.counts.templates
   for(const item of preview.items){const sender=j.senders[item.owner]??={agreements:0,templates:0};sender[item.kind==='envelope'?'agreements':'templates']++}
   j.next={...preview.next,continuation:true};j.nextAt=0;delete j.reason
   if(!Object.values(preview.next).some(Boolean)){j.state='ready';j.fingerprint=await sha256(canonical({account:j.account,pages:j.pages,senders:j.senders,agreements:j.agreements,templates:j.templates,fingerprints:[...(await env.DB.prepare('SELECT p.fingerprint FROM iw_remote_job_pages b JOIN iw_remote_previews p ON p.id=b.preview_id WHERE b.job_id=? ORDER BY b.page').bind(j.id).all<{fingerprint:string}>()).results.map(p=>p.fingerprint),preview.fingerprint]}))}
   await save(env,actor,j,[env.DB.prepare('INSERT INTO iw_remote_job_pages VALUES(?,?,?)').bind(j.id,j.pages,preview.previewId),env.DB.prepare('DELETE FROM iw_remote_read_cache WHERE job_id=?').bind(j.id)])
   return view(env,j,j.state==='ready')
  }catch(error){
   // The cursor is unchanged. A replacement grant must identify the same source account.
   const current=await load(env,actor,j.id)
   if(current.version===j.version){j.reason=error instanceof Refusal?error.message:'Provider review interrupted; continue from the saved page.';if(error instanceof ApiRateLimit)j.nextAt=Math.max(j.nextAt,Date.now()+error.retryAfter*1000);await save(env,actor,j)}
   throw error
  }
 }
 if(action==='approve') {
  insist(j.state==='ready'&&input.fingerprint===j.fingerprint&&input.approved===true,'Review the entire account and confirm its fingerprint first.',409)
  j.state='importing';await save(env,actor,j);return view(env,j)
 }
 if(action==='advance'){await advanceRemoteJob(env,actor,j);return view(env,await load(env,actor,j.id),false)}
 throw new Refusal('Import route not found.',404)
}
async function advanceRemoteJob(env:Env,actor:Actor,j:Job) {
 if(j.state!=='importing')return
 const page=await env.DB.prepare('SELECT p.id,p.fingerprint FROM iw_remote_job_pages b JOIN iw_remote_previews p ON p.id=b.preview_id WHERE b.job_id=? AND b.page=?').bind(j.id,j.applied+1).first<{id:string;fingerprint:string}>()
 insist(page,'The reviewed account page is unavailable.',409)
 await applyRemoteImport(env,actor,{previewId:page.id,fingerprint:page.fingerprint},[guard(j)])
 j.applied++;if(j.applied===j.pages)j.state='complete'
 await save(env,actor,j)
}
export async function advanceRemoteImports(env:Env) {
 const rows=(await env.DB.prepare("SELECT data FROM iw_remote_jobs WHERE json_extract(data,'$.state')='importing' LIMIT 5").all<{data:string}>()).results
 for(const row of rows){const j=JSON.parse(row.data) as Job,actor=await env.DB.prepare("SELECT id,email,display_name AS name,version,role FROM oa_operators WHERE id=? AND version=? AND status='active' AND role='owner'").bind(j.owner,j.ownerVersion).first<Actor>();if(actor)await advanceRemoteJob(env,actor,j)}
}
