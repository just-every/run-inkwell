import { active, appendEvent, canonical, currentSigners, insist, secret, sha256, text, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { insistAccess } from './members'
import { signInMethod } from './own-signing'
import type { CommandContext } from './envelopes'

const cookieName = (env: Env) => { const origin = new URL(env.AUTH_ORIGIN); return env.AUTH_LOCAL === 'true' ? `inkwell_hosted_local_${origin.port || (origin.protocol === 'https:' ? '443' : '80')}` : '__Host-inkwell_hosted' }
export const hostedCredential = (request: Request, env: Env) => request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName(env) + '='))?.slice(cookieName(env).length + 1)
export const hostedCookie = (env: Env, value = '') => `${cookieName(env)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value ? 86400 : 0}${new URL(env.AUTH_ORIGIN).protocol === 'https:' ? '; Secure' : ''}`

/** ROUTE-007: exchange the host's app session for one recipient's signing session. No host credentials survive the handoff. */
export async function hostSigning(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  await insistAccess(env, context.actor, before, 'edit')
  active(before)
  const index = input.signer
  insist(Number.isInteger(index) && currentSigners(before).includes(index as number), 'Choose a signer whose turn it is.', 409)
  const signer = before.signers[index as number]
  insist(signer.inPerson, 'This recipient is not an in-person signer.', 409)
  const member = await env.DB.prepare('SELECT id FROM oa_operators WHERE lower(email)=?').bind(signer.email.toLowerCase()).first<{ id: string }>()
  insist(signer.email.toLowerCase() !== context.actor.email.toLowerCase() && member?.id !== context.actor.id, 'The host cannot be the in-person signer.', 403)
  insist(context.actor.sessionId, 'Sign in again before hosting.', 401)
  insist(input.confirmed === true && ['government-photo-id', 'personally-known'].includes(String(input.method)), 'Confirm the signer’s identity in person and choose how.')
  const device = input.screen as Record<string, unknown> | undefined
  insist(device && Number.isInteger(device.width) && Number.isInteger(device.height) && (device.width as number) > 0 && (device.height as number) > 0 && (device.width as number) <= 100000 && (device.height as number) <= 100000, 'Provide the screen size reported by the browser.')
  const sender = await env.DB.prepare('SELECT display_name AS name,email FROM oa_operators WHERE id=?').bind(before.createdBy).first<{ name: string; email: string }>()
  insist(sender?.name && sender.email, 'The sender’s name and contact email are required before hosting.', 409)
  const after = structuredClone(before), token = secret(), session = secret()
  after.signers[index as number].hostedSender = { ...sender, version: 'inkwell-esign-2026-10-19-in-person-' + (await sha256(canonical(sender))).match(/.{1,16}/g)!.join('-') }
  await appendEvent(after, 'signer.in_person_hosted', context.actor.id, { signer: index, host: { id: context.actor.id, name: context.actor.name, email: context.actor.email }, signIn: await signInMethod(env, context.actor.sessionId), method: input.method, screen: { width: device.width, height: device.height }, ...context.client })
  const result = { id: after.id, status: after.status }
  await commitEnvelope(env, before, after, context.actor, [
    env.DB.prepare('UPDATE iw_signers SET token_hash=?,link_sealed=NULL,code_hash=NULL,code_expires=NULL,session_hash=?,session_expires=? WHERE envelope_id=? AND signer=?').bind(await sha256(token), await sha256(session), Date.now() + 86400000, after.id, index),
    env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND signer=? AND state='pending'").bind(after.id, index),
    env.DB.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=?').bind(Date.now(), context.actor.sessionId),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result),
  ])
  return { ...result, signing: { url: new URL('/sign/' + token, env.AUTH_ORIGIN).href }, cookie: hostedCookie(env, token + '.' + session) }
}

/** Before any auth/import/app door: a hosted browser may use only this signing request. The revoked host session also
 * protects requests where a browser omits or deletes the marker. Ended, voided, rotated and expired sessions sign out. */
export async function hostedResponse(request: Request, env: Env): Promise<Response | null> {
  const credential = hostedCredential(request, env)
  if (!credential) return null
  const [token, session] = credential.split('.')
  const row = /^[a-f0-9]{64}$/.test(token ?? '') && /^[a-f0-9]{64}$/.test(session ?? '') ? await env.DB.prepare('SELECT s.session_hash,s.session_expires,e.data FROM iw_signers s JOIN iw_envelopes e ON e.id=s.envelope_id WHERE s.token_hash=?').bind(await sha256(token)).first<{ session_hash: string; session_expires: number; data: string }>() : null
  const envelope = row ? JSON.parse(row.data) : null
  const live = row && row.session_expires > Date.now() && await sha256(session) === row.session_hash && envelope.status === 'awaiting_signature' && Date.parse(envelope.expiresAt) > Date.now()
  const path = new URL(request.url).pathname
  if (live && (path === '/sign/' + token || path === '/api/sign/' + token || path.startsWith('/api/sign/' + token + '/'))) return null
  const headers = new Headers({ 'cache-control': 'no-store' })
  if (!live) headers.append('set-cookie', hostedCookie(env))
  if (path.startsWith('/api/')) return Response.json({ error: live ? 'This device is limited to the hosted signing request.' : 'Hosted signing ended. The host must sign in again.' }, { status: 401, headers })
  if (!live && path === '/signin') return null
  headers.set('location', live ? '/sign/' + token : '/signin')
  return new Response(null, { status: 303, headers })
}
