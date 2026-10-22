const constantEqual = (a: string, b: string) => { if(a.length!==b.length)return false;let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0 }
import { validatePdfText } from '../pdf'
import { operatorAuth } from '../../auth.server'
import { appendEvent, canonical, id, insist, now, secret, sha256, text, type Actor, type Env } from '../model'
import { securityAlertWrites } from './security'
import { dispatchMail } from '../mail'
import { atomic, commitEnvelope, commandWrite, roleGuard, type Guard } from '../storage'
import { recipientOf, liveGuard, sessionGuard, type SigningContext } from '../signing'
import type { CommandContext } from '../envelopes'

type Identity = { operator_id: string; operator_version: number; email: string; name: string; method: string; verified_by: string; verified_at: string; version: number; activation_hash: string | null; activation_expires: number | null; salt: string | null; password_hash: string | null }
const cookieName = 'inkwell_part11_identity'
export const identityCookie = (env: Env, token = '') => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict${token ? '' : '; Max-Age=0'}${new URL(env.AUTH_ORIGIN).protocol === 'https:' ? '; Secure' : ''}`
const credential = (request: Request) => request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
const identity = (env: Env, operator: string) => env.DB.prepare("SELECT i.* FROM iw_part11_identities i JOIN oa_operators o ON o.id=i.operator_id AND o.version=i.operator_version AND lower(o.email)=i.email AND o.status='active' WHERE i.operator_id=?").bind(operator).first<Identity>()
/** No mailbox-only reset. An admin repeats identity verification and separately delivers a new activation token. */
export async function verifySignerIdentity(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(['owner','admin'].includes(context.actor.role), 'Only an owner or admin can verify a signer.', 403)
  insist(input.confirm === true, 'Confirm that you verified this person’s identity outside Inkwell.')
  const operator = text(input.operatorId, 'a member ID'), name = text(input.name, 'the verified printed name', 120), method = text(input.method, 'the identity verification method', 500)
  insist(!/[\x00-\x1f\x7f]/.test(name+method),'Use single-line names and identity methods.')
  await validatePdfText([name,method])
  const person = await env.DB.prepare("SELECT id,email,version FROM oa_operators WHERE id=? AND status='active'").bind(operator).first<{id:string;email:string;version:number}>()
  insist(person, 'Choose an active member.', 409)
  const previous = await env.DB.prepare('SELECT version FROM iw_part11_identities WHERE operator_id=?').bind(operator).first<{version:number}>()
  const token = secret(), at = now(), record = { operator, email: person.email.toLowerCase(), name, method, verifiedBy: context.actor.id, at, version: (previous?.version ?? 0) + 1 }
  const result = { operatorId: operator, version: record.version }
  await atomic(env.DB, [roleGuard(context.actor,['owner','admin']), {sql:"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND email=?)",values:[operator,person.version,person.email]}, {sql:previous?'EXISTS(SELECT 1 FROM iw_part11_identities WHERE operator_id=? AND version=?)':'NOT EXISTS(SELECT 1 FROM iw_part11_identities WHERE operator_id=?)', values:[operator,...(previous?[previous.version]:[])]}], [
    env.DB.prepare('INSERT INTO iw_part11_identities(operator_id,operator_version,email,name,method,verified_by,verified_at,version,activation_hash,activation_expires) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET operator_version=excluded.operator_version,email=excluded.email,name=excluded.name,method=excluded.method,verified_by=excluded.verified_by,verified_at=excluded.verified_at,version=excluded.version,activation_hash=excluded.activation_hash,activation_expires=excluded.activation_expires,salt=NULL,password_hash=NULL,activated_at=NULL').bind(operator,person.version,record.email,name,method,context.actor.id,at,record.version,await sha256(token),Date.now()+86400000),
    env.DB.prepare('DELETE FROM iw_part11_sessions WHERE operator_id=?').bind(operator),
    env.DB.prepare("INSERT INTO iw_part11_records VALUES(?,'identity',?,?,?)").bind(id(),context.actor.id,at,canonical(record)),
    commandWrite(env.DB,context.actor.id,context.commandId,context.fingerprint,result),
  ])
  return { ...result, activationToken: token }
}
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const hash = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:600_000},key,256)
  return Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('')
}
export async function enrollPassword(env: Env, actor: Actor, input: Record<string, unknown>) {
  const row = await identity(env,actor.id)
  insist(row?.activation_hash && row.activation_expires!==null && row.activation_expires>Date.now() && !row.password_hash, 'An admin must first verify your identity and give you a new activation token.', 403)
  const password = text(input.password, 'a password', 128), activation = text(input.activationToken, 'your activation token', 64)
  insist(password.length >= 15, 'Use at least 15 characters for this separate password.')
  insist(constantEqual(await sha256(activation), row.activation_hash), 'The activation token is invalid.', 403)
  const salt = secret(), hash = await passwordHash(password,salt)
  await atomic(env.DB,[roleGuard(actor,['owner','admin','sender','viewer']), {sql:'EXISTS(SELECT 1 FROM iw_part11_identities WHERE operator_id=? AND version=? AND activation_hash=? AND activation_expires>? AND password_hash IS NULL)', values:[actor.id,row.version,row.activation_hash,Date.now()]}],[env.DB.prepare('UPDATE iw_part11_identities SET activation_hash=NULL,activation_expires=NULL,salt=?,password_hash=?,activated_at=? WHERE operator_id=?').bind(salt,hash,now(),actor.id)])
  return { ok: true }
}
export async function authenticateSigner(env: Env, c: SigningContext, input: Record<string, unknown>) {
  insist(c.envelope.part11 && c.verified, 'Verify your signing invitation first.', 401)
  const row = await env.DB.prepare("SELECT i.operator_id FROM iw_part11_identities i JOIN oa_operators o ON o.id=i.operator_id WHERE i.email=? AND o.status='active'").bind(recipientOf(c).email.toLowerCase()).first<{operator_id:string}>()
  const verified = row ? await identity(env,row.operator_id) : null
  insist(verified?.salt && verified.password_hash, 'Part 11 signing needs a verified signer account', 403)
  const window = Math.floor(Date.now()/600_000)
  const count = await env.DB.prepare('INSERT INTO iw_part11_password_attempts VALUES(?,?,1) ON CONFLICT(operator_id) DO UPDATE SET window=excluded.window,attempts=CASE WHEN iw_part11_password_attempts.window=excluded.window THEN attempts+1 ELSE 1 END RETURNING attempts').bind(verified.operator_id,window).first<{attempts:number}>()
  const password = text(input.password, 'your signer password', 128)
  const correct = Boolean(count&&count.attempts<=5&&constantEqual(await passwordHash(password,verified.salt),verified.password_hash))
  if(count && count.attempts>=5 && !correct) {
    const after=structuredClone(c.envelope);await appendEvent(after,'signer.identity_attempts_exhausted',`signer:${c.recipient.signer+1}`,{signer:c.recipient.signer})
    await commitEnvelope(env,c.envelope,after,null,await securityAlertWrites(env,c,'signer-password-attempts'),[liveGuard(c),sessionGuard(c)])
    await dispatchMail(env,after.id).catch(()=>undefined)
    c.envelope=after
  }
  insist(count && count.attempts<=5, 'Password attempts exhausted. Wait ten minutes and contact your security administrator.', 429)
  insist(correct, 'The signer password is incorrect.', 401)
  const token=secret(), at=Date.now()
  await atomic(env.DB,[liveGuard(c),sessionGuard(c),identityGuard(verified)],[env.DB.prepare('INSERT INTO iw_part11_sessions VALUES(?,?,?,?,?)').bind(await sha256(token),verified.operator_id,verified.version,at,at+86400000)])
  return identityCookie(env,token)
}
function identityGuard(row: Identity): Guard {
  return {sql:"EXISTS(SELECT 1 FROM iw_part11_identities i JOIN oa_operators o ON o.id=i.operator_id WHERE i.operator_id=? AND i.version=? AND i.operator_version=o.version AND lower(o.email)=i.email AND o.status='active')",values:[row.operator_id,row.version]}
}
/** A separate identity session grants no app access. Email-link, owner-setup, review and dev sessions never qualify. */
export async function signerIdentity(env: Env, c: SigningContext, request: Request) {
  let row: Identity | null = null, method: 'password' | 'OIDC' = 'password', fence: Guard | undefined
  const token = credential(request), hash = token ? await sha256(token) : ''
  if (token) {
    const session = await env.DB.prepare('SELECT operator_id,identity_version FROM iw_part11_sessions WHERE token_hash=? AND expires>?').bind(hash,Date.now()).first<{operator_id:string;identity_version:number}>()
    if(session) { row=await identity(env,session.operator_id); if(row?.version!==session.identity_version)row=null }
    fence={sql:'EXISTS(SELECT 1 FROM iw_part11_sessions WHERE token_hash=? AND operator_id=? AND identity_version=? AND expires>?)',values:[hash,row?.operator_id??'',row?.version??0,Date.now()]}
  }
  if (!row) {
    const session=await operatorAuth(env).getSession(request)
    if(session?.kind==='oidc') {
      row=await identity(env,session.operator.id);method='OIDC'
      // Base validates current provider binding, policy generation and pin on read; repeat those facts in the signature batch.
      fence={sql:"EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_provider_sessions p ON p.session_id=s.id JOIN oa_auth_settings a ON a.singleton=1 AND a.idp_sign_in=1 AND a.generation=p.generation JOIN oa_external_identities e ON e.issuer=p.issuer AND e.subject=p.subject AND e.operator_id=s.operator_id WHERE s.id=? AND s.operator_id=? AND s.operator_version=? AND s.revoked_at IS NULL AND s.expires_at>? AND NOT EXISTS(SELECT 1 FROM oa_provider_session_pins pin WHERE pin.session_id=s.id AND NOT EXISTS(SELECT 1 FROM oa_identity_providers provider WHERE provider.provider_id=pin.provider_id AND provider.status='linked' AND provider.issuer=pin.issuer AND provider.client_id=pin.client_id AND provider.linked_at=pin.linked_at)))",values:[session.id,session.operator.id,session.operator.version,Date.now()]}
    }
  }
  insist(row && fence && row.email===recipientOf(c).email.toLowerCase(), 'Part 11 signing needs a verified signer account', 403)
  return { row, method, guards:[identityGuard(row),fence], evidence:{operator:row.operator_id,version:row.version,name:row.name,method:row.method,verifiedBy:row.verified_by,verifiedAt:row.verified_at,component:method} }
}

export async function endSignerIdentity(env: Env, request: Request) { const token=credential(request);if(token)await env.DB.prepare('DELETE FROM iw_part11_sessions WHERE token_hash=?').bind(await sha256(token)).run();return identityCookie(env) }
