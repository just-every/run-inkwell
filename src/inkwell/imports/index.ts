import type { Bindings } from '../../auth.server'
import { createD1ImportJob, planD1Import, readD1ImportJob, resumeD1Import, rollbackD1Import, undoD1Import } from '../../modules/import-kit/src/d1/index'
import { confirmOwner, importContext, importSameOrigin, importSession, ImportError } from './auth'
import { archiveArtifact, archiveLibrary } from './library'
import { MAX_ARCHIVE_BYTES, readArchive } from './source'
export { eraseImportedArchive } from './library'
export { importContext, importSession } from './auth'

const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}})
async function body(request:Request):Promise<Record<string,unknown>> {
 if (!request.headers.get('content-type')?.includes('application/json')) throw new ImportError('Send application/json.',415)
 const limit=MAX_ARCHIVE_BYTES*2+20_000,reader=request.body?.getReader()
 if (!reader) throw new ImportError('Supply an archive request body.')
 const chunks:Uint8Array[]=[];let size=0
 try {for (;;) {const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit)throw new ImportError('Archive request is too large.',413);chunks.push(part.value)}} finally {await reader.cancel()}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
 const parsed=JSON.parse(new TextDecoder().decode(bytes))
 if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new ImportError('Supply a JSON object.')
 return parsed
}

/** Owner-only archive door; the signing API can dispatch here before its routes. */
export async function importResponse(request:Request,env:Bindings):Promise<Response|null> {
 const url=new URL(request.url),prefix='/api/inkwell/import/'
 if (!url.pathname.startsWith(prefix)) return null
 try {
  const session=await importSession(request,env),route=url.pathname.slice(prefix.length)
  if (request.method==='GET') {
   if(route==='records')return response(await archiveLibrary(env,session))
   const artifact=route.match(/^records\/([a-f0-9]{64})\/artifacts\/(signed|certificate|audit)$/)
   if(artifact)return archiveArtifact(env,session,artifact[1],artifact[2],url.searchParams.get('index'))
   if(route==='jobs') {
    const {results}=await env.DB.prepare("SELECT id FROM ik_jobs WHERE destination='inkwell' AND namespace='docuseal-completed-archive' ORDER BY rowid DESC LIMIT 100").all<{id:string}>()
    const jobs=[]
    for(const r of results)jobs.push(await readD1ImportJob(r.id,importContext(env,session)))
    await confirmOwner(env,session)
    return response({jobs})
   }
  } else if(request.method==='POST') {
   importSameOrigin(request,env)
   const p=await body(request)
   if(route==='preview'||route==='apply') {
    const {source,mapping,digest}=await readArchive(p.archive)
    const context=importContext(env,session,`docuseal:${digest}`)
    const plan=await planD1Import(source,mapping,context)
    if(route==='preview')return response({fingerprint:plan.fingerprint,counts:plan.counts,diagnostics:plan.diagnostics})
    if(typeof p.fingerprint!=='string'||p.fingerprint!==plan.fingerprint)throw new ImportError('Apply exactly the dry run you reviewed; its fingerprint changed.',409)
    const job=await createD1ImportJob(plan,{...context,reviewedFingerprint:p.fingerprint})
    // Operation replay resumes the retained job, including an interrupted undo.
    return response({job:await resumeD1Import(job.id,context)})
   }
   if(route==='undo'||route==='resume') {
    if(typeof p.id!=='string'||p.id.length>128)throw new ImportError('Supply the import job id.')
    const context=importContext(env,session)
    if(route==='resume')return response({job:await resumeD1Import(p.id,context)})
    const current=await readD1ImportJob(p.id,context)
    return response({job:['queued','applying','failed','rolling_back','rolled_back'].includes(current.state)?await rollbackD1Import(p.id,context):await undoD1Import(p.id,context)})
   }
  }
  return response({error:'Import route not found.'},404)
 } catch(error) {
  const message=error instanceof Error?error.message:'Import failed.'
  const status=error instanceof ImportError?error.status:/CONFLICT|MISMATCH|CHANGED|GUARD|BUSY|SUPERSEDED/.test(message)?409:400
  return response({error:message},status)
 }
}
