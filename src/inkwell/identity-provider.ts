import { insist, type Env } from './model'

export interface IdentityBindings { STRIPE_IDENTITY_SECRET_KEY?: string }
export const identityReady = (env: Env) => Boolean((env as Env & IdentityBindings).STRIPE_IDENTITY_SECRET_KEY)

/** Fixed Stripe Identity edge. Provider bodies stay in memory and are never logged or stored. */
async function stripe(env: Env, path: string, form?: URLSearchParams, key?: string): Promise<Record<string, any>> {
  const secret = (env as Env & IdentityBindings).STRIPE_IDENTITY_SECRET_KEY
  insist(secret, 'Identity verification is not configured. Ask the owner to configure Stripe Identity.', 503)
  let response: Response
  try {
    response = await fetch('https://api.stripe.com/v1/identity/' + path, {
      method: form ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: 'Bearer ' + secret, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(form ? { body: form.toString() } : {}),
    })
  } catch { insist(false, 'Identity provider unavailable. Try checking the existing verification again.', 503) }
  insist(response.ok, 'Identity provider could not complete this request. Contact the sender if it continues.', 503)
  const reader = response.body?.getReader(); insist(reader, 'Identity provider returned no receipt.', 503)
  const decoder = new TextDecoder(); let body = '', size = 0
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 128 * 1024) { await reader.cancel(); insist(false, 'Identity provider receipt is too large.', 503) }; body += decoder.decode(part.value, {stream:true}) }; body += decoder.decode() } finally { reader.releaseLock() }
  try { return JSON.parse(body) } catch { insist(false, 'Identity provider returned an invalid receipt.', 503) }
}

export async function startIdentity(env: Env, key: string) {
  const result = await stripe(env, 'verification_sessions', new URLSearchParams({
    type: 'document', 'options[document][require_matching_selfie]': 'true',
    client_reference_id: key,
  }), key)
  insist(typeof result.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(result.id), 'Invalid identity verification reference.', 503)
  return { reference: result.id as string, url: identityUrl(result.url) }
}

function identityUrl(value: unknown): string {
  insist(typeof value === 'string', 'Identity provider returned no verification page.', 503)
  const url = new URL(value)
  insist(url.protocol === 'https:' && url.hostname === 'verify.stripe.com' && !url.username && !url.password, 'Identity provider returned an invalid verification page.', 503)
  return url.href
}

/** Exact full-name comparison after Unicode, whitespace and case normalization; no fuzzy acceptance. */
export async function checkIdentity(env: Env, reference: string, expectedName: string) {
  const result = await stripe(env, 'verification_sessions/' + encodeURIComponent(reference) + '?expand[]=last_verification_report')
  insist(result.id === reference, 'Identity provider returned the wrong verification reference.', 503)
  if (result.status === 'processing') return { outcome: 'pending' as const }
  if (result.status === 'requires_input' && !result.last_error) return { outcome: 'pending' as const }
  const report = result.last_verification_report, document = report?.document
  const normalize = (v: string) => v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
  const name = [document?.first_name, document?.last_name].filter(v => typeof v === 'string').join(' ')
  const matched = Boolean(name && normalize(name) === normalize(expectedName))
  const verified = result.status === 'verified' && report?.verification_session === reference && document?.status === 'verified' && report?.selfie?.status === 'verified'
  return { outcome: verified && matched ? 'passed' as const : 'failed' as const, nameMatch: matched }
}
