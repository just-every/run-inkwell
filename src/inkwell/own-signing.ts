import { active, appendEvent, currentSigners, insist, secret, sha256, text, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope, roleGuard } from './storage'
import { signerCookie } from './signing'
import type { CommandContext } from './envelopes'

/** MANAGE-003: a signed-in member whose turn it is signs from the app with no email round trip. Their Inkwell session
 * authenticates them, so opening their signing page replaces the link they were sent with a fresh one that is already
 * verified in this browser, and the record names the session's member. Any role may sign their own turn; a sender's
 * access code is still asked for on the page (IDV-003), and mail being set up or not makes no difference. */
export async function openOwnSigning(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  active(before)
  const signer = currentSigners(before).find(i => before.signers[i].email.toLowerCase() === context.actor.email.toLowerCase())
  insist(signer !== undefined, 'It is not your turn to sign this envelope.', 409)
  const after = structuredClone(before), token = secret(), session = secret()
  await appendEvent(after, 'signer.session_verified', context.actor.id, { signer, email: after.signers[signer].email, operator: context.actor.id, method: 'inkwell-session', ...context.client })
  const result = { id: after.id, status: after.status }
  await commitEnvelope(env.DB, before, after, null, [
    env.DB.prepare('UPDATE iw_signers SET token_hash=?,code_hash=NULL,code_expires=NULL,code_attempts=0,session_hash=?,session_expires=? WHERE envelope_id=? AND signer=?').bind(await sha256(token), await sha256(session), Date.now() + 24 * 60 * 60_000, after.id, signer),
    env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id, signer),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)], [roleGuard(context.actor, ['owner', 'admin', 'sender', 'viewer'])])
  return { ...result, signing: { url: new URL('/sign/' + token, env.AUTH_ORIGIN).href }, cookie: signerCookie(env, token, session) }
}
