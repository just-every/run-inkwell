import { insist } from './model'
import { parsePaymentRequirement, paymentMethodType, paymentMode, type PaymentAuthority, type PaymentReceipt, type PaymentRequirement } from './payment-requirement'

export interface PaymentBindings { STRIPE_PAYMENTS_SECRET_KEY?: string; STRIPE_PAYMENTS_TEST_MODE?: string; STRIPE_PAYMENTS_BUYER_NAME?: string }
type ProviderObject = Record<string, unknown>
export interface StartPaymentCheckout {
  requirement: PaymentRequirement
  idempotencyKey: string
  /** Opaque, immutable identifier bound to this invitation and requirement by the caller. */
  reference: string
  buyerReference: string
  /** The caller constructs this from its own trusted installation origin. */
  returnUrl: string
}
export interface CheckPaymentCheckout { requirement: PaymentRequirement; reference: string; clientReference: string; buyerReference: string }
export const paymentsReady = (env: PaymentBindings) => Boolean(env.STRIPE_PAYMENTS_SECRET_KEY)

function credential(env: PaymentBindings) {
  const key = env.STRIPE_PAYMENTS_SECRET_KEY
  insist(key, 'Payments are not configured. Ask the sender to configure Stripe.', 503)
  insist(env.STRIPE_PAYMENTS_TEST_MODE === 'true', 'Payment at signing currently requires Stripe test mode.', 503)
  return { key, livemode: false }
}

function record(value: unknown): ProviderObject {
  insist(value && typeof value === 'object' && !Array.isArray(value), 'Stripe returned an invalid payment receipt.', 503)
  return value as ProviderObject
}
function providerReference(value: unknown, prefix: string): string {
  const candidate = typeof value === 'string' ? value : record(value).id
  insist(typeof candidate === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_]{1,180}$`).test(candidate), 'Stripe returned an invalid payment reference.', 503)
  return candidate
}
function optionalReference(value: unknown, prefix: string) { return value === undefined || value === null ? undefined : providerReference(value, prefix) }
function checkMode(env: PaymentBindings, value: ProviderObject) {
  insist(value.livemode === credential(env).livemode, 'Stripe returned a payment from the wrong mode.', 503)
}

/** Fixed Stripe edge. Raw responses remain transient; errors never expose provider bodies. */
async function stripe(env: PaymentBindings, path: string, form?: URLSearchParams, idempotencyKey?: string): Promise<ProviderObject> {
  const { key } = credential(env)
  let response: Response
  try {
    response = await fetch('https://api.stripe.com/v1/' + path, {
      method: form ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: 'Bearer ' + key, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      ...(form ? { body: form.toString() } : {}),
    })
  } catch { insist(false, 'Stripe is unavailable. Check the existing payment before starting again.', 503) }
  if (!response.ok) { await response.body?.cancel(); insist(false, 'Stripe could not complete the payment request. Contact the sender if it continues.', 503) }
  const reader = response.body?.getReader(); insist(reader, 'Stripe returned no payment receipt.', 503)
  const decoder = new TextDecoder(); let body = '', size = 0
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break
      size += part.value.byteLength
      if (size > 128 * 1024) { await reader.cancel(); insist(false, 'Stripe returned an oversized payment receipt.', 503) }
      body += decoder.decode(part.value, { stream: true })
    }
    body += decoder.decode()
  } finally { reader.releaseLock() }
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { insist(false, 'Stripe returned an invalid payment receipt.', 503) }
  return record(parsed)
}

/** Account identity comes from authenticated Stripe data, never from a client-provided name. */
export async function paymentBuyer(env: PaymentBindings): Promise<PaymentAuthority['buyer']> {
  const account = await stripe(env, 'account')
  const reference = providerReference(account.id, 'acct')
  const profile = account.business_profile && typeof account.business_profile === 'object' ? account.business_profile as ProviderObject : undefined
  const settings = account.settings && typeof account.settings === 'object' ? account.settings as ProviderObject : undefined
  const dashboard = settings?.dashboard && typeof settings.dashboard === 'object' ? settings.dashboard as ProviderObject : undefined
  const name = [profile?.name, dashboard?.display_name, env.STRIPE_PAYMENTS_BUYER_NAME].find(value => typeof value === 'string' && value.trim())
  insist(typeof name === 'string' && name.trim().length <= 200 && !/[\u0000-\u001f\u007f]/.test(name), 'Configure an explicit Stripe buyer business name before requiring payment.', 503)
  // Stripe Account has no livemode field. Sessions, intents, methods and mandates prove mode.
  return { reference, name: name.trim() }
}

async function checkBuyer(env: PaymentBindings, expected: string) {
  const reference = providerReference(expected, 'acct')
  const buyer = await paymentBuyer(env)
  insist(buyer.reference === reference, 'The configured Stripe account does not match this payment requirement.', 503)
}

function requirementOf(value: PaymentRequirement) {
  const requirement = parsePaymentRequirement(value)
  insist(requirement, 'Choose a payment requirement.')
  return requirement
}
function continuation(value: string) {
  let url: URL
  try { url = new URL(value) } catch { insist(false, 'The signing return address is invalid.', 503) }
  insist(!url.username && !url.password && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'The signing return address must use HTTPS.', 503)
  return url.href
}
function checkoutUrl(value: unknown) {
  insist(typeof value === 'string', 'Stripe returned no checkout page.', 503)
  let url: URL
  try { url = new URL(value) } catch { insist(false, 'Stripe returned an invalid checkout page.', 503) }
  insist(url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.username && !url.password, 'Stripe returned an invalid checkout page.', 503)
  return url.href
}

export async function startPaymentCheckout(env: PaymentBindings, input: StartPaymentCheckout): Promise<{ reference: string; url: string }> {
  const requirement = requirementOf(input.requirement), mode = paymentMode(requirement)
  insist(typeof input.reference === 'string' && /^[A-Za-z0-9:_-]{1,180}$/.test(input.reference), 'Provide the payment obligation reference.')
  insist(typeof input.idempotencyKey === 'string' && /^[A-Za-z0-9:_-]{1,220}$/.test(input.idempotencyKey), 'Provide a payment request identifier.')
  const returnUrl = continuation(input.returnUrl)
  await checkBuyer(env, input.buyerReference)
  const form = new URLSearchParams({ mode, client_reference_id: input.reference, success_url: returnUrl, cancel_url: returnUrl, 'payment_method_types[0]': paymentMethodType(requirement) })
  form.set('metadata[buyer_reference]', input.buyerReference)
  form.set(`${mode === 'setup' ? 'setup_intent_data' : 'payment_intent_data'}[metadata][buyer_reference]`, input.buyerReference)
  if (mode === 'setup') {
    // Setup confirms attachment only; it confers no authority for unspecified future charges.
    const customer = await stripe(env, 'customers', new URLSearchParams({ 'metadata[signing_reference]': input.reference }), input.idempotencyKey + ':customer')
    checkMode(env, customer)
    form.set('customer', providerReference(customer.id, 'cus'))
    form.set('currency', requirement.currency)
    form.set('setup_intent_data[metadata][signing_reference]', input.reference)
  } else {
    insist('amount' in requirement, 'A payment needs an amount.')
    form.set('line_items[0][price_data][currency]', requirement.currency)
    form.set('line_items[0][price_data][unit_amount]', String(requirement.amount))
    form.set('line_items[0][price_data][product_data][name]', requirement.kind === 'deposit' ? 'Signing deposit' : 'Signing payment')
    form.set('line_items[0][quantity]', '1')
    form.set('payment_intent_data[metadata][signing_reference]', input.reference)
  }
  const session = await stripe(env, 'checkout/sessions', form, input.idempotencyKey)
  checkMode(env, session)
  insist(session.mode === mode && session.client_reference_id === input.reference, 'Stripe returned a different payment obligation.', 503)
  return { reference: providerReference(session.id, 'cs'), url: checkoutUrl(session.url) }
}

/** Only this authenticated read establishes an outcome; the browser's return address establishes none. */
export async function checkPaymentCheckout(env: PaymentBindings, input: CheckPaymentCheckout): Promise<PaymentReceipt> {
  const requirement = requirementOf(input.requirement), mode = paymentMode(requirement), reference = providerReference(input.reference, 'cs')
  await checkBuyer(env, input.buyerReference)
  const intentName = mode === 'payment' ? 'payment_intent' : 'setup_intent'
  const query = new URLSearchParams({ 'expand[]': intentName + '.payment_method' })
  const session = await stripe(env, 'checkout/sessions/' + encodeURIComponent(reference) + '?' + query)
  checkMode(env, session)
  insist(session.id === reference && session.mode === mode && session.client_reference_id === input.clientReference, 'Stripe returned a different payment obligation.', 503)
  insist(record(session.metadata).buyer_reference === input.buyerReference, 'Stripe returned a different buyer payment obligation.', 503)
  insist(Array.isArray(session.payment_method_types) && session.payment_method_types.length === 1 && session.payment_method_types[0] === paymentMethodType(requirement), 'Stripe returned a different payment method.', 503)
  const receipt: PaymentReceipt = { reference, outcome: 'pending', livemode: session.livemode as boolean }
  const customer = optionalReference(session.customer, 'cus'); if (customer) receipt.customer = customer
  if (mode === 'payment') {
    insist('amount' in requirement && session.amount_total === requirement.amount && session.currency === requirement.currency, 'Stripe returned a different payment amount.', 503)
  }
  const rawIntent = session[intentName]
  if (!rawIntent) { if (session.status === 'expired') receipt.outcome = 'failed'; return receipt }
  const intent = typeof rawIntent === 'string' ? await stripe(env, `${mode === 'payment' ? 'payment_intents' : 'setup_intents'}/${encodeURIComponent(providerReference(rawIntent, mode === 'payment' ? 'pi' : 'seti'))}?expand[]=payment_method`) : record(rawIntent)
  checkMode(env, intent)
  const intentReference = providerReference(intent.id, mode === 'payment' ? 'pi' : 'seti')
  insist(intentReference === providerReference(rawIntent, mode === 'payment' ? 'pi' : 'seti'), 'Stripe returned a different payment intent.', 503)
  const metadata = record(intent.metadata)
  insist(metadata.signing_reference === input.clientReference && metadata.buyer_reference === input.buyerReference, 'Stripe returned a different payment intent obligation.', 503)
  if (mode === 'payment') {
    receipt.paymentIntent = intentReference
    insist('amount' in requirement && intent.amount === requirement.amount && intent.currency === requirement.currency, 'Stripe returned a different payment amount.', 503)
  } else {
    receipt.setupIntent = intentReference
    insist(customer && optionalReference(intent.customer, 'cus') === customer, 'Stripe returned a different saved-payment customer.', 503)
  }
  const paymentMethod = optionalReference(intent.payment_method, 'pm')
  if (paymentMethod) {
    receipt.paymentMethod = paymentMethod
    const details = typeof intent.payment_method === 'string' ? await stripe(env, 'payment_methods/' + encodeURIComponent(paymentMethod)) : record(intent.payment_method)
    checkMode(env, details)
    insist(details.id === paymentMethod && details.type === paymentMethodType(requirement), 'Stripe returned a different payment method.', 503)
    if (mode === 'setup') insist(customer && optionalReference(details.customer, 'cus') === customer, 'Stripe has not attached the payment method to the buyer’s customer.', 503)
  }
  if (intent.status === 'canceled' || session.status === 'expired' || intent.status === 'requires_payment_method' && (intent.last_payment_error || intent.last_setup_error)) { receipt.outcome = 'failed'; return receipt }
  if (session.status !== 'complete' || intent.status !== 'succeeded') return receipt
  insist(paymentMethod, 'Stripe confirmed no payment method.', 503)
  if (mode === 'payment') {
    insist(session.payment_status === 'paid', 'Stripe has not confirmed the payment.', 409)
    insist('amount' in requirement && intent.amount_received === requirement.amount, 'Stripe has not confirmed receipt of the required payment amount.', 503)
  } else if (requirement.kind === 'ach_mandate') {
    const mandateReference = providerReference(intent.mandate, 'mandate')
    const mandate = await stripe(env, 'mandates/' + encodeURIComponent(mandateReference))
    checkMode(env, mandate)
    insist(mandate.id === mandateReference && optionalReference(mandate.payment_method, 'pm') === paymentMethod, 'Stripe returned a different ACH mandate.', 503)
    if (mandate.status !== 'active') return receipt
    receipt.mandate = mandateReference
  }
  receipt.outcome = 'succeeded'
  return receipt
}
