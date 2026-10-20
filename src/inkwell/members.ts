import { insist, now, text, type Env, type Envelope, type Actor } from './model'
import { atomic, commandWrite, memberRoleSql, roleGuard } from './storage'
import type { CommandContext } from './envelopes'

/** ACCESS-001 / ADMIN-001: Inkwell's roles over Base's accounts. Base's owner and admin keep their names; a Base member
 * is Inkwell's sender or viewer (viewer unless an owner or admin chose sender). Owners and admins act on and see every
 * envelope; a sender acts on and sees the envelopes they created and those shared with them (ADMIN-001); a viewer reads
 * every envelope and changes none. Signing one's own turn (MANAGE-003) is open to every role. */
export const memberRoles = ['sender', 'viewer'] as const
export type MemberRole = typeof memberRoles[number]

import { namedApprover } from './internal-approval'
export type Access = 'none' | 'view' | 'edit'
/** ADMIN-001: what `actor` may do with `envelope`. Owners and admins edit every envelope; a sender edits their own and
 * those shared with them to edit, and reads those shared to view; a viewer reads every envelope, and an edit share
 * never lets a viewer change one (the role caps the share; it applies if they become a sender). `share` is the actor's
 * share of this envelope, if any. */
export function accessFrom(actor: Actor, envelope: Envelope, share?: string | null): Access {
  if (actor.role === 'owner' || actor.role === 'admin' || (actor.role === 'sender' && envelope.createdBy === actor.id)) return 'edit'
  if (actor.role === 'viewer') return 'view'
  // ROUTE-004: a named internal approver reads the envelope from the request onward.
  return share === 'edit' ? 'edit' : share === 'view' || namedApprover(envelope, actor.id) ? 'view' : 'none'
}
export async function envelopeAccess(env: Env, actor: Actor, envelope: Envelope) {
  return accessFrom(actor, envelope, (await env.DB.prepare('SELECT access FROM iw_shares WHERE envelope_id=? AND operator_id=?').bind(envelope.id, actor.id).first<{ access: string }>())?.access)
}
export async function insistAccess(env: Env, actor: Actor, envelope: Envelope, needed: 'view' | 'edit') {
  const access = await envelopeAccess(env, actor, envelope)
  insist(access === 'edit' || (needed === 'view' && access === 'view'), needed === 'view' ? 'You can open only envelopes you sent or that were shared with you.' : 'You can change only envelopes you sent or that were shared with you to edit.', 403)
  return access
}
/** Who may share an envelope or take a share back: its sender, an owner or an admin; never someone it is shared with. */
export const mayShare = (actor: Actor, envelope: Envelope) => actor.role === 'owner' || actor.role === 'admin' || (actor.role === 'sender' && envelope.createdBy === actor.id)

/** Every active person in the workspace with their Inkwell role, for owners and admins. */
export async function listPeople(env: Env) {
  return (await env.DB.prepare(`SELECT o.id, o.display_name AS name, o.email, CASE WHEN o.role='member' THEN ${memberRoleSql('o.id')} ELSE o.role END AS role FROM oa_operators o WHERE o.status='active' ORDER BY o.created_at, o.id`).all<{ id: string; name: string; email: string; role: string }>()).results
}

export async function setMemberRole(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(context.actor.role === 'owner' || context.actor.role === 'admin', 'Only an owner or admin can change roles.', 403)
  const operatorId = text(input.operatorId, 'a person', 100), role = input.role as MemberRole
  insist(memberRoles.includes(role), 'Choose sender or viewer.')
  const target = await env.DB.prepare("SELECT role FROM oa_operators WHERE id=? AND status='active'").bind(operatorId).first<{ role: string }>()
  insist(target, 'That person is not active in this workspace.', 404)
  insist(target.role === 'member', 'Owners and admins already act on every envelope; change their role in Base.', 409)
  const result = { operatorId, role }
  await atomic(env.DB, [roleGuard(context.actor, ['owner', 'admin']), { sql: "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role='member')", values: [operatorId] }], [
    env.DB.prepare('INSERT INTO iw_member_roles(operator_id,role,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(operatorId, role, now(), context.actor.id),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}
