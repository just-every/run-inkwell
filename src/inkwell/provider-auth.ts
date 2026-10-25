import { appendEvent, insist, secret, sha256, text, type Env, type Signer } from './model'
import { commitEnvelope } from './storage'
import { accessGate, liveGuard, recipientOf, signerCookie, turn, type SigningContext } from './signing'
import { checkIdentity, identityReady, startIdentity } from './identity-provider'
import { checkVoice, requestVoice, voiceReady } from './phone-provider'
import { checkKnowledge, knowledgeReady, startKnowledge } from './knowledge-provider'
import { seal, unseal } from './seal'
import { providerLockWrites } from './provider-notice'
import { dispatchMail } from './mail'
import { usMobile } from './sms'

export type ProviderAuth = 'identity' | 'voice' | 'knowledge'
export function providerChoice(value: Record<string, unknown>, previous?: Pick<Signer, 'providerAuth'>) {
  const method = value.providerAuth === undefined ? previous?.providerAuth : value.providerAuth || undefined
  insist(method === undefined || ['identity','voice','knowledge'].includes(String(method)), 'Choose a supported verification method.')
  insist(!method || !value.sms && !value.linkOnly && !value.inPerson && !value.group && !value.unresolvedIdentity, 'Provider verification belongs to one named remote recipient and cannot be combined with another method.')
  return method ? { providerAuth: method as ProviderAuth } : {}
}
export function requireProvider(env: Env, method?: ProviderAuth) {
  if (method) insist(method === 'identity' ? identityReady(env) : method === 'knowledge' ? knowledgeReady(env) : voiceReady(env), method === 'identity' ? 'Ask the owner to configure Stripe Identity.' : method === 'knowledge' ? 'Ask the owner to configure Authenticate knowledge questions.' : 'Ask the owner to configure Twilio Verify voice calls.', 503)
}
interface Attempt { token_hash: string; method: ProviderAuth; generation: number; reference: string | null; provider_session: string | null; sealed_token: string | null; outcome: string; attempts: number; failures: number; requested_at: number }
interface Started { reference: string; url?: string; session?: string; token?: string }
interface Result { outcome: 'pending' | 'passed' | 'failed'; nameMatch?: boolean; failedAttempts?: number }
const attempt = (env: Env, c: SigningContext) => env.DB.prepare('SELECT * FROM iw_provider_auth WHERE envelope_id=? AND signer=? AND token_hash=?').bind(c.envelope.id, c.recipient.row, c.recipient.token_hash).first<Attempt>()
function gate(env: Env, c: SigningContext) { turn(c); accessGate(c); const s = recipientOf(c); insist(s.providerAuth, 'This invitation does not use provider verification.', 409); requireProvider(env, s.providerAuth); return s }
const fence = (c: SigningContext, a: Attempt) => ({ sql: 'EXISTS(SELECT 1 FROM iw_provider_auth WHERE envelope_id=? AND signer=? AND token_hash=? AND generation=? AND outcome=? AND attempts=?)', values: [c.envelope.id, c.recipient.row, c.recipient.token_hash, a.generation, a.outcome, a.attempts] })
const tokenBinding = (c: SigningContext) => `${c.envelope.id}:${c.recipient.row}:${c.recipient.token_hash}`

/** Explicit consent precedes all outbound requests. A durable claim prevents automatic duplicate calls. */
export async function startProviderAuth(env: Env, c: SigningContext, input: Record<string, unknown>) {
  const s = gate(env, c), prior = await attempt(env, c)
  insist(prior?.outcome !== 'locked', 'This invitation is locked after failed verification. Contact the sender.', 423)
  insist(input.consent === true, 'Agree to verification by this provider before continuing.')
  const dob = s.providerAuth === 'knowledge' ? text(input.dateOfBirth, 'your date of birth', 10) : undefined
  insist(!dob || /^\d{4}-\d{2}-\d{2}$/.test(dob), 'Enter your date of birth.')
  insist(!prior || Date.now() - prior.requested_at >= 60_000, 'Wait one minute before starting another verification.', 429)
  insist(!prior || prior.generation < 10, 'Verification request limit reached. Contact the sender.', 423)
  const generation = (prior?.generation ?? 0) + 1, failures = prior && prior.method === s.providerAuth ? prior.failures : 0, after = structuredClone(c.envelope)
  await appendEvent(after, 'signer.provider_consent', `signer:${c.recipient.signer + 1}`, { signer: c.recipient.signer, method: s.providerAuth, generation, consent: true })
  await commitEnvelope(env, c.envelope, after, null, [env.DB.prepare(`INSERT INTO iw_provider_auth(envelope_id,signer,token_hash,method,generation,outcome,requested_at,failures) VALUES(?,?,?,?,?,'starting',?,?) ON CONFLICT(envelope_id,signer) DO UPDATE SET token_hash=excluded.token_hash,method=excluded.method,generation=excluded.generation,reference=NULL,provider_session=NULL,sealed_token=NULL,outcome='starting',attempts=0,requested_at=excluded.requested_at,failures=excluded.failures`).bind(after.id, c.recipient.row, c.recipient.token_hash, s.providerAuth!, generation, Date.now(), failures)], [liveGuard(c)])
  const key = await sha256(c.recipient.token_hash + ':' + generation)
  const result: Started = s.providerAuth === 'identity' ? await startIdentity(env, key) : s.providerAuth === 'knowledge' ? await startKnowledge(env, {name:s.name,email:s.email,dob:dob!}, prior?.reference ?? undefined) : await requestVoice(env, usMobile(s.phone))
  const sealed = result.token ? await seal(env, 'knowledge-verification', tokenBinding(c), result.token) : null
  const updated = await env.DB.prepare("UPDATE iw_provider_auth SET reference=?,provider_session=?,sealed_token=?,outcome='pending' WHERE envelope_id=? AND signer=? AND token_hash=? AND generation=? AND outcome='starting'").bind(result.reference, result.session ?? null, sealed, after.id, c.recipient.row, c.recipient.token_hash, generation).run()
  insist(updated.meta.changes === 1, 'Verification changed. Open your current invitation.', 409)
  return { ...(result.url ? {url:result.url} : {}), started: true }
}

export async function checkProviderAuth(env: Env, c: SigningContext, input: Record<string, unknown>) {
  const s = gate(env, c), a = await attempt(env, c)
  insist(a?.outcome !== 'locked', 'This invitation is locked after failed verification. Contact the sender.', 423)
  insist(a && a.reference && a.method === s.providerAuth, 'Start verification on this invitation first.', 409)
  insist(a.outcome === 'pending', 'This verification is closed. Start a new verification.', 409)
  insist(Date.now() - a.requested_at < 30 * 60_000, 'Verification expired. Start again.', 401)
  insist(a.attempts < 5, 'Verification attempt limit reached. Contact the sender.', 423)
  let result: Result
  if (s.providerAuth === 'identity') result = await checkIdentity(env, a.reference, s.name)
  else if (s.providerAuth === 'knowledge') {
    const token = await unseal(env, 'knowledge-verification', tokenBinding(c), a.sealed_token)
    insist(token && a.provider_session, 'Verification session unavailable. Contact the sender.', 409)
    result = await checkKnowledge(env, token, a.reference, a.provider_session)
  } else result = { outcome: await checkVoice(env, a.reference, text(input.code, 'the voice-call code', 10)) ? 'passed' : 'failed' }
  if (result.outcome === 'pending') return { pending: true }
  const passed = result.outcome === 'passed', failures = a.failures + (passed ? 0 : Math.max(1, result.failedAttempts ?? 1)), locked = !passed && (s.providerAuth === 'knowledge' ? failures >= 2 : s.providerAuth === 'voice' && failures >= 5)
  const after = structuredClone(c.envelope), session = passed ? secret() : undefined
  await appendEvent(after, passed ? 'signer.provider_verified' : 'signer.provider_rejected', `signer:${c.recipient.signer + 1}`, { signer: c.recipient.signer, method: s.providerAuth, reference: a.reference, outcome: result.outcome, ...(result.nameMatch === undefined ? {} : {nameMatch:result.nameMatch}), ...c.client })
  if (locked) await appendEvent(after, 'signer.provider_locked', `signer:${c.recipient.signer + 1}`, {signer:c.recipient.signer,method:s.providerAuth,reference:a.reference,outcome:'failed'})
  const outcome = passed ? 'passed' : locked ? 'locked' : s.providerAuth === 'voice' ? 'pending' : 'failed'
  const writes = [env.DB.prepare('UPDATE iw_provider_auth SET outcome=?,failures=?,attempts=attempts+1,sealed_token=CASE WHEN ? THEN sealed_token ELSE NULL END WHERE envelope_id=? AND signer=? AND token_hash=?').bind(outcome, failures, outcome==='pending'?1:0, after.id, c.recipient.row, c.recipient.token_hash)]
  if (session) writes.push(env.DB.prepare('UPDATE iw_signers SET code_hash=NULL,code_expires=NULL,session_hash=?,session_expires=? WHERE envelope_id=? AND signer=?').bind(await sha256(session), Date.now() + 24 * 60 * 60_000, after.id, c.recipient.row))
  if (locked) writes.push(...await providerLockWrites(env, after, c.recipient.signer))
  await commitEnvelope(env, c.envelope, after, null, writes, [liveGuard(c), fence(c, a)])
  if (locked) await dispatchMail(env, after.id)
  insist(passed, locked ? 'This invitation is locked after failed verification. The sender has been notified.' : s.providerAuth === 'identity' ? 'Identity verification failed or the name did not match. You can start a new verification.' : s.providerAuth === 'knowledge' ? 'Knowledge verification failed. You can start a new verification; a second failure locks this invitation.' : 'The voice-call code is incorrect.', locked ? 423 : 401)
  return { cookie: signerCookie(env, c.token, session!) }
}
