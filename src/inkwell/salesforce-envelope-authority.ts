import { insist, type Actor, type Envelope, type Env } from './model'
import { assertSalesforceCredential, salesforceCredential, salesforceCredentialGuard, type SalesforceCredential } from './salesforce-provider'
import { memberRoleSql, type Guard } from './storage'

type Binding = { id:string; credential_version:number; account_id:string; principal:string; member_version:number; member_role:Actor['role']; active:number }
export function salesforceBindingGuard(binding: Binding): Guard {
  return { sql: `EXISTS(SELECT 1 FROM iw_salesforce_send_bindings b JOIN iw_salesforce_credentials c ON c.id='salesforce' JOIN oa_operators o ON o.id=b.principal WHERE b.id=? AND b.active=1 AND b.principal=? AND b.member_version=? AND b.credential_version=? AND b.account_id=? AND c.active=1 AND c.version=b.credential_version AND c.account_id=b.account_id AND o.status='active' AND o.version=b.member_version AND CASE WHEN o.role='member' THEN ${memberRoleSql('o.id')} ELSE o.role END=b.member_role AND b.member_role IN ('owner','admin','sender'))`, values:[binding.id,binding.principal,binding.member_version,binding.credential_version,binding.account_id] }
}
/** Release observes the configured credential again; a restored environment cannot revive a retired launch. */
export async function salesforceSendCredential(env:Env, bindingId:string, principal:string) {
  const binding=await env.DB.prepare('SELECT * FROM iw_salesforce_send_bindings WHERE id=?').bind(bindingId).first<Binding>()
  let current:SalesforceCredential|undefined
  try { current=await salesforceCredential(env) } catch { /* The decision below holds the draft. */ }
  const guard=binding?salesforceBindingGuard(binding):{sql:'0=1',values:[]} as Guard
  const active=Boolean(binding&&binding.principal===principal&&current?.version===binding.credential_version&&current?.accountId===binding.account_id&&await env.DB.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())
  return {record:binding?{kind:'salesforce' as const,id:binding.id,version:binding.credential_version,memberVersion:binding.member_version}:null,active,guard}
}
export async function salesforcePreparationGuard(env:Env, credential:SalesforceCredential) {
  await assertSalesforceCredential(env,credential)
  return salesforceCredentialGuard(credential)
}
export function salesforceNativeAdministrator(actor:Actor) {
  insist(Boolean(actor.sessionId)&&!actor.apiKeyId&&!actor.agentId&&['owner','admin'].includes(actor.role),'Use a native owner or admin session for Salesforce preparation.',403)
}
