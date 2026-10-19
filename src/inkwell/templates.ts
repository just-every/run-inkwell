// TMPL-001: a template keeps one fixed PDF with its roles in routing order, fields, messages, reminders, expiry and
// identity settings; sending from it asks only for each role's person (and the access code a role needs), and the new
// envelope is prepared exactly as `envelope.prepare` would prepare it, then approved like any other.
import { blobWrites, download, fromBase64, readBlob } from './blobs'
import { parsePdf, validateFields, validatePdfText } from './pdf'
import { appendEvent, id, insist, now, object, sha256, text, type Actor, type Env, type Field, type Envelope } from './model'
import { atomic, commandWrite, getEnvelope, insertEnvelope, roleGuard } from './storage'
import { insistAccess } from './members'
import { accessCodeWrites, draftDetail, readDraft } from './drafts'
import { chooseReminders } from './reminders'
import { defaultExpiryDays, maxExpiryDays } from './expiry'
import type { CommandContext } from './envelopes'

/** A role is a place in the routing order with no person yet; `accessCode` says the sender gives that person a code. */
export interface Role { role: string; order: number; accessCode?: boolean; message?: string }
export interface Template { id: string; title: string; filename: string; originalSha256: string; pageSizes: { width: number; height: number }[]; roles: Role[]; fields: Field[]; expiryDays: number; reminders?: { afterDays: number; everyDays: number }; allowPaper?: boolean; allowReassign?: boolean; subject?: string; message?: string; createdBy: string; createdAt: string; version?: number; updatedAt?: string }
/** TMPL-003: a template stored before versions is version 1. */
const versionOf = (template: Template) => template.version ?? 1
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

/** The prepare screen's PDF, fields and settings, with roles in place of people, validated for a new template or a new
 * version of one. */
async function readTemplate(input: Record<string, unknown>) {
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
  const definition = { title, filename, originalSha256: await sha256(bytes), pageSizes, roles, fields, expiryDays: expiryDays as number, ...(reminders ? { reminders } : {}), ...(input.allowPaperSigning ? { allowPaper: true } : {}), ...(input.allowReassignment ? { allowReassign: true } : {}), ...(subject ? { subject } : {}), ...(message ? { message } : {}) }
  return { definition, bytes }
}
const blobInserts = (env: Env, templateId: string, bytes: Uint8Array) => { const parts: D1PreparedStatement[] = []; for (let offset = 0; offset < bytes.length; offset += 64 * 1024) parts.push(env.DB.prepare('INSERT INTO iw_template_blobs(template_id,part,data) VALUES(?,?,?)').bind(templateId, parts.length, bytes.slice(offset, offset + 64 * 1024).buffer)); return parts }
async function insertTemplate(env: Env, context: CommandContext, input: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const { definition, bytes } = await readTemplate(input), template: Template = { id: id(), ...definition, createdBy: context.actor.id, createdAt: now(), version: 1 }
  const result = { id: template.id, version: 1, ...extra }
  await atomic(env.DB, [roleGuard(context.actor)], [env.DB.prepare('INSERT INTO iw_templates(id,created_by,created_at,data) VALUES(?,?,?,?)').bind(template.id, template.createdBy, template.createdAt, JSON.stringify(template)), ...blobInserts(env, template.id, bytes), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}
/** `template.save`: a new template, version 1. */
export const saveTemplate = (env: Env, context: CommandContext, input: Record<string, unknown>) => insertTemplate(env, context, input)

/** TMPL-003 `template.update`: an edit is the template's next version. Envelopes already sent keep their own bytes,
 * fields and settings and name the version they came from, so nothing sent changes. */
export async function updateTemplate(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await loadTemplate(env, context.actor, text(input.id, 'a template ID')), { definition, bytes } = await readTemplate(input)
  const after: Template = { ...definition, id: before.id, createdBy: before.createdBy, createdAt: before.createdAt, version: versionOf(before) + 1, updatedAt: now() }
  const result = { id: after.id, version: after.version }
  await atomic(env.DB, [roleGuard(context.actor), { sql: 'EXISTS(SELECT 1 FROM iw_templates WHERE id=? AND data=?)', values: [before.id, JSON.stringify(before)] }], [env.DB.prepare('UPDATE iw_templates SET data=? WHERE id=?').bind(JSON.stringify(after), after.id), env.DB.prepare('DELETE FROM iw_template_blobs WHERE template_id=?').bind(after.id), ...blobInserts(env, after.id, bytes), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

/** TMPL-003 `template.from_envelope`: a new template from an envelope this person may read: its original PDF, its
 * recipients (not removed ones) as roles in the same order with their access-code setting and private message, their
 * fields, and its subject, message, reminders, expiry length and options. Roles keep the names of the template the
 * envelope came from; other recipients become Signer 1, Signer 2 and so on. */
export async function templateFromEnvelope(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const envelope: Envelope = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  await insistAccess(env, context.actor, envelope, 'view')
  insist(!envelope.imported, 'Only a native envelope can be saved as a template.', 409)
  const bytes = await readBlob(env.DB, envelope.id, 'original', envelope.originalSha256), kept = envelope.signers.flatMap((s, i) => s.removedAt ? [] : [i])
  const names = (envelope.events.find(e => e.action === 'envelope.prepared')?.detail.template as { roles?: string[] } | undefined)?.roles ?? []
  const days = Math.min(maxExpiryDays, Math.max(1, Math.round((Date.parse(envelope.expiresAt) - Date.parse(envelope.createdAt)) / day)))
  return insertTemplate(env, context, { title: input.title === undefined ? envelope.title : input.title, filename: envelope.filename, pdfBase64: base64(bytes), roles: kept.map((i, k) => ({ role: names[i] ?? `Signer ${k + 1}`, order: envelope.signers[i].order ?? i + 1, ...(envelope.signers[i].accessCode ? { accessCode: true } : {}), ...(envelope.signers[i].message ? { message: envelope.signers[i].message } : {}) })), fields: envelope.fields.filter(f => kept.includes(f.signer)).map(f => ({ ...f, signer: kept.indexOf(f.signer) })), expiryDays: days, ...(envelope.reminders ? { reminders: envelope.reminders } : {}), ...(envelope.allowPaper ? { allowPaperSigning: true } : {}), ...(envelope.allowReassign ? { allowReassignment: true } : {}), ...(envelope.subject ? { subject: envelope.subject } : {}), ...(envelope.message ? { message: envelope.message } : {}) }, { fromEnvelope: envelope.id })
}

/** The template's current PDF, for its edit screen. */
export async function templateDocument(env: Env, actor: Actor, templateId: string) { const template = await loadTemplate(env, actor, templateId); return download(await templateBytes(env, template), template.filename) }

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
  const from = { id: template.id, title: template.title, version: versionOf(template) }
  const envelope = { id: id(), version: 1, status: 'prepared' as const, createdAt, createdBy: context.actor.id, ...draft, template: from, events: [] }
  await appendEvent(envelope, 'envelope.prepared', context.actor.id, { ...draftDetail(draft), template: { ...from, roles: template.roles.map(r => r.role) } })
  const result = { id: envelope.id, template: template.id }
  await insertEnvelope(env.DB, envelope, context.actor, [...blobWrites(env.DB, envelope.id, 'original', bytes), ...await accessCodeWrites(env, envelope.id, accessCodes), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  await readBlob(env.DB, envelope.id, 'original', envelope.originalSha256)
  return result
}
