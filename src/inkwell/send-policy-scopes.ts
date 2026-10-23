import { id, insist, now, text, type Env } from './model'
import { atomic, commandWrite, roleGuard, type Guard } from './storage'
import type { CommandContext } from './envelopes'

/** ADMIN-004 A4: these memberships only narrow sends; ADMIN-002/008 add their other group/profile capabilities. */
export interface SendPolicyScope { id: string; kind: 'group' | 'profile'; name: string; members: string[]; version: number; actor: string; at: string }
export const encodedScope = (scope: Pick<SendPolicyScope,'kind'|'id'>) => `${scope.kind}:${scope.id}`
export async function sendPolicyScopes(env: Env): Promise<SendPolicyScope[]> {
  return (await env.DB.prepare('SELECT data FROM iw_send_policy_scopes ORDER BY kind,name,id').all<{data:string}>()).results.map(row => JSON.parse(row.data))
}
export async function saveSendPolicyScope(env: Env, context: CommandContext, input: Record<string,unknown>) {
  const actor = context.actor
  insist(Boolean(actor.sessionId) && !actor.apiKeyId && !actor.agentId && ['owner','admin'].includes(actor.role), 'Only a signed-in owner or admin can manage member groups or profiles.', 403)
  insist(input.kind === 'group' || input.kind === 'profile', 'Choose a member group or permission profile.')
  const scopeId = input.id === undefined ? id() : text(input.id,'a group or profile ID',100)
  const row = await env.DB.prepare('SELECT data FROM iw_send_policy_scopes WHERE id=?').bind(scopeId).first<{data:string}>()
  const before = row ? JSON.parse(row.data) as SendPolicyScope : undefined
  insist(input.id === undefined || before, 'Group or profile not found.',404)
  insist(!before || before.kind === input.kind, 'A group or profile cannot change kind.',409)
  insist(input.expectedVersion === (before?.version ?? 0), 'This membership changed. Refresh and try again.',409)
  insist(Array.isArray(input.members) && input.members.length <= 1000 && input.members.every(member => typeof member === 'string'), 'Choose up to 1,000 current members.')
  const members = [...new Set(input.members as string[])].sort()
  const membershipGuards: Guard[] = [{sql:"NOT EXISTS(SELECT 1 FROM json_each(?) member WHERE NOT EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=member.value AND o.status='active'))",values:[JSON.stringify(members)]}]
  const membership=membershipGuards[0]
  insist(await env.DB.prepare(`SELECT 1 WHERE ${membership.sql}`).bind(...membership.values).first(),'Every selected member must be active.')
  // Removing a constraint can widen authority, so all membership saves use a fresh administrator sign-in.
  const fresh: Guard = {sql:'EXISTS(SELECT 1 FROM oa_sessions WHERE id=? AND created_at>=?)',values:[actor.sessionId,Date.now()-15*60_000]}
  insist(await env.DB.prepare(`SELECT 1 WHERE ${fresh.sql}`).bind(...fresh.values).first(),'Sign in again: group/profile membership changes need a sign-in from the last 15 minutes.',403)
  const after: SendPolicyScope = {id:scopeId,kind:input.kind,name:text(input.name,'a group or profile name',100),members,version:(before?.version??0)+1,actor:actor.id,at:now()}
  const result = {scope:after}
  await atomic(env.DB,[roleGuard(actor,['owner','admin']),fresh,...membershipGuards,{sql:'COALESCE((SELECT version FROM iw_send_policy_scopes WHERE id=?),0)=?',values:[scopeId,before?.version??0]}],[
    env.DB.prepare('INSERT INTO iw_send_policy_scopes(id,kind,name,version,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=excluded.version,data=excluded.data').bind(scopeId,after.kind,after.name,after.version,JSON.stringify(after)),
    env.DB.prepare('INSERT INTO iw_send_policy_scope_versions(id,version,actor,at,before_value,after_value) VALUES(?,?,?,?,?,?)').bind(scopeId,after.version,actor.id,after.at,before?JSON.stringify(before):null,JSON.stringify(after)),
    commandWrite(env.DB,actor.id,context.commandId,context.fingerprint,result),
  ])
  return result
}
/** Match the complete current membership set, including a scope assigned concurrently with a release. */
export async function principalScopes(env: Env, principal: string) {
  const list = (await sendPolicyScopes(env)).filter(scope => scope.members.includes(principal)).sort((a,b) => a.id.localeCompare(b.id))
  const fence: Guard = {sql:"COALESCE((SELECT group_concat(id||':'||version,',') FROM (SELECT id,version FROM iw_send_policy_scopes WHERE EXISTS(SELECT 1 FROM json_each(data,'$.members') WHERE value=?) ORDER BY id)),'')=?",values:[principal,list.map(scope=>`${scope.id}:${scope.version}`).join(',')]}
  return {list,fence}
}
