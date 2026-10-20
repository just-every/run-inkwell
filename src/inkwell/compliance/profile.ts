import { insist, now, type Actor, type Env } from '../model'
import { atomic, commandWrite, memberRoleSql, roleGuard } from '../storage'
import type { CommandContext } from '../envelopes'

/** COMPLY-002: an installation profile, never a certification or provider attestation. */
export async function healthcareProfile(env: Env) {
  const row = await env.DB.prepare("SELECT value FROM iw_settings WHERE key='healthcare'").first<{ value: string }>()
  return row?.value === 'true'
}
export async function setHealthcareProfile(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(['owner', 'admin'].includes(context.actor.role), 'Only an owner or admin can change account settings.', 403)
  insist(typeof input.enabled === 'boolean', 'Choose whether to enable the healthcare profile.')
  const result = { enabled: input.enabled }
  await atomic(env.DB, [roleGuard(context.actor, ['owner', 'admin'])], [
    env.DB.prepare("INSERT INTO iw_settings(key,value,updated_at,updated_by) VALUES('healthcare',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(String(input.enabled), now(), context.actor.id),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result),
  ])
  return result
}
export async function accessReview(env: Env, actor: Actor) {
  insist(['owner', 'admin'].includes(actor.role), 'Only an owner or admin can review member access.', 403)
  const members = (await env.DB.prepare(`SELECT o.id, o.email, o.display_name AS name, o.status,
    CASE WHEN o.role='member' THEN ${memberRoleSql('o.id')} ELSE o.role END AS role,
    a.last_access_at AS lastAccessAt FROM oa_operators o LEFT JOIN iw_member_access a ON a.operator_id=o.id ORDER BY o.email`).all()).results
  return { generatedAt: now(), enabled: await healthcareProfile(env), members }
}
