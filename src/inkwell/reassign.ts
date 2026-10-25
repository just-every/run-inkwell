import { smsIdentity } from './sms'
// ROUTE-006: when the sender allows it on the envelope, a recipient whose turn it is reassigns their signing to someone
// else, with a reason. The new person takes their place in routing order (same fields and private message, and the
// same access code if the sender set one); the original recipient's link, code and session stop working, the new person
// is invited at once and verifies their own email, and the audit trail, timeline and certificate show both people. The
// sender replaces an unsigned recipient through a correction (DELIV-006). Exact semantics: reassignment is off unless the
// sender turns it on for the envelope (an account default joins with ADMIN-004); it needs the recipient's verified session
// and mail set up (the new person can only be reached by email); the new email may not belong to another recipient or a
// copy recipient on the envelope; a delegate may reassign again while it is their turn.
import { appendEvent, canonical, insist, secret, sha256, text } from './model'
import { commandWrite, commitEnvelope, previousCommand } from './storage'
import { dispatchMail, invitationWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { validatePdfText } from './pdf'
import { accessGate, liveGuard, turn, type SigningContext } from './signing'
import type { Env } from './model'
import { sealLink } from './links'

export async function reassignSigning(env: Env, context: SigningContext, input: Record<string, unknown>) {
  insist(context.verified, 'Verify your email before reassigning.', 401)
  const name = text(input.name, 'the new signer’s name', 100), email = text(input.email, 'the new signer’s email', 254).toLowerCase(), reason = text(input.reason, 'a reason for reassigning', 500).replace(/\s+/g, ' ')
  const method = context.envelope.signers[context.recipient.signer].providerAuth
  const mobile = smsIdentity({ sms: context.envelope.signers[context.recipient.signer].sms, phone: input.phone, linkOnly: context.envelope.signers[context.recipient.signer].linkOnly })
  insist(method!=='voice' || mobile.phone, 'Enter the new recipient’s US phone number.')
  const commandId = text(input.commandId, 'a command ID', 100), fingerprint = await sha256(canonical({ reassign: { name, email, reason, ...mobile } })), key = `signer:${context.envelope.id}:${context.recipient.signer}`
  const previous = await previousCommand(env.DB, key, commandId, fingerprint)
  if (previous) { await dispatchMail(env, context.envelope.id); return previous }
  turn(context); accessGate(context)
  const before = context.envelope, index = context.recipient.signer, original = before.signers[index]
  insist(!original.role || original.role==='signer','Only a signer can reassign signing; recipient authority stays with the sender-approved person.',403)
  insist(original.witnessFor===undefined,'A witness is replaced by the signer who nominated them.',403)
  insist(!original.group, 'A signing group’s members were fixed when the envelope was prepared, so its signing cannot be reassigned. Ask the sender instead.', 409)
  insist(!original.inPerson, 'In-person signing cannot be reassigned through a remote signing session. Ask the sender to correct the recipient.', 409)
  insist(before.allowReassign, 'The sender does not allow reassigning this envelope. Ask them to correct the recipient instead.', 403)
  insist(!mailSuppressed(env), 'Mail is not set up, so the new signer cannot be invited. Ask the sender instead.', 409)
  insist(original.paper?.status !== 'pending', 'Your paper signature is waiting for the sender’s review.', 409)
  insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Provide a valid email for the new signer.')
  insist(reason.length >= 3, 'Give a reason for reassigning (at least 3 characters).')
  insist(![...before.signers.filter(s => !s.removedAt).map(s => s.email), ...(before.copies ?? []).map(c => c.email)].includes(email), 'That email already belongs to a recipient of this envelope.', 409)
  await validatePdfText([name, email, reason])
  const after = structuredClone(before), token = secret()
  after.signers[index] = { name, email, ...(method?{providerAuth:method}:{}), ...mobile, ...(original.linkOnly ? { linkOnly: true } : {}), ...(original.role?{role:original.role}:{}), ...(original.witnesses?{witnesses:structuredClone(original.witnesses)}:{}), ...(original.order === undefined ? {} : { order: original.order }), ...(original.message ? { message: original.message } : {}), ...(original.accessCode ? { accessCode: true } : {}) }
  await appendEvent(after, 'signer.reassigned', `signer:${index + 1}`, { signer: index, before: { name: original.name, email: original.email, ...(method?{providerAuth:method}:{}), ...(original.phone ? { phone: original.phone } : {}), ...(original.sms ? { sms: true } : {}) }, after: { name, email, ...(method?{providerAuth:method}:{}), ...mobile }, reason, ...context.client })
  const result = { id: after.id, reassignedTo: email }
  await commitEnvelope(env, before, after, null, [
    env.DB.prepare('UPDATE iw_signers SET token_hash=?,link_sealed=?,code_hash=NULL,code_expires=NULL,code_attempts=0,code_sent_at=NULL,session_hash=NULL,session_expires=NULL,progress=NULL WHERE envelope_id=? AND signer=?').bind(await sha256(token), await sealLink(env, after.id, index, token), after.id, index),
    env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id, index),
    invitationWrite(env, after, index, token), commandWrite(env.DB, key, commandId, fingerprint, result)], [liveGuard(context)])
  await dispatchMail(env, after.id)
  return result
}
