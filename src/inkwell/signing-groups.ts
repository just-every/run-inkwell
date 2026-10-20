import { id, insist, memberRow, now, object, secret, sha256, text, type Envelope, type Env, type SignerGroup } from './model'
import { atomic, commandWrite, roleGuard } from './storage'
import { invitationWrite } from './mail'
import { sealLink } from './links'
import { validatePdfText } from './pdf'
import type { CommandContext } from './envelopes'

/** ROUTE-005: signing groups. Owners and admins keep named groups (a unique name ignoring case, 2-10 members, each a name
 * and a distinct email, workspace members or not), stored as account settings. A recipient place may name a group
 * instead of a person: the draft snapshots the group's name and members each time it is saved, so a later change to the
 * group never changes a prepared or sent envelope (a copy keeps its source's snapshot until its draft is saved again).
 * The group takes one routing place. At its turn every member gets their own link and verifies as the place's method
 * requires (emailed code, or link only, IDV-001); access codes, in-person signing and reassignment are refused for groups
 * in v1, and so is a group while mail is not set up (each member's link and code go by email). The first member to sign
 * (electronically, or with an accepted paper scan) completes the place; the others' links then show who signed for the
 * group and when, and can no longer act. A member's decline or withdrawal declines the envelope, naming that member.
 * Reminders and resends go to every member while the place is open; the completed copy goes to the member who signed.
 * The certificate names the group, the member who signed with their authentication evidence, and every member invited.
 * ROUTE-003 include rules apply to a group place as to a person. TMPL-001: a template role may be filled by a group when
 * sending. MOVE-002 imports Docusign signing groups as these groups. */
export interface SigningGroupRecord { id: string; name: string; members: { name: string; email: string }[]; updatedAt: string; updatedBy: string }
const key = 'signing_groups', maxMembers = 10

export async function listGroups(env: Env): Promise<SigningGroupRecord[]> {
  const row = await env.DB.prepare('SELECT value FROM iw_settings WHERE key=?').bind(key).first<{ value: string }>()
  return row ? JSON.parse(row.value) : []
}

/** `account.signing_group`: create or replace a group (`id` absent creates one), or remove it (`remove: true`). */
export async function saveGroup(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(context.actor.role === 'owner' || context.actor.role === 'admin', 'Only an owner or admin can change signing groups.', 403)
  const before = await listGroups(env), raw = JSON.stringify(before), existing = input.id === undefined ? undefined : text(input.id, 'a group ID', 100)
  insist(existing === undefined || before.some(g => g.id === existing), 'Signing group not found.', 404)
  let groups: SigningGroupRecord[]
  if (input.remove === true) groups = before.filter(g => g.id !== existing)
  else {
    const name = text(input.name, 'the group name', 100)
    insist(!/[\r\n\t]/.test(name), 'Use one line for the group name.')
    insist(!before.some(g => g.id !== existing && g.name.toLowerCase() === name.toLowerCase()), 'Another signing group already has that name.', 409)
    insist(Array.isArray(input.members) && input.members.length >= 2 && input.members.length <= maxMembers, `Add 2-${maxMembers} members to a signing group.`)
    const members = input.members.map(value => {
      const m = object(value), email = text(m.email, 'the member email', 254).toLowerCase()
      insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Provide a valid member email.')
      return { name: text(m.name, 'the member name', 100), email }
    })
    insist(new Set(members.map(m => m.email)).size === members.length, 'Each member of a signing group must use a different email.')
    await validatePdfText([name, ...members.flatMap(m => [m.name, m.email])])
    const group = { id: existing ?? id(), name, members, updatedAt: now(), updatedBy: context.actor.id }
    groups = existing ? before.map(g => g.id === existing ? group : g) : [...before, group]
  }
  const result = { groups }
  await atomic(env.DB, [roleGuard(context.actor, ['owner', 'admin']), { sql: "COALESCE((SELECT value FROM iw_settings WHERE key=?),'[]')=?", values: [key, raw] }], [
    env.DB.prepare('INSERT INTO iw_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(key, JSON.stringify(groups), now(), context.actor.id),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

/** The snapshot a draft keeps for the group named by `value` (its ID). */
export async function snapshotGroup(env: Env, value: unknown): Promise<SignerGroup> {
  const groupId = text(value, 'a signing group', 100), group = (await listGroups(env)).find(g => g.id === groupId)
  insist(group, 'That signing group no longer exists. Choose another group or a person.', 409)
  return { id: group.id, name: group.name, members: group.members.map(({ name, email }) => ({ name, email })) }
}

/** The recipient place's fields for a group: its name, and every member's email so search and display name them all. */
export const groupPlace = (group: SignerGroup) => ({ name: group.name, email: group.members.map(m => m.email).join(', '), group })

/** Each member's link for a group place reaching its turn: a fresh token in their own row (inserted at the send, updated
 * after), sealed for resending (DELIV-005), and the member's invitation unless the send waits for its scheduled time. */
export async function memberLinkWrites(env: Env, envelope: Envelope, place: number, insert: boolean, invite: boolean) {
  const writes: D1PreparedStatement[] = []
  for (const [m] of envelope.signers[place].group!.members.entries()) {
    const token = secret(), row = memberRow(place, m), hash = await sha256(token), sealed = await sealLink(env, envelope.id, row, token)
    writes.push(insert ? env.DB.prepare('INSERT INTO iw_signers(envelope_id,signer,token_hash,link_sealed) VALUES(?,?,?,?)').bind(envelope.id, row, hash, sealed)
      : env.DB.prepare('UPDATE iw_signers SET token_hash=?,link_sealed=? WHERE envelope_id=? AND signer=?').bind(hash, sealed, envelope.id, row))
    if (invite) writes.push(invitationWrite(env, envelope, place, token, m))
  }
  return writes
}
