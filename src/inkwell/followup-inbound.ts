import { followupRecipient } from './followup-recipients'
// AGENT-003 R11–17: this door authenticates provider facts; reply text is data, never instructions.
import { readBytes } from './body'
import { Refusal, insist, type Env } from './model'
import { resolveReplyCapability, storeReply } from './followup-store'
import type { FollowupReply } from './followup-inbound-types'
export type { FollowupReply } from './followup-inbound-types'

const encoder = new TextEncoder()
const bodyLimit = 500_000
const messageLimit = 16 * 1024 * 1024
const attachmentLimit = 40 * 1024 * 1024
const metadataLimit = 256 * 1024
const providerFailure = 'The inbound message could not be retrieved completely.'
type Json = Record<string, unknown>
const record = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const string = (value: unknown) => typeof value === 'string' ? value : ''
function field(value: unknown, max = 8192) {
  const result = string(value)
  insist(result.length <= max, 'Inbound message headers exceed the custody limit.', 413)
  return result
}
function strings(value: unknown): string[] {
  insist(Array.isArray(value) && value.length <= 100 && value.every(v => typeof v === 'string'), 'The inbound recipient list is invalid.', 400)
  return value.map(v => field(v))
}

/** Single mailbox only. Comments and a display name are not part of the normalized addr-spec. */
function mailbox(value: string): string | null {
  let cleaned = '', depth = 0, quoted = false, escaped = false
  for (const character of value.replace(/\r\n[ \t]+/g, ' ')) {
    if (escaped) { if (!depth) cleaned += character; escaped = false; continue }
    if (character === '\\' && (quoted || depth)) { if (!depth) cleaned += character; escaped = true; continue }
    if (!depth && character === '"') quoted = !quoted
    if (!quoted && character === '(') { depth++; continue }
    if (!quoted && character === ')' && depth) { depth--; continue }
    if (!depth) cleaned += character
  }
  if (depth || quoted || escaped || /[\r\n\0]/.test(cleaned)) return null
  const angle = cleaned.match(/^[^<>]*<([^<>]+)>\s*$/)
  if (cleaned.includes('<') && !angle) return null
  if (angle && /[,@;]/.test(cleaned.slice(0, cleaned.indexOf('<')).replace(/"(?:[^"\\]|\\.)*"/g, ''))) return null
  const address = (angle ? angle[1] : cleaned).trim()
  const match = address.match(/^("(?:[^"\\\r\n]|\\.)+"|[^\s<>(),;:"\\@]+)@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i)
  if (!match) return null
  const local = match[1].startsWith('"') ? match[1].slice(1, -1).replace(/\\(.)/g, '$1') : match[1]
  return `${local}@${match[2]}`.toLowerCase()
}

function unbase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0))
}
async function signedEvent(request: Request, secret: string): Promise<{ eventId: string; event: Json }> {
  const eventId = request.headers.get('svix-id') ?? ''
  const timestamp = request.headers.get('svix-timestamp') ?? ''
  const signatures = request.headers.get('svix-signature') ?? ''
  const invalid = () => new Refusal('The inbound signature did not verify.', 401)
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(eventId) || !/^\d{1,12}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !signatures || signatures.length > 4096 || !secret) throw invalid()
  let raw: Uint8Array
  try { raw = await readBytes(request, 1024 * 1024) } catch { throw invalid() }
  try {
    // Svix signs id.timestamp.rawBody with the base64-decoded whsec_ key.
    const prefix = encoder.encode(`${eventId}.${timestamp}.`)
    const content = new Uint8Array(prefix.length + raw.length)
    content.set(prefix); content.set(raw, prefix.length)
    const key = await crypto.subtle.importKey('raw', unbase64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    let verified = false
    for (const signature of signatures.split(/\s+/)) {
      if (!signature.startsWith('v1,')) continue
      try { if (await crypto.subtle.verify('HMAC', key, unbase64(signature.slice(3)), content)) verified = true } catch { /* A rotated signature may use a different format. */ }
    }
    if (!verified) throw invalid()
  } catch { throw invalid() }
  try { return { eventId, event: record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))) } }
  catch { throw new Refusal('The signed inbound event is invalid JSON.', 400) }
}

/** Never buffer an unbounded provider response; refuse the whole operation rather than truncate it. */
async function boundedBytes(response: Response, max: number): Promise<Uint8Array<ArrayBuffer>> {
  insist(response.ok && response.body, providerFailure, 503)
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) {
    await response.body.cancel()
    throw new Refusal('The inbound provider response exceeds the processing limit; no reply was kept.', 413)
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) { await reader.cancel(); throw new Refusal('The inbound provider response exceeds the processing limit; no reply was kept.', 413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}
async function providerJson(env: Env, path: string, max = metadataLimit): Promise<Json> {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { authorization: `Bearer ${env.MAIL_INBOUND_API_KEY}` }, redirect: 'manual', signal: AbortSignal.timeout(30_000),
  })
  const bytes = await boundedBytes(response, max)
  try { return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) }
  catch { throw new Refusal(providerFailure, 503) }
}
function providerId(value: unknown) {
  const result = string(value)
  insist(/^[a-zA-Z0-9_-]{1,128}$/.test(result), 'The inbound provider identifier is invalid.', 400)
  return result
}
function htmlText(html: string): string {
  // Render no HTML, execute nothing, fetch no image, and keep no script/style content.
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
      const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
      if (entity[0] !== '#') return named[entity.toLowerCase()] ?? whole
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd'
    })
}
function authFailed(message: Json, headers: Map<string, string>) {
  const authentication = record(message.authentication)
  return ['dkim', 'dmarc'].some(key => /^(?:fail|softfail|temperror|permerror)$/i.test(string(authentication[key]))) ||
    /\b(?:dkim|dmarc)\s*=\s*(?:fail|softfail|temperror|permerror)\b/i.test(headers.get('authentication-results') ?? '')
}

async function attachments(env: Env, emailId: string, input: unknown): Promise<FollowupReply['attachments']> {
  insist(Array.isArray(input) && input.length <= 100, 'The inbound attachment list exceeds the processing limit.', 413)
  const result: FollowupReply['attachments'] = []
  let total = 0
  // Bound memory and API concurrency: each real attachment is digested and immediately discarded.
  for (const value of input) {
    const metadata = record(value), attachmentId = providerId(metadata.id)
    const attachment = await providerJson(env, `/emails/receiving/${emailId}/attachments/${attachmentId}`)
    insist(Number.isSafeInteger(attachment.size) && Number(attachment.size) >= 0 && Number(attachment.size) <= attachmentLimit - total, 'Inbound attachments exceed the processing limit; no reply was kept.', 413)
    let url: URL
    try { url = new URL(string(attachment.download_url)) } catch { throw new Refusal(providerFailure, 503) }
    insist(url.protocol === 'https:' && !url.username && !url.password, providerFailure, 503)
    // This URL comes only from the authenticated provider API; never attach its API credential to downloads.
    const response = await fetch(url.href, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
    const bytes = await boundedBytes(response, attachmentLimit - total)
    insist(bytes.byteLength === attachment.size, providerFailure, 503)
    total += bytes.byteLength
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    result.push({ name: field(attachment.filename ?? metadata.filename), type: field(attachment.content_type ?? metadata.content_type, 1024), size: bytes.byteLength,
      sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''), status: 'not kept by Inkwell' })
  }
  return result
}

/** Dedicated HTTP door. Only storeReply's atomic write may persist, classify, pause, and claim the event id. */
export async function receiveFollowupReply(env: Env, request: Request): Promise<Response> {
  try {
    const { eventId, event } = await signedEvent(request, env.MAIL_INBOUND_SECRET ?? '')
    insist(env.MAIL_INBOUND_DOMAIN && env.MAIL_INBOUND_API_KEY, 'Inbound replies are not configured.', 503)
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString()
    await env.DB.prepare('DELETE FROM iw_followup_receipts WHERE received_at < ?').bind(cutoff).run()
    insist(!await env.DB.prepare('SELECT 1 FROM iw_followup_receipts WHERE event_id=?').bind(eventId).first(), 'This inbound event was already received.', 409)
    insist(event.type === 'email.received', 'Only received-email events are accepted here.', 400)
    const emailId = providerId(record(event.data).email_id)
    const message = await providerJson(env, `/emails/receiving/${emailId}?html_format=cid`, messageLimit)
    insist(message.id === emailId, providerFailure, 503)
    const to = strings(message.to), domain = env.MAIL_INBOUND_DOMAIN.toLowerCase()
    const tokens = [...new Set(to.filter(address => mailbox(address)?.endsWith(`@${domain}`)).map(address => address.match(/reply\+([A-Za-z0-9_-]{43})@/i)?.[1]).filter((token): token is string => Boolean(token)))]
    insist(tokens.length === 1, 'This message has no unique current reply address.', 403)
    const token = tokens[0], capability = await resolveReplyCapability(env, token)
    insist(capability, 'This reply address is unknown or no longer current.', 403)
    const sourceHeaders = record(message.headers), headers = new Map(Object.entries(sourceHeaders).map(([name, value]) => [name.toLowerCase(), field(value, 64 * 1024)]))
    const from = field(message.from), normalizedFrom = mailbox(from)
    const verified = Boolean(normalizedFrom && normalizedFrom === mailbox(followupRecipient(capability.envelope,capability.signer).email) &&
      (!headers.has('from') || normalizedFrom === mailbox(headers.get('from')!)) && !authFailed(message, headers))
    const body = typeof message.text === 'string' ? message.text : htmlText(string(message.html))
    const bodyBytes = encoder.encode(body).byteLength
    // To necessarily contains the secret reply capability. Remove it from every custody field before storage/export.
    const scrub = (value: string) => value.replace(/reply\+[A-Za-z0-9_-]{43}@[^\s<>"']+/gi, 'reply+[capability omitted]').replace(new RegExp(token, 'gi'), '[capability omitted]')
    const reply: FollowupReply = {
      automatic: /^(?:auto-replied|auto-generated)$/i.test(headers.get('auto-submitted')??'') || /^(?:yes|true|auto-replied)$/i.test(headers.get('x-autoreply')??headers.get('x-autorespond')??'') || headers.has('x-ms-exchange-inbox-rules-loop'),
      id: crypto.randomUUID(), receivedAt: new Date().toISOString(), provider: 'resend', providerMessageId: emailId, verified,
      senderLabel: verified ? 'provider-reported sender' : 'unverified sender, provider-reported',
      headers: { from: scrub(headers.get('from') ?? from), to: to.map(scrub), date: scrub(headers.get('date') ?? ''), subject: scrub(field(message.subject, 64 * 1024)),
        messageId: scrub(field(message.message_id)), inReplyTo: scrub(headers.get('in-reply-to') ?? ''), autoSubmitted: scrub(headers.get('auto-submitted') ?? '') },
      body: bodyBytes <= bodyLimit ? scrub(body) : null, bodyBytes, bodyStatus: bodyBytes <= bodyLimit ? 'kept' : 'reply too large to keep',
      attachments: (await attachments(env, emailId, message.attachments)).map(attachment => ({ ...attachment, name: scrub(attachment.name), type: scrub(attachment.type) })),
    }
    await storeReply(env, capability.envelope, capability.signer, reply, eventId)
    return Response.json({ ok: true, received: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    // Never return provider bodies/errors, addresses, headers, capabilities or reply text.
    const refusal = error instanceof Refusal ? error : new Refusal('The inbound reply could not be processed completely.', 503)
    return Response.json({ ok: false, error: refusal.message }, { status: refusal.status, headers: { 'cache-control': 'no-store' } })
  }
}
