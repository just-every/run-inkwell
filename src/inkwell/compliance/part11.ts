import { signerIdentity } from './identity'
import { signingMeanings } from './records'
import { securityAlertWrites } from './security'
import { appendEvent, canonical, insist, now, randomCode, sha256, text, type Env } from '../model'
import { commandWrite, commitEnvelope, getEnvelope, roleGuard, type Guard } from '../storage'
import { accessGate, disclosureGate, liveGuard, recipientOf, sessionGuard, turn, type SigningContext } from '../signing'
import { dispatchMail, noticeWrite } from '../mail'
import { mailSuppressed } from '../manual-invitations'
import { validatePdfText } from '../pdf'
import type { CommandContext } from '../envelopes'

/** Conservative, unvalidated controls. Enabling is explicit, audited, and cannot relax an existing record. */
export async function enablePart11(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(['owner', 'admin'].includes(context.actor.role), 'Only an owner or admin can enable this profile.', 403)
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  insist(!before.imported && before.status === 'prepared' && before.internalApproval?.state !== 'pending', 'Enable the profile on an unlocked native draft.', 409)
  insist(!before.part11, 'The profile is already required for this envelope.', 409)
  insist(input.confirm === true, 'Confirm the additional signing requirements.')
  insist(!before.allowPaper, 'Turn off paper signing before enabling this unvalidated electronic profile.', 409)
  const after = structuredClone(before), at = now()
  after.part11 = { actor: context.actor.id, at }
  await appendEvent(after, 'envelope.part11_enabled', context.actor.id, { part11: after.part11, consent: true })
  const result = { id: after.id, part11: after.part11 }
  await commitEnvelope(env, before, after, context.actor, [commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)], [roleGuard(context.actor, ['owner', 'admin'])])
  return result
}
type Challenge = { token_hash: string; session_hash: string; code_hash: string; expires: number; attempts: number; generation: number; sent_at: number }
const challenge = (env: Env, c: SigningContext) => env.DB.prepare('SELECT * FROM iw_part11_challenges WHERE envelope_id=? AND signer=?').bind(c.envelope.id, c.recipient.row).first<Challenge>()
const guard = (c: SigningContext, row: Challenge): Guard => ({ sql: 'EXISTS(SELECT 1 FROM iw_part11_challenges WHERE envelope_id=? AND signer=? AND token_hash=? AND session_hash=? AND code_hash=? AND generation=? AND attempts=? AND attempts<5 AND expires>?)', values: [c.envelope.id, c.recipient.row, c.recipient.token_hash, c.recipient.session_hash, row.code_hash, row.generation, row.attempts, Date.now()] })
export async function requestSignatureCode(env: Env, c: SigningContext, request: Request) {
  insist(c.verified, 'Verify your identity before requesting signature re-authentication.', 401)
  turn(c); accessGate(c); disclosureGate(recipientOf(c), 're-authenticating')
  insist(c.envelope.part11, 'This envelope does not require the profile.', 409)
  await signerIdentity(env,c,request)
  insist(!mailSuppressed(env), 'Signature re-authentication requires configured email delivery.', 409)
  const previous = await challenge(env, c), at = Date.now(), sameIdentity=previous?.token_hash===c.recipient.token_hash, generation = (sameIdentity ? previous.generation : 0) + 1
  insist(!sameIdentity || previous.sent_at < at - 60_000, 'Wait one minute before requesting another signature code.', 429)
  if(generation>10) {
    const after=structuredClone(c.envelope);await appendEvent(after,'signer.signature_code_exhausted',`signer:${c.recipient.signer+1}`,{signer:c.recipient.signer})
    await commitEnvelope(env,c.envelope,after,null,await securityAlertWrites(env,c,'signature-code-requests'),[liveGuard(c),sessionGuard(c)])
    await dispatchMail(env,after.id).catch(()=>undefined)
    insist(false,'The signature code request limit was reached. Contact the sender.',429)
  }
  const code = randomCode(), hash = await sha256(`${env.SESSION_SECRET}:${c.recipient.token_hash}:${c.recipient.session_hash}:${generation}:${code}`), after = structuredClone(c.envelope)
  await appendEvent(after, 'signer.signature_code_requested', `signer:${c.recipient.signer + 1}`, { signer: c.recipient.signer, ...(c.recipient.member === undefined ? {} : { member: c.recipient.member }), generation })
  await commitEnvelope(env, c.envelope, after, null, [env.DB.prepare('INSERT INTO iw_part11_challenges(envelope_id,signer,token_hash,session_hash,code_hash,expires,attempts,generation,sent_at) VALUES(?,?,?,?,?,?,0,?,?) ON CONFLICT(envelope_id,signer) DO UPDATE SET token_hash=excluded.token_hash,session_hash=excluded.session_hash,code_hash=excluded.code_hash,expires=excluded.expires,attempts=0,generation=excluded.generation,sent_at=excluded.sent_at').bind(after.id,c.recipient.row,c.recipient.token_hash,c.recipient.session_hash,hash,at+600_000,generation,at), noticeWrite(env.DB, after, c.recipient.signer, recipientOf(c).email, 'Your Inkwell signature code', `Your Inkwell signature code is ${code}.\n\nUse it only to sign ${after.title}. It expires in 10 minutes. Do not share it.`)], [liveGuard(c), sessionGuard(c), { sql: previous ? 'EXISTS(SELECT 1 FROM iw_part11_challenges WHERE envelope_id=? AND signer=? AND generation=?)' : 'NOT EXISTS(SELECT 1 FROM iw_part11_challenges WHERE envelope_id=? AND signer=?)', values: [after.id,c.recipient.row,...(previous?[previous.generation]:[])] }])
  await dispatchMail(env, after.id)
  return { ok: true }
}
export async function signatureProof(env: Env, c: SigningContext, input: Record<string, unknown>, request: Request) {
  if (!c.envelope.part11) return undefined
  const identity = await signerIdentity(env,c,request)
  const reason = text(input.signingReason, 'your signing reason', 120)
  insist((await signingMeanings(env)).includes(reason), 'Choose a configured signing meaning.')
  const code = text(input.signatureCode, 'a fresh signature code', 6), row = await challenge(env,c)
  insist(/^\d{6}$/.test(code), 'Enter the six-digit signature code.')
  insist(row && row.token_hash === c.recipient.token_hash && row.session_hash === c.recipient.session_hash && row.expires > Date.now() && row.attempts < 5, 'Request a fresh signature code: this one expired, was used or reached its attempt limit.', 401)
  const hash = await sha256(`${env.SESSION_SECRET}:${c.recipient.token_hash}:${c.recipient.session_hash}:${row.generation}:${code}`), fence = guard(c,row)
  if (hash !== row.code_hash) {
    const after = structuredClone(c.envelope)
    await appendEvent(after, 'signer.signature_code_rejected', `signer:${c.recipient.signer+1}`, { signer: c.recipient.signer, ...(c.recipient.member===undefined?{}:{member:c.recipient.member}), attempt: row.attempts+1, ...c.client })
    await commitEnvelope(env,c.envelope,after,null,[env.DB.prepare('UPDATE iw_part11_challenges SET attempts=attempts+1 WHERE envelope_id=? AND signer=?').bind(after.id,c.recipient.row),...(row.attempts===4?await securityAlertWrites(env,c,'signature-code-attempts'):[])],[liveGuard(c),sessionGuard(c),fence])
    if(row.attempts===4)await dispatchMail(env,after.id).catch(()=>undefined)
    insist(false, 'The signature code is incorrect.', 401)
  }
  const evidence = { reason, reauthenticatedAt: now(), method: 'verified identity and single-use emailed code' as const, name: identity.row.name, identity: identity.evidence }
  await validatePdfText([evidence.name, reason])
  return { evidence, fence, identityGuards: identity.guards, consume: env.DB.prepare('DELETE FROM iw_part11_challenges WHERE envelope_id=? AND signer=?').bind(c.envelope.id,c.recipient.row) }
}
