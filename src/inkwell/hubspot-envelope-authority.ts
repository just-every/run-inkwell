import { insist, type Actor, type Envelope, type Env } from './model'
import { envelopeAccess } from './members'
import { assertHubspotCredential, hubspotCredential, hubspotCredentialGuard, type HubspotCredential } from './hubspot-provider'
import { memberRoleSql, type Guard } from './storage'

type Binding = { id:string; credential_version:number; account_id:string; principal:string; member_version:number; member_role:Actor['role']; active:number }
export function hubspotBindingGuard(binding: Binding): Guard {
  return { sql: `EXISTS(SELECT 1 FROM iw_hubspot_send_bindings b JOIN iw_hubspot_credentials c ON c.id='hubspot' JOIN oa_operators o ON o.id=b.principal WHERE b.id=? AND b.active=1 AND b.principal=? AND b.member_version=? AND b.credential_version=? AND b.account_id=? AND c.active=1 AND c.version=b.credential_version AND c.account_id=b.account_id AND o.status='active' AND o.version=b.member_version AND CASE WHEN o.role='member' THEN ${memberRoleSql('o.id')} ELSE o.role END=b.member_role AND b.member_role IN ('owner','admin','sender'))`, values:[binding.id,binding.principal,binding.member_version,binding.credential_version,binding.account_id] }
}
/** Release observes the configured credential again; a restored environment cannot revive a retired launch. */
export async function hubspotSendCredential(env:Env, bindingId:string, principal:string) {
  const binding=await env.DB.prepare('SELECT * FROM iw_hubspot_send_bindings WHERE id=?').bind(bindingId).first<Binding>()
  let current:HubspotCredential|undefined
  try { current=await hubspotCredential(env) } catch { /* The decision below holds the draft. */ }
  const guard=binding?hubspotBindingGuard(binding):{sql:'0=1',values:[]} as Guard
  const active=Boolean(binding&&binding.principal===principal&&current?.version===binding.credential_version&&current?.accountId===binding.account_id&&await env.DB.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())
  return {record:binding?{kind:'hubspot' as const,id:binding.id,version:binding.credential_version,memberVersion:binding.member_version}:null,active,guard}
}
export async function hubspotPreparationGuard(env:Env, credential:HubspotCredential) {
  await assertHubspotCredential(env,credential)
  return hubspotCredentialGuard(credential)
}
export async function hubspotEscalationOwner(env:Env,e:Envelope):Promise<string|undefined> {
  const native=e.events.find(event=>['hubspot.record_prepared','salesforce.record_prepared'].includes(event.action))
  const candidate=native?.detail.escalationOwner
  if(typeof candidate!=='string')return undefined
  const actor=await env.DB.prepare(`SELECT id,version,email,display_name AS name,CASE WHEN role='member' THEN ${memberRoleSql('oa_operators.id')} ELSE role END AS role FROM oa_operators WHERE id=? AND status='active'`).bind(candidate).first<Actor>()
  if(!actor||!['owner','admin','sender'].includes(actor.role))return undefined
  // New drafts have not been inserted yet. A sender's existing creator relation is sufficient; no share is created.
  if(actor.role==='sender'&&actor.id!==e.createdBy&&await envelopeAccess(env,actor,e)!=='edit')return undefined
  return actor.id
}
export function hubspotNativeAdministrator(actor:Actor) {
  insist(Boolean(actor.sessionId)&&!actor.apiKeyId&&!actor.agentId&&['owner','admin'].includes(actor.role),'Use a native owner or admin session for HubSpot preparation.',403)
}
