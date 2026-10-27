import { insist, Refusal, sha256, type Env } from './model'
import type { Guard } from './storage'
export type HubspotEnv = Env & { HUBSPOT_ACCESS_TOKEN?: string; HUBSPOT_ACCOUNT_ID?: string }
export interface HubspotCredential { id: string; version: number; accountId: string; token: string }
type CredentialRow = { version: number; account_id: string; token_hash: string; active: number }
/** An observed credential change permanently retires existing authorizations. Tokens never enter D1. */
export async function hubspotCredential(env: HubspotEnv): Promise<HubspotCredential> {
  const token = env.HUBSPOT_ACCESS_TOKEN, accountId = env.HUBSPOT_ACCOUNT_ID
  if (!token || !accountId || !/^\d{1,30}$/.test(accountId) || /[\x00-\x20\x7f]/.test(token)) {
    await env.DB.prepare("UPDATE iw_hubspot_credentials SET active=0 WHERE id='hubspot' AND active=1").run()
    throw new Refusal('Ask the owner to configure the HubSpot account and credential.', 503)
  }
  const hash = await sha256(token)
  await env.DB.prepare("INSERT INTO iw_hubspot_credentials(id,version,account_id,token_hash,active) VALUES('hubspot',1,?,?,1) ON CONFLICT(id) DO UPDATE SET version=iw_hubspot_credentials.version+1,account_id=excluded.account_id,token_hash=excluded.token_hash,active=1 WHERE iw_hubspot_credentials.token_hash<>excluded.token_hash OR iw_hubspot_credentials.account_id<>excluded.account_id OR iw_hubspot_credentials.active<>1").bind(accountId, hash).run()
  const row = await env.DB.prepare("SELECT version,account_id,token_hash,active FROM iw_hubspot_credentials WHERE id='hubspot'").first<CredentialRow>()
  insist(row?.active === 1 && row.token_hash === hash && row.account_id === accountId, 'The HubSpot credential changed. Refresh.', 409)
  return { id: 'hubspot', version: row.version, accountId, token }
}
export function hubspotCredentialGuard(credential: HubspotCredential): Guard {
  return { sql: 'EXISTS(SELECT 1 FROM iw_hubspot_credentials WHERE id=? AND version=? AND account_id=? AND active=1)', values: [credential.id, credential.version, credential.accountId] }
}
export async function assertHubspotCredential(env: HubspotEnv, credential: HubspotCredential) {
  const live = await hubspotCredential(env)
  insist(live.version === credential.version && live.accountId === credential.accountId, 'The HubSpot credential was retired. Authorize again.', 403)
}
/** Only official HubSpot HTTPS endpoints; redirect, transport and provider errors stay sanitized. */
export async function hubspotRequest(env: HubspotEnv, credential: HubspotCredential, path: string, init: RequestInit = { method: 'GET' }): Promise<Record<string, unknown>> {
  insist(/^\/[a-z0-9][^\x00-\x20\\#]*$/.test(path) && !path.startsWith('//'), 'Invalid HubSpot endpoint.')
  await assertHubspotCredential(env, credential)
  let response: Response
  try { response = await fetch('https://api.hubapi.com' + path, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${credential.token}` }, redirect: 'manual', signal: AbortSignal.timeout(30_000) }) }
  catch { throw new Refusal('HubSpot did not return a verifiable response. Resume this run manually.', 502) }
  if (response.status === 401 || response.status === 403) await env.DB.prepare("UPDATE iw_hubspot_credentials SET active=0 WHERE id=? AND version=?").bind(credential.id, credential.version).run()
  if (!response.ok) { await response.body?.cancel(); throw new Refusal('HubSpot refused the request. Check the connector and resume manually.', 502) }
  let value: unknown
  try { const body = await response.text(); insist(body.length <= 2_000_000, 'HubSpot response is too large.', 502); value = JSON.parse(body) } catch { throw new Refusal('HubSpot returned an invalid response.', 502) }
  insist(value && typeof value === 'object' && !Array.isArray(value), 'HubSpot returned an invalid response.', 502)
  await assertHubspotCredential(env, credential)
  return value as Record<string, unknown>
}
