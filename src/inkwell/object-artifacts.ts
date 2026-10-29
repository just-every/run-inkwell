import { id, insist, sha256, type Env } from './model'
export type ObjectArtifact={object_key:string;bytes:number;sha256:string}
export async function objectArtifact(env:Env,type:string,owner:string,kind:string) {
 return env.DB.prepare('SELECT object_key,bytes,sha256 FROM iw_object_artifacts WHERE owner_type=? AND owner_id=? AND kind=?').bind(type,owner,kind).first<ObjectArtifact>()
}
export async function readObject(env:Env,artifact:ObjectArtifact,expected?:string) {
 const object=await env.ARTIFACTS.get(artifact.object_key)
 insist(object&&object.size===artifact.bytes,'The stored object is unavailable or incomplete.',503)
 const bytes=new Uint8Array(await object.arrayBuffer())
 insist(await sha256(bytes)===(expected??artifact.sha256),'The stored object failed its SHA-256 integrity check.',503)
 return bytes
}
/** Publish immutable bytes before the fenced database reference. Failed transactions leave no readable artifact. */
export async function objectWrites(env:Env,type:string,owner:string,kind:string,bytes:Uint8Array) {
 const hash=await sha256(bytes),key=`artifacts/${type}/${owner}/${id()}`
 const staged=await env.DB.prepare('INSERT INTO iw_object_pending(object_key,owner_type,owner_id,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM iw_object_erasure_fences WHERE owner_type=? AND owner_id=?)').bind(key,type,owner,new Date().toISOString(),type,owner).run()
 insist(staged.meta.changes===1,'This document was erased.',409)
 await env.ARTIFACTS.put(key,bytes,{sha256:hash})
 const pending=await env.DB.prepare('SELECT cancelled FROM iw_object_pending WHERE object_key=?').bind(key).first<{cancelled:number}>()
 if(!pending||pending.cancelled){await env.ARTIFACTS.delete(key);await env.DB.prepare('DELETE FROM iw_object_pending WHERE object_key=?').bind(key).run();insist(false,'This document was erased during storage.',409)}
 return [env.DB.prepare('INSERT INTO iw_object_artifacts(owner_type,owner_id,kind,object_key,bytes,sha256) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_type,owner_id,kind) DO UPDATE SET object_key=excluded.object_key,bytes=excluded.bytes,sha256=excluded.sha256').bind(type,owner,kind,key,bytes.length,hash),env.DB.prepare('DELETE FROM iw_object_pending WHERE object_key=?').bind(key)]
}
export function copyObjectWrites(env:Env,fromType:string,from:string,toType:string,to:string,kind:string,toKind=kind) {
 return env.DB.prepare('INSERT INTO iw_object_artifacts(owner_type,owner_id,kind,object_key,bytes,sha256) SELECT ?,?,?,object_key,bytes,sha256 FROM iw_object_artifacts WHERE owner_type=? AND owner_id=? AND kind=?').bind(toType,to,toKind,fromType,from,kind)
}
export async function ownedObjectKeys(env:Env,type:string,owner:string) {
 return (await env.DB.prepare('SELECT object_key FROM iw_object_artifacts WHERE owner_type=? AND owner_id=?').bind(type,owner).all<{object_key:string}>()).results.map(r=>r.object_key)
}
/** Copies have independent custody references. Erasure removes bytes only after the final reference is gone. */
async function retainedBySnapshot(env:Env,key:string) {
 const snapshots=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'iw_exit_*_o'").all<{name:string}>()).results.filter(row=>/^iw_exit_[a-f0-9]+_o$/.test(row.name))
 for(const snapshot of snapshots)if(await env.DB.prepare(`SELECT 1 FROM "${snapshot.name}" WHERE object_key=? LIMIT 1`).bind(key).first())return true
 return false
}
export async function removeUnreferencedObjects(env:Env,keys:string[]) {
 for(const key of new Set(keys)){
  if(!await env.DB.prepare('SELECT 1 FROM iw_object_artifacts WHERE object_key=? LIMIT 1').bind(key).first()){
   if(await retainedBySnapshot(env,key))continue
   await env.ARTIFACTS.delete(key)
  }
  await env.DB.prepare('DELETE FROM iw_object_deletions WHERE object_key=?').bind(key).run()
 }
}
/** Export only committed custody; the portability reference check fences inventory against its snapshot. */
export function archiveBuckets(env:Env) {
 const bucket=env.ARTIFACTS
 return {ARTIFACTS:new Proxy(bucket,{get(target,prop){
  if(prop==='list')return async(options:R2ListOptions={})=>{
   const page=await target.list(options),objects=[]
   for(const object of page.objects)if(await env.DB.prepare('SELECT 1 FROM iw_object_artifacts WHERE object_key=? LIMIT 1').bind(object.key).first())objects.push(object)
   return {...page,objects}
  }
  const value=Reflect.get(target,prop);return typeof value==='function'?value.bind(target):value
 }})}
}
export async function ownerObjectKeys(env:Env,type:string,owner:string) {
 const keys=await ownedObjectKeys(env,type,owner);let cursor:string|undefined
 do{const page=await env.ARTIFACTS.list({prefix:`artifacts/${type}/${owner}/`,cursor});keys.push(...page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:undefined}while(cursor)
 return keys
}

export async function cleanupUploads(env:Env) {
 const rows=(await env.DB.prepare('SELECT upload_id FROM iw_upload_cleanup LIMIT 32').all<{upload_id:string}>()).results
 for(const row of rows){let cursor:string|undefined;do{const page=await env.ARTIFACTS.list({prefix:`staging/${row.upload_id}/`,cursor});if(page.objects.length)await env.ARTIFACTS.delete(page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:undefined}while(cursor);await env.DB.prepare('DELETE FROM iw_upload_cleanup WHERE upload_id=?').bind(row.upload_id).run()}
}
export async function cleanupExpiredUploads(env:Env,at:number) {
 const cutoff=new Date(at-24*60*60*1000).toISOString()
 await env.DB.prepare('DELETE FROM iw_pdf_uploads WHERE created_at<?').bind(cutoff).run()
 await cleanupUploads(env)
 const deletions=(await env.DB.prepare('SELECT object_key FROM iw_object_deletions LIMIT 100').all<{object_key:string}>()).results
 await removeUnreferencedObjects(env,deletions.map(row=>row.object_key))
 const stale=(await env.DB.prepare('SELECT object_key FROM iw_object_pending WHERE cancelled=1 OR created_at<? LIMIT 100').bind(cutoff).all<{object_key:string}>()).results
 for(const row of stale){await removeUnreferencedObjects(env,[row.object_key]);await env.DB.prepare('DELETE FROM iw_object_pending WHERE object_key=?').bind(row.object_key).run()}
}

export async function cleanupSupersededObjects(env:Env) {
 const queued=(await env.DB.prepare('SELECT object_key FROM iw_object_deletions LIMIT 100').all<{object_key:string}>()).results
 await removeUnreferencedObjects(env,queued.map(row=>row.object_key))
}
