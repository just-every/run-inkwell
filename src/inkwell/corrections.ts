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
import { accessCodeHash, active, appendEvent, canonical, currentSigners, insist, now, object, routingOrder, secret, sha256, text, type Envelope, type Env, type Field, type Signer } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { dispatchMail, invitationWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { validateFields, validatePdfText } from './pdf'
import { chooseExpiry } from './expiry'
import { chooseCopies } from './completed-copies'
import type { CommandContext } from './envelopes'
import { sealLink } from './links'

const maxPlaces = 10, maxActive = 5
/** A recipient who has acted (signed, declined, or uploaded a paper scan awaiting review) or was removed: fixed for good. */
const settled = (s: Signer) => Boolean(s.signedAt || s.declinedAt || s.paper?.status === 'pending' || s.removedAt)
const identity = (s: Signer, place: number) => ({ name: s.name, email: s.email, order: s.order ?? place + 1, ...(s.linkOnly ? { linkOnly: true } : {}), ...(s.message ? { message: s.message } : {}) })
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
function readRecipient(value: unknown, place: number, previous?: Signer): { signer: Signer; code?: string } {
  const s = object(value), email = text(s.email, 'the signer email', 254).toLowerCase(), order = s.order === undefined ? previous?.order ?? place + 1 : s.order
  insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Provide a valid signer email.')
  insist(Number.isInteger(order) && (order as number) >= 1 && (order as number) <= 100, 'Give each signer a whole-number routing order from 1 to 100.')
  const code = s.accessCode === undefined || s.accessCode === '' ? undefined : text(s.accessCode, 'an access code', 32)
  insist(code === undefined || /^\S{4,32}$/.test(code), 'Use an access code of 4–32 characters with no spaces.')
  const name = text(s.name, 'the signer name', 100), message = edit(s.message, previous?.message, 'the private message', 1000)
  const same = previous && previous.name === name && previous.email === email
  const { message: _, linkOnly: __, ...kept } = same ? previous : {} as Signer
  insist(s.linkOnly === undefined || typeof s.linkOnly === 'boolean', 'Choose email code or link only for each recipient.')
  return { signer: { ...kept, name, email, order: order as number, ...(s.linkOnly ? { linkOnly: true } : {}), ...(message ? { message } : {}), ...(code || previous?.accessCode ? { accessCode: true } : {}) }, code }
}

export async function correctEnvelope(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  active(before)
  const after = structuredClone(before), at = now(), codes = new Map<number, string>()
  const signedFixed = (i: number) => `${before.signers[i].name} has already ${before.signers[i].removedAt ? 'been removed' : before.signers[i].declinedAt ? 'declined' : before.signers[i].paper?.status === 'pending' ? 'signed on paper' : 'signed'}; their details and fields cannot change.`
  if (input.signers !== undefined) {
    insist(Array.isArray(input.signers) && input.signers.length >= before.signers.length && input.signers.length <= maxPlaces, `Keep every recipient in their place (remove one with "remove") and add at most ${maxPlaces - before.signers.length} more.`)
    after.signers = input.signers.map((value, i) => {
      const previous = before.signers[i], entry = object(value)
      if (previous && settled(previous)) {
        insist(previous.removedAt ? entry.remove === true : entry.remove !== true && entry.accessCode === undefined && canonical(identity(readRecipient(value, i, previous).signer, i)) === canonical(identity(previous, i)), signedFixed(i), 409)
        return previous
      }
      if (entry.remove === true) { insist(previous, 'Only a recipient already on the envelope can be removed.'); return { ...previous, removedAt: at } }
      const { signer, code } = readRecipient(value, i, previous)
      if (code) codes.set(i, code)
      return signer
    })
  }
  const live = after.signers.flatMap((s, i) => s.removedAt ? [] : [i]), open = live.filter(i => !after.signers[i].signedAt)
  insist(live.length <= maxActive, `An envelope has at most ${maxActive} signers.`)
  insist(open.length, 'Keep at least one recipient who has not signed, or void the envelope instead.', 409)
  insist(new Set(live.map(i => after.signers[i].email)).size === live.length, 'Each ordered signer must use a different email.')
  const highestSigned = Math.max(0, ...live.filter(i => after.signers[i].signedAt).map(i => routingOrder(after, i)))
  for (const i of open) insist(routingOrder(after, i) >= highestSigned, `${after.signers[i].name} can only be placed at routing order ${highestSigned} or later: recipients there have already signed.`, 409)

  const removedPlaces = after.signers.flatMap((s, i) => s.removedAt ? [i] : [])
  after.fields = validateFields(input.fields === undefined ? before.fields.filter(f => !removedPlaces.includes(f.signer)) : input.fields, after.signers.length, before.pageSizes.length, removedPlaces)
  const fixedFields = (fields: Field[]) => canonical(fields.filter(f => settled(before.signers[f.signer] ?? {} as Signer) && !before.signers[f.signer].removedAt).sort((a, b) => a.id.localeCompare(b.id)))
  insist(fixedFields(after.fields) === fixedFields(before.fields), 'A field of a recipient who has already signed cannot be changed.', 409)

  const copies = chooseCopies(input.copies === undefined ? before.copies : input.copies, live.map(i => after.signers[i]))
  if (copies.length) after.copies = copies; else delete after.copies
  const subject = edit(input.subject, before.subject, 'the email subject', 200, true), message = edit(input.message, before.message, 'the message', 2000)
  if (subject) after.subject = subject; else delete after.subject
  if (message) after.message = message; else delete after.message
  if (input.expiresAt !== undefined) after.expiresAt = chooseExpiry(input.expiresAt, at)
  await validatePdfText(after.signers.flatMap(s => [s.name, s.email]))

  // The audit trail: one event per recipient change and one for the envelope's own settings, each with before and after.
  const writes: D1PreparedStatement[] = [], rotated = new Set<number>()
  for (const [i, s] of after.signers.entries()) {
    const previous = before.signers[i]
    if (!previous) { await appendEvent(after, 'signer.added', context.actor.id, { signer: i, after: identity(s, i), accessCode: Boolean(s.accessCode) }); continue }
    if (s.removedAt && !previous.removedAt) { await appendEvent(after, 'signer.removed', context.actor.id, { signer: i, before: identity(previous, i) }); rotated.add(i); continue }
    if (canonical(identity(s, i)) !== canonical(identity(previous, i)) || codes.has(i)) {
      await appendEvent(after, 'signer.corrected', context.actor.id, { signer: i, before: identity(previous, i), after: identity(s, i), ...(codes.has(i) ? { accessCodeReplaced: true } : {}) })
      // IDV-001: a changed authentication method is a new link, like a new access code.
      if (s.name !== previous.name || s.email !== previous.email || codes.has(i) || Boolean(s.linkOnly) !== Boolean(previous.linkOnly)) rotated.add(i)
    }
  }
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const key of ['subject', 'message', 'expiresAt', 'copies', 'fields'] as const) if (canonical(before[key] ?? null) !== canonical(after[key] ?? null)) changes[key] = { before: before[key] ?? null, after: after[key] ?? null }
  if (Object.keys(changes).length) await appendEvent(after, 'envelope.corrected', context.actor.id, { changes })
  insist(after.events.length > before.events.length, 'Nothing to correct: change a recipient, a field, the messages or the expiry.', 409)

  // Links: a corrected or removed recipient's link, code, session and saved entries stop working; whoever's turn it now
  // is and was corrected, added or newly reached gets a fresh link and invitation.
  const wasCurrent = currentSigners(before), nowCurrent = currentSigners(after), mail = !mailSuppressed(env)
  for (const [i] of after.signers.entries()) {
    const added = !before.signers[i], invite = nowCurrent.includes(i) && (added || rotated.has(i) || !wasCurrent.includes(i))
    if (!added && !rotated.has(i) && !invite) continue
    const token = secret()
    const sealed = after.signers[i].removedAt ? null : await sealLink(env, after.id, i, token)
    writes.push(added ? env.DB.prepare('INSERT INTO iw_signers(envelope_id,signer,token_hash,link_sealed) VALUES(?,?,?,?)').bind(after.id, i, await sha256(token), sealed)
      : env.DB.prepare('UPDATE iw_signers SET token_hash=?,link_sealed=?,code_hash=NULL,code_expires=NULL,code_attempts=0,code_sent_at=NULL,session_hash=NULL,session_expires=NULL,progress=NULL WHERE envelope_id=? AND signer=?').bind(await sha256(token), sealed, after.id, i))
    if (rotated.has(i)) writes.push(env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id, i))
    if (after.signers[i].removedAt) writes.push(env.DB.prepare('DELETE FROM iw_access_codes WHERE envelope_id=? AND signer=?').bind(after.id, i))
    if (invite && mail) writes.push(invitationWrite(env, after, i, token))
  }
  for (const [i, code] of codes) writes.push(env.DB.prepare('DELETE FROM iw_access_codes WHERE envelope_id=? AND signer=?').bind(after.id, i), env.DB.prepare('INSERT INTO iw_access_codes(envelope_id,signer,code_hash) VALUES(?,?,?)').bind(after.id, i, await accessCodeHash(env, after.id, i, code)))
  const result = { id: after.id, invited: nowCurrent.filter(i => !wasCurrent.includes(i) || rotated.has(i) || !before.signers[i]).map(i => after.signers[i].email), emailSent: mail }
  await commitEnvelope(env, before, after, context.actor, [...writes, commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  await dispatchMail(env, after.id)
  return result
}
