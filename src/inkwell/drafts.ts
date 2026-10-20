import { normalizeRoutingRule, validateCopyRouting, validateRouting } from './routing'
import { fromBase64, blobWrites, readBlob } from './blobs'
import { parsePdf, validateFields, validatePdfText } from './pdf'
import { accessCodeHash, appendEvent, insist, now, object, sha256, text, type Envelope, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { chooseExpiry } from './expiry'
import { chooseReminders } from './reminders'
import { chooseCopies } from './completed-copies'
import { insistAccess } from './members'
import type { CommandContext } from './envelopes'
import { mailSuppressed } from './manual-invitations'

/** PREP-009: what a prepared envelope holds, validated the same way when it is first saved and whenever its draft is
 * saved again: the PDF, title, recipients in routing order with any access code and private message, fields, expiry,
 * reminders, copy recipients, the paper option, and the invitation's subject and message. */
export type Draft = Pick<Envelope, 'title' | 'filename' | 'signers' | 'fields' | 'pageSizes' | 'originalSha256' | 'expiresAt' | 'allowPaper' | 'allowReassign' | 'reminders' | 'copies' | 'subject' | 'message'>
const optional = (value: unknown, label: string, max: number, oneLine = false) => { if (value === undefined || value === '') return undefined; const result = text(value, label, max); insist(!oneLine || !/[\r\n\t]/.test(result), `Use a single line for ${label}.`); return result }
/** `previous` is the draft being saved again: a recipient at the same place with the same email may keep their access
 * code (`keepAccessCode`), which is bound to that place. */
export async function readDraft(env: Env, input: Record<string, unknown>, base: string, previous?: Envelope) {
  const title = text(input.title, 'a title'), filename = text(input.filename, 'a filename', 240)
  insist(!/[\x00-\x1f/\\]/.test(filename) && filename.toLowerCase().endsWith('.pdf'), 'Choose a PDF filename.')
  insist(!/[\r\n\t]/.test(title), 'Use a single line for the envelope title.')
  const bytes = fromBase64(input.pdfBase64), { pageSizes } = await parsePdf(bytes)
  insist(Array.isArray(input.signers) && input.signers.length >= 1 && input.signers.length <= 5, 'Add 1–5 ordered signers.')
  const accessCodes: (string | 'keep' | undefined)[] = []
  const signers = input.signers.map((value, i) => {
    const s = object(value), email = text(s.email, 'the signer email', 254).toLowerCase(), order = s.order === undefined ? i + 1 : s.order
    insist(Number.isInteger(order) && (order as number) >= 1 && (order as number) <= 100, 'Give each signer a whole-number routing order from 1 to 100.')
    insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Provide a valid signer email.')
    const code = s.accessCode === undefined || s.accessCode === '' ? undefined : text(s.accessCode, 'an access code', 32)
    insist(code === undefined || /^\S{4,32}$/.test(code), 'Use an access code of 4–32 characters with no spaces.')
    const keep = s.keepAccessCode === true && !code
    insist(!keep || (previous?.signers[i]?.email === email && previous.signers[i].accessCode), `Enter the access code for ${email} again: a kept code stays with the same recipient in the same place.`)
    accessCodes.push(keep ? 'keep' : code)
    const message = optional(s.message, 'the private message', 1000)
    // IDV-001: link only is a choice per recipient, refused when mail is off (the owner's private link would be the only factor).
    insist(s.linkOnly === undefined || typeof s.linkOnly === 'boolean', 'Choose email code or link only for each recipient.')
    insist(!s.linkOnly || !mailSuppressed(env), 'Link-only signing needs mail; while mail is not set up every recipient verifies a code.', 409)
    insist(s.inPerson === undefined || typeof s.inPerson === 'boolean', 'Choose whether each recipient signs in person.')
    const inPerson = s.inPerson ?? (previous?.signers[i]?.email === email && previous.signers[i].inPerson)
    return { ...(s.includeWhen===undefined?{}:{includeWhen:normalizeRoutingRule(s.includeWhen)}), name: text(s.name, 'the signer name', 100), email, order: order as number, ...(inPerson ? { inPerson: true } : {}), ...(code || keep ? { accessCode: true } : {}), ...(s.linkOnly ? { linkOnly: true } : {}), ...(message ? { message } : {}) }
  })
  insist(new Set(signers.map(s => s.email)).size === signers.length, 'Each ordered signer must use a different email.')
  const fields = validateFields(input.fields, signers.length, pageSizes.length), copies = chooseCopies(input.copies, signers)
  validateRouting(signers, fields)
  validateCopyRouting(copies, fields)
  await validatePdfText([...signers, ...copies].flatMap(person=>person.includeWhen?[person.includeWhen.value]:[]))
  await validatePdfText(fields.flatMap(field => field.prefill ? [field.prefill.value] : []))
  insist(input.allowPaperSigning === undefined || typeof input.allowPaperSigning === 'boolean', 'Choose whether recipients may sign on paper.')
  // ROUTE-006: whether a recipient may reassign their signing to someone else; off unless the sender turns it on.
  insist(input.allowReassignment === undefined || typeof input.allowReassignment === 'boolean', 'Choose whether recipients may reassign their signing.')
  const allowPaper = input.allowPaperSigning === true, allowReassign = input.allowReassignment === true, reminders = chooseReminders(input.reminders)
  const subject = optional(input.subject, 'the email subject', 200, true), message = optional(input.message, 'the message', 2000)
  await validatePdfText([title, ...[...signers, ...copies].flatMap(s => [s.name, s.email])])
  const draft: Draft = { title, filename, signers, fields, pageSizes, originalSha256: await sha256(bytes), expiresAt: chooseExpiry(input.expiresAt, base), ...(allowPaper ? { allowPaper } : {}), ...(allowReassign ? { allowReassign } : {}), ...(reminders ? { reminders } : {}), ...(copies.length ? { copies } : {}), ...(subject ? { subject } : {}), ...(message ? { message } : {}) }
  return { draft, bytes, accessCodes }
}
/** The event detail a saved draft records (prepared or updated). */
export const draftDetail = (d: Draft) => ({ originalSha256: d.originalSha256, orderedSigners: d.signers, fields: d.fields, expiresAt: d.expiresAt, allowPaperSigning: Boolean(d.allowPaper), ...(d.allowReassign ? { allowReassignment: true } : {}), ...(d.reminders ? { reminders: d.reminders } : {}), ...(d.copies ? { copies: d.copies } : {}), ...(d.subject ? { subject: d.subject } : {}), ...(d.message ? { message: d.message } : {}) })
export async function accessCodeWrites(env: Env, envelopeId: string, codes: (string | 'keep' | undefined)[]) {
  return Promise.all(codes.flatMap((code, i) => code && code !== 'keep' ? [accessCodeHash(env, envelopeId, i, code).then(hash => env.DB.prepare('INSERT INTO iw_access_codes(envelope_id,signer,code_hash) VALUES(?,?,?)').bind(envelopeId, i, hash))] : []))
}

/** PREP-009: reopen a saved draft and save it again with anything changed, until it is approved. The envelope keeps its
 * ID, sender, creation time and audit trail; the record names every saved version. */
export async function updateDraft(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  await insistAccess(env, context.actor, before, 'edit')
  insist(!before.imported && before.status === 'prepared', 'Only a draft that has not been approved can be edited.', 409)
  // ROUTE-004: a draft waiting for internal approval is locked; a rejected one keeps its rejection until it is sent again.
  insist(before.internalApproval?.state !== 'pending', 'This envelope is waiting for internal approval and cannot be edited.', 409)
  const { draft, bytes, accessCodes } = await readDraft(env, input, now(), before)
  const after: Envelope = { id: before.id, version: before.version, status: 'prepared', createdAt: before.createdAt, createdBy: before.createdBy, ...(before.copiedFrom ? { copiedFrom: before.copiedFrom } : {}), ...(before.approvalRule ? { approvalRule: before.approvalRule } : {}), ...(before.internalApproval ? { internalApproval: before.internalApproval } : {}), events: structuredClone(before.events), ...draft }
  await appendEvent(after, 'envelope.updated', context.actor.id, draftDetail(draft))
  const result = { id: after.id }
  await commitEnvelope(env, before, after, context.actor, [
    ...(draft.originalSha256 === before.originalSha256 ? [] : [env.DB.prepare("DELETE FROM iw_blobs WHERE envelope_id=? AND kind='original'").bind(after.id), ...blobWrites(env.DB, after.id, 'original', bytes)]),
    env.DB.prepare(`DELETE FROM iw_access_codes WHERE envelope_id=?${accessCodes.some(code => code === 'keep') ? ` AND signer NOT IN (${accessCodes.flatMap((code, i) => code === 'keep' ? [i] : []).join(',')})` : ''}`).bind(after.id),
    ...await accessCodeWrites(env, after.id, accessCodes),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  await readBlob(env.DB, after.id, 'original', after.originalSha256)
  return result
}
