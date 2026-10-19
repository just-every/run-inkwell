import { appendEvent, insist, text, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { mayShare } from './members'
import type { CommandContext } from './envelopes'

/** ADMIN-001: the envelope's sender, an owner or an admin shares one envelope with an active member, found by email, to
 * view or to edit; sharing again changes the access, and removing it takes it back. People it is shared with cannot
 * share it on. Every grant and removal is an audited event. Folder shares (MANAGE-002) and group shares (ADMIN-002)
 * join this before they ship. */
export async function shareEnvelope(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  insist(mayShare(context.actor, before), 'Only the envelope’s sender, an owner or an admin can share it.', 403)
  const email = text(input.email, 'a member email', 254).toLowerCase(), access = input.access
  insist(access === 'view' || access === 'edit', 'Share to view or to edit.')
  const target = await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=? AND status='active'").bind(email).first<{ id: string }>()
  insist(target, 'No active member of this workspace uses that email.', 404)
  insist(target.id !== before.createdBy, 'That member sent this envelope.', 409)
  const after = structuredClone(before), at = new Date().toISOString(), result = { id: after.id, operatorId: target.id, access }
  await appendEvent(after, 'envelope.shared', context.actor.id, { operator: target.id, email, access })
  await commitEnvelope(env.DB, before, after, context.actor, [
    env.DB.prepare('INSERT INTO iw_shares(envelope_id,operator_id,access,granted_by,granted_at) VALUES(?,?,?,?,?) ON CONFLICT(envelope_id,operator_id) DO UPDATE SET access=excluded.access,granted_by=excluded.granted_by,granted_at=excluded.granted_at').bind(after.id, target.id, access, context.actor.id, at),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}
export async function unshareEnvelope(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID')), operatorId = text(input.operatorId, 'a member', 100)
  insist(mayShare(context.actor, before), 'Only the envelope’s sender, an owner or an admin can change who it is shared with.', 403)
  insist(await env.DB.prepare('SELECT 1 FROM iw_shares WHERE envelope_id=? AND operator_id=?').bind(before.id, operatorId).first(), 'This envelope is not shared with that member.', 404)
  const after = structuredClone(before), result = { id: after.id, operatorId }
  await appendEvent(after, 'envelope.unshared', context.actor.id, { operator: operatorId })
  await commitEnvelope(env.DB, before, after, context.actor, [env.DB.prepare('DELETE FROM iw_shares WHERE envelope_id=? AND operator_id=?').bind(after.id, operatorId), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}
/** Who an envelope is shared with, for the people who may change that. */
export async function listShares(env: Env, envelopeId: string) {
  return (await env.DB.prepare('SELECT s.operator_id AS operatorId, o.display_name AS name, o.email, s.access FROM iw_shares s JOIN oa_operators o ON o.id=s.operator_id WHERE s.envelope_id=? ORDER BY s.granted_at').bind(envelopeId).all<{ operatorId: string; name: string; email: string; access: 'view' | 'edit' }>()).results
}
