import { remoteReadControl } from './remote-import-rate'
import { appendEvent, canonical, id, insist, now, sha256, text, type Actor, type Envelope, type Env } from './model'
import { atomic, roleGuard, type Guard } from './storage'
import { blobWrites, fromBase64 } from './blobs'
import { parsePdf, validateFields } from './pdf'
import { importedTemplateDefinition, type Template } from './templates'
import { readRemoteBatch, type RemoteReadControl } from './remote-import-provider'

interface Planned { id:string;kind:'envelope'|'template';owner:Actor;envelope?:Envelope;template?:Template;pdf:string;audit:string }
/** Match source email exactly; the owner explicitly chooses the fallback admin required by MOVE-002. */
async function mappedOwner(env:Env,email:string,fallback:string) {
 const row=await env.DB.prepare("SELECT o.id,o.email,o.display_name AS name,o.version,CASE WHEN o.role='member' THEN COALESCE(r.role,'viewer') ELSE o.role END AS role FROM oa_operators o LEFT JOIN iw_member_roles r ON r.operator_id=o.id WHERE lower(o.email)=? AND o.status='active'").bind(email).first<Actor>()
 if(row)return {owner:row,unmapped:false}
 const admin=await env.DB.prepare("SELECT id,email,display_name AS name,version,role FROM oa_operators WHERE lower(email)=? AND status='active' AND role IN ('owner','admin')").bind(fallback).first<Actor>()
 insist(admin,'Choose an active owner or admin for unmapped source owners.')
 return {owner:admin,unmapped:true}
}
const ownerGuard=(owner:Actor):Guard=>({sql:"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active')",values:[owner.id,owner.version]})
export async function previewRemoteImport(env:Env,actor:Actor,input:Record<string,unknown>,control:RemoteReadControl&{guard?:Guard}={}) {
 const fallback=text(input.fallbackAdmin,'the fallback admin email',254).toLowerCase()
 const batch=await readRemoteBatch(input,remoteReadControl(env,String(input.provider),control)),planned:Planned[]=[],unmapped=[...batch.unmapped],at=now()
 for(const item of batch.items) {
  const target='remote-'+await sha256(canonical([batch.provider,batch.account,item.kind,item.sourceId]))
  const seen=await env.DB.prepare('SELECT id FROM iw_remote_imports WHERE id=?').bind(target).first()
  if(seen){unmapped.push({sourceId:item.sourceId,reason:'Already imported or erased; retry will not recreate it.'});continue}
  const {owner,unmapped:missing}=await mappedOwner(env,item.ownerEmail,fallback)
  if(missing)unmapped.push({sourceId:item.sourceId,reason:`No active member matches the source owner; assigned to ${owner.email}.`})
  const pdf=fromBase64(item.pdf),{pageSizes}=await parsePdf(pdf)
  if(item.kind==='envelope') {
   const audit=fromBase64(item.audit);await parsePdf(audit)
   insist(item.signers.length>0&&item.signers.length<=100&&item.signers.every(s=>s.email.includes('@')),'Source recipients are invalid; no record was imported.')
   const envelope:Envelope={id:target,version:1,title:item.title,filename:'imported.pdf',status:'imported',imported:true,createdAt:at,createdBy:owner.id,expiresAt:at,signers:item.signers,fields:[],pageSizes,originalSha256:await sha256(pdf),signedSha256:await sha256(pdf),certificateSha256:await sha256(audit),events:[],source:{provider:batch.provider,account:batch.account,id:item.sourceId,status:item.status,ownerEmail:item.ownerEmail,importedAt:at,...(item.terminalAt?{terminalAt:item.terminalAt}:{basis:'terminal time not in the source'}),audit:batch.provider==='dropbox'?'Provider combined PDF including audit trail':'Provider audit report'}}
   await appendEvent(envelope,'envelope.imported',actor.id,{source:envelope.source,owner:owner.id,originalSha256:envelope.originalSha256,certificateSha256:envelope.certificateSha256},at)
   planned.push({id:target,kind:item.kind,owner,envelope,pdf:item.pdf,audit:item.audit})
  } else {
   const fields=(item.fields??[]).map(f=>{const size=pageSizes[Number(f.page)];insist(size,'Template field names a missing page.');return {...f,x:Number(f.x)/size.width,y:Number(f.y)/size.height,width:Number(f.width)/size.width,height:Number(f.height)/size.height}})
   const validated=validateFields(fields,item.roles!.length,pageSizes.length)
   const {definition}=await importedTemplateDefinition(env,{title:item.title,filename:'imported-template.pdf',pdfBase64:item.pdf,roles:item.roles,fields:validated,expiryDays:30},actor)
   const template:Template={...definition,id:target,createdAt:at,createdBy:owner.id,version:1,source:{provider:batch.provider,account:batch.account,id:item.sourceId,ownerEmail:item.ownerEmail,importedAt:at}}
   planned.push({id:target,kind:item.kind,owner,template,pdf:item.pdf,audit:''})
  }
 }
 const summary={provider:batch.provider,account:batch.account,counts:{agreements:planned.filter(p=>p.kind==='envelope').length,templates:planned.filter(p=>p.kind==='template').length},items:planned.map(p=>({id:p.id,title:p.envelope?.title??p.template!.title,kind:p.kind,owner:p.owner.email})),unmapped,next:batch.next}
 const fingerprint=await sha256(canonical({planned,summary})),previewId=id()
 await atomic(env.DB,[roleGuard(actor,['owner']),...(control.guard?[control.guard]:[])],[env.DB.prepare('INSERT INTO iw_remote_previews VALUES(?,?,?,?,?)').bind(previewId,actor.id,fingerprint,JSON.stringify({summary}),Date.now()+30*60_000),...previewParts(env,previewId,JSON.stringify(planned))])
 return {...summary,previewId,fingerprint}
}
/** Each native record and its opaque checkpoint commit together; a lost response is safe to resume. */
export async function applyRemoteImport(env:Env,actor:Actor,input:Record<string,unknown>,guards:Guard[]=[]) {
 const previewId=text(input.previewId,'the preview ID'),fingerprint=text(input.fingerprint,'the approved fingerprint')
 const row=await env.DB.prepare('SELECT data,fingerprint,expires_at FROM iw_remote_previews WHERE id=? AND owner_id=?').bind(previewId,actor.id).first<{data:string;fingerprint:string;expires_at:number}>()
 insist(row&&(row.expires_at>Date.now()||await env.DB.prepare('SELECT job_id FROM iw_remote_job_pages WHERE preview_id=?').bind(previewId).first()),'Preview expired. Review a fresh provider batch.',409)
 insist(row.fingerprint===fingerprint,'The reviewed fingerprint changed.',409)
 const job=await env.DB.prepare('SELECT job_id FROM iw_remote_job_pages WHERE preview_id=?').bind(previewId).first()
 insist(!job||guards.length,'Account pages require approved job authority.',409)
 const {summary,complete}=JSON.parse(row.data) as {summary:unknown;complete?:boolean}
 const parts=(await env.DB.prepare('SELECT part,data FROM iw_remote_preview_parts WHERE preview_id=? ORDER BY part').bind(previewId).all<{part:number;data:string}>()).results
 insist(parts.every((p,i)=>p.part===i),'The reviewed batch is incomplete.',409)
 const planned:Planned[]=parts.length?JSON.parse(parts.map(p=>p.data).join('')):[]
 insist(complete||await sha256(canonical({planned,summary}))===fingerprint,'The reviewed batch is incomplete or changed.',409)
 for(const p of planned) {
  if(await env.DB.prepare('SELECT id FROM iw_remote_imports WHERE id=?').bind(p.id).first())continue
  const writes:D1PreparedStatement[]=[env.DB.prepare('INSERT INTO iw_remote_imports VALUES(?,?)').bind(p.id,p.kind)]
  if(p.envelope) {
   const e=p.envelope,at=now()
   e.createdAt=at;e.expiresAt=at;e.source={...(e.source as Record<string,unknown>),importedAt:at};e.events=[]
   await appendEvent(e,'envelope.imported',actor.id,{source:e.source,owner:e.createdBy,originalSha256:e.originalSha256,certificateSha256:e.certificateSha256},at)
   writes.push(env.DB.prepare('INSERT INTO iw_envelopes VALUES(?,?,?)').bind(e.id,e.version,JSON.stringify(e)),...e.events.map((v,i)=>env.DB.prepare('INSERT INTO iw_events VALUES(?,?,?,?)').bind(e.id,i,v.hash,JSON.stringify(v))),...blobWrites(env.DB,e.id,'original',fromBase64(p.pdf)),...blobWrites(env.DB,e.id,'signed',fromBase64(p.pdf)),...blobWrites(env.DB,e.id,'certificate',fromBase64(p.audit)))
  } else {
   const t=p.template!,bytes=fromBase64(p.pdf)
   t.createdAt=now();if(t.source)t.source.importedAt=t.createdAt
   writes.push(env.DB.prepare('INSERT INTO iw_templates(id,created_by,created_at,data,folder_id) VALUES(?,?,?,?,NULL)').bind(t.id,t.createdBy,t.createdAt,JSON.stringify(t)))
   for(let offset=0,part=0;offset<bytes.length;offset+=65536,part++)writes.push(env.DB.prepare('INSERT INTO iw_template_blobs VALUES(?,?,?)').bind(t.id,part,bytes.slice(offset,offset+65536).buffer))
  }
  await atomic(env.DB,[roleGuard(actor,['owner']),ownerGuard(p.owner),...guards,{sql:'EXISTS(SELECT 1 FROM iw_remote_previews WHERE id=? AND fingerprint=? AND (expires_at>? OR EXISTS(SELECT 1 FROM iw_remote_job_pages WHERE preview_id=?)))',values:[previewId,fingerprint,Date.now(),previewId]}],writes)
 }
 // Drop staged private bytes after successful materialization. A repeat of the approved batch remains idempotent.
 await atomic(env.DB,[roleGuard(actor,['owner']),...guards],[env.DB.prepare('DELETE FROM iw_remote_preview_parts WHERE preview_id=?').bind(previewId),env.DB.prepare('UPDATE iw_remote_previews SET data=? WHERE id=?').bind(JSON.stringify({summary,complete:true}),previewId)])
 return {ok:true,summary}
}

function previewParts(env:Env,previewId:string,data:string) {
 insist(new TextEncoder().encode(data).length<=24*1024*1024,'This source batch exceeds 24 MiB. Choose a smaller source page.',413)
 const parts:D1PreparedStatement[]=[]
 for(let offset=0,part=0;offset<data.length;offset+=50000,part++)parts.push(env.DB.prepare('INSERT INTO iw_remote_preview_parts VALUES(?,?,?)').bind(previewId,part,data.slice(offset,offset+50000)))
 return parts
}
export async function cleanupRemotePreviews(env:Env,at=Date.now()) {await env.DB.prepare('DELETE FROM iw_remote_previews WHERE expires_at<=? AND NOT EXISTS(SELECT 1 FROM iw_remote_job_pages WHERE preview_id=iw_remote_previews.id)').bind(at).run()}
