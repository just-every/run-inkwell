import { configurePayment } from './payment-authority'
import { parsePaymentRequirement, samePaymentRequirement, type PaymentRequirement } from './payment-requirement'
import { customEnvelopeFields, envelopeTags } from './envelope-metadata'
import { delegatedPlaces, validateDelegationGrants, validateActionDocuments, requireDelegationAuthority } from './delegation-grants'
import { providerChoice, requireProvider } from './provider-auth'
import { smsIdentity, smsReady } from './sms'
import { recipientRole, witnessRule, validateRoleFields, validateRecipientCount } from './recipient-roles'
import { validateDocumentAudience } from './document-visibility'
import { consumedUploadWrites, readDocuments, documentInputFields, documentFields as mapDocumentFields, documentWrites, stagedBlobWrites } from './documents'
import { envelopeDefaults } from './envelope-defaults'
import { normalizeRoutingRule, validateCopyRouting, validateRouting } from './routing'
import { fromBase64, blobWrites, readBlob } from './blobs'
import { parsePdf, validateFields, validatePdfText, validatePrefilledFields } from './pdf'
import { documentFields, readAnchors } from './document-fields'
import { applyPrefillPayload } from './prefill'
import { accessCodeHash, appendEvent, insist, now, object, sha256, text, type Actor, type Envelope, type Env, type Field, type Signer } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { chooseExpiry } from './expiry'
import { chooseReminders } from './reminders'
import { chooseCopies } from './completed-copies'
import { insistAccess } from './members'
import type { CommandContext } from './envelopes'
import { mailSuppressed } from './manual-invitations'
import { groupPlace, snapshotGroup } from './signing-groups'

/** PREP-009: what a prepared envelope holds, validated the same way when it is first saved and whenever its draft is
 * saved again: the PDF, title, recipients in routing order with any access code and private message, fields, expiry,
 * reminders, copy recipients, the paper option, and the invitation's subject and message. */
export type Draft = Pick<Envelope, 'tags' | 'customFields' | 'consumerDisclosure' | 'adoptionMethods' | 'part11' | 'documents' | 'freeForm' | 'title' | 'filename' | 'signers' | 'fields' | 'pageSizes' | 'originalSha256' | 'expiresAt' | 'allowPaper' | 'allowReassign' | 'reminders' | 'copies' | 'subject' | 'message'>
const optional = (value: unknown, label: string, max: number, oneLine = false) => { if (value === undefined || value === '') return undefined; const result = text(value, label, max); insist(!oneLine || !/[\r\n\t]/.test(result), `Use a single line for ${label}.`); return result }
/** `previous` is the draft being saved again: a recipient at the same place with the same email may keep their access
 * code (`keepAccessCode`), which is bound to that place. */
export async function readDraft(env: Env, input: Record<string, unknown>, base: string, previous?: Envelope, actor?: Actor, prepared?:{bytes:Uint8Array;documents:NonNullable<Envelope['documents']>;composition?:true}, savedMethods?: import('./model').AdoptionMethod[], savedDisclosure?: Envelope['consumerDisclosure'] | null, savedPayments?: readonly Pick<Signer,'payment'|'paymentAuthority'>[]) {
  const defaults = previous ? undefined : await envelopeDefaults(env)
  const title = text(input.title, 'a title'), filename = text(input.filename ?? (input.documents ? 'combined.pdf' : undefined), 'a filename', 240)
  insist(!/[\x00-\x1f/\\]/.test(filename) && filename.toLowerCase().endsWith('.pdf'), 'Choose a PDF filename.')
  insist(!/[\r\n\t]/.test(title), 'Use a single line for the envelope title.')
  const multiple = prepared?{...await parsePdf(prepared.bytes,2000),bytes:prepared.bytes,documents:structuredClone(prepared.documents),originals:undefined}:await readDocuments(env,input,actor,previous), bytes = multiple?.bytes ?? fromBase64(input.pdfBase64), { document, pageSizes } = multiple ?? await parsePdf(bytes)
  insist(Array.isArray(input.signers) && input.signers.length >= 1 && input.signers.length <= 100, 'Add 1–100 ordered recipients.')
  const accessCodes: (string | 'keep' | undefined)[] = []
  const groups = await Promise.all(input.signers.map(value => object(value).group === undefined ? undefined : snapshotGroup(env, object(value).group)))
  const signers: Signer[] = await Promise.all(input.signers.map(async(value, i) => {
    const raw = object(value)
    const chosen = previous?.signers[i]
    const inheritedLink = Boolean(previous ? chosen?.linkOnly : defaults?.authentication === 'link')
    const s = raw.linkOnly === undefined && raw.sms === undefined && raw.inPerson === undefined && raw.providerAuth === undefined ? { ...raw, linkOnly: !raw.unresolvedIdentity && inheritedLink } : raw, role = recipientRole(s.role), witnesses = witnessRule(s.witnesses, role), group = groups[i], order = s.order === undefined ? i + 1 : s.order
    // ROUTE-005: a group recipient, snapshotted now; no access code, in-person signing or mail-less links in v1.
    if (group) insist(s.name === undefined && s.email === undefined, 'Name either a person or a signing group for each recipient, not both.')
    insist(!group || ((s.accessCode === undefined || s.accessCode === '') && s.keepAccessCode !== true && s.inPerson !== true), 'Signing groups cannot use access codes or in-person signing.', 409)
    insist(!group || !mailSuppressed(env), 'Signing groups need mail: every member gets their own link and code by email. Set up mail first.', 409)
    insist(s.unresolvedIdentity === undefined || s.unresolvedIdentity === true, 'Leave a recipient open explicitly.'); const unresolved = s.unresolvedIdentity === true
    insist(!unresolved || !group && !s.sms && !s.linkOnly && !s.inPerson && !s.accessCode && !s.keepAccessCode && !s.name && !s.email, 'An open identity has no person, phone, group or secret yet; it uses email verification.')
    const email = unresolved ? '' : group ? groupPlace(group).email : text(s.email, 'the signer email', 254).toLowerCase()
    insist(Number.isInteger(order) && (order as number) >= 1 && (order as number) <= 100, 'Give each signer a whole-number routing order from 1 to 100.')
    insist(unresolved || group || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Provide a valid signer email.')
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
    insist(!group || role === 'signer', 'A signing group fills a signer role.')
    insist(!inPerson || role === 'signer', 'In-person recipients sign their own signature.')
    insist(!witnesses?.linkOnly || !mailSuppressed(env), 'Link-only witnesses need mail.')
    const inheritedPayment=previous?.signers[i]?.payment??savedPayments?.[i]?.payment,payment=parsePaymentRequirement(s.payment===undefined?inheritedPayment:s.payment)
    if(!samePaymentRequirement(payment,inheritedPayment)){insist(actor&&['owner','admin'].includes(actor.role),'Only an owner or admin can change a payment requirement.',403);insist(s.paymentConsent===true,'Explicitly authorize this payment requirement.')}
    insist(!payment||role==='signer','Payment belongs to a signer role.')
    const paymentAuthority=await configurePayment(env,actor,payment,inheritedPayment,previous?.signers[i]?.paymentAuthority??savedPayments?.[i]?.paymentAuthority)
    const provider = providerChoice({...s,inPerson}, previous?.signers[i]); requireProvider(env, provider.providerAuth)
    insist(provider.providerAuth !== 'voice' || s.phone || previous?.signers[i]?.phone, 'Enter a US phone number for voice verification.')
    const sms = smsIdentity({sms:s.sms,phone:s.phone,linkOnly:s.linkOnly,inPerson,group:s.group},previous?.signers[i])
    insist(!sms.sms || smsReady(env), 'SMS delivery is not configured. Ask the owner to configure Twilio.',503)
    return { ...(payment?{payment,paymentAuthority}:{}), ...provider, ...sms, ...(unresolved ? {unresolvedIdentity:true as const} : {}), ...(s.delegates === undefined ? {} : {delegates:delegatedPlaces(s.delegates)}), ...(role !== 'signer' ? { role } : {}), ...(witnesses ? { witnesses } : {}), ...(s.includeWhen===undefined?{}:{includeWhen:normalizeRoutingRule(s.includeWhen)}), ...(group ? groupPlace(group) : { name: unresolved ? '' : text(s.name, 'the signer name', 100), email }), order: order as number, ...(inPerson ? { inPerson: true } : {}), ...(code || keep ? { accessCode: true } : {}), ...(s.linkOnly ? { linkOnly: true } : {}), ...(message ? { message } : {}) }
  }))
  if(previous?.signers.some((signer,i)=>signer.payment&&!samePaymentRequirement(signer.payment,signers[i]?.payment)))insist(actor&&['owner','admin'].includes(actor.role),'Only an owner or admin can remove a payment requirement.',403)
  validateDelegationGrants(signers);requireDelegationAuthority(signers,actor)
  const addresses = signers.filter(s=>!s.unresolvedIdentity).flatMap(s => s.group ? s.group.members.map(m => m.email) : [s.email])
  const places = signers.filter(s=>!s.unresolvedIdentity).flatMap(s => s.group ? s.group.members.map(m => m.email) : [prepared?.composition || previous?.templates ? `${s.email}:${s.order}` : s.email])
  insist(new Set(places).size === places.length && !signers.some(s=>s.group?.members.some(m=>signers.some(other=>other!==s&&!other.group&&other.email===m.email))), 'Each ordered signer must use a different email, and nobody can sign both alone and in a group.')
  // PREP-007: with no fields given, the document's own text tags, the caller's anchors and its form fields are the fields;
  // a prefill map fills them by field ID or by the document's own field name.
  insist(input.fields === undefined || input.anchors === undefined, 'Give either fields or anchors to place them, not both.')
  insist(input.freeForm === undefined || typeof input.freeForm === 'boolean', 'Choose whether signers place their own fields.')
  const freeForm = input.freeForm === true
  insist(!freeForm || ((input.fields === undefined || Array.isArray(input.fields) && input.fields.length === 0) && input.anchors === undefined && input.prefill === undefined), 'Free-form envelopes have no sender-placed fields, anchors or prefilled values.')
  const carried = !freeForm && input.fields === undefined ? await documentFields(document, pageSizes, readAnchors(input.anchors)) : undefined
  for (const field of carried ?? []) insist(field.signer < signers.length, `The document places a field for recipient ${field.signer + 1} (${field.name}), but the envelope has ${signers.length}.`)
  const placed = carried ?? documentInputFields(input.fields,multiple?.documents)
  const fields = freeForm ? [] : validateFields(Array.isArray(placed) && placed.every(field => field && typeof field === 'object') ? applyPrefillPayload(placed as Field[], input.prefill, 'this envelope') : placed, signers.length, pageSizes.length, [], signers.flatMap((s,i)=>s.role && s.role!=='signer' && s.role!=='witness'?[i]:[])), copies = chooseCopies(input.copies, signers.flatMap(s => s.group ? s.group.members : [s]))
  validateRoleFields(signers, fields)
  validateRecipientCount(signers, copies.length)
  for (const s of signers) for (const w of s.witnesses?.named ?? []) insist(![...addresses,...copies.map(c=>c.email)].includes(w.email), 'A witness cannot be the signer or another recipient.')
  validateDocumentAudience(multiple?.documents,signers.length,copies.length,fields,(await envelopeDefaults(env)).hideDocumentsWithoutFields===true)
  validateActionDocuments(signers,multiple?.documents)
  mapDocumentFields(fields,multiple?.documents,signers.length,freeForm,signers.flatMap((s,i)=>s.role && s.role!=='signer' && s.role!=='witness'?[i]:[]))
  if(multiple)insist(signers.every((_,i)=>multiple.documents.some(d=>!d.visibleTo||d.visibleTo.signers.includes(i))),'Every signer needs at least one visible document. Free-form drafts have no fields: turn off the hide-without-fields default before preparing one.')
  validateRouting(signers, fields)
  validateCopyRouting(copies, fields)
  await validatePdfText([...signers, ...copies].flatMap(person=>person.includeWhen?[person.includeWhen.value]:[]))
  await validatePrefilledFields(fields)
  insist(input.allowPaperSigning === undefined || typeof input.allowPaperSigning === 'boolean', 'Choose whether recipients may sign on paper.')
  // ADMIN-004 / ROUTE-006: inherit only for new drafts; a saved draft keeps its choice unless explicitly changed.
  insist(input.allowReassignment === undefined || typeof input.allowReassignment === 'boolean', 'Choose whether recipients may reassign their signing.')
  insist(!previous?.part11 || input.allowPaperSigning !== true, 'Paper signing is unavailable in this unvalidated electronic profile.',409)
  const allowPaper = input.allowPaperSigning === true, allowReassign = input.allowReassignment === undefined ? Boolean(previous ? previous.allowReassign : defaults?.allowReassignment) : input.allowReassignment === true, reminders = chooseReminders(input.reminders === undefined ? defaults?.reminders : input.reminders)
  const subject = optional(input.subject, 'the email subject', 200, true), message = optional(input.message, 'the message', 2000)
  await validatePdfText([title, ...[...signers, ...copies].flatMap(s => [s.name, s.email]), ...signers.flatMap(s => s.group ? s.group.members.flatMap(m => [m.name, m.email]) : [])])
  const consumerDisclosure = previous ? previous.consumerDisclosure : savedDisclosure !== undefined ? savedDisclosure : defaults?.disclosureText ? { version: defaults.version, text: defaults.disclosureText, actor: defaults.actor!, at: defaults.at! } : undefined
  const accountMethods = defaults?.adoptionMethods ?? ['typed','drawn','uploaded']
  const adoptionMethods = previous ? previous.adoptionMethods ?? ['typed','drawn','uploaded'] : (savedMethods ?? accountMethods).filter(method => accountMethods.includes(method))
  insist(adoptionMethods.length > 0, 'This template and the account allow no common signature adoption method. An editor must prepare a new compatible template.',409)
  const draft: Draft = { tags:envelopeTags(input.tags??previous?.tags),customFields:customEnvelopeFields(input.customFields??previous?.customFields,previous?.customFields), ...(consumerDisclosure ? {consumerDisclosure:structuredClone(consumerDisclosure)} : {}), adoptionMethods: structuredClone(adoptionMethods) as import('./model').AdoptionMethod[], ...(previous?.part11?{part11:structuredClone(previous.part11)}:{}), ...(multiple?{documents:multiple.documents}:{}), ...(freeForm ? { freeForm: true } : {}), title, filename, signers, fields, pageSizes, originalSha256: await sha256(bytes), expiresAt: chooseExpiry(input.expiresAt, base, defaults?.expiryDays), ...(allowPaper ? { allowPaper } : {}), ...(allowReassign ? { allowReassign } : {}), ...(reminders ? { reminders } : {}), ...(copies.length ? { copies } : {}), ...(subject ? { subject } : {}), ...(message ? { message } : {}) }
  return { draft, bytes, accessCodes, originals:multiple?.originals }
}
/** The event detail a saved draft records (prepared or updated). */
export const draftDetail = (d: Draft) => ({ tags:d.tags,customFields:d.customFields,consumerDisclosure: d.consumerDisclosure, adoptionMethods: d.adoptionMethods, ...(d.part11?{part11:d.part11}:{}), ...(d.documents?{documents:d.documents}:{}), ...(d.freeForm ? { freeForm: true } : {}), originalSha256: d.originalSha256, orderedSigners: d.signers, fields: d.fields, expiresAt: d.expiresAt, allowPaperSigning: Boolean(d.allowPaper), ...(d.allowReassign ? { allowReassignment: true } : {}), ...(d.reminders ? { reminders: d.reminders } : {}), ...(d.copies ? { copies: d.copies } : {}), ...(d.subject ? { subject: d.subject } : {}), ...(d.message ? { message: d.message } : {}) })
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
  const { draft, bytes, accessCodes, originals } = await readDraft(env, input, now(), before, context.actor)
  const after: Envelope = { folderId:before.folderId,id: before.id, version: before.version, status: 'prepared', createdAt: before.createdAt, createdBy: before.createdBy, ...(before.sendHold ? { sendHold: before.sendHold } : {}), ...(before.template ? { template: before.template } : {}), ...(before.templates ? { templates: structuredClone(before.templates) } : {}), ...(before.approvalRules ? { approvalRules: structuredClone(before.approvalRules) } : {}), ...(before.copiedFrom ? { copiedFrom: before.copiedFrom } : {}), ...(before.approvalRule ? { approvalRule: before.approvalRule } : {}), ...(before.internalApproval ? { internalApproval: before.internalApproval } : {}), events: structuredClone(before.events), ...(before.supplements ? { supplements: structuredClone(before.supplements) } : {}), ...draft }
  await appendEvent(after, 'envelope.updated', context.actor.id, draftDetail(draft))
  const result = { id: after.id }
  await commitEnvelope(env, before, after, context.actor, [
    ...(draft.originalSha256 === before.originalSha256 ? [] : [env.DB.prepare("DELETE FROM iw_blobs WHERE envelope_id=? AND kind='original'").bind(after.id), ...await stagedBlobWrites(env, after.id, 'original', bytes)]),
    env.DB.prepare("DELETE FROM iw_blobs WHERE envelope_id=? AND kind GLOB 'document-[0-9]*'").bind(after.id), ...await documentWrites(env,after.id,originals),...consumedUploadWrites(env,input),
    env.DB.prepare(`DELETE FROM iw_access_codes WHERE envelope_id=?${accessCodes.some(code => code === 'keep') ? ` AND signer NOT IN (${accessCodes.flatMap((code, i) => code === 'keep' ? [i] : []).join(',')})` : ''}`).bind(after.id),
    ...await accessCodeWrites(env, after.id, accessCodes),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  await readBlob(env.DB, after.id, 'original', after.originalSha256)
  return result
}
