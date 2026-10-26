import { samePaymentRequirement } from './payment-requirement'
import { apiCommandActor } from './api-command'
import { providerChoice, requireProvider } from './provider-auth'
import { smsIdentity } from './sms'
import { recipientRole, witnessRule, validateRoleFields, validateRecipientCount } from './recipient-roles'
import { remapCopyAudience } from './document-visibility'
import { documentFields, documentInputFields } from './documents'
import { advanceAfterSigning } from './signing'
import { guardRoutingCorrection, normalizeRoutingRule, resolveRouting, routeSettled, validateCopyRouting, validateRouting } from './routing'
// DELIV-006: correct an envelope in flight. Before a recipient acts, whoever may change the envelope (its sender, an edit
// share or an admin: ADMIN-001) changes that recipient's name, email, routing order or private message, adds or removes
// later recipients and copy recipients, and edits the subject, message, expiry and the fields of recipients who have not
// acted. Corrections are the only way a sent envelope changes (SEND-001): each change is audited with its before and
// after values, a corrected or removed recipient's old link, code and session stop working, and a recipient who has
// signed, declined or uploaded a paper scan, with their fields and values, can never change. Exact semantics:
// - "later" means a recipient who has not signed may sit at any routing order no lower than the highest order of a
//   recipient who has signed; at least one recipient who has not signed always remains (void the envelope instead);
// - a removed recipient keeps their place in the record, marked removed, and never signs, is reminded or gets a copy;
// - a recipient whose turn it is after the correction and who was corrected, added or newly reached gets a new
//   invitation at once on a new link; a recipient left unchanged keeps their link;
// - a changed subject or message applies to invitations sent from then on; the document's bytes never change.
import { placeRows, placeRowsSql, accessCodeHash, active, appendEvent, canonical, currentSigners, insist, now, object, routingOrder, secret, sha256, text, type Envelope, type Env, type Field, type Signer } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { dispatchMail, invitationWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { validateFields, validatePdfText } from './pdf'
import { chooseExpiry } from './expiry'
import { chooseCopies } from './completed-copies'
import type { CommandContext } from './envelopes'
import { sealLink } from './links'
import { memberLinkWrites } from './signing-groups'

const maxPlaces = 999, maxActive = 100
/** A recipient who has acted (signed, declined, or uploaded a paper scan awaiting review) or was removed: fixed for good. */
const settled = (s: Signer) => Boolean(s.signedAt || s.completedAt || s.declinedAt || s.paper?.status === 'pending' || s.removedAt || s.routeResult?.state === 'skipped')
const identity = (s: Signer, place: number) => ({ ...(s.role?{role:s.role}:{}), ...(s.delegates?{delegates:s.delegates}:{}), ...(s.unresolvedIdentity?{unresolvedIdentity:true}:{}), ...(s.witnesses?{witnesses:s.witnesses}:{}), ...(s.includeWhen?{includeWhen:s.includeWhen}:{}), providerAuth:s.providerAuth, name: s.name, email: s.email, ...(s.phone ? { phone: s.phone } : {}), ...(s.sms ? { sms: true } : {}), order: s.order ?? place + 1, ...(s.inPerson ? { inPerson: true } : {}), ...(s.linkOnly ? { linkOnly: true } : {}), ...(s.message ? { message: s.message } : {}) })
/** An optional text: absent keeps the current value, an empty string clears it. */
function edit(value: unknown, current: string | undefined, label: string, max: number, oneLine = false) {
  if (value === undefined) return current
  if (value === '') return undefined
  const result = text(value, label, max)
  insist(!oneLine || !/[\r\n\t]/.test(result), `Use a single line for ${label}.`)
  return result
}

/** One recipient as the correction names them. A recipient whose name or email changes is a new person at that place:
 * nothing the previous person agreed to carries over. */
function readRecipient(env: Env, value: unknown, place: number, previous?: Signer): { signer: Signer; code?: string } {
  const s = object(value), role = recipientRole(s.role ?? previous?.role), witnesses = witnessRule(s.witnesses ?? previous?.witnesses, role), email = text(s.email, 'the signer email', 254).toLowerCase(), order = s.order === undefined ? previous?.order ?? place + 1 : s.order
  insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Provide a valid signer email.')
  insist(Number.isInteger(order) && (order as number) >= 1 && (order as number) <= 100, 'Give each signer a whole-number routing order from 1 to 100.')
  const code = s.accessCode === undefined || s.accessCode === '' ? undefined : text(s.accessCode, 'an access code', 32)
  insist(code === undefined || /^\S{4,32}$/.test(code), 'Use an access code of 4–32 characters with no spaces.')
  const name = text(s.name, 'the signer name', 100), message = edit(s.message, previous?.message, 'the private message', 1000)
  insist(!previous || canonical(role) === canonical(previous.role ?? 'signer') && canonical(witnesses ?? null) === canonical(previous.witnesses ?? null), 'A sent recipient’s role and witness requirement cannot change.',409)
  insist(!previous?.payment || (previous.name===name&&previous.email===email&&samePaymentRequirement(s.payment===undefined?previous.payment:s.payment,previous.payment)), 'A payment obligation stays with its authorized payer. Void and prepare a new envelope to replace that payer.',409)
  insist(previous?.payment || s.payment===undefined || s.payment===null,'A sent recipient cannot acquire a new payment obligation.',409)
  const provider = providerChoice({...s,inPerson:previous?.inPerson ?? s.inPerson}, previous); requireProvider(env, provider.providerAuth)
  const mobile = smsIdentity({ ...s, inPerson: previous?.inPerson ?? s.inPerson }, previous)
  const same = previous && previous.name === name && previous.email === email && previous.phone === mobile.phone && Boolean(previous.sms) === Boolean(mobile.sms) && previous.providerAuth === provider.providerAuth
  const { message: _, linkOnly: __, providerAuth: _provider, includeWhen: _rule, ...kept } = same ? previous : {} as Signer
  insist(s.linkOnly === undefined || typeof s.linkOnly === 'boolean', 'Choose email code or link only for each recipient.')
  insist(s.inPerson === undefined || typeof s.inPerson === 'boolean', 'Choose whether each recipient signs in person.')
  // A correction keeps the approved signing method even when the recipient's name or email changes.
  // Moving between hosted and remote signing requires a newly prepared envelope and its approval.
  insist(!previous || s.inPerson === undefined || s.inPerson === Boolean(previous.inPerson), 'A sent recipient’s signing method cannot change. Prepare and approve a new envelope to change between in-person and remote signing.', 409)
  const includeWhen = s.includeWhen === undefined ? previous?.includeWhen : normalizeRoutingRule(s.includeWhen)
  const inPerson = previous ? previous.inPerson : s.inPerson === true
  return { signer: { ...kept, ...provider, ...mobile, ...(previous?.delegates?{delegates:previous.delegates}:{}), ...(role!=='signer'?{role}:{}), ...(witnesses?{witnesses}:{}), ...(includeWhen?{includeWhen}:{}), name, email, order: order as number, ...(inPerson ? { inPerson: true } : {}), ...(s.linkOnly ? { linkOnly: true } : {}), ...(message ? { message } : {}), ...(code || previous?.accessCode ? { accessCode: true } : {}) }, code }
}

export async function correctEnvelope(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  active(before)
  const after = structuredClone(before), at = now(), codes = new Map<number, string>()
  const signedFixed = (i: number) => `${before.signers[i].name} has already ${before.signers[i].routeResult?.state === 'skipped' ? 'been skipped' : before.signers[i].removedAt ? 'been removed' : before.signers[i].declinedAt ? 'declined' : before.signers[i].paper?.status === 'pending' ? 'signed on paper' : 'signed'}; their details and fields cannot change.`
  if (input.signers !== undefined) {
    insist(Array.isArray(input.signers) && input.signers.length >= before.signers.length && input.signers.length <= maxPlaces, `Keep every recipient in their place (remove one with "remove") and add at most ${maxPlaces - before.signers.length} more.`)
    after.signers = input.signers.map((value, i) => {
      const previous = before.signers[i], entry = object(value)
      insist(entry.delegates === undefined || canonical(entry.delegates) === canonical(previous?.delegates), 'Sent delegation grants cannot change.',409)
      if(previous?.unresolvedIdentity && entry.unresolvedIdentity === true) { insist(!entry.name && !entry.email && !entry.phone && !entry.sms && !entry.remove && (entry.order??previous.order)===previous.order, 'Keep an open identity unchanged or name its person.',409); return previous }
      if (previous?.witnessFor!==undefined) {
        insist(previous.removedAt ? entry.remove===true : entry.remove!==true&&entry.name===previous.name&&entry.email===previous.email&&(entry.order??previous.order)===previous.order&&Boolean(entry.linkOnly)===Boolean(previous.linkOnly)&&!entry.inPerson&&entry.accessCode===undefined&&canonical(entry.includeWhen??null)===canonical(previous.includeWhen??null)&&(entry.message??'')===(previous.message??'')&&(entry.role??'witness')==='witness', 'Witnesses are changed only by their signer’s nomination.',409)
        return previous
      }
      if (previous && settled(previous)) {
        insist(previous.removedAt ? entry.remove === true : entry.remove !== true && entry.accessCode === undefined && canonical(identity(readRecipient(env, value, i, previous).signer, i)) === canonical(identity(previous, i)), signedFixed(i), 409)
        return previous
      }
      if (entry.remove === true) { insist(!previous?.payment,'A sent payment obligation cannot be removed. Void this envelope instead.',409); insist(previous, 'Only a recipient already on the envelope can be removed.'); return { ...previous, removedAt: at } }
      // ROUTE-005: a signing group keeps the members snapshotted when its draft was saved; it stays as it is or is removed.
      if (previous?.group) { insist(entry.group === previous.group.id && Object.keys(entry).every(k => k === 'group'), `${previous.group.name} is a signing group: keep it as it is ({"group": "${previous.group.id}"}) or remove it.`, 409); return previous }
      insist(entry.group === undefined, 'A correction cannot add a signing group. Prepare a new envelope instead.', 409)
      const { signer, code } = readRecipient(env, value, i, previous)
      if (code) codes.set(i, code)
      return signer
    })
  }
  const live = after.signers.flatMap((s, i) => s.removedAt ? [] : [i]), open = live.filter(i => !routeSettled(after.signers[i]))
  insist(live.length <= maxActive, `An envelope has at most ${maxActive} signers.`)
  insist(open.length, 'Keep at least one recipient who has not signed, or void the envelope instead.', 409)
  insist(new Set(live.filter(i=>!after.signers[i].unresolvedIdentity).map(i => after.templates ? `${after.signers[i].email}:${routingOrder(after,i)}` : after.signers[i].email)).size === live.filter(i=>!after.signers[i].unresolvedIdentity).length, 'Each ordered signer must use a different email.')
  const highestSigned = Math.max(0, ...live.filter(i => after.signers[i].signedAt||after.signers[i].completedAt).map(i => routingOrder(after, i)))
  for (const i of open) insist(routingOrder(after, i) >= highestSigned, `${after.signers[i].name} can only be placed at routing order ${highestSigned} or later: recipients there have already signed.`, 409)

  const removedPlaces = after.signers.flatMap((s, i) => s.removedAt ? [i] : [])
  const remainingFields = before.fields.filter(f => !removedPlaces.includes(f.signer))
  insist(!before.freeForm || input.fields === undefined || canonical(input.fields) === canonical(remainingFields), 'Corrections cannot add or change sender fields on a free-form envelope.', 409)
  after.fields = before.freeForm ? remainingFields : validateFields(documentInputFields(input.fields === undefined ? before.fields.filter(f => !removedPlaces.includes(f.signer)) : input.fields, before.documents), after.signers.length, before.pageSizes.length, removedPlaces,after.signers.flatMap((s,i)=>s.role && s.role!=='signer' && s.role!=='witness'?[i]:[]))
  const fixedFields = (fields: Field[]) => canonical(fields.filter(f => before.signers[f.signer]?.witnessFor!==undefined || settled(before.signers[f.signer] ?? {} as Signer) && !before.signers[f.signer].removedAt).sort((a, b) => a.id.localeCompare(b.id)))
  insist(fixedFields(after.fields) === fixedFields(before.fields), 'A field of a recipient who has already signed cannot be changed.', 409)

  documentFields(after.fields,after.documents,after.signers.length,Boolean(after.freeForm),[...removedPlaces,...after.signers.flatMap((s,i)=>s.role && s.role!=='signer' && s.role!=='witness'?[i]:[])],after.signers)
  validateRouting(after.signers,after.fields)
  guardRoutingCorrection(before,after)

  const copies = chooseCopies(input.copies === undefined ? before.copies : input.copies, live.map(i => after.signers[i]))
  validateCopyRouting(copies, after.fields)
  if (copies.length) after.copies = copies; else delete after.copies
  validateRecipientCount(after.signers, after.copies?.length??0)
  validateRoleFields(after.signers,after.fields)
  remapCopyAudience(after,before.copies??[])
  const subject = edit(input.subject, before.subject, 'the email subject', 200, true), message = edit(input.message, before.message, 'the message', 2000)
  if (subject) after.subject = subject; else delete after.subject
  if (message) after.message = message; else delete after.message
  if (input.expiresAt !== undefined) after.expiresAt = chooseExpiry(input.expiresAt, at)
  await validatePdfText([...after.signers.flatMap(s => [s.name, s.email, ...(s.includeWhen?[s.includeWhen.value]:[])]), ...(after.copies ?? []).flatMap(c => [c.name, c.email, ...(c.includeWhen ? [c.includeWhen.value] : [])]), ...after.fields.flatMap(field => field.prefill ? [field.prefill.value] : [])])

  // The audit trail: one event per recipient change and one for the envelope's own settings, each with before and after.
  const writes: D1PreparedStatement[] = [], rotated = new Set<number>()
  for (const [i, s] of after.signers.entries()) {
    const previous = before.signers[i]
    if (!previous) { await appendEvent(after, 'signer.added', context.actor.id, { signer: i, after: identity(s, i), accessCode: Boolean(s.accessCode) }); continue }
    if (s.removedAt && !previous.removedAt) { await appendEvent(after, 'signer.removed', context.actor.id, { signer: i, before: identity(previous, i) }); rotated.add(i); continue }
    if (canonical(identity(s, i)) !== canonical(identity(previous, i)) || codes.has(i)) {
      await appendEvent(after, 'signer.corrected', context.actor.id, { signer: i, before: identity(previous, i), after: identity(s, i), ...(codes.has(i) ? { accessCodeReplaced: true } : {}) })
      // IDV-001: a changed authentication method is a new link, like a new access code.
      if (s.name !== previous.name || s.email !== previous.email || codes.has(i) || Boolean(s.linkOnly) !== Boolean(previous.linkOnly) || s.phone !== previous.phone || Boolean(s.sms) !== Boolean(previous.sms) || s.providerAuth !== previous.providerAuth) rotated.add(i)
    }
  }
  if(canonical(before.documents??null)!==canonical(after.documents??null))await appendEvent(after,'document.audience_updated',context.actor.id,{before:before.documents,after:after.documents})
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const key of ['subject', 'message', 'expiresAt', 'copies', 'fields'] as const) if (canonical(before[key] ?? null) !== canonical(after[key] ?? null)) changes[key] = { before: before[key] ?? null, after: after[key] ?? null }
  if (Object.keys(changes).length) await appendEvent(after, 'envelope.corrected', context.actor.id, { changes })
  insist(after.events.length > before.events.length, 'Nothing to correct: change a recipient, a field, the messages or the expiry.', 409)

  await resolveRouting(after,at)

  // Links: a corrected or removed recipient's link, code, session and saved entries stop working; whoever's turn it now
  // is and was corrected, added or newly reached gets a fresh link and invitation.
  const wasCurrent = currentSigners(before), nowCurrent = currentSigners(after), mail = !mailSuppressed(env)
  for (const [i] of after.signers.entries()) {
    const added = !before.signers[i], invite = nowCurrent.includes(i) && (added || rotated.has(i) || !wasCurrent.includes(i))
    if (!added && !rotated.has(i) && !invite) continue
    if (after.signers[i].group) { if (after.signers[i].removedAt) writes.push(env.DB.prepare(`UPDATE iw_signers SET link_sealed=NULL,code_hash=NULL,session_hash=NULL,progress=NULL WHERE envelope_id=? AND ${placeRowsSql}`).bind(after.id, ...placeRows(i))); if (invite) writes.push(...await memberLinkWrites(env, after, i, false, mail)); continue }
    const token = secret()
    const sealed = after.signers[i].removedAt || after.signers[i].inPerson ? null : await sealLink(env, after.id, i, token)
    writes.push(added ? env.DB.prepare('INSERT INTO iw_signers(envelope_id,signer,token_hash,link_sealed) VALUES(?,?,?,?)').bind(after.id, i, await sha256(token), sealed)
      : env.DB.prepare('UPDATE iw_signers SET token_hash=?,link_sealed=?,code_hash=NULL,code_expires=NULL,code_attempts=0,code_sent_at=NULL,session_hash=NULL,session_expires=NULL,progress=NULL WHERE envelope_id=? AND signer=?').bind(await sha256(token), sealed, after.id, i))
    if (rotated.has(i)) writes.push(env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id, i))
    if (after.signers[i].removedAt) writes.push(env.DB.prepare('DELETE FROM iw_access_codes WHERE envelope_id=? AND signer=?').bind(after.id, i))
    if (invite && mail && !after.signers[i].inPerson) writes.push(invitationWrite(env, after, i, token))
  }
  for (const [i, code] of codes) writes.push(env.DB.prepare('DELETE FROM iw_access_codes WHERE envelope_id=? AND signer=?').bind(after.id, i), env.DB.prepare('INSERT INTO iw_access_codes(envelope_id,signer,code_hash) VALUES(?,?,?)').bind(after.id, i, await accessCodeHash(env, after.id, i, code)))
  const invited = nowCurrent.filter(i => !after.signers[i].inPerson && (!wasCurrent.includes(i) || rotated.has(i) || !before.signers[i])).map(i => after.signers[i].email)
  if (after.signers.every(routeSettled)) writes.push(...await advanceAfterSigning(env,after,after.signers.findLastIndex(s=>s.signedAt||s.completedAt)))
  const result = { id: after.id, invited, emailSent: mail && invited.length > 0 }
  await commitEnvelope(env, before, after, context.actor, [...writes, commandWrite(env.DB, apiCommandActor(context.actor), context.commandId, context.fingerprint, result)])
  await dispatchMail(env, after.id)
  return result
}
