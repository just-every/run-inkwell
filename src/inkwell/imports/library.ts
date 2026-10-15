import { Buffer } from 'node:buffer'
import type { Bindings } from '../../auth.server'
import type { Session } from '../../modules/operator-auth/index.mjs'
import { retireD1ImportCustody, sha256, type D1Sql } from '../../modules/import-kit/src/d1/index'
import { confirmOwner, importContext, ImportError } from './auth'
import type { ArchiveValue } from './source'

export async function archiveLibrary(env:Bindings,session:Session) {
 const {results}=await env.DB.prepare('SELECT id,value FROM iw_imported_archives ORDER BY id').all<{id:string;value:string}>()
 const records=results.map(r=>{
  const value=JSON.parse(r.value) as ArchiveValue
  return {id:r.id,title:value.title,sourceId:value.sourceId,provider:value.provider,completedAt:value.completedAt,signers:value.metadata.submitters.map((s:any)=>({name:s.name,email:s.email,role:s.role,completedAt:s.completed_at})),artifacts:value.files.map((f,i)=>({role:f.role,name:f.name,sha256:f.sha256,size:f.size,url:`/api/inkwell/import/records/${r.id}/artifacts/${f.role}?index=${i}`}))}
 })
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
 const context={...importContext(env,session),originalErasurePolicy:'withdraw-affected-artifacts' as const}
 return retireD1ImportCustody({target:{kind:'archive',id}},[{sql:'DELETE FROM iw_imported_archives WHERE id=?',params:[id]}],context,checkpoint)
}
