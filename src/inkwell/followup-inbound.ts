import { mailbox, htmlText, authFailed } from './inbound-content'
import { receiveAgentMessage } from './agent-workflows'
import { normalizeInbound, createResendAttachmentFetcher, verifyWebhook } from '../mail-inbound.server.mjs'
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

async function signedEvent(request: Request, secret: string): Promise<{ eventId: string; event: Json }> {
  const raw = await readBytes(request, 1024 * 1024)
  insist(await verifyWebhook({provider:'resend',rawBody:raw,headers:request.headers,key:secret,now:Date.now(),toleranceSeconds:300}),'The inbound signature did not verify.',401)
  const eventId=request.headers.get('svix-id')!
  try{return{eventId,event:record(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)))}}
  catch{throw new Refusal('The signed inbound event is invalid JSON.',400)}
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
    if(await receiveAgentMessage(env,eventId,emailId,message))return Response.json({ok:true,received:true})
    const to = strings(message.to), domain = env.MAIL_INBOUND_DOMAIN.toLowerCase()
    const tokens = [...new Set(to.filter(address => mailbox(address)?.endsWith(`@${domain}`)).map(address => address.match(/reply\+([A-Za-z0-9_-]{43})@/i)?.[1]).filter((token): token is string => Boolean(token)))]
    insist(tokens.length === 1, 'This message has no unique current reply address.', 403)
    const token = tokens[0], capability = await resolveReplyCapability(env, token)
    insist(capability, 'This reply address is unknown or no longer current.', 403)
    const normalized=await normalizeInbound({provider:'resend',signedEmailId:emailId,email:message,fetchAttachment:createResendAttachmentFetcher({apiKey:env.MAIL_INBOUND_API_KEY,maxAttachmentBytes:attachmentLimit})},{maxRawBytes:messageLimit,maxBodyBytes:messageLimit,maxAttachments:100,maxAttachmentBytes:attachmentLimit,maxTotalAttachmentBytes:attachmentLimit})
    const sourceHeaders = record(message.headers), headers = new Map(Object.entries(sourceHeaders).map(([name, value]) => [name.toLowerCase(), field(value, 64 * 1024)]))
    const from = field(message.from), normalizedFrom = mailbox(from)
    const verified = Boolean(normalizedFrom && normalizedFrom === mailbox(followupRecipient(capability.envelope,capability.signer).email) &&
      (!headers.has('from') || normalizedFrom === mailbox(headers.get('from')!)) && !authFailed(message, headers))
    const body = normalized.text ?? htmlText(normalized.html??'')
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
      attachments: await Promise.all(normalized.attachments.map(async attachment=>({name:scrub(attachment.filename),type:scrub(attachment.contentType),size:attachment.content.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',attachment.content as BufferSource)),byte=>byte.toString(16).padStart(2,'0')).join(''),status:'not kept by Inkwell' as const}))),
    }
    await storeReply(env, capability.envelope, capability.signer, reply, eventId)
    return Response.json({ ok: true, received: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    // Never return provider bodies/errors, addresses, headers, capabilities or reply text.
    const refusal = error instanceof Refusal ? error : new Refusal('The inbound reply could not be processed completely.', 503)
    return Response.json({ ok: false, error: refusal.message }, { status: refusal.status, headers: { 'cache-control': 'no-store' } })
  }
}
