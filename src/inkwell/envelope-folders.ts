import { appendEvent, id, insist, now, text, type Actor, type Env } from './model'
import { atomic, commandWrite, commitEnvelope, getEnvelope, roleGuard } from './storage'
import { mayShare } from './members'
import type { CommandContext } from './envelopes'

type Folder = { id:string; name:string; owner_id:string; version:number; retention_years:number|null; updated_at:string; updated_by:string }
const admin=(actor:Actor)=>['owner','admin'].includes(actor.role)
const manages=(actor:Actor,folder:Folder)=>admin(actor)||actor.role==='sender'&&folder.owner_id===actor.id
async function load(env:Env,folderId:string) { const row=await env.DB.prepare('SELECT * FROM iw_envelope_folders WHERE id=?').bind(folderId).first<Folder>();insist(row,'Folder not found.',404);return row }
export async function envelopeFolders(env:Env,actor:Actor) {
 const rows=(await env.DB.prepare("SELECT f.*,s.access FROM iw_envelope_folders f LEFT JOIN iw_envelope_folder_shares s ON s.folder_id=f.id AND s.operator_id=? WHERE ?=1 OR f.owner_id=? OR s.operator_id IS NOT NULL ORDER BY f.name COLLATE NOCASE,f.id").bind(actor.id,admin(actor)||actor.role==='viewer'?1:0,actor.id).all<Folder&{access:string|null}>()).results
 return {folders:await Promise.all(rows.map(async f=>({id:f.id,name:f.name,version:f.version,retentionYears:f.retention_years,manage:manages(actor,f),access:actor.role==='viewer'?'view':manages(actor,f)?'edit':f.access,shares:manages(actor,f)?(await env.DB.prepare('SELECT s.operator_id AS operatorId,o.email,s.access FROM iw_envelope_folder_shares s JOIN oa_operators o ON o.id=s.operator_id WHERE folder_id=? ORDER BY o.email').bind(f.id).all()).results:[]})))}
}
export async function changeEnvelopeFolder(env:Env,context:CommandContext,input:Record<string,unknown>) {
 const before=await getEnvelope(env.DB,text(input.id,'an envelope ID'))
 insist(mayShare(context.actor,before),'Only the sender, an owner or an admin can move an envelope between shared folders.',403)
 const folderId=input.folderId===null||input.folderId===''?undefined:text(input.folderId,'a folder ID',100)
 const folder=folderId?await load(env,folderId):undefined
 insist(!folder||manages(context.actor,folder),'Only the folder owner, an owner or an admin can file an envelope here.',403)
 insist(input.expectedVersion===before.version,'This envelope changed. Refresh before moving it.',409)
 const after=structuredClone(before);after.folderId=folderId
 await appendEvent(after,'envelope.folder_changed',context.actor.id,{before:before.folderId??null,after:folderId??null})
 const result={id:before.id,folderId:folderId??null}
 await commitEnvelope(env,before,after,context.actor,[commandWrite(env.DB,context.actor.id,context.commandId,context.fingerprint,result)],folder?[{sql:'EXISTS(SELECT 1 FROM iw_envelope_folders WHERE id=? AND version=?)',values:[folder.id,folder.version]}]:[])
 return result
}
export async function changeFolder(env:Env,context:CommandContext,input:Record<string,unknown>) {
 const action=text(input.action,'a folder action'),actor=context.actor,at=now()
 insist(!actor.agentId&&!actor.apiKeyId&&['owner','admin','sender'].includes(actor.role),'Use a sender, owner or admin session to manage folders.',403)
 const folder=action==='create'?undefined:await load(env,text(input.id,'a folder ID'))
 insist(!folder||manages(actor,folder),'Only the folder owner, an owner or an admin can change its settings or shares.',403)
 insist(!folder||input.expectedVersion===folder.version,'This folder changed. Refresh before saving.',409)
 const folderId=folder?.id??id(),version=(folder?.version??0)+1,writes:D1PreparedStatement[]=[]
 let detail:Record<string,unknown>
 if(action==='create') {const name=text(input.name,'a folder name',80);insist(!/[\r\n\t]/.test(name),'Use a single line for the folder name.');detail={name};writes.push(env.DB.prepare('INSERT INTO iw_envelope_folders VALUES(?,?,?,?,NULL,?,?)').bind(folderId,name,actor.id,version,at,actor.id))}
 else if(action==='retention') {
  insist(admin(actor),'Only an owner or admin changes retention rules.',403)
  const years=input.years;insist(years===null||Number.isInteger(years)&&Number(years)>=1&&Number(years)<=99,'Choose 1–99 whole years, or inherit the account rule.')
  detail={before:folder!.retention_years,after:years};writes.push(env.DB.prepare('UPDATE iw_envelope_folders SET retention_years=? WHERE id=?').bind(years,folderId))
 } else {
  insist(action==='share'||action==='unshare','Unknown folder action.')
  const email=text(input.email,'a member email',254).toLowerCase(),target=await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=? AND status='active'").bind(email).first<{id:string}>()
  insist(target,'No active member uses that email.',404);insist(target.id!==folder!.owner_id,'That member owns this folder.',409)
  if(action==='share'){insist(input.access==='view'||input.access==='edit','Share to view or to edit.');writes.push(env.DB.prepare('INSERT INTO iw_envelope_folder_shares VALUES(?,?,?) ON CONFLICT(folder_id,operator_id) DO UPDATE SET access=excluded.access').bind(folderId,target.id,input.access))}
  else writes.push(env.DB.prepare('DELETE FROM iw_envelope_folder_shares WHERE folder_id=? AND operator_id=?').bind(folderId,target.id))
  detail={operator:target.id,...(action==='share'?{access:input.access}:{})}
 }
 if(folder)writes.push(env.DB.prepare('UPDATE iw_envelope_folders SET version=?,updated_at=?,updated_by=? WHERE id=?').bind(version,at,actor.id,folderId))
 const result={id:folderId,version}
 await atomic(env.DB,[roleGuard(actor,action==='retention'?['owner','admin']:undefined),...(folder?[{sql:'EXISTS(SELECT 1 FROM iw_envelope_folders WHERE id=? AND version=?)',values:[folderId,folder.version]}]:[])],[...writes,env.DB.prepare('INSERT INTO iw_envelope_folder_events VALUES(?,?,?,?,?,?)').bind(id(),folderId,actor.id,at,action,JSON.stringify(detail)),commandWrite(env.DB,actor.id,context.commandId,context.fingerprint,result)])
 return result
}
