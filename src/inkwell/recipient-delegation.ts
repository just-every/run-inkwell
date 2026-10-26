import { appendEvent, canonical, currentSigners, insist, now, object, placeRows, placeRowsSql, recipientSettled, routingOrder, secret, sha256, text, type Envelope, type Env, type Field, type Signer } from './model'
import { delegatedPlaces } from './delegation-grants'
import { canSeeDocument, recipientPages } from './document-visibility'
import { documentFields, documentInputFields } from './documents'
import { validateFields, validatePdfText, validatePrefilledFields } from './pdf'
import { validateRecipientCount, validateRoleFields } from './recipient-roles'
import { guardRoutingCorrection, validateCopyRouting, validateRouting } from './routing'
import { accessGate, advanceAfterSigning, disclosureGate, liveGuard, recipientOf, sessionGuard, turn, type SigningContext } from './signing'
import { requireSupplements } from './supplements'
import { smsIdentity } from './sms'
import { dispatchMail } from './mail'
import { commandWrite, commitEnvelope, previousCommand } from './storage'

type DelegationRole = 'specify_recipients' | 'editor'
const roleOf = (person: Signer) => person.role as string | undefined
const withoutDocument = ({ document: _document, documentPage: _documentPage, ...field }: Field) => field
function targetsOf(envelope: Envelope, index: number) {
  const person = envelope.signers[index]
  insist(person && ['specify_recipients', 'editor'].includes(roleOf(person) ?? ''), 'This recipient has no delegated editing action.', 403)
  const current = currentSigners(envelope), order = routingOrder(envelope, index), places = delegatedPlaces(person.delegates)
  return places.filter(place => {
    const target = envelope.signers[place]
    insist(Number.isInteger(place) && place >= 0 && target, 'The sender’s delegated recipient scope is invalid.', 409)
    return routingOrder(envelope, place) > order && !recipientSettled(target) && !target.signedAt && !target.completedAt && !target.declinedAt && !target.activatedAt && !current.includes(place) && target.paper?.status !== 'pending' && target.witnessFor === undefined
  })
}
function sharedPage(envelope: Envelope, editor: number, target: number, page: number) {
  if (!Number.isInteger(page) || page < 0 || page >= envelope.pageSizes.length) return false
  if (!envelope.documents) return true
  const document = envelope.documents.findIndex(d => page >= d.pageStart && page < d.pageStart + d.pages)
  return document >= 0 && canSeeDocument(envelope, document, editor) && canSeeDocument(envelope, document, target)
}
const identity = (person: Signer) => ({ name: person.name, email: person.email, role: person.role, order: person.order, linkOnly: person.linkOnly, inPerson: person.inPerson, accessCode: person.accessCode, witnesses: person.witnesses ? structuredClone(person.witnesses) : undefined, includeWhen: person.includeWhen ? structuredClone(person.includeWhen) : undefined, delegates: person.delegates ? [...person.delegates] : undefined, ...(person.phone ? { phone: person.phone } : {}), ...(person.sms ? { sms: true } : {}), ...(person.message ? { message: person.message } : {}), ...(person.unresolvedIdentity ? { unresolvedIdentity: true } : {}) })

/** The caller exposes this projection only after verification, access-code and disclosure gates. No account or hidden-party data. */
export function delegationView(envelope: Envelope, index: number) {
  const editor = roleOf(envelope.signers[index]) === 'editor', canonicalPages = recipientPages(envelope, index)
  const places = targetsOf(envelope, index).filter(place => editor || (envelope.signers[place]).unresolvedIdentity)
  return { targets: places.map(place => {
    const person = envelope.signers[place]
    return { place, name: person.name, email: person.email, order: routingOrder(envelope, place), role: roleOf(person) ?? 'signer', unresolved: Boolean(person.unresolvedIdentity),
      ...(editor ? { message: person.message ?? '', visiblePages: canonicalPages.flatMap((page, local) => sharedPage(envelope, index, place, page) ? [local] : []) } : {}),
      ...(person.sms ? { sms: true, phone: person.phone } : {}) }
  }), fields: editor ? envelope.fields.filter(field => places.includes(field.signer) && sharedPage(envelope, index, field.signer, field.page)).map(field => ({ ...withoutDocument(field), page: canonicalPages.indexOf(field.page) })) : [],
    canonicalPages, pageSizes: canonicalPages.map(page => envelope.pageSizes[page]) }
}

function checkFields(before: Envelope, after: Envelope, index: number, places: number[], value: unknown) {
  insist(Array.isArray(value), 'Supply the delegated editor fields.')
  const original = before.fields.filter(field => places.includes(field.signer) && sharedPage(before, index, field.signer, field.page))
  const originalIds = new Set(original.map(field => field.id)), allIds = new Set(before.fields.map(field => field.id))
  const requested = documentInputFields(value, before.documents) as Field[]
  for (const raw of requested) {
    const field = object(raw)
    insist(Number.isInteger(field.signer) && places.includes(field.signer as number) && sharedPage(before, index, field.signer as number, field.page as number), 'Edit fields only for granted later recipients on documents visible to both of you.', 403)
    insist(!allIds.has(field.id as string) || originalIds.has(field.id as string), 'A field outside your delegated scope cannot be changed or replaced.', 403)
  }
  insist(new Set(requested.map(field => field.id)).size === requested.length, 'Each delegated field needs a unique ID.')
  const updates = new Map(requested.map(field => [field.id, field]))
  insist(original.every(field => updates.has(field.id)), 'Delegated editing cannot remove existing fields.', 403)
  const combined = before.fields.map(field => updates.get(field.id) ?? field).concat(requested.filter(field => !allIds.has(field.id)))
  const removed = after.signers.flatMap((person, place) => person.removedAt ? [place] : [])
  const noSignature = after.signers.flatMap((person, place) => !['signer', 'witness'].includes(roleOf(person) ?? 'signer') ? [place] : [])
  after.fields = validateFields(combined, after.signers.length, before.pageSizes.length, removed, before.freeForm ? after.signers.map((_, place) => place) : noSignature)
  documentFields(after.fields, after.documents, after.signers.length, Boolean(before.freeForm), [...removed, ...noSignature], after.signers)
  for (const field of before.fields.filter(field => !originalIds.has(field.id))) insist(canonical(after.fields.find(next => next.id === field.id)) === canonical(field), 'Fields outside the delegated scope must stay unchanged.', 403)
  insist(!before.freeForm || canonical(after.fields) === canonical(before.fields), 'Free-form signers place their own fields; delegated editors may change only their recipient identities and messages.', 409)
  for (const field of after.fields.filter(field => updates.has(field.id))) {
    const previous = before.fields.find(original => original.id === field.id)
    if (previous && canonical(withoutDocument(previous)) === canonical(withoutDocument(field))) continue
    const dependencies = [field.condition?.field, field.requiredWhen?.field, ...(field.calculation?.fields ?? [])].filter((id): id is string => Boolean(id))
    insist(dependencies.every(id => after.fields.some(source => source.id === id && places.includes(source.signer) && sharedPage(after, index, source.signer, source.page))), 'An edited field cannot depend on a field outside your delegated document scope.', 403)
  }
  validateRoleFields(after.signers, after.fields); validateRecipientCount(after.signers, after.copies?.length ?? 0)
  validateRouting(after.signers, after.fields); validateCopyRouting(after.copies ?? [], after.fields); guardRoutingCorrection(before, after)
  return requested
}

/** Recipient authority is its live, authenticated routing place and the sender’s explicit grants—not an account Actor. */
export async function completeDelegation(env: Env, context: SigningContext, input: Record<string, unknown>, role: DelegationRole) {
  insist(context.verified, 'Verify your invitation before completing this action.', 401)
  const before = context.envelope, index = context.recipient.signer, person = before.signers[index]
  insist(roleOf(person) === role, 'Use only the action assigned to your recipient role.', 403)
  const keys = ['recipients', 'consent', 'commandId', ...(role === 'editor' ? ['fields'] : [])]
  insist(Object.keys(input).every(key => keys.includes(key)), 'Only delegated recipient identities, private messages and editor fields can be changed.', 403)
  const commandId = text(input.commandId, 'a command ID', 100), fingerprint = await sha256(canonical({ role, recipients: input.recipients, fields: input.fields, consent: input.consent })), key = `recipient:${before.id}:${context.recipient.row}`
  const previous = await previousCommand(env.DB, key, commandId, fingerprint)
  if (previous) { await dispatchMail(env, before.id); return previous }
  turn(context); accessGate(context); disclosureGate(recipientOf(context), 'passing on this envelope', context.envelope.consumerDisclosure); requireSupplements(before, index, context.recipient.member)
  insist(input.consent === true, 'Review and explicitly confirm your delegated action.')
  const places = targetsOf(before, index), after = structuredClone(before), at = now(), actor = `signer:${index + 1}`, writes: D1PreparedStatement[] = []
  insist(Array.isArray(input.recipients) && input.recipients.length <= places.length, 'Supply only the later recipients the sender delegated to you.')
  const seen = new Set<number>()
  for (const value of input.recipients) {
    const entry = object(value), place = entry.place as number, allowed = ['place', 'name', 'email', ...(role === 'editor' ? ['phone', 'message'] : [])]
    insist(Object.keys(entry).every(key => allowed.includes(key)) && Number.isInteger(place) && places.includes(place) && !seen.has(place), 'Each change must name one granted, unactivated later recipient.', 403)
    seen.add(place)
    const original = before.signers[place]
    insist(role === 'editor' || original.unresolvedIdentity === true && !original.sms && !original.phone && !original.linkOnly && !original.inPerson && !original.accessCode && !original.group, 'This naming action can fill only sender-open email identities.', 403)
    const name = text(entry.name, 'the recipient name', 100), email = text(entry.email, 'the recipient email', 254).toLowerCase()
    insist(!/[\r\n\t]/.test(name) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Supply a real name and a valid recipient email.')
    const renamed = name !== original.name || email !== original.email
    insist(!original.payment||!renamed,'A payment requirement stays with its authorized payer. Ask the sender to prepare a new envelope.',409)
    insist(!original.group || !renamed && entry.phone === undefined, 'A signing group’s snapshotted identity cannot be changed by a recipient.', 403)
    insist(!original.sms || !renamed || entry.phone !== undefined && entry.phone !== '', 'Supply this recipient’s mobile number explicitly when changing their SMS identity.')
    const mobile = smsIdentity({ sms: Boolean(original.sms), phone: entry.phone, linkOnly: original.linkOnly, inPerson: original.inPerson, ...(original.group ? { group: original.group } : {}) }, original)
    const changedIdentity = renamed || mobile.phone !== original.phone
    const changed: Signer = { ...original, name, email, ...mobile }
    delete changed.unresolvedIdentity
    if (!mobile.phone) delete changed.phone
    if (role === 'editor' && entry.message !== undefined) { insist(typeof entry.message === 'string' && entry.message.length <= 1000, 'Keep a private message to 1000 characters.'); if (entry.message.trim()) changed.message = text(entry.message, 'the private message', 1000); else delete changed.message }
    if (changedIdentity) {
      delete changed.disclosure; delete changed.adoption; delete changed.initialsAdoption; delete changed.signingTimeZone; delete changed.part11; delete changed.hostedSender; delete changed.viewedDocuments
      writes.push(env.DB.prepare(`UPDATE iw_signers SET token_hash=?,link_sealed=NULL,code_hash=NULL,code_expires=NULL,code_attempts=0,code_sent_at=NULL,code_generation=code_generation+1,session_hash=NULL,session_expires=NULL,progress=NULL WHERE envelope_id=? AND ${placeRowsSql}`).bind(await sha256(secret()), after.id, ...placeRows(place)),
        env.DB.prepare('UPDATE iw_access_codes SET passed_token=NULL,attempts=0 WHERE envelope_id=? AND signer=?').bind(after.id, place),
        env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id, place),
        env.DB.prepare("UPDATE iw_sms SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id, place))
    }
    after.signers[place] = changed
    if (canonical(identity(original)) !== canonical(identity(changed))) await appendEvent(after, 'signer.corrected', actor, { signer: place, before: identity(original), after: identity(changed), byRecipient: index, ...context.client }, at)
  }
  if (role === 'specify_recipients') insist(places.every(place => !(after.signers[place]).unresolvedIdentity), 'Name every unresolved recipient delegated to you before continuing.')
  const parties = after.signers.flatMap((s, place) => s.removedAt || s.unresolvedIdentity ? [] : s.group ? s.group.members.map(member => ({ email: member.email.toLowerCase(), order: routingOrder(after, place), group: true })) : [{ email: s.email.toLowerCase(), order: routingOrder(after, place), group: false }])
  const recipientKeys = parties.map(party => after.templates && !party.group ? canonical([party.email, party.order]) : party.email)
  const copies = (after.copies ?? []).map(copy => copy.email.toLowerCase())
  insist(new Set(recipientKeys).size === recipientKeys.length && parties.every((party, i) => !party.group || parties.every((other, j) => i === j || party.email !== other.email)) && new Set(copies).size === copies.length && copies.every(email => !parties.some(party => party.email === email)), 'Use distinct recipient emails; composed recipients may share an email only at different orders, and copies must always be distinct.')
  const edited = role === 'editor' ? checkFields(before, after, index, places, input.fields) : []
  await validatePdfText([...seen].flatMap(place => { const s = after.signers[place]; return [s.name, s.email, s.message ?? ''] }).concat(edited.map(field => field.label)))
  if (role === 'editor') await validatePrefilledFields(edited)
  if (canonical(before.fields) !== canonical(after.fields)) await appendEvent(after, 'envelope.corrected', actor, { byRecipient: index, changes: { fields: { before: before.fields, after: after.fields } }, ...context.client }, at)
  after.signers[index] = { ...after.signers[index], completedAt: at }
  await appendEvent(after, role === 'editor' ? 'recipient.edited' : 'recipient.specified', actor, { signer: index, role, email: person.email, consent: true, recipients: [...seen], ...context.client }, at)
  writes.push(...await advanceAfterSigning(env, after, index))
  const result = { id: after.id, status: after.status, completedAt: at }
  await commitEnvelope(env, before, after, null, [...writes, commandWrite(env.DB, key, commandId, fingerprint, result)], [liveGuard(context), sessionGuard(context)])
  await dispatchMail(env, after.id)
  return result
}
