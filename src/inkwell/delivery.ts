// DELIV-001: each message's delivery status. Inkwell records which provider accepted a message and the id it gave
// (mail.ts); the provider's signed webhook then reaches Base's verified delivery-event intake, which keeps durable
// receipts and per-recipient state in D1. Status is read from those facts, never inferred: a provider that reports no
// delivery events (Cloudflare Email as Inkwell sends it, the development outbox) is labelled as such and never shown
// as delivered or bounced.
import { deliveryIntake, type DeliveryEvent } from '../mail-events.server.mjs'
import { readBytes } from './body'
import { Refusal, insist, type Env } from './model'

const tenantId = 'inkwell'
/** Providers whose signed delivery events Inkwell takes in, through Base's intake. */
const eventProviders = ['resend', 'sendgrid']
const eventNamespace = (provider: string) => `${provider}-webhook`
/** Delivery events arrive only when the provider sends them and the installation holds its webhook signing key. */
export const deliveryEventsReady = (env: Env) => eventProviders.includes(env.MAIL_PROVIDER ?? '') && Boolean(env.MAIL_WEBHOOK_KEY)

/** POST /api/inkwell/mail/events: one signed provider webhook. Every event in it must name a message this
 * installation sent to that recipient through that provider, or the whole batch is refused before anything is stored. */
export async function receiveDeliveryEvents(env: Env, request: Request) {
  insist(deliveryEventsReady(env), 'Delivery events are not set up for this installation.', 404)
  const rawBody = await readBytes(request, 1024 * 1024), provider = env.MAIL_PROVIDER!
  const intake = deliveryIntake(env, { tenantId, eventNamespace: eventNamespace(provider), authorize: event => sentHere(env, provider, event) })
  try {
    const results = await intake.ingestWebhook({ rawBody, headers: request.headers })
    return { received: results.length, stored: results.filter(result => result.outcome === 'stored').length }
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'event_signature_invalid') throw new Refusal('The event signature did not verify.', 401)
    if (code === 'event_unauthorized') throw new Refusal('The event names a message this installation did not send.', 403)
    if (!code || code === 'event_storage_failed') throw new Refusal('The event could not be stored. Send it again.', 503)
    throw new Refusal(`The event was refused (${code}).`, 400)
  }
}

/** Read-only: Resend events carry the id Resend returned at send; SendGrid events carry the signed rer_delivery_id
 * (the iw_mail id) because SendGrid's event message id extends the one it returned. */
async function sentHere(env: Env, provider: string, event: DeliveryEvent) {
  for (const recipient of event.recipients) {
    const row = provider === 'sendgrid'
      ? event.deliveryId && await env.DB.prepare("SELECT 1 AS ok FROM iw_mail WHERE id=? AND provider='sendgrid' AND state='sent' AND lower(recipient)=lower(?)").bind(event.deliveryId, recipient).first()
      : await env.DB.prepare("SELECT 1 AS ok FROM iw_mail WHERE provider=? AND provider_message_id=? AND state='sent' AND lower(recipient)=lower(?)").bind(provider, event.providerMessageId, recipient).first()
    if (!row) return false
  }
  return event.recipients.length > 0
}

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed' | 'complained' | 'uncertain' | 'not_sent'
export interface Message { id: string; kind: string; signer: number; recipient: string; subject: string; status: MessageStatus; label: string; createdAt: string; sentAt?: string; deliveredAt?: string; openedAt?: string; bouncedAt?: string; failedAt?: string }
interface Row { id: string; kind: string; signer: number; recipient: string; subject: string; state: string; provider: string | null; provider_message_id: string | null; created_at: string; sent_at: string | null }
const iso = (ms: number) => new Date(ms).toISOString()
const earliest = (events: DeliveryEvent[], match: (event: DeliveryEvent) => boolean) => { const times = events.filter(match).map(event => event.occurredAt); return times.length ? iso(Math.min(...times)) : undefined }

/** Every message sent for one envelope, oldest first, with the status its provider's events support. */
export async function envelopeMessages(env: Env, envelopeId: string): Promise<Message[]> {
  const rows = (await env.DB.prepare('SELECT id,kind,signer,recipient,subject,state,provider,provider_message_id,created_at,sent_at FROM iw_mail WHERE envelope_id=? ORDER BY created_at,rowid').bind(envelopeId).all<Row>()).results
  const events = (await env.DB.prepare("SELECT r.event_json FROM rer_mail_event_receipts r JOIN iw_mail m ON m.envelope_id=? AND r.provider=m.provider AND r.tenant_id=? AND (json_extract(r.event_json,'$.providerMessageId')=m.provider_message_id OR json_extract(r.event_json,'$.deliveryId')=m.id)").bind(envelopeId, tenantId).all<{ event_json: string }>()).results.map(row => JSON.parse(row.event_json) as DeliveryEvent)
  const own = (row: Row) => events.filter(event => event.provider === row.provider && (event.deliveryId === row.id || event.providerMessageId === row.provider_message_id) && event.recipients.some(r => r.toLowerCase() === row.recipient.toLowerCase()))
  const states = await Promise.all(rows.map(async row => {
    const ids = [...new Set(own(row).map(event => event.providerMessageId))]
    if (!ids.length || !row.provider) return null
    return env.DB.prepare(`SELECT status,occurred_at FROM rer_mail_event_states WHERE provider=? AND tenant_id=? AND event_namespace=? AND lower(recipient)=lower(?) AND provider_message_id IN (${ids.map(() => '?').join(',')}) ORDER BY terminal DESC,occurred_at DESC LIMIT 1`).bind(row.provider, tenantId, eventNamespace(row.provider), row.recipient, ...ids).first<{ status: string; occurred_at: number }>()
  }))
  return rows.map((row, index) => {
    const mine = own(row), state = states[index]
    const base = { id: row.id, kind: row.kind, signer: row.signer, recipient: row.recipient, subject: row.subject, createdAt: row.created_at, ...(row.sent_at ? { sentAt: row.sent_at } : {}) }
    if (['pending', 'sending'].includes(row.state)) return { ...base, status: 'queued' as const, label: 'Queued' }
    if (row.state === 'cancelled') return { ...base, status: 'not_sent' as const, label: 'Not sent: mail is not set up' }
    if (row.state === 'uncertain') return { ...base, status: 'uncertain' as const, label: 'Uncertain: the provider’s answer was unclear, so it was not sent again' }
    if (row.state !== 'sent') return { ...base, status: 'failed' as const, label: 'Failed: the provider refused it' }
    if (!eventProviders.includes(row.provider ?? '')) return { ...base, status: 'sent' as const, label: row.provider === 'development' ? 'Sent to the development outbox, not to a mailbox' : 'Sent, no delivery confirmation from this provider' }
    const deliveredAt = earliest(mine, event => event.status === 'delivered'), openedAt = earliest(mine, event => ['open', 'email.opened'].includes(event.type))
    const times = { ...(deliveredAt ? { deliveredAt } : {}), ...(openedAt ? { openedAt } : {}) }
    if (state?.status === 'bounced') return { ...base, ...times, bouncedAt: iso(state.occurred_at), status: 'bounced' as const, label: 'Bounced' }
    if (state && ['failed', 'rejected'].includes(state.status)) return { ...base, ...times, failedAt: iso(state.occurred_at), status: 'failed' as const, label: 'Failed: the provider could not deliver it' }
    if (state?.status === 'complained') return { ...base, ...times, status: 'complained' as const, label: 'Delivered, then marked as spam' }
    if (openedAt) return { ...base, ...times, status: 'opened' as const, label: 'Opened' }
    if (deliveredAt) return { ...base, ...times, status: 'delivered' as const, label: 'Delivered' }
    return { ...base, status: 'sent' as const, label: state?.status === 'deferred' ? 'Sent, delivery delayed' : deliveryEventsReady(env) || mine.length ? 'Sent, no delivery event yet' : 'Sent, delivery events are not set up' }
  })
}
