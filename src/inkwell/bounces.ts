// DELIV-002: a recipient whose current invitation bounced or was refused for their address (DELIV-001 status) is flagged
// on the envelope, gets no reminders, and the sender is alerted once by email; the sender corrects the address and the
// new invitation goes out in the same step, on a new link (the old one stops working).
import { active, appendEvent, currentSigners, insist, secret, sha256, text, type Envelope, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { dispatchMail, invitationWrite, noticeWrite } from './mail'
import { envelopeMessages, type Message } from './delivery'
import type { CommandContext } from './envelopes'
import { sealLink } from './links'

const undeliverable = (message?: Message) => message?.status === 'bounced' || message?.status === 'failed'
/** Each current, unsigned recipient whose latest invitation bounced or was refused, with that invitation. */
export function bouncedRecipients(envelope: Envelope, messages: Message[]) {
  if (envelope.status !== 'awaiting_signature') return []
  return currentSigners(envelope).flatMap(signer => {
    if (envelope.signers[signer].inPerson) return []
    const latest = messages.filter(m => m.kind === 'invitation' && m.signer === signer).at(-1)
    return undeliverable(latest) && latest!.recipient.toLowerCase() === envelope.signers[signer].email ? [{ signer, message: latest! }] : []
  })
}

/** Alert each envelope's sender once per bounced invitation. Runs after every delivery webhook and on the hourly pass,
 * so an alert interrupted after the event was stored still goes out; the audit event keyed by the message makes it once. */
export async function alertBounces(env: Env) {
  const rows = (await env.DB.prepare("SELECT DISTINCT m.envelope_id FROM iw_mail m JOIN iw_envelopes e ON e.id=m.envelope_id AND json_extract(e.data,'$.status')='awaiting_signature' WHERE m.kind='invitation' AND (m.state='rejected' OR EXISTS(SELECT 1 FROM rer_mail_event_receipts r WHERE r.provider=m.provider AND (json_extract(r.event_json,'$.providerMessageId')=m.provider_message_id OR json_extract(r.event_json,'$.deliveryId')=m.id) AND json_extract(r.event_json,'$.status') IN ('bounced','failed','rejected')))").all<{ envelope_id: string }>()).results
  for (const { envelope_id } of rows) {
    const before = await getEnvelope(env.DB, envelope_id)
    const fresh = bouncedRecipients(before, await envelopeMessages(env, before.id)).filter(({ message }) => !before.events.some(e => e.action === 'signer.bounced' && e.detail.message === message.id))
    if (!fresh.length) continue
    // DELIV-008 alerts the sender (and edit-share holders) as each of them chose, from the signer.bounced event.
    const after = structuredClone(before)
    for (const { signer, message } of fresh) await appendEvent(after, 'signer.bounced', 'inkwell', { signer, email: message.recipient, message: message.id, status: message.status })
    await commitEnvelope(env, before, after, null)
    await dispatchMail(env, after.id)
  }
}

/** The sender corrects a bounced recipient's address (and optionally name) and resends in one step: audited with the
 * before and after values, a new link (the old one and any code or session stop working), and a new invitation. */
export async function correctBounced(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  active(before)
  const signer = input.signer as number, flagged = bouncedRecipients(before, await envelopeMessages(env, before.id))
  insist(flagged.some(entry => entry.signer === signer), 'Only a recipient whose invitation bounced can be corrected here.', 409)
  const email = text(input.email, 'the corrected email', 254).toLowerCase(), name = input.name === undefined ? before.signers[signer].name : text(input.name, 'the signer name', 100)
  insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Provide a valid signer email.')
  insist(email !== before.signers[signer].email, 'Enter a different email address than the one that bounced.')
  insist(!before.signers.some((s, i) => i !== signer && s.email === email), 'Another recipient already uses that email address.')
  const after = structuredClone(before), token = secret()
  await appendEvent(after, 'signer.corrected', context.actor.id, { signer, reason: 'bounced', before: { name: before.signers[signer].name, email: before.signers[signer].email }, after: { name, email } })
  after.signers[signer] = { ...after.signers[signer], name, email }
  const result = { id: after.id, signer, email }
  await commitEnvelope(env, before, after, context.actor, [
    env.DB.prepare('UPDATE iw_signers SET token_hash=?,link_sealed=?,code_hash=NULL,code_expires=NULL,code_attempts=0,code_sent_at=NULL,session_hash=NULL,session_expires=NULL,progress=NULL WHERE envelope_id=? AND signer=?').bind(await sha256(token), await sealLink(env, after.id, signer, token), after.id, signer),
    env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND recipient=? AND state='pending'").bind(after.id, signer, before.signers[signer].email),
    invitationWrite(env, after, signer, token), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  await dispatchMail(env, after.id)
  return result
}
