import { archiveRetentionMessages } from './retention-mail'
import { archiveMailErasure } from './retention-mail-erasure'
import { Buffer } from 'node:buffer'
import type { Bindings } from '../../auth.server'
import type { Session } from '../../modules/operator-auth/index.mjs'
import { retireD1ImportCustody, sha256, type D1Sql, type ImportAction } from '../../modules/import-kit/src/d1/index'
import { confirmOwner, importContext, ImportError } from './auth'
import type { ArchiveValue } from './source'
import { unheldArchive } from './retention-holds'
import { archiveClocks, archiveGroups } from './retention-groups'

export async function archiveLibrary(env:Bindings,session:Session) {
 const {results}=await env.DB.prepare('SELECT id,value FROM iw_imported_archives ORDER BY id').all<{id:string;value:string}>()
 const holds=(await env.DB.prepare('SELECT record_id,reason,actor,placed_at FROM iw_import_holds').all<{record_id:string;reason:string;actor:string;placed_at:string}>()).results
 const groups=archiveGroups(await archiveClocks(env))
 const history=(await env.DB.prepare('SELECT record_id,action,reason,actor,at FROM iw_import_hold_events ORDER BY at,id').all<{record_id:string;action:string;reason:string;actor:string;at:string}>()).results
 const records=await Promise.all(results.map(async r=>{
  const group=groups.find(g=>g.some(c=>(JSON.parse(c.records) as {id:string}[]).some(v=>v.id===r.id)))
  const clock=group?.find(g=>g.purge_at)
  const value=JSON.parse(r.value) as ArchiveValue
  const messages=(await Promise.all((group??[]).map(g=>archiveRetentionMessages(env,g.job_id)))).flat()
  return {id:r.id,messages:[...new Map(messages.map(m=>[m.id,m])).values()],legalHold:holds.find(h=>h.record_id===r.id),holdHistory:history.filter(e=>e.record_id===r.id),retention:clock?{due:clock.due,warnedAt:clock.warned_at,purgeAt:clock.purge_at}:null,title:value.title,sourceId:value.sourceId,provider:value.provider,completedAt:value.completedAt,signers:value.metadata.submitters.map((s:any)=>({name:s.name,email:s.email,role:s.role,completedAt:s.completed_at})),artifacts:value.files.map((f,i)=>({role:f.role,name:f.name,sha256:f.sha256,size:f.size,url:`/api/inkwell/import/records/${r.id}/artifacts/${f.role}?index=${i}`}))}
 }))
 await confirmOwner(env,session)
 return {records}
}
export async function archiveArtifact(env:Bindings,session:Session,id:string,role:string,index:string|null) {
 const row=await env.DB.prepare('SELECT value FROM iw_imported_archives WHERE id=?').bind(id).first<{value:string}>()
 if (!row) throw new ImportError('Imported archive not found.',404)
 const value=JSON.parse(row.value) as ArchiveValue
 const wanted=role==='certificate'?'audit':role
 const file=index===null ? value.files.find(f=>f.role===wanted) : value.files[Number(index)]
 if (!file || file.role!==wanted) throw new ImportError('Imported artifact not found.',404)
 const bytes=Buffer.from(file.base64,'base64')
 if (sha256(bytes)!==file.sha256 || bytes.length!==file.size) throw new ImportError('Imported artifact failed its integrity check.',409)
 await confirmOwner(env,session)
 return new Response(bytes,{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'cache-control':'no-store','x-content-type-options':'nosniff','x-inkwell-evidence-origin':'docuseal-import'}})
}

/** Original JSON can contain other submissions. Withdraw its whole artifact rather
 * than claiming that a removed submission's bytes were selectively scrubbed. */
export async function eraseImportedArchive(env:Bindings,session:Session,id:string,checkpoint:D1Sql[]) {
 const owner=importContext(env,session), unheld=unheldArchive(id)
 const context={...owner,originalErasurePolicy:'withdraw-affected-artifacts' as const,authorization:{...owner.authorization,predicate:(action:ImportAction,destination:string)=>{const p=owner.authorization.predicate(action,destination);return {sql:`(${p.sql}) AND (${unheld.sql})`,params:[...p.params??[],...unheld.params??[]]}}}}
 const group=archiveGroups(await archiveClocks(env)).find(g=>g.some(c=>(JSON.parse(c.records) as {id:string}[]).some(r=>r.id===id)))??[]
 const jobs=JSON.stringify(group.map(g=>g.job_id))
 const native:D1Sql[]=[{sql:'DELETE FROM iw_imported_archives WHERE id=?',params:[id]},{sql:'DELETE FROM iw_import_hold_events WHERE record_id=?',params:[id]},
  ...archiveMailErasure(group.map(g=>g.job_id)),
  {sql:"DELETE FROM iw_notice_posts WHERE notice_id IN (SELECT id FROM iw_notices WHERE envelope_id IN (SELECT 'import:'||value FROM json_each(?)))",params:[jobs]},
  {sql:"DELETE FROM iw_notices WHERE envelope_id IN (SELECT 'import:'||value FROM json_each(?))",params:[jobs]},
  {sql:'UPDATE iw_import_retention SET due=NULL,warned_at=NULL,purge_at=NULL WHERE job_id IN (SELECT value FROM json_each(?))',params:[jobs]}]
 return retireD1ImportCustody({target:{kind:'archive',id}},native,context,checkpoint)
}
