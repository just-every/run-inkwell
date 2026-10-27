import { id, insist, now, secret, sha256, text, type Actor, type Env } from './model'
import { atomic, roleGuard, commandWrite } from './storage'
import type { CommandContext } from './envelopes'
export async function issueAgent(env: Env, context: CommandContext) { insist(context.actor.role==='owner','Only the owner can issue agent tokens.',403);const token=secret(),agentId=id(),createdAt=now();await atomic(env.DB,[roleGuard(context.actor,['owner'])],[env.DB.prepare('INSERT INTO iw_agents(id,owner_id,owner_version,token_hash,created_at) VALUES(?,?,?,?,?)').bind(agentId,context.actor.id,context.actor.version,await sha256(token),createdAt),commandWrite(env.DB,context.actor.id,context.commandId,context.fingerprint,{id:agentId,tokenShown:true})]);return{id:agentId,token} }
export async function revokeAgent(env: Env, context: CommandContext, input:Record<string,unknown>) { insist(context.actor.role==='owner','Only the owner can revoke agent tokens.',403);const agentId=text(input.id,'an agent ID'),result={id:agentId,revoked:true};await atomic(env.DB,[roleGuard(context.actor,['owner']),{sql:'EXISTS(SELECT 1 FROM iw_agents WHERE id=?)',values:[agentId]}],[env.DB.prepare('UPDATE iw_agents SET revoked_at=? WHERE id=?').bind(now(),agentId),commandWrite(env.DB,context.actor.id,context.commandId,context.fingerprint,result)]);return result }
export async function authenticateAgent(request: Request, env: Env):Promise<Actor> { const match=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')??'');insist(match,'Provide a valid preparation agent bearer token.',401);const row=await env.DB.prepare("SELECT a.id AS agent_id,o.id,o.display_name,o.email,o.role,o.version FROM iw_agents a JOIN oa_operators o ON o.id=a.owner_id AND o.version=a.owner_version WHERE a.token_hash=? AND a.revoked_at IS NULL AND o.role='owner' AND o.status='active'").bind(await sha256(match[1])).first<{agent_id:string;id:string;display_name:string;email:string;role:'owner';version:number}>();insist(row,'This agent token is invalid or revoked.',401);return{id:row.id,name:row.display_name,email:row.email,role:row.role,version:row.version,agentId:row.agent_id} }
export async function listAgents(env: Env) { return(await env.DB.prepare('SELECT id,created_at AS createdAt,revoked_at AS revokedAt FROM iw_agents ORDER BY created_at DESC').all()).results }

/** A CRM owner can default escalation only when already active and able to read this envelope. */
export async function eligibleCrmOwner(env:Env,envelope:import('./model').Envelope,email:string) {
 const {listPeople,envelopeAccess}=await import('./members')
 const person=(await listPeople(env)).find(p=>p.email.toLowerCase()===email.toLowerCase())
 if(!person)return undefined
 const row=await env.DB.prepare('SELECT version FROM oa_operators WHERE id=?').bind(person.id).first<{version:number}>()
 if(!row)return undefined
 const actor={...person,version:row.version,role:person.role as Actor['role']}
 return envelope.createdBy===actor.id||['owner','admin'].includes(actor.role)||await envelopeAccess(env,actor,envelope)!=='none'?actor.id:undefined
}
export async function crmEscalationOwner(env:Env,envelope:import('./model').Envelope) {
 const row=await env.DB.prepare('SELECT escalation_owner FROM iw_hubspot_drafts WHERE envelope_id=?').bind(envelope.id).first<{escalation_owner:string|null}>()
 if(!row?.escalation_owner)return undefined
 const person=await env.DB.prepare("SELECT email FROM oa_operators WHERE id=? AND status='active'").bind(row.escalation_owner).first<{email:string}>()
 return person?eligibleCrmOwner(env,envelope,person.email):undefined
}
