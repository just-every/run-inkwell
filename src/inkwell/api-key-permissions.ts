import { atomic, commandWrite, previousCommand, roleGuard, type Guard } from './storage'
import { insist, now, text, type Actor, type Env } from './model'
import type { CommandContext } from './envelopes'

interface Permission { member_id:string;enabled:number;version:number;actor:string;at:string }
const view=(p:Permission)=>({memberId:p.member_id,enabled:Boolean(p.enabled),version:p.version,actor:p.actor,at:p.at})
/** API-001 B2/B5: owner/admin grants; current sender role and record access still cap every operation. */
export async function selfServiceKeyGuard(env:Env,actor:Actor):Promise<Guard[]> {
 if(actor.role!=='sender')return []
 const row=await env.DB.prepare('SELECT version FROM iw_api_key_permissions WHERE member_id=? AND enabled=1').bind(actor.id).first<{version:number}>()
 insist(row,'Your administrator has not granted permission to use self-service API keys.',403)
 return [{sql:'EXISTS(SELECT 1 FROM iw_api_key_permissions WHERE member_id=? AND enabled=1 AND version=?)',values:[actor.id,row.version]}]
}
export async function apiKeyPermissions(env:Env) {
 const rows=(await env.DB.prepare('SELECT * FROM iw_api_key_permissions ORDER BY member_id').all<Permission>()).results
 return {permissions:rows.map(view)}
}
export async function setApiKeyPermission(env:Env,context:CommandContext,input:Record<string,unknown>) {
 const {actor}=context;insist(actor.sessionId&&!actor.apiKeyId&&!actor.agentId&&['owner','admin'].includes(actor.role),'Only a signed-in owner or admin grants self-service API keys.',403)
 const member=text(input.memberId,'a member ID',100);insist(typeof input.enabled==='boolean','Choose whether self-service API keys are allowed.')
 const previous=await previousCommand(env.DB,actor.id,context.commandId,context.fingerprint);if(previous)return previous
 const before=await env.DB.prepare('SELECT * FROM iw_api_key_permissions WHERE member_id=?').bind(member).first<Permission>()
 insist(input.expectedVersion===(before?.version??0),'This permission changed. Refresh before saving it.',409)
 const version=(before?.version??0)+1,at=now(),after={member_id:member,enabled:input.enabled?1:0,version,actor:actor.id,at},result=view(after)
 const guards:Guard[]=[roleGuard(actor,['owner','admin']),{sql:"EXISTS(SELECT 1 FROM oa_operators o JOIN iw_member_roles r ON r.operator_id=o.id WHERE o.id=? AND o.status='active' AND o.role='member' AND r.role='sender')",values:[member]},before?{sql:'EXISTS(SELECT 1 FROM iw_api_key_permissions WHERE member_id=? AND version=?)',values:[member,before.version]}:{sql:'NOT EXISTS(SELECT 1 FROM iw_api_key_permissions WHERE member_id=?)',values:[member]}]
 await atomic(env.DB,guards,[env.DB.prepare('INSERT INTO iw_api_key_permissions(member_id,enabled,version,actor,at) VALUES(?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET enabled=excluded.enabled,version=excluded.version,actor=excluded.actor,at=excluded.at').bind(member,after.enabled,version,actor.id,at),env.DB.prepare('INSERT INTO iw_api_key_permission_versions(member_id,version,actor,at,before_value,after_value) VALUES(?,?,?,?,?,?)').bind(member,version,actor.id,at,JSON.stringify(before?view(before):null),JSON.stringify(result)),commandWrite(env.DB,actor.id,context.commandId,context.fingerprint,result)])
 return result
}
