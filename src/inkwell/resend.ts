import { apiCommandActor } from './api-command'
import { dispatchSms, smsInvitation, smsReady } from './sms'
// DELIV-005: the sender (or anyone who may change the envelope, ADMIN-001) resends the invitation to a recipient whose
// turn it is, from the envelope detail page (MANAGE-005). Resend sends the same link again (the old link keeps
// working); Resend with a new link rotates it, so the previous link, code, session and access-code pass stop working.
// Both are audited, and each resent message shows its own status (DELIV-001). Exact semantics: only a recipient whose
// turn it is can be resent to, never one whose invitation bounced (correct the address instead, DELIV-002) or whose
// paper scan awaits review; it needs mail set up (without mail the owner creates a new private link instead); a link
// that cannot be reopened (issued before links were sealed, or sealed under another installation key, links.ts) is
// rotated and the result says so; a resend does not move the automatic reminder schedule (DELIV-003). SMS resend
// arrives with IDV-002's numbers.
import { active, appendEvent, currentSigners, insist, memberRow, secret, sha256, text, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { dispatchMail, invitationWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { envelopeMessages } from './delivery'
import { bouncedRecipients } from './bounces'
import type { CommandContext } from './envelopes'
import { openLink, sealLink } from './links'

export async function resendInvitation(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  active(before)
  const sms = input.channel === 'sms'
  insist(input.channel === undefined || input.channel === 'email' || sms, 'Choose email or SMS for this resend.')
  insist(sms ? smsReady(env) : !mailSuppressed(env), 'Mail is not set up, so no invitation can be emailed. Create a new signing link instead.', 409)
  const signer = input.signer as number, current = currentSigners(before)
  insist(Number.isInteger(signer) && current.includes(signer), 'Choose a recipient whose turn it is to sign.', 409)
  insist(!sms || before.signers[signer].phone && !before.signers[signer].group, 'SMS resend needs an individual recipient’s US mobile number.', 409)
  insist(!before.signers[signer].inPerson, 'In-person signers do not receive signing invitations. Start a hosted session instead.', 409)
  insist(before.signers[signer].paper?.status !== 'pending', 'This recipient’s paper signature is waiting for your review.', 409)
  insist(!bouncedRecipients(before, await envelopeMessages(env, before.id)).some(entry => entry.signer === signer), 'This recipient’s invitation bounced: correct their email address instead.', 409)
  insist(input.newLink === undefined || typeof input.newLink === 'boolean', 'Choose whether to send a new link.')
  // ROUTE-005: a group place resends to every member, each on their own link.
  const rows = before.signers[signer].group?.members.map((_, m) => ({ row: memberRow(signer, m), member: m as number | undefined })) ?? [{ row: signer, member: undefined }], links: { row: number; member?: number; token: string; rotated: boolean }[] = []
  for (const { row: number, member } of rows) {
    const row = await env.DB.prepare('SELECT token_hash,link_sealed FROM iw_signers WHERE envelope_id=? AND signer=?').bind(before.id, number).first<{ token_hash: string; link_sealed: string | null }>()
    insist(row, 'Recipient not found.', 404)
    const kept = input.newLink === true ? undefined : await openLink(env, before.id, number, row.link_sealed)
    const same = kept && await sha256(kept) === row.token_hash ? kept : undefined
    links.push({ row: number, member, token: same ?? secret(), rotated: !same })
  }
  const rotated = links.some(l => l.rotated), forced = rotated && input.newLink !== true
  const after = structuredClone(before)
  await appendEvent(after, 'signer.resent', context.actor.id, { signer, ...(sms ? { channel: 'sms', phone: after.signers[signer].phone } : {}), email: after.signers[signer].email, newLink: rotated, ...(forced ? { reason: 'The previous link could not be reopened, so a new link was sent.' } : {}) })
  const result = { id: after.id, signer, email: after.signers[signer].email, newLink: rotated, ...(forced ? { reason: 'This link was issued before Inkwell kept links for resending, so a new link was sent and the previous one no longer works.' } : {}) }
  const writes: D1PreparedStatement[] = rotated ? [env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND kind='invitation' AND state='pending'").bind(after.id, signer)] : []
  for (const link of links) writes.push(...(link.rotated ? [env.DB.prepare('UPDATE iw_signers SET token_hash=?,link_sealed=?,code_hash=NULL,code_expires=NULL,code_attempts=0,code_sent_at=NULL,session_hash=NULL,session_expires=NULL WHERE envelope_id=? AND signer=?').bind(await sha256(link.token), await sealLink(env, after.id, link.row, link.token), after.id, link.row),
] : []),
    sms ? smsInvitation(env, after, signer, link.token) : invitationWrite(env, after, signer, link.token, link.member))
  await commitEnvelope(env, before, after, context.actor, [...writes, commandWrite(env.DB, apiCommandActor(context.actor), context.commandId, context.fingerprint, result)])
  if (sms) await dispatchSms(env, after.id); else await dispatchMail(env, after.id)
  return result
}
