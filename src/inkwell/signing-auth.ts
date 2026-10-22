import { appendEvent, insist, randomCode, secret, sha256, text, type Env } from './model'
import { commitEnvelope } from './storage'
import { dispatchMail, mailWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { accessGate, liveGuard, recipientOf, signerCookie, turn, type SigningContext } from './signing'
import { dispatchSms, maskedMobile, smsReady, smsWrite } from './sms'

export async function requestCode(env: Env, context: SigningContext) {
  const person = recipientOf(context), sms = person.sms === true
  insist(!person.inPerson, 'The host must open in-person signing.', 403)
  insist(sms ? smsReady(env) : !mailSuppressed(env), sms ? 'SMS delivery is not configured.' : 'Mail is not set up. Ask the sender for a new signing link and verification code.', 409)
  turn(context, !sms); accessGate(context)
  const r = context.recipient, at = Date.now()
  insist(!r.code_sent_at || r.code_sent_at < at - 60_000, 'Wait one minute before requesting another verification code.', 429)
  insist(r.code_generation < 10, 'The verification request limit was reached. Contact the sender.', 429)
  const code = randomCode(), generation = r.code_generation + 1, hash = await sha256(`${env.SESSION_SECRET}:${r.token_hash}:${generation}:${code}`), after = structuredClone(context.envelope)
  await appendEvent(after, 'signer.code_requested', `signer:${r.signer + 1}`, { signer: r.signer, ...(r.member === undefined ? {} : { member: r.member }), ...(sms ? { method: 'sms', maskedPhone: maskedMobile(person.phone!) } : {}) })
  const body = `Your Inkwell verification code is ${code}.\n\nIt expires in 10 minutes. Do not share it.\nDocument: ${after.title}`
  await commitEnvelope(env, context.envelope, after, null, [
    env.DB.prepare('UPDATE iw_signers SET code_hash=?,code_expires=?,code_attempts=0,code_sent_at=?,code_generation=?,code_channel=? WHERE envelope_id=? AND signer=?')
      .bind(hash, at + 10 * 60_000, at, generation, sms ? 'sms' : 'email', after.id, r.row),
    sms ? smsWrite(env, after, r.signer, person.phone!, 'code', body) : mailWrite(env.DB, after, r.signer, 'code', body, r.member),
  ], [liveGuard(context, !sms), { sql: 'EXISTS(SELECT 1 FROM iw_signers WHERE envelope_id=? AND signer=? AND code_generation=? AND token_hash=?)', values: [after.id, r.row, r.code_generation, r.token_hash] }])
  if (sms) await dispatchSms(env, after.id); else await dispatchMail(env, after.id)
  return { ok: true }
}

export async function verifyCode(env: Env, context: SigningContext, input: Record<string, unknown>) {
  const person = recipientOf(context), sms = person.sms === true
  insist(!person.inPerson, 'The host must open in-person signing.', 403)
  turn(context, !sms); accessGate(context)
  const r = context.recipient, code = text(input.code, 'the six-digit code', 6)
  insist(/^\d{6}$/.test(code), `Enter the six-digit code from your ${sms ? 'text message' : 'email'}.`)
  insist(!sms || r.code_channel === 'sms', 'Request an SMS verification code for this invitation.', 401)
  insist(r.code_hash && r.code_expires && r.code_expires > Date.now() && r.code_attempts < 5, 'This code expired, was already used, or reached its attempt limit. Request a new code.', 401)
  const correct = await sha256(`${env.SESSION_SECRET}:${r.token_hash}:${r.code_generation}:${code}`) === r.code_hash
  const guards = [liveGuard(context, !sms), { sql: 'EXISTS(SELECT 1 FROM iw_signers WHERE envelope_id=? AND signer=? AND code_hash=? AND code_generation=? AND code_attempts=? AND code_attempts<5 AND code_expires>? AND token_hash=?)', values: [context.envelope.id, r.row, r.code_hash, r.code_generation, r.code_attempts, Date.now(), r.token_hash] }]
  const after = structuredClone(context.envelope), details = { signer: r.signer, ...(r.member === undefined ? {} : { member: r.member }), ...(sms ? { method: 'sms', maskedPhone: maskedMobile(person.phone!) } : {}), ...context.client }
  if (!correct) {
    await appendEvent(after, 'signer.code_rejected', `signer:${r.signer + 1}`, details)
    await commitEnvelope(env, context.envelope, after, null, [env.DB.prepare('UPDATE iw_signers SET code_attempts=code_attempts+1 WHERE envelope_id=? AND signer=?').bind(after.id, r.row)], guards)
    insist(false, 'The verification code is incorrect.', 401)
  }
  const manualCode = !sms && after.events.find(e => e.action === 'invitation.manual_issued' && e.detail.signer === r.signer && e.detail.generation === r.code_generation)
  const session = secret(), expires = Date.now() + 24 * 60 * 60_000
  await appendEvent(after, sms ? 'signer.sms_verified' : manualCode ? 'signer.code_verified' : 'signer.email_verified', `signer:${r.signer + 1}`, { ...details, email: person.email, ...(manualCode ? { delivery: manualCode.detail.delivery } : {}) })
  await commitEnvelope(env, context.envelope, after, null, [env.DB.prepare('UPDATE iw_signers SET code_hash=NULL,code_expires=NULL,session_hash=?,session_expires=? WHERE envelope_id=? AND signer=?').bind(await sha256(session), expires, after.id, r.row)], guards)
  return signerCookie(env, context.token, session)
}
