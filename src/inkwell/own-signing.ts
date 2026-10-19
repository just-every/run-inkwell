import { active, appendEvent, currentSigners, insist, secret, sha256, text, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { mailSuppressed, manualInvitation } from './manual-invitations'
import type { CommandContext } from './envelopes'

/** The signed-in person whose turn it is to sign opens their own signing page from the app. A fresh private link replaces
 * the one they were sent, and the page still asks for a verification code: emailed to them when mail is set up, and
 * handed back here when it is not, as the owner's private links already are. */
export async function openOwnSigning(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  active(before)
  const signer = currentSigners(before).find(i => before.signers[i].email.toLowerCase() === context.actor.email.toLowerCase())
  insist(signer !== undefined, 'It is not your turn to sign this envelope.', 409)
  const suppressed = mailSuppressed(env)
  insist(!suppressed || context.actor.role === 'owner', 'Mail is not set up. Ask the owner for a private signing link and code.', 403)
  const row = await env.DB.prepare('SELECT code_generation FROM iw_signers WHERE envelope_id=? AND signer=?').bind(before.id, signer).first<{code_generation:number}>()
  insist(row, 'Recipient not found.', 404)
  const after = structuredClone(before), token = secret()
  let code: string | undefined, write: D1PreparedStatement
  if (suppressed) {
    const issued = await manualInvitation(env, after, signer, token, row.code_generation + 1, context.actor.id, 'self')
    code = issued.invitation.code; write = issued.write
  } else {
    await appendEvent(after, 'invitation.opened_in_app', context.actor.id, { signer, recipient: after.signers[signer].email })
    write = env.DB.prepare('UPDATE iw_signers SET token_hash=?,code_hash=NULL,code_expires=NULL,code_attempts=0,session_hash=NULL,session_expires=NULL WHERE envelope_id=? AND signer=?').bind(await sha256(token), after.id, signer)
  }
  const result = { id: after.id, status: after.status }
  await commitEnvelope(env.DB, before, after, context.actor, [write,
    env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id, signer),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return { ...result, signing: { url: new URL('/sign/' + token, env.AUTH_ORIGIN).href, ...(code ? { code } : {}) } }
}
