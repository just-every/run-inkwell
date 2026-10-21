import { insist, type Env } from './model'
import type { Template } from './templates'
import { stageBytes } from './documents'
export async function templateOriginal(env:Env,template:Template,index:number) {
 const rows=(await env.DB.prepare('SELECT part,data FROM iw_template_document_blobs WHERE template_id=? AND document=? ORDER BY part').bind(template.id,index).all<{part:number;data:number[]}>()).results
 insist(rows.length&&rows.every((r,i)=>r.part===i),'Template document is incomplete.',503)
 const bytes=new Uint8Array(rows.reduce((n,r)=>n+r.data.length,0));let offset=0;for(const r of rows){bytes.set(r.data,offset);offset+=r.data.length}return bytes
}
export async function templateDocumentWrites(env:Env,id:string,originals:(Uint8Array|string)[]|undefined) {
 const writes:D1PreparedStatement[]=[]
 for(const [index,bytes] of (originals??[]).entries()){
  const upload=typeof bytes==='string'?bytes:await stageBytes(env,bytes)
  writes.push(env.DB.prepare('INSERT INTO iw_template_document_blobs(template_id,document,part,data) SELECT ?,?,part,data FROM iw_blob_staging WHERE id=?').bind(id,index,upload),env.DB.prepare('DELETE FROM iw_blob_staging WHERE id=?').bind(upload))
 }
 return writes
}
