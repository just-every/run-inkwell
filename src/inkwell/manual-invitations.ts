import { active, appendEvent, insist, randomCode, secret, sha256, text, type Envelope, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import type { CommandContext } from './envelopes'

export const mailSuppressed = (env: Env) => !env.MAIL_PROVIDER || env.MAIL_PROVIDER === 'development'

/** Secrets leave only in this response, never in the command journal or mail queue. */
export async function manualInvitation(env: Env, envelope: Envelope, signer: number, token: string, generation: number, actor: string, delivery: 'sender' | 'self' = 'sender') {
  const code = randomCode(), tokenHash = await sha256(token)
  const codeHash = await sha256(`${env.SESSION_SECRET}:${tokenHash}:${generation}:${code}`)
  await appendEvent(envelope, 'invitation.manual_issued', actor, { signer, recipient: envelope.signers[signer].email, generation, delivery, emailSent: false })
  return {
    invitation: { url: new URL('/sign/' + token, env.AUTH_ORIGIN).href, code, recipient: envelope.signers[signer].email, expiresAt: envelope.expiresAt },
    write: env.DB.prepare('UPDATE iw_signers SET token_hash=?,code_hash=?,code_expires=?,code_attempts=0,code_sent_at=?,code_generation=?,session_hash=NULL,session_expires=NULL WHERE envelope_id=? AND signer=?')
      .bind(tokenHash, codeHash, Date.now() + 10 * 60_000, Date.now(), generation, envelope.id, signer)
  }
}

export async function reissueInvitation(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(context.actor.role === 'owner', 'Only the owner can create a private signing link.', 403)
  insist(mailSuppressed(env), 'Private signing links are only shown when mail is not set up.', 409)
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  active(before)
  const signer = before.signers.findIndex(s => !s.signedAt)
  insist(signer >= 0, 'All recipients have signed.', 409)
  const row = await env.DB.prepare('SELECT code_generation FROM iw_signers WHERE envelope_id=? AND signer=?').bind(before.id, signer).first<{code_generation:number}>()
  insist(row, 'Recipient not found.', 404)
  const after = structuredClone(before)
  const issued = await manualInvitation(env, after, signer, secret(), row.code_generation + 1, context.actor.id)
  const result = { id: after.id, status: after.status }
  await commitEnvelope(env.DB, before, after, context.actor, [issued.write,
    env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id, signer),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return { ...result, invitation: issued.invitation }
}
