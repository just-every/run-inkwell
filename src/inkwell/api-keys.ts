import { canonical, id, insist, now, secret, sha256, text, type Actor, type Env, type Role } from './model'
import { atomic, commandWrite, memberRoleSql, previousCommand, roleGuard, type Guard } from './storage'
import type { CommandContext } from './envelopes'

/** API-001 scope-review-65: preparation agents, API keys and OAuth grants are separate credentials.
 * Live keys cover read, artifact, template, prepare, send and manage doors. OAuth and test mode remain unshipped. */
export const apiScopes = ['envelopes:read', 'artifacts:read', 'templates:read', 'envelopes:prepare', 'envelopes:send', 'envelopes:manage'] as const
export type ApiScope = typeof apiScopes[number]
const day = 86_400_000
interface KeyRow {
  id: string; name: string; member_id: string; member_version: number; member_role: Role
  prefix: string; last_four: string; scopes: string; created_at: string; created_by: string
  expires_at: string; revoked_at: string | null; suspended_at: string | null; rotated_to: string | null; version: number
}
const columns = 'id,name,member_id,member_version,member_role,prefix,last_four,scopes,created_at,created_by,expires_at,revoked_at,suspended_at,rotated_to,version'
const metadata = (r: KeyRow) => ({ id: r.id, name: r.name, memberId: r.member_id, memberVersion: r.member_version,
  memberRole: r.member_role, prefix: r.prefix, lastFour: r.last_four, scopes: JSON.parse(r.scopes) as ApiScope[],
  createdAt: r.created_at, createdBy: r.created_by, expiresAt: r.expires_at, revokedAt: r.revoked_at,
  suspendedAt: r.suspended_at, rotatedTo: r.rotated_to, version: r.version })
const effectiveRole = `CASE WHEN o.role='member' THEN ${memberRoleSql('o.id')} ELSE o.role END`
const memberGuard = (member: { id: string; version: number; role: Role }): Guard => ({
  sql: `EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=? AND o.version=? AND o.status='active' AND ${effectiveRole}=?)`,
  values: [member.id, member.version, member.role],
})
function scopesOf(value: unknown): ApiScope[] {
  insist(Array.isArray(value) && value.length > 0 && value.every(s => apiScopes.includes(s as ApiScope)), `Choose one or more shipped scopes: ${apiScopes.join(', ')}.`)
  return [...new Set(value as ApiScope[])].sort()
}
function management(actor: Actor) {
  insist(Boolean(actor.sessionId) && !actor.agentId && !actor.apiKeyId && ['owner', 'admin'].includes(actor.role), 'Only a signed-in owner or admin can manage API keys.', 403)
}
async function freshGuards(env: Env, actor: Actor): Promise<Guard[]> {
  const cutoff = Date.now() - 15 * 60_000
  const guard: Guard = { sql: 'EXISTS(SELECT 1 FROM oa_sessions WHERE id=? AND created_at>=?)', values: [actor.sessionId, cutoff] }
  insist(await env.DB.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first(), 'Sign in again: minting, changing scopes or rotating an API key needs a sign-in from the last 15 minutes.', 403)
  return [guard]
}
async function getKey(env: Env, keyId: string) {
  const row = await env.DB.prepare(`SELECT ${columns} FROM iw_api_keys WHERE id=?`).bind(keyId).first<KeyRow>()
  insist(row, 'API key not found.', 404); return row
}
const live = (r: KeyRow) => !r.revoked_at && !r.suspended_at && r.expires_at > now()
const unchangedKey = (r: KeyRow): Guard => ({ sql: 'EXISTS(SELECT 1 FROM iw_api_keys WHERE id=? AND version=? AND revoked_at IS NULL AND suspended_at IS NULL AND expires_at>?)', values: [r.id, r.version, now()] })
async function newKey(env: Env, actor: Actor, member: { id: string; version: number; role: Role }, name: string, scopes: ApiScope[], expiresAt: string) {
  const keyId = id(), prefix = `iwk_live_${keyId}_`, token = prefix + secret()
  const row: KeyRow = { id: keyId, name, member_id: member.id, member_version: member.version, member_role: member.role,
    prefix, last_four: token.slice(-4), scopes: JSON.stringify(scopes), created_at: now(), created_by: actor.id,
    expires_at: expiresAt, revoked_at: null, suspended_at: null, rotated_to: null, version: 1 }
  const write = env.DB.prepare(`INSERT INTO iw_api_keys(${columns},token_hash) VALUES(${Array(16).fill('?').join(',')})`)
    .bind(row.id, row.name, row.member_id, row.member_version, row.member_role, row.prefix, row.last_four, row.scopes,
      row.created_at, row.created_by, row.expires_at, null, null, null, row.version, await sha256(token))
  return { row, token, write }
}
export async function listApiKeys(env: Env, actor: Actor) {
 management(actor)
 const warnings=(await env.DB.prepare('SELECT key_id,expires_at,days,state,claimed_at,finished_at FROM iw_api_key_warnings ORDER BY claimed_at,id').all<{key_id:string;expires_at:string;days:number;state:string;claimed_at:string;finished_at:string|null}>()).results
 return {keys:(await env.DB.prepare(`SELECT ${columns} FROM iw_api_keys ORDER BY created_at,id`).all<KeyRow>()).results.map(row=>({...metadata(row),expiryWarnings:warnings.filter(w=>w.key_id===row.id&&w.expires_at===row.expires_at).map(({days,state,claimed_at,finished_at})=>({days,state,claimedAt:claimed_at,finishedAt:finished_at}))}))}
}
/** Command receipts deliberately never contain a bearer token. Retrying mint/rotate returns tokenShown, not the secret. */
export async function changeApiKey(env: Env, context: CommandContext, action: 'mint' | 'rotate' | 'scopes' | 'revoke', input: Record<string, unknown>) {
  const { actor } = context; management(actor)
  const fresh = action === 'revoke' ? [] : await freshGuards(env, actor)
  const previous = await previousCommand(env.DB, actor.id, context.commandId, context.fingerprint)
  if (previous) return previous
  const guards = [roleGuard(actor, ['owner', 'admin']), ...fresh]
  if (action === 'mint') {
    insist(input.mode === undefined || input.mode === 'live', 'Test-mode keys arrive with API-004; mint a live key.', 409)
    const memberId = text(input.memberId, 'an active member ID', 100), name = text(input.name, 'a key name', 100)
    const member = await env.DB.prepare(`SELECT o.id,o.version,${effectiveRole} AS role FROM oa_operators o WHERE o.id=? AND o.status='active'`).bind(memberId).first<{ id: string; version: number; role: Role }>()
    insist(member && ['owner', 'admin', 'sender'].includes(member.role), 'Bind the key to an active owner, admin or sender.', 403)
    const days = input.expiresInDays ?? 365
    insist(Number.isInteger(days) && (days as number) >= 1 && (days as number) <= 730, 'Expire a key in 1–730 whole days (365 by default).')
    const created = await newKey(env, actor, member, name, scopesOf(input.scopes), new Date(Date.now() + (days as number) * day).toISOString())
    const result = { key: metadata(created.row), tokenShown: true }
    await atomic(env.DB, [...guards, memberGuard(member)], [created.write, commandWrite(env.DB, actor.id, context.commandId, context.fingerprint, result)])
    return { ...result, token: created.token }
  }
  const row = await getKey(env, text(input.id, 'a key ID', 100))
  const result = { key: metadata(row) }
  if (action === 'revoke') {
    const revokedAt = row.revoked_at ?? now(); result.key.revokedAt = revokedAt
    await atomic(env.DB, guards, [env.DB.prepare('UPDATE iw_api_keys SET revoked_at=COALESCE(revoked_at,?),version=version+1 WHERE id=?').bind(revokedAt, row.id), commandWrite(env.DB, actor.id, context.commandId, context.fingerprint, { revoked: row.id })])
    return { revoked: row.id }
  }
  insist(live(row), 'This API key is expired, revoked or permanently suspended.', 403)
  const member = { id: row.member_id, version: row.member_version, role: row.member_role }
  guards.push(unchangedKey(row), memberGuard(member))
  if (action === 'scopes') {
    insist(!row.rotated_to, 'Change the successor key’s scopes instead of its retiring predecessor.', 409)
    const scopes = scopesOf(input.scopes); result.key.scopes = scopes; result.key.version++
    await atomic(env.DB, guards, [env.DB.prepare('UPDATE iw_api_keys SET scopes=?,version=version+1 WHERE id=?').bind(JSON.stringify(scopes), row.id), commandWrite(env.DB, actor.id, context.commandId, context.fingerprint, result)])
    return result
  }
  insist(!row.rotated_to, 'This key already has a successor.', 409)
  const days = input.overlapDays ?? 7
  insist(Number.isInteger(days) && (days as number) >= 0 && (days as number) <= 7, 'Allow 0–7 whole days of overlap (7 by default).')
  // Rotation preserves the binding, scopes and final expiry; it cannot extend the original grant.
  const created = await newKey(env, actor, member, row.name, JSON.parse(row.scopes), row.expires_at)
  const retiresAt = new Date(Math.min(Date.parse(row.expires_at), Date.now() + (days as number) * day)).toISOString()
  const rotated = { key: metadata(created.row), predecessor: row.id, retiresAt, tokenShown: true }
  await atomic(env.DB, guards, [created.write, env.DB.prepare('UPDATE iw_api_keys SET expires_at=?,rotated_to=?,version=version+1 WHERE id=?').bind(retiresAt, created.row.id, row.id), commandWrite(env.DB, actor.id, context.commandId, context.fingerprint, rotated)])
  return { ...rotated, token: created.token }
}
/** No cookie fallback, query-string credential, or preparation token is accepted at this door. */
export async function authenticateApiKey(request: Request, env: Env, scope?: ApiScope): Promise<Actor> {
  const header = request.headers.get('authorization') ?? ''
  insist(!/^Bearer [a-f0-9]{64}$/.test(header), 'Preparation tokens cannot use API-key routes.', 403)
  const match = /^Bearer (iwk_live_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_[a-f0-9]{64})$/.exec(header)
  insist(match, 'Provide a live API key in the Bearer header.', 401)
  const row = await env.DB.prepare(`SELECT k.id AS key_id,k.scopes,o.id,o.display_name,o.email,o.version,${effectiveRole} AS role
    FROM iw_api_keys k JOIN oa_operators o ON o.id=k.member_id AND o.version=k.member_version
    WHERE k.token_hash=? AND k.revoked_at IS NULL AND k.suspended_at IS NULL AND k.expires_at>max(?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    AND o.status='active' AND ${effectiveRole}=k.member_role AND k.member_role IN ('owner','admin','sender')`)
    .bind(await sha256(match[1]), now()).first<{ key_id: string; scopes: string; id: string; display_name: string; email: string; version: number; role: Role }>()
  insist(row, 'This API key is invalid, expired, revoked or suspended.', 401)
  insist(scope === undefined || JSON.parse(row.scopes).includes(scope), `This API key needs the ${scope} scope.`, 403)
  return { id: row.id, name: row.display_name, email: row.email, role: row.role, version: row.version, apiKeyId: row.key_id, apiKeyScope: scope }
}
export { apiCommandActor } from './api-command'
export async function apiKeyContext(request: Request, actor: Actor, body: Record<string, unknown>): Promise<CommandContext> {
  const commandId = text(body.commandId, 'a command ID', 100)
  return { actor, commandId, fingerprint: await sha256(canonical({ path: new URL(request.url).pathname, body })) }
}
