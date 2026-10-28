import { canonical, insist, now, object, text, type Actor } from './model'
import { roleGuard, type Guard } from './storage'
import type { SalesforceEnv } from './salesforce-provider'
export const salesforceDisclosure = 'Import the selected Salesforce contacts into this account’s shared contact book. Owners, admins and senders can read these contacts. This authorization grants no envelope access, signing consent, sending authority or follow-up authority.'
export interface SyncDefinition {
  accountId: string
  scope: { kind: 'all' | 'selected'; recordIds?: string[] }
  properties: string[]
  mappings: { name: string; email: string; phone?: string; company?: string }
  destination: 'shared_contacts'
  updateBehavior: 'preserve_local_edits'
  cadence: 'once' | 'hourly' | 'daily'
}
export interface SyncAuthorization { id: string; version: number; authorizer: string; member_version: number; credential_version: number; account_id: string; definition: string; authorized_at: string; state: string; next_run_at: number | null; stop_reason: string | null }
export interface SyncRun { id: string; authorization_id: string; version: number; request_id: string; status: string; cursor: string | null; pages: number; records: number; applied: number; conflicts: number; failures: number; error: string | null; lease: string | null; lease_at: number | null; created_at: string; updated_at: string }
const propertyNames = ['FirstName', 'LastName', 'Email', 'Phone', 'Account.Name']
export function syncDefinition(value: unknown): SyncDefinition {
  const input = object(value), scope = object(input.scope), mappings = object(input.mappings)
  insist(scope.kind === 'all' || scope.kind === 'selected', 'Choose all contacts or selected record IDs.')
  let recordIds: string[] | undefined
  if (scope.kind === 'selected') {
    insist(Array.isArray(scope.recordIds) && scope.recordIds.length > 0 && scope.recordIds.length <= 10_000, 'Select 1–10,000 contact IDs.')
    recordIds = [...new Set(scope.recordIds.map(value => { const id = text(value, 'a Salesforce contact ID', 100); insist(/^[a-zA-Z0-9_-]+$/.test(id), 'Invalid Salesforce contact ID.'); return id }))].sort()
  } else insist(scope.recordIds === undefined, 'All-contact scope cannot also contain selected IDs.')
  insist(Array.isArray(input.properties) && input.properties.length > 0 && input.properties.every(value => typeof value === 'string' && propertyNames.includes(value)), 'Choose supported contact properties.')
  const properties = [...new Set(input.properties as string[])].sort()
  insist(mappings.name === 'full_name' && mappings.email === 'Email', 'Map full_name to name and email to email.')
  insist(properties.includes('FirstName') && properties.includes('LastName') && properties.includes('Email'), 'Import firstname, lastname and email for contact names and email.')
  const optional: { phone?: string; company?: string } = {}
  for (const field of ['phone', 'company'] as const) if (mappings[field] !== undefined) { insist(mappings[field] === (field === 'phone' ? 'Phone' : 'Account.Name') && properties.includes(String(mappings[field])), `Import and map ${field}.`); optional[field] = String(mappings[field]) }
  insist(input.destination === 'shared_contacts' && input.updateBehavior === 'preserve_local_edits', 'Use the shared contact book and preserve local edits.')
  insist(['once', 'hourly', 'daily'].includes(String(input.cadence)), 'Choose once, hourly or daily.')
  return { accountId: text(input.accountId, 'the configured Salesforce account', 30), scope: { kind: scope.kind, ...(recordIds ? { recordIds } : {}) }, properties, mappings: { name: 'full_name', email: 'Email', ...optional }, destination: 'shared_contacts', updateBehavior: 'preserve_local_edits', cadence: input.cadence as SyncDefinition['cadence'] }
}
export async function syncAdmin(env: SalesforceEnv, actor: Actor) {
  insist(!actor.agentId && !actor.apiKeyId && !!actor.sessionId, 'Use an owner or admin native session to manage Salesforce.', 403)
  const guard = roleGuard(actor, ['owner', 'admin'])
  insist(await env.DB.prepare('SELECT 1 AS ok WHERE ' + guard.sql).bind(...guard.values).first(), 'Only a current owner or admin can manage Salesforce.', 403)
}
export function syncAuthorizationGuard(auth: SyncAuthorization): Guard {
  return { sql: "EXISTS(SELECT 1 FROM iw_salesforce_authorizations a JOIN oa_operators o ON o.id=a.authorizer JOIN iw_salesforce_credentials c ON c.id='salesforce' WHERE a.id=? AND a.version=? AND a.state='active' AND o.version=a.member_version AND o.status='active' AND o.role IN('owner','admin') AND c.active=1 AND c.version=a.credential_version AND c.account_id=a.account_id)", values: [auth.id, auth.version] }
}
export async function activeSyncAuthorization(env: SalesforceEnv, authorizationId: string) {
  const auth = await env.DB.prepare('SELECT * FROM iw_salesforce_authorizations WHERE id=?').bind(authorizationId).first<SyncAuthorization>()
  insist(auth, 'Salesforce authorization not found.', 404)
  const guard = syncAuthorizationGuard(auth)
  const active = await env.DB.prepare('SELECT 1 AS ok WHERE ' + guard.sql).bind(...guard.values).first()
  if (!active && auth.state === 'active') await env.DB.prepare("UPDATE iw_salesforce_authorizations SET state='revoked',stop_reason='Current authorization, member or credential is unavailable' WHERE id=? AND state='active'").bind(auth.id).run()
  insist(active, 'This Salesforce authorization has stopped. Authorize a new version.', 403)
  return auth
}
export function syncAudit(env: SalesforceEnv, actor: string, action: string, auth: SyncAuthorization, outcome: string, runId: string | null = null): D1PreparedStatement[] {
  const at = now(), scope = canonical(JSON.parse(auth.definition)), details = JSON.stringify({ authorizationId: auth.id, version: auth.version, scope: JSON.parse(scope), runId, outcome })
  return [env.DB.prepare('INSERT INTO iw_salesforce_sync_audit(id,actor,action,authorization_id,version,scope,run_id,outcome,at) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?,?)').bind(actor, action, auth.id, auth.version, scope, runId, outcome, at), env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(lower(hex(randomblob(16))),?,?,?,?,NULL,?)').bind(at, actor, action, 'salesforce:' + auth.id, details)]
}
export const cadenceMilliseconds = (definition: SyncDefinition) => definition.cadence === 'hourly' ? 3_600_000 : definition.cadence === 'daily' ? 86_400_000 : null
