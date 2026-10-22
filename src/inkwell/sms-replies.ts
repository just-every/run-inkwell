import { readBytes } from './body'
import { id, insist, now, sha256, type Envelope, type Env } from './model'
import { followupGrant, liveGrant, resolveReplyCapability, storeReply } from './followup-store'
import { smsReady, usMobile, type SmsBindings } from './sms'

/** Purpose-separated capability identifies one recipient and invitation epoch even when phone numbers are reused.
 * Only its hash is kept; neither the reply capability nor private reply text enters logs or audit. */
export async function smsReplyCapability(env: Env, e: Envelope, signer: number): Promise<string> {
  const g = await followupGrant(env, e.id)
  insist(g?.state === 'active' && g.channels.includes('sms') && await liveGrant(env, e, g), 'An active SMS follow-up grant is required.', 409)
  const row = await env.DB.prepare('SELECT token_hash FROM iw_signers WHERE envelope_id=? AND signer=?').bind(e.id, signer).first<{token_hash:string}>()
  insist(row, 'Recipient invitation is unavailable.', 409)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), {name:'HMAC',hash:'SHA-256'}, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`inkwell:followup-sms-reply:v1:${e.id}:${signer}:${row.token_hash}:${g.version}`)))
  const token = btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
  await env.DB.prepare('INSERT INTO iw_followup_capabilities(cap_hash,envelope_id,signer,token_hash,grant_version) VALUES(?,?,?,?,?) ON CONFLICT(cap_hash) DO NOTHING').bind(await sha256(token), e.id, signer, row.token_hash, g.version).run()
  return token
}

/** Twilio form webhook HMAC-SHA1, per https://www.twilio.com/docs/usage/security . The canonical URL is installation
 * configuration, never forwarded headers. Twilio supplies no signed timestamp; durable MessageSid replay refusal applies. */
export async function receiveSmsReply(env: Env, request: Request) {
  insist(smsReady(env), 'SMS replies are not configured.', 404)
  insist(request.headers.get('content-type')?.split(';')[0].trim() === 'application/x-www-form-urlencoded', 'Use a Twilio form webhook.', 415)
  const raw = await readBytes(request, 512 * 1024), form = new URLSearchParams(new TextDecoder().decode(raw)), names = [...form.keys()]
  insist(new Set(names).size === names.length && names.length <= 100, 'Invalid SMS webhook fields.')
  const settings = env as Env & SmsBindings, signature = request.headers.get('x-twilio-signature') ?? ''
  insist(/^[A-Za-z0-9+/]{27}=$/.test(signature), 'The SMS webhook signature did not verify.', 401)
  const canonical = new URL('/api/inkwell/sms/replies', env.AUTH_ORIGIN).href + names.sort().map(name => name + form.get(name)).join('')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(settings.TWILIO_AUTH_TOKEN!), {name:'HMAC',hash:'SHA-1'}, false, ['verify'])
  insist(await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(signature), c => c.charCodeAt(0)), new TextEncoder().encode(canonical)), 'The SMS webhook signature did not verify.', 401)
  insist(form.get('AccountSid') === settings.TWILIO_ACCOUNT_SID && form.get('To') === settings.TWILIO_FROM, 'SMS webhook names another account or sender.', 403)
  const messageId = form.get('MessageSid') ?? ''
  insist(/^[A-Za-z0-9_-]{1,100}$/.test(messageId), 'Invalid SMS message reference.')
  const eventId = 'twilio:' + messageId
  insist(!await env.DB.prepare('SELECT 1 FROM iw_followup_receipts WHERE event_id=?').bind(eventId).first(), 'This SMS reply was already received.', 409)
  insist(!form.get('NumMedia') || form.get('NumMedia') === '0', 'This signing reply channel accepts text SMS only.')
  const text = form.get('Body') ?? '', match = text.match(/^(?:reply\s+)?([A-Za-z0-9_-]{43})\s+([\s\S]*)$/i)
  if (!match) return { received: false }
  const target = await resolveReplyCapability(env, match[1])
  if (!target) return { received: false }
  const g = await followupGrant(env, target.envelope.id)
  if (!g?.channels.includes('sms')) return { received: false }
  const person = target.envelope.signers[target.signer]
  if (!person || person.group) return { received: false }
  const from = form.get('From') ?? ''
  let verified = false
  try { verified = Boolean(person.phone && usMobile(from) === person.phone) } catch { /* Kept as provider-reported unverified sender. */ }
  const body = match[2], bodyBytes = new TextEncoder().encode(body).length, at = now()
  await storeReply(env, target.envelope, target.signer, { id:id(), receivedAt:at, provider:'twilio', providerMessageId:messageId, verified,
    senderLabel:verified?'provider-reported sender':'unverified sender, provider-reported',
    headers:{from,to:[settings.TWILIO_FROM!],date:at,subject:'SMS reply',messageId,inReplyTo:'',autoSubmitted:''},
    body:bodyBytes<=500_000?body:null,bodyBytes,bodyStatus:bodyBytes<=500_000?'kept':'reply too large to keep',attachments:[] }, eventId)
  return { received: true }
}
