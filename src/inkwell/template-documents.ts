import { createHash } from 'node:crypto'
import { insist, type Env } from './model'
import type { Template } from './templates'
import { stageBytes } from './documents'
async function* chunks(env:Env,template:Template,index:number){
 let part=0
 for(;;){const rows=(await env.DB.prepare('SELECT part,data FROM iw_template_document_blobs WHERE template_id=? AND document=? AND part>=? ORDER BY part LIMIT 4').bind(template.id,index,part).all<{part:number;data:number[]}>()).results;if(!rows.length)break;for(const row of rows){insist(row.part===part++,'Template document is incomplete.',503);yield new Uint8Array(row.data)}}
 insist(part>0,'Template document is unavailable.',503)
}
export async function verifyTemplateDocument(env:Env,template:Template,index:number){const digest=createHash('sha256');for await(const chunk of chunks(env,template,index))digest.update(chunk);insist(digest.digest('hex')===template.documents?.[index]?.sha256,'Template document failed its SHA-256 integrity check.',503)}
export async function templateOriginal(env:Env,template:Template,index:number) {
 const d=template.documents?.[index];insist(d,'Template document not found.',404)
 const bytes=new Uint8Array(d.bytes),digest=createHash('sha256');let offset=0
 for await(const chunk of chunks(env,template,index)){bytes.set(chunk,offset);offset+=chunk.length;digest.update(chunk)}
 insist(offset===bytes.length&&digest.digest('hex')===d.sha256,'Template document failed its SHA-256 integrity check.',503);return bytes
}
export async function templateDocumentWrites(env:Env,id:string,originals:(Uint8Array|string)[]|undefined) {
 const writes:D1PreparedStatement[]=[]
 for(const [index,bytes] of (originals??[]).entries()){
  const upload=typeof bytes==='string'?bytes:await stageBytes(env,bytes)
  writes.push(env.DB.prepare('INSERT INTO iw_template_document_blobs(template_id,document,part,data) SELECT ?,?,part,data FROM iw_blob_staging WHERE id=?').bind(id,index,upload),env.DB.prepare('DELETE FROM iw_blob_staging WHERE id=?').bind(upload))
 }
 return writes
}
