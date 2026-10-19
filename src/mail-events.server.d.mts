import type { Bindings } from './auth.server'
/** One normalized, signature-verified provider event (Base mail events README). */
export interface DeliveryEvent { provider: string; tenantId: string; eventNamespace: string; eventId: string; providerMessageId: string; type: string; status: 'accepted' | 'deferred' | 'delivered' | 'bounced' | 'failed' | 'rejected' | 'complained' | null; occurredAt: number; recipients: readonly string[]; deliveryId: string | null; product: string | null; fingerprint: string }
export interface DeliveryResult { eventId: string; outcome: 'stored' | 'duplicate'; recipients: { recipient: string; applied: boolean; state: { status: string; occurredAt: number; eventId: string } }[] }
export function deliveryIntake(env: Bindings, options: { tenantId: string; eventNamespace: string; authorize: (event: DeliveryEvent) => Promise<boolean> }): { ingestWebhook(input: { rawBody: Uint8Array; headers: Headers }): Promise<DeliveryResult[]> }
