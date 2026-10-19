// TMPL-002: templates live in their maker's personal folder or in a shared folder, which its maker owns; a template or
// a folder is shared with a member to use (see and send from) or to edit (also save a new version). A folder share
// covers every template in it, and a person's access is the highest their shares, folders and role give. Owners and
// admins manage every template and folder; a template's maker manages it and a folder's maker manages that folder:
// only they share, take a share back, move or delete it. Viewers and agent tokens have no templates. Group shares
// (ADMIN-002) join this before they ship.
import { id, insist, now, text, type Actor, type Env } from './model'
import { atomic, commandWrite, memberRoleSql, roleGuard } from './storage'
import type { CommandContext } from './envelopes'

export type TemplateAccess = 'none' | 'use' | 'edit' | 'manage'
export type TemplateRow = { id: string; created_by: string; folder_id: string | null; data: string }
export type Folder = { id: string; name: string; ownerId: string; access: TemplateAccess }
const rank: Record<TemplateAccess, number> = { none: 0, use: 1, edit: 2, manage: 3 }
const highest = (...levels: TemplateAccess[]) => levels.reduce((a, b) => rank[b] > rank[a] ? b : a, 'none')
const admin = (actor: Actor) => actor.role === 'owner' || actor.role === 'admin'

/** The SQL condition for "this person may use template t" (alias t), with its bound values. */
export function visibleSql(actor: Actor) {
  if (admin(actor)) return { sql: '1=1', values: [] as string[] }
  return { sql: "(t.created_by=?1 OR EXISTS(SELECT 1 FROM iw_template_folders f WHERE f.id=t.folder_id AND f.owner_id=?1) OR EXISTS(SELECT 1 FROM iw_template_shares s WHERE s.operator_id=?1 AND ((s.subject='template' AND s.subject_id=t.id) OR (s.subject='folder' AND s.subject_id=t.folder_id))))", values: [actor.id] }
}
async function sharesFor(env: Env, actor: Actor) {
  return (await env.DB.prepare('SELECT subject,subject_id,access FROM iw_template_shares WHERE operator_id=?').bind(actor.id).all<{ subject: string; subject_id: string; access: 'use' | 'edit' }>()).results
}
async function folderRows(env: Env) { return (await env.DB.prepare('SELECT id,name,owner_id FROM iw_template_folders ORDER BY name COLLATE NOCASE, id').all<{ id: string; name: string; owner_id: string }>()).results }

/** How this person reaches each template and folder: one read of their shares and the folders. */
export async function accessContext(env: Env, actor: Actor) {
  const shares = admin(actor) ? [] : await sharesFor(env, actor), rows = await folderRows(env)
  const shared = (subject: string, subjectId: string | null) => shares.find(s => s.subject === subject && s.subject_id === subjectId)?.access ?? 'none'
  const folderAccess = (row: { id: string; owner_id: string }): TemplateAccess => admin(actor) || row.owner_id === actor.id ? 'manage' : shared('folder', row.id)
  const folders: Folder[] = rows.map(row => ({ id: row.id, name: row.name, ownerId: row.owner_id, access: folderAccess(row) })).filter(f => f.access !== 'none')
  const templateAccess = (row: Pick<TemplateRow, 'id' | 'created_by' | 'folder_id'>): TemplateAccess => {
    if (admin(actor) || row.created_by === actor.id) return 'manage'
    const folder = row.folder_id ? rows.find(f => f.id === row.folder_id) : undefined
    return highest(shared('template', row.id), folder ? (folder.owner_id === actor.id ? 'edit' : shared('folder', folder.id)) : 'none')
  }
  return { folders, templateAccess }
}
export async function folderAccess(env: Env, actor: Actor, folderId: string) {
  const folder = (await accessContext(env, actor)).folders.find(f => f.id === folderId)
  insist(folder, 'Folder not found.', 404)
  return folder
}

/** `template.folder_create`: a shared folder, owned by whoever makes it. */
export async function createFolder(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const name = text(input.name, 'a folder name', 80), result = { id: id(), name }
  insist(!/[\r\n\t]/.test(name), 'Use a single line for the folder name.')
  await atomic(env.DB, [roleGuard(context.actor)], [env.DB.prepare('INSERT INTO iw_template_folders(id,name,owner_id,created_at) VALUES(?,?,?,?)').bind(result.id, name, context.actor.id, now()), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

/** The subject of a share command: a template (by `id`) or a folder (by `folderId`), which the actor must manage. */
async function subjectOf(env: Env, actor: Actor, input: Record<string, unknown>) {
  if (input.folderId !== undefined) {
    const folder = await folderAccess(env, actor, text(input.folderId, 'a folder ID', 100))
    insist(folder.access === 'manage', 'Only the folder’s owner, an owner or an admin can share it.', 403)
    return { subject: 'folder' as const, subjectId: folder.id, ownerId: folder.ownerId }
  }
  const templateId = text(input.id, 'a template ID'), row = await env.DB.prepare('SELECT id,created_by,folder_id FROM iw_templates WHERE id=?').bind(templateId).first<Omit<TemplateRow, 'data'>>()
  const access = row ? (await accessContext(env, actor)).templateAccess(row) : 'none'
  insist(row && access !== 'none', 'Template not found.', 404)
  insist(access === 'manage', 'Only the template’s maker, an owner or an admin can share it.', 403)
  return { subject: 'template' as const, subjectId: row.id, ownerId: row.created_by }
}

/** `template.share`: share a template or folder with an active sender, found by email, to use or to edit; sharing again
 * changes the access. Owners and admins already reach every template, and viewers have none, so neither is shared with. */
export async function shareTemplate(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const subject = await subjectOf(env, context.actor, input), email = text(input.email, 'a member email', 254).toLowerCase(), access = input.access
  insist(access === 'use' || access === 'edit', 'Share to use or to edit.')
  const target = await env.DB.prepare(`SELECT id, CASE WHEN role='member' THEN ${memberRoleSql('id')} ELSE role END AS role FROM oa_operators WHERE lower(email)=? AND status='active'`).bind(email).first<{ id: string; role: string }>()
  insist(target, 'No active member of this workspace uses that email.', 404)
  insist(target.id !== subject.ownerId, `That member owns this ${subject.subject}.`, 409)
  insist(target.role === 'sender', target.role === 'viewer' ? 'Viewers cannot use templates; make them a sender first.' : 'Owners and admins already reach every template.', 409)
  const result = { ...(subject.subject === 'folder' ? { folderId: subject.subjectId } : { id: subject.subjectId }), operatorId: target.id, access }
  await atomic(env.DB, [roleGuard(context.actor)], [env.DB.prepare('INSERT INTO iw_template_shares(subject,subject_id,operator_id,access,granted_by,granted_at) VALUES(?,?,?,?,?,?) ON CONFLICT(subject,subject_id,operator_id) DO UPDATE SET access=excluded.access,granted_by=excluded.granted_by,granted_at=excluded.granted_at').bind(subject.subject, subject.subjectId, target.id, access, context.actor.id, now()), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}
/** `template.unshare`: take a person's share of a template or folder back. */
export async function unshareTemplate(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const subject = await subjectOf(env, context.actor, input), operatorId = text(input.operatorId, 'a member', 100)
  insist(await env.DB.prepare('SELECT 1 FROM iw_template_shares WHERE subject=? AND subject_id=? AND operator_id=?').bind(subject.subject, subject.subjectId, operatorId).first(), `This ${subject.subject} is not shared with that member.`, 404)
  const result = { ...(subject.subject === 'folder' ? { folderId: subject.subjectId } : { id: subject.subjectId }), operatorId }
  await atomic(env.DB, [roleGuard(context.actor)], [env.DB.prepare('DELETE FROM iw_template_shares WHERE subject=? AND subject_id=? AND operator_id=?').bind(subject.subject, subject.subjectId, operatorId), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}
/** Who a template or folder is shared with, for the people who manage it. */
export async function sharesOf(env: Env, subject: 'template' | 'folder', subjectId: string) {
  return (await env.DB.prepare("SELECT s.operator_id AS operatorId, o.display_name AS name, o.email, s.access, s.granted_by AS grantedBy, s.granted_at AS grantedAt FROM iw_template_shares s JOIN oa_operators o ON o.id=s.operator_id WHERE s.subject=? AND s.subject_id=? ORDER BY o.email").bind(subject, subjectId).all<{ operatorId: string; name: string; email: string; access: string; grantedBy: string; grantedAt: string }>()).results
}
