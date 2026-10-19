// TMPL-001: a template keeps one fixed PDF with its roles in routing order, fields, messages, reminders, expiry and
// identity settings; sending from it asks only for each role's person (and the access code a role needs), and the new
// envelope is prepared exactly as `envelope.prepare` would prepare it, then approved like any other.
import { blobWrites, fromBase64, readBlob } from './blobs'
import { parsePdf, validateFields, validatePdfText } from './pdf'
import { appendEvent, id, insist, now, object, sha256, text, type Actor, type Env, type Field } from './model'
import { atomic, commandWrite, insertEnvelope, roleGuard } from './storage'
import { accessCodeWrites, draftDetail, readDraft } from './drafts'
import { chooseReminders } from './reminders'
import { defaultExpiryDays, maxExpiryDays } from './expiry'
import type { CommandContext } from './envelopes'

/** A role is a place in the routing order with no person yet; `accessCode` says the sender gives that person a code. */
export interface Role { role: string; order: number; accessCode?: boolean; message?: string }
export interface Template { id: string; title: string; filename: string; originalSha256: string; pageSizes: { width: number; height: number }[]; roles: Role[]; fields: Field[]; expiryDays: number; reminders?: { afterDays: number; everyDays: number }; allowPaper?: boolean; allowReassign?: boolean; subject?: string; message?: string; createdBy: string; createdAt: string }
const day = 86_400_000
const optional = (value: unknown, label: string, max: number) => value === undefined || value === '' ? undefined : text(value, label, max)

/** Until shared templates (TMPL-002), a sender sees and uses only the templates they made; owners and admins see all. */
const visible = (actor: Actor) => actor.role === 'owner' || actor.role === 'admin' ? { sql: '', values: [] } : { sql: ' WHERE created_by=?', values: [actor.id] }
async function loadTemplate(env: Env, actor: Actor, templateId: string) {
  const row = await env.DB.prepare('SELECT data,created_by FROM iw_templates WHERE id=?').bind(templateId).first<{ data: string; created_by: string }>()
  insist(row && (actor.role === 'owner' || actor.role === 'admin' || row.created_by === actor.id), 'Template not found.', 404)
  return JSON.parse(row.data) as Template
}
async function templateBytes(env: Env, template: Template) {
  const rows = (await env.DB.prepare('SELECT part,data FROM iw_template_blobs WHERE template_id=? ORDER BY part').bind(template.id).all<{ part: number; data: number[] | ArrayBuffer }>()).results
  const chunks = rows.map((r, i) => { insist(r.part === i, 'The stored template document is incomplete.', 503); return new Uint8Array(r.data) })
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  insist(await sha256(bytes) === template.originalSha256, 'The stored template document failed its SHA-256 integrity check.', 503)
  return bytes
}

export async function listTemplates(env: Env, actor: Actor) {
  const where = visible(actor)
  const rows = (await env.DB.prepare(`SELECT data FROM iw_templates${where.sql} ORDER BY created_at DESC`).bind(...where.values).all<{ data: string }>()).results
  return { templates: rows.map(r => JSON.parse(r.data) as Template) }
}

/** `template.save`: the prepare screen's PDF, fields and settings, with roles in place of people. */
export async function saveTemplate(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const title = text(input.title, 'a template name'), filename = text(input.filename, 'a filename', 240)
  insist(!/[\x00-\x1f/\\]/.test(filename) && filename.toLowerCase().endsWith('.pdf'), 'Choose a PDF filename.')
  insist(!/[\r\n\t]/.test(title), 'Use a single line for the template name.')
  const bytes = fromBase64(input.pdfBase64), { pageSizes } = await parsePdf(bytes)
  insist(Array.isArray(input.roles) && input.roles.length >= 1 && input.roles.length <= 5, 'Add 1–5 roles in routing order.')
  const roles: Role[] = input.roles.map((value, i) => {
    const r = object(value), order = r.order === undefined ? i + 1 : r.order, message = optional(r.message, 'the private message', 1000)
    insist(Number.isInteger(order) && (order as number) >= 1 && (order as number) <= 100, 'Give each role a whole-number routing order from 1 to 100.')
    insist(r.accessCode === undefined || typeof r.accessCode === 'boolean', 'Choose whether each role needs an access code.')
    return { role: text(r.role, 'the role name', 100), order: order as number, ...(r.accessCode ? { accessCode: true } : {}), ...(message ? { message } : {}) }
  })
  insist(new Set(roles.map(r => r.role.toLowerCase())).size === roles.length, 'Give each role a different name.')
  const fields = validateFields(input.fields, roles.length, pageSizes.length)
  insist(roles.every((_, i) => fields.some(f => f.signer === i && f.type === 'signature')), 'Place at least one signature field for every role.')
  const expiryDays = input.expiryDays === undefined ? defaultExpiryDays : input.expiryDays
  insist(Number.isInteger(expiryDays) && (expiryDays as number) >= 1 && (expiryDays as number) <= maxExpiryDays, `Set the expiry from 1 to ${maxExpiryDays} whole days.`)
  for (const key of ['allowPaperSigning', 'allowReassignment']) insist(input[key] === undefined || typeof input[key] === 'boolean', 'Choose each option with true or false.')
  const reminders = chooseReminders(input.reminders), subject = optional(input.subject, 'the email subject', 200), message = optional(input.message, 'the message', 2000)
  insist(!subject || !/[\r\n\t]/.test(subject), 'Use a single line for the email subject.')
  await validatePdfText([title, ...roles.map(r => r.role)])
  const template: Template = { id: id(), title, filename, originalSha256: await sha256(bytes), pageSizes, roles, fields, expiryDays: expiryDays as number, ...(reminders ? { reminders } : {}), ...(input.allowPaperSigning ? { allowPaper: true } : {}), ...(input.allowReassignment ? { allowReassign: true } : {}), ...(subject ? { subject } : {}), ...(message ? { message } : {}), createdBy: context.actor.id, createdAt: now() }
  const result = { id: template.id }
  const parts: D1PreparedStatement[] = []
  for (let offset = 0; offset < bytes.length; offset += 64 * 1024) parts.push(env.DB.prepare('INSERT INTO iw_template_blobs(template_id,part,data) VALUES(?,?,?)').bind(template.id, parts.length, bytes.slice(offset, offset + 64 * 1024).buffer))
  await atomic(env.DB, [roleGuard(context.actor)], [env.DB.prepare('INSERT INTO iw_templates(id,created_by,created_at,data) VALUES(?,?,?,?)').bind(template.id, template.createdBy, template.createdAt, JSON.stringify(template)), ...parts, commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

export async function removeTemplate(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const template = await loadTemplate(env, context.actor, text(input.id, 'a template ID')), result = { id: template.id, removed: true }
  await atomic(env.DB, [roleGuard(context.actor)], [env.DB.prepare('DELETE FROM iw_template_blobs WHERE template_id=?').bind(template.id), env.DB.prepare('DELETE FROM iw_templates WHERE id=?').bind(template.id), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

const base64 = (bytes: Uint8Array) => { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary) }

/** `template.use`: one person per role, in the template's order; everything else comes from the template. The envelope is
 * a draft validated by the same rules as one prepared by hand, and records the template it came from. */
export async function useTemplate(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const template = await loadTemplate(env, context.actor, text(input.id, 'a template ID')), bytes = await templateBytes(env, template)
  insist(Array.isArray(input.recipients) && input.recipients.length === template.roles.length, `Name one person for each of the template’s ${template.roles.length} roles.`)
  const signers = template.roles.map((role, i) => {
    const person = object((input.recipients as unknown[])[i]), code = person.accessCode === undefined || person.accessCode === '' ? undefined : person.accessCode
    insist(!role.accessCode || code !== undefined, `Enter the access code for the ${role.role} role.`)
    insist(role.accessCode || code === undefined, `The ${role.role} role does not use an access code.`)
    return { name: person.name, email: person.email, order: role.order, ...(code === undefined ? {} : { accessCode: code }), ...(role.message ? { message: role.message } : {}) }
  })
  const createdAt = now()
  const { draft, accessCodes } = await readDraft(env, { title: template.title, filename: template.filename, pdfBase64: base64(bytes), signers, fields: template.fields, expiresAt: new Date(Date.parse(createdAt) + template.expiryDays * day).toISOString(), ...(template.reminders ? { reminders: template.reminders } : {}), ...(template.allowPaper ? { allowPaperSigning: true } : {}), ...(template.allowReassign ? { allowReassignment: true } : {}), ...(template.subject ? { subject: template.subject } : {}), ...(template.message ? { message: template.message } : {}) }, createdAt)
  const from = { id: template.id, title: template.title }
  const envelope = { id: id(), version: 1, status: 'prepared' as const, createdAt, createdBy: context.actor.id, ...draft, template: from, events: [] }
  await appendEvent(envelope, 'envelope.prepared', context.actor.id, { ...draftDetail(draft), template: { ...from, roles: template.roles.map(r => r.role) } })
  const result = { id: envelope.id, template: template.id }
  await insertEnvelope(env.DB, envelope, context.actor, [...blobWrites(env.DB, envelope.id, 'original', bytes), ...await accessCodeWrites(env, envelope.id, accessCodes), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  await readBlob(env.DB, envelope.id, 'original', envelope.originalSha256)
  return result
}
