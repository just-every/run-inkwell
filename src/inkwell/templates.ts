import { consumedUploadWrites, readDocuments, documentFields, documentInputFields, documentWrites, stagedBlobWrites, type EnvelopeDocument } from './documents'
import { verifyTemplateDocument, templateOriginal, templateDocumentWrites } from './template-documents'
import { envelopeDefaults } from './envelope-defaults'
import { normalizeRoutingRule, validateRouting } from './routing'
// TMPL-001: a template keeps one fixed PDF with its roles in routing order, fields, messages, reminders, expiry and
// identity settings; sending from it asks only for each role's person (and the access code a role needs), and the new
// envelope is prepared exactly as `envelope.prepare` would prepare it, then approved like any other.
import { applyPrefillPayload } from './prefill'
import { blobWrites, download, fromBase64, readBlob } from './blobs'
import { parsePdf, validateFields, validatePdfText, validatePrefilledFields } from './pdf'
import { appendEvent, id, insist, now, object, sha256, text, type Actor, type Env, type Field, type Envelope, type Supplement } from './model'
import { atomic, commandWrite, getEnvelope, insertEnvelope, roleGuard, type Guard } from './storage'
import { normalizeApprovalRule } from './internal-approval'
import { insistAccess } from './members'
import { accessCodeWrites, draftDetail, readDraft } from './drafts'
import { chooseReminders } from './reminders'
import { maxExpiryDays } from './expiry'
import type { CommandContext } from './envelopes'
import { accessContext, folderAccess, sharesOf, visibleSql, type TemplateAccess, type TemplateRow } from './template-shares'
import { supplementDefinition, supplementsFromEnvelope, supplementsFromTemplate, templateSupplementWrites, type TemplateSupplementArtifact } from './template-supplements'

/** A role is a place in the routing order with no person yet; `accessCode` says the sender gives that person a code. */
export interface Role { includeWhen?: import('./model').RoutingRule; role: string; order: number; accessCode?: boolean; linkOnly?: boolean; message?: string }
export interface Template { part11?: Envelope['part11']; documents?: EnvelopeDocument[]; supplements?: Supplement[]; maintenance?: { proposalId: string; by: string; at: string; examples: { id: string; eventHash: string }[] }; approval?: import('./model').ApprovalRule; id: string; title: string; filename: string; originalSha256: string; pageSizes: { width: number; height: number }[]; roles: Role[]; fields: Field[]; expiryDays: number; reminders?: { afterDays: number; everyDays: number }; allowPaper?: boolean; allowReassign?: boolean; subject?: string; message?: string; createdBy: string; createdAt: string; version?: number; updatedAt?: string; tags?: string[] }
/** TMPL-003: a template stored before versions is version 1. */
const versionOf = (template: Template) => template.version ?? 1
const day = 86_400_000
const optional = (value: unknown, label: string, max: number) => value === undefined || value === '' ? undefined : text(value, label, max)

/** TMPL-002: a template this person reaches with at least `needed`; one they cannot reach at all is not found. */
export async function loadTemplate(env: Env, actor: Actor, templateId: string, needed: Exclude<TemplateAccess, 'none'>) {
  const row = await env.DB.prepare('SELECT id,data,created_by,folder_id FROM iw_templates WHERE id=?').bind(templateId).first<TemplateRow>()
  const access = row ? (await accessContext(env, actor)).templateAccess(row) : 'none'
  insist(row && access !== 'none', 'Template not found.', 404)
  insist(needed === 'use' || access === 'manage' || (needed === 'edit' && access === 'edit'), needed === 'edit' ? 'This template is shared with you to use, not to edit.' : 'Only the template’s maker, an owner or an admin can do that.', 403)
  return { template: JSON.parse(row.data) as Template, row }
}
/** The folder a new or moved template goes to: none (its maker's personal folder) or a shared folder this person may edit. */
async function targetFolder(env: Env, actor: Actor, value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const folder = await folderAccess(env, actor, text(value, 'a folder ID', 100))
  insist(folder.access === 'edit' || folder.access === 'manage', 'You can put templates only in folders you own or that are shared with you to edit.', 403)
  return folder.id
}
export async function templateBytes(env: Env, template: Template) {
  const rows = (await env.DB.prepare('SELECT part,data FROM iw_template_blobs WHERE template_id=? ORDER BY part').bind(template.id).all<{ part: number; data: number[] | ArrayBuffer }>()).results
  const chunks = rows.map((r, i) => { insist(r.part === i, 'The stored template document is incomplete.', 503); return new Uint8Array(r.data) })
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  insist(await sha256(bytes) === template.originalSha256, 'The stored template document failed its SHA-256 integrity check.', 503)
  return bytes
}

/** The templates this person may use, newest first. */
export async function visibleTemplates(env: Env, actor: Actor) {
  const where = visibleSql(actor)
  return (await env.DB.prepare(`SELECT t.data FROM iw_templates t WHERE ${where.sql} ORDER BY t.created_at DESC`).bind(...where.values).all<{ data: string }>()).results.map(r => JSON.parse(r.data) as Template)
}
/** TMPL-002 `GET /api/inkwell/templates`: the templates this person may use, each with its folder, tags and their access
 * (and who it is shared with, for those who manage it); `q` keeps those whose name or a tag contains it, ignoring case,
 * and `folder` those in one folder (`personal` for the maker's own). Also the folders this person reaches. */
export async function listTemplates(env: Env, actor: Actor, params = new URLSearchParams()) {
  const where = visibleSql(actor), context = await accessContext(env, actor), q = (params.get('q') ?? '').trim().toLowerCase(), folder = params.get('folder')
  const rows = (await env.DB.prepare(`SELECT t.id,t.data,t.created_by,t.folder_id FROM iw_templates t WHERE ${where.sql} ORDER BY t.created_at DESC`).bind(...where.values).all<TemplateRow>()).results
  const templates = await Promise.all(rows.filter(row => !folder || (folder === 'personal' ? !row.folder_id : row.folder_id === folder)).map(row => ({ row, template: JSON.parse(row.data) as Template })).filter(({ template }) => !q || template.title.toLowerCase().includes(q) || (template.tags ?? []).some(tag => tag.toLowerCase().includes(q))).map(async ({ row, template }) => {
    const access = context.templateAccess(row), named = context.folders.find(f => f.id === row.folder_id)
    const { maintenance, ...definition } = template
    return { ...definition, ...(template.createdBy === actor.id && maintenance ? { maintenance } : {}), maintenanceAvailable: template.createdBy === actor.id, access, folder: row.folder_id ? { id: row.folder_id, name: named?.name ?? 'Shared folder' } : null, ...(access === 'manage' ? { shares: await sharesOf(env, 'template', row.id) } : {}) }
  }))
  const folders = await Promise.all(context.folders.map(async f => ({ ...f, ...(f.access === 'manage' ? { shares: await sharesOf(env, 'folder', f.id) } : {}) })))
  return { templates, folders }
}

/** The prepare screen's PDF, fields and settings, with roles in place of people, validated for a new template or a new
 * version of one. */
async function readTemplate(env: Env, input: Record<string, unknown>, actor:Actor, retained?:{documents:EnvelopeDocument[];read:(index:number)=>Promise<Uint8Array>}) {
  insist(input.supplements === undefined, 'Save supplemental documents from an envelope; template edits keep the saved documents.')
  const defaults = await envelopeDefaults(env)
  const title = text(input.title, 'a template name'), filename = text(input.filename, 'a filename', 240)
  insist(!/[\x00-\x1f/\\]/.test(filename) && filename.toLowerCase().endsWith('.pdf'), 'Choose a PDF filename.')
  insist(!/[\r\n\t]/.test(title), 'Use a single line for the template name.')
  const multiple=await readDocuments(env,input,actor,undefined,retained),bytes=multiple?.bytes??fromBase64(input.pdfBase64),{pageSizes}=multiple??await parsePdf(bytes)
  insist(Array.isArray(input.roles) && input.roles.length >= 1 && input.roles.length <= 5, 'Add 1–5 roles in routing order.')
  const roles: Role[] = input.roles.map((value, i) => {
    const r = object(value), order = r.order === undefined ? i + 1 : r.order, message = optional(r.message, 'the private message', 1000)
    insist(Number.isInteger(order) && (order as number) >= 1 && (order as number) <= 100, 'Give each role a whole-number routing order from 1 to 100.')
    insist(r.accessCode === undefined || typeof r.accessCode === 'boolean', 'Choose whether each role needs an access code.')
    insist(r.linkOnly === undefined || typeof r.linkOnly === 'boolean', 'Choose email code or link only for each role.')
    return { ...(r.includeWhen===undefined?{}:{includeWhen:normalizeRoutingRule(r.includeWhen)}), role: text(r.role, 'the role name', 100), order: order as number, ...(r.accessCode ? { accessCode: true } : {}), ...(r.linkOnly ? { linkOnly: true } : {}), ...(message ? { message } : {}) }
  })
  insist(new Set(roles.map(r => r.role.toLowerCase())).size === roles.length, 'Give each role a different name.')
  const fields = validateFields(documentInputFields(input.fields,multiple?.documents), roles.length, pageSizes.length)
  documentFields(fields,multiple?.documents,roles.length)
  validateRouting(roles, fields)
  await validatePdfText(roles.flatMap(person=>person.includeWhen?[person.includeWhen.value]:[]))
  await validatePrefilledFields(fields)
  insist(roles.every((_, i) => fields.some(f => f.signer === i && f.type === 'signature')), 'Place at least one signature field for every role.')
  const expiryDays = input.expiryDays === undefined ? defaults.expiryDays : input.expiryDays
  insist(Number.isInteger(expiryDays) && (expiryDays as number) >= 1 && (expiryDays as number) <= maxExpiryDays, `Set the expiry from 1 to ${maxExpiryDays} whole days.`)
  for (const key of ['allowPaperSigning', 'allowReassignment']) insist(input[key] === undefined || typeof input[key] === 'boolean', 'Choose each option with true or false.')
  const reminders = chooseReminders(input.reminders === undefined ? defaults.reminders : input.reminders), subject = optional(input.subject, 'the email subject', 200), message = optional(input.message, 'the message', 2000)
  insist(!subject || !/[\r\n\t]/.test(subject), 'Use a single line for the email subject.')
  // TMPL-002: up to 10 tags of 1-40 characters, for search.
  insist(input.tags === undefined || (Array.isArray(input.tags) && input.tags.length <= 10), 'Add at most 10 tags.')
  const tags = [...new Set(((input.tags ?? []) as unknown[]).map(tag => text(tag, 'a tag', 40)))]
  await validatePdfText([title, ...roles.map(r => r.role)])
  // ROUTE-004: the template's internal approval rule, saved with this version.
  const approval = await normalizeApprovalRule(env, input.approval)
  const definition = { ...(multiple?{documents:multiple.documents}:{}), ...(approval ? { approval } : {}), title, ...(tags.length ? { tags } : {}), filename, originalSha256: await sha256(bytes), pageSizes, roles, fields, expiryDays: expiryDays as number, ...(reminders ? { reminders } : {}), ...(input.allowPaperSigning ? { allowPaper: true } : {}), ...(input.allowReassignment ? { allowReassign: true } : {}), ...(subject ? { subject } : {}), ...(message ? { message } : {}) }
  return { definition, bytes, originals:multiple?.originals }
}
const blobInserts = (env: Env, templateId: string, bytes: Uint8Array) => { const parts: D1PreparedStatement[] = []; for (let offset = 0; offset < bytes.length; offset += 64 * 1024) parts.push(env.DB.prepare('INSERT INTO iw_template_blobs(template_id,part,data) VALUES(?,?,?)').bind(templateId, parts.length, bytes.slice(offset, offset + 64 * 1024).buffer)); return parts }
async function insertTemplate(env: Env, context: CommandContext, input: Record<string, unknown>, extra: Record<string, unknown> = {}, custody?: { artifacts: TemplateSupplementArtifact[]; guard: Guard; source?:Envelope }) {
  const { definition, bytes, originals } = await readTemplate(env, input, context.actor,custody?.source?.documents?{documents:custody.source.documents,read:i=>readBlob(env.DB,custody.source!.id,`document-${i}`,custody.source!.documents![i].sha256)}:undefined), template: Template = { id: id(), ...definition, createdBy: context.actor.id, createdAt: now(), version: 1, ...(custody?.source?.part11?{part11:structuredClone(custody.source.part11)}:{}), ...(custody?.artifacts.length ? { supplements: custody.artifacts.map(a => a.supplement) } : {}) }
  const folder = await targetFolder(env, context.actor, input.folderId), result = { id: template.id, version: 1, ...extra }
  await atomic(env.DB, [roleGuard(context.actor), ...(custody ? [custody.guard] : [])], [env.DB.prepare('INSERT INTO iw_templates(id,created_by,created_at,data,folder_id) VALUES(?,?,?,?,?)').bind(template.id, template.createdBy, template.createdAt, JSON.stringify(template), folder), ...blobInserts(env, template.id, bytes), ...await templateDocumentWrites(env,template.id,originals),...consumedUploadWrites(env,input), ...(custody?.artifacts ?? []).flatMap(a => templateSupplementWrites(env.DB, template.id, a.supplement.id, a.bytes)), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}
/** `template.save`: a new template, version 1. */
export const saveTemplate = (env: Env, context: CommandContext, input: Record<string, unknown>) => insertTemplate(env, context, input)

/** TMPL-003 `template.update`: an edit is the template's next version. Envelopes already sent keep their own bytes,
 * fields and settings and name the version they came from, so nothing sent changes. */
export async function updateTemplate(env: Env, context: CommandContext, input: Record<string, unknown>, review?: { version: number; maintenance: NonNullable<Template['maintenance']>; guards: Guard[] }) {
  const { template: before, row } = await loadTemplate(env, context.actor, text(input.id, 'a template ID'), 'edit'), { definition, bytes, originals } = await readTemplate(env, {...input,...(before.documents&&input.documents===undefined?{documents:before.documents.map((d,i)=>({existing:i,mode:d.mode}))}:{})},context.actor,before.documents?{documents:before.documents,read:i=>templateOriginal(env,before,i)}:undefined)
  insist(!before.part11 || !definition.allowPaper, 'Paper signing is unavailable in this unvalidated electronic profile.',409)
  if (review) insist(before.createdBy === context.actor.id && versionOf(before) === review.version, 'This suggestion changed. Review it again before publishing.', 409)
  const after: Template = { ...(before.part11?{part11:structuredClone(before.part11)}:{}), ...(before.supplements?.length ? { supplements: before.supplements.map(supplementDefinition) } : {}), ...(review ? { maintenance: review.maintenance } : {}), ...definition, id: before.id, createdBy: before.createdBy, createdAt: before.createdAt, version: versionOf(before) + 1, updatedAt: now() }
  // TMPL-002: without `folderId` the template stays where it is; moving it is for those who manage it.
  const moving = input.folderId !== undefined && (input.folderId || null) !== row.folder_id
  if (moving) await loadTemplate(env, context.actor, before.id, 'manage')
  const folder = moving ? await targetFolder(env, context.actor, input.folderId) : row.folder_id, result = { id: after.id, version: after.version }
  await atomic(env.DB, [roleGuard(context.actor), ...(review?.guards ?? []), { sql: 'EXISTS(SELECT 1 FROM iw_templates WHERE id=? AND data=?)', values: [before.id, JSON.stringify(before)] }], [env.DB.prepare('UPDATE iw_templates SET data=?,folder_id=? WHERE id=?').bind(JSON.stringify(after), folder, after.id), env.DB.prepare('DELETE FROM iw_template_blobs WHERE template_id=?').bind(after.id), ...blobInserts(env, after.id, bytes), env.DB.prepare('DELETE FROM iw_template_document_blobs WHERE template_id=?').bind(after.id),...await templateDocumentWrites(env,after.id,originals),...consumedUploadWrites(env,input), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
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
  const [bytes, artifacts] = await Promise.all([readBlob(env.DB, envelope.id, 'original', envelope.originalSha256), supplementsFromEnvelope(env, envelope)]), kept = envelope.signers.flatMap((s, i) => s.removedAt ? [] : [i])
  const names = (envelope.events.find(e => e.action === 'envelope.prepared')?.detail.template as { roles?: string[] } | undefined)?.roles ?? []
  const days = Math.min(maxExpiryDays, Math.max(1, Math.round((Date.parse(envelope.expiresAt) - Date.parse(envelope.createdAt)) / day)))
  return insertTemplate(env, context, { ...(envelope.documents?{documents:envelope.documents.map((d,i)=>({existing:i,mode:d.mode}))}:{}), title: input.title === undefined ? envelope.title : input.title, filename: envelope.filename, pdfBase64: base64(bytes), roles: kept.map((i, k) => ({ ...(envelope.signers[i].includeWhen?{includeWhen:envelope.signers[i].includeWhen}:{}), role: names[i] ?? `Signer ${k + 1}`, order: envelope.signers[i].order ?? i + 1, ...(envelope.signers[i].accessCode ? { accessCode: true } : {}), ...(envelope.signers[i].linkOnly ? { linkOnly: true } : {}), ...(envelope.signers[i].message ? { message: envelope.signers[i].message } : {}) })), fields: envelope.fields.filter(f => kept.includes(f.signer)).map(f => ({ ...f, signer: kept.indexOf(f.signer) })), expiryDays: days, reminders: envelope.reminders ?? null, ...(envelope.allowPaper ? { allowPaperSigning: true } : {}), ...(envelope.allowReassign ? { allowReassignment: true } : {}), ...(envelope.subject ? { subject: envelope.subject } : {}), ...(envelope.message ? { message: envelope.message } : {}), ...(envelope.approvalRule ? { approval: envelope.approvalRule } : {}) }, { fromEnvelope: envelope.id }, { artifacts, source:envelope, guard: { sql: 'EXISTS(SELECT 1 FROM iw_envelopes WHERE id=? AND version=?)', values: [envelope.id, envelope.version] } })
}

/** The template's current PDF, for its edit screen. */
export async function templateDocument(env: Env, actor: Actor, templateId: string) { const { template } = await loadTemplate(env, actor, templateId, 'use'); return download(await templateBytes(env, template), template.filename) }

export async function removeTemplate(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const { template } = await loadTemplate(env, context.actor, text(input.id, 'a template ID'), 'manage'), result = { id: template.id, removed: true }
  await atomic(env.DB, [roleGuard(context.actor)], [env.DB.prepare("DELETE FROM iw_template_shares WHERE subject='template' AND subject_id=?").bind(template.id), env.DB.prepare('DELETE FROM iw_template_blobs WHERE template_id=?').bind(template.id), env.DB.prepare('DELETE FROM iw_template_supplement_blobs WHERE template_id=?').bind(template.id), env.DB.prepare('DELETE FROM iw_template_document_blobs WHERE template_id=?').bind(template.id), env.DB.prepare('DELETE FROM iw_templates WHERE id=?').bind(template.id), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

const base64 = (bytes: Uint8Array) => { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary) }

/** `template.use`: one person per role, in the template's order; everything else comes from the template. The envelope is
 * a draft validated by the same rules as one prepared by hand, and records the template it came from. */
export async function useTemplate(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const { template } = await loadTemplate(env, context.actor, text(input.id, 'a template ID'), 'use')
  const [bytes, artifacts] = await Promise.all([templateBytes(env, template), supplementsFromTemplate(env, template)])
  insist(Array.isArray(input.recipients) && input.recipients.length === template.roles.length, `Name one person for each of the template’s ${template.roles.length} roles.`)
  const signers = template.roles.map((role, i) => {
    const person = object((input.recipients as unknown[])[i]), code = person.accessCode === undefined || person.accessCode === '' ? undefined : person.accessCode
    insist(!role.accessCode || code !== undefined, `Enter the access code for the ${role.role} role.`)
    insist(role.accessCode || code === undefined, `The ${role.role} role does not use an access code.`)
    // ROUTE-005: a role may be filled by a signing group instead of a person.
    return { ...(role.includeWhen?{includeWhen:role.includeWhen}:{}), ...(person.group === undefined ? { name: person.name, email: person.email } : { group: person.group }), order: role.order, ...(role.linkOnly ? { linkOnly: true } : {}), ...(code === undefined ? {} : { accessCode: code }), ...(role.message ? { message: role.message } : {}) }
  })
  const createdAt = now()
  for(const [i] of (template.documents??[]).entries())await verifyTemplateDocument(env,template,i)
  const { draft, accessCodes } = await readDraft(env, { title: template.title, filename: template.filename, pdfBase64: base64(bytes), signers, fields: applyPrefillPayload(template.fields, input.prefill), expiresAt: new Date(Date.parse(createdAt) + template.expiryDays * day).toISOString(), reminders: template.reminders ?? null, ...(template.allowPaper ? { allowPaperSigning: true } : {}), ...(template.allowReassign ? { allowReassignment: true } : {}), ...(template.subject ? { subject: template.subject } : {}), ...(template.message ? { message: template.message } : {}) }, createdAt,undefined,context.actor,template.documents?{bytes,documents:template.documents}:undefined)
  const from = { id: template.id, title: template.title, version: versionOf(template) }
  const envelope = { id: id(), version: 1, status: 'prepared' as const, createdAt, createdBy: context.actor.id, ...draft, ...(template.part11?{part11:structuredClone(template.part11)}:{}), ...(artifacts.length ? { supplements: artifacts.map(a => a.supplement) } : {}), template: from, ...(template.approval ? { approvalRule: template.approval } : {}), events: [] }
  await appendEvent(envelope, 'envelope.prepared', context.actor.id, { ...draftDetail(draft), ...(envelope.part11?{part11:envelope.part11}:{}), ...(envelope.supplements ? { supplements: envelope.supplements } : {}), template: { ...from, roles: template.roles.map(r => r.role) } })
  const result = { id: envelope.id, template: template.id }
  await insertEnvelope(env.DB, envelope, context.actor, [...await stagedBlobWrites(env, envelope.id, 'original', bytes), ...(template.documents??[]).map((_,i)=>env.DB.prepare('INSERT INTO iw_blobs(envelope_id,kind,part,data) SELECT ?,?,part,data FROM iw_template_document_blobs WHERE template_id=? AND document=?').bind(envelope.id,`document-${i}`,template.id,i)), ...artifacts.flatMap(a => blobWrites(env.DB, envelope.id, `supplement-${a.supplement.id}`, a.bytes)), ...await accessCodeWrites(env, envelope.id, accessCodes), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)], [{ sql: 'EXISTS(SELECT 1 FROM iw_templates WHERE id=? AND data=?)', values: [template.id, JSON.stringify(template)] }])
  await readBlob(env.DB, envelope.id, 'original', envelope.originalSha256)
  return result
}
