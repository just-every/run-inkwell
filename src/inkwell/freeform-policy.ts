import { insist, now, type Envelope, type Env } from './model'
import { atomic, commandWrite, roleGuard, type Guard } from './storage'
import type { CommandContext } from './envelopes'

export interface FreeFormPolicy { enabled: boolean; version: number; actor: string | null; at: string | null }
export interface FreeFormFlip { actor: string; at: string; before: boolean; after: boolean; version: number }
/** PREP-011 / ADMIN-004: this singleton is off until an owner or admin explicitly changes it. */
export async function freeFormPolicy(env: Env): Promise<FreeFormPolicy> {
  const row = await env.DB.prepare('SELECT enabled,version,actor,at FROM iw_freeform_policy WHERE id=1').first<{ enabled: number; version: number; actor: string | null; at: string | null }>()
  insist(row, 'The free-form policy has not been installed.', 503)
  return { ...row, enabled: Boolean(row.enabled) }
}
export async function freeFormHistory(env: Env): Promise<FreeFormFlip[]> {
  const rows = (await env.DB.prepare('SELECT actor,at,before_value AS before,after_value AS after,version FROM iw_freeform_history ORDER BY version').all<{ actor: string; at: string; before: number; after: number; version: number }>()).results
  return rows.map(row => ({ ...row, before: Boolean(row.before), after: Boolean(row.after) }))
}
/** Human account authority and the expected policy version are checked inside the same write as its audit record. */
export async function setFreeFormPolicy(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist((context.actor.role === 'owner' || context.actor.role === 'admin') && Boolean(context.actor.sessionId) && !context.actor.agentId, 'Only a signed-in owner or admin can change free-form signing.', 403)
  insist(typeof input.enabled === 'boolean', 'Choose whether free-form signing is allowed.')
  insist(Number.isSafeInteger(input.expectedVersion) && (input.expectedVersion as number) >= 0, 'Give the current free-form setting version.')
  const before = await freeFormPolicy(env)
  insist(input.expectedVersion === before.version, 'The free-form setting changed. Refresh and try again.', 409)
  const changed = before.enabled !== input.enabled, policy: FreeFormPolicy = changed ? { enabled: input.enabled, version: before.version + 1, actor: context.actor.id, at: now() } : before
  const result = { policy }
  await atomic(env.DB, [roleGuard(context.actor, ['owner', 'admin']), policyVersionGuard(before)], [
    ...(changed ? [env.DB.prepare('INSERT INTO iw_freeform_history(version,actor,at,before_value,after_value) VALUES(?,?,?,?,?)').bind(policy.version, policy.actor, policy.at, Number(before.enabled), Number(policy.enabled)), env.DB.prepare('UPDATE iw_freeform_policy SET enabled=?,version=?,actor=?,at=? WHERE id=1').bind(Number(policy.enabled), policy.version, policy.actor, policy.at)] : []),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result),
  ])
  return result
}
function policyVersionGuard(policy: FreeFormPolicy): Guard {
  return { sql: 'EXISTS(SELECT 1 FROM iw_freeform_policy WHERE id=1 AND enabled=? AND version=?)', values: [Number(policy.enabled), policy.version] }
}
/** A send may release only under this exact live, enabled version, in its invitation transaction. */
export function freeFormSendGuard(policy: FreeFormPolicy): Guard {
  const guard = policyVersionGuard(policy)
  return { sql: `${guard.sql} AND ?=1`, values: [...guard.values, Number(policy.enabled)] }
}
export function snapshotFreeFormPolicy(envelope: Envelope, policy: FreeFormPolicy) {
  insist(policy.enabled && policy.actor && policy.at, 'Free-form signing is disabled. Ask an owner or admin to enable it before sending.', 409)
  envelope.freeFormSetting = { version: policy.version, actor: policy.actor, at: policy.at }
}
