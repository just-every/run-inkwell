import { insist, object } from './model'

/** Amounts are integer minor units. Setup requirements never imply an immediate charge. */
export type PaymentRequirement =
  | { kind: 'payment' | 'deposit'; amount: number; currency: string; method: 'card' | 'ach' }
  | { kind: 'saved_card' | 'ach_mandate'; currency: string }

/** Configuration authority is frozen with the exact requirement on each envelope. */
export interface PaymentAuthority {
  actor: string
  at: string
  version: string
  buyer: { reference: string; name: string }
}

/** Shared by signer display and consent audit evidence; amounts have no currency symbol. */
export function paymentConsentText(requirement: PaymentRequirement, buyer: string): string {
  if (requirement.kind === 'saved_card') return `I agree to continue to Stripe Checkout to save a card with ${buyer} for this signing request. Stripe collects my card details directly. This step does not charge my card or authorize unspecified future charges. Inkwell keeps the requirement, Stripe references, result and consent audit evidence. My signature will not be saved until Stripe confirms successful setup.`
  if (requirement.kind === 'ach_mandate') return `I agree to continue to Stripe Checkout to review and authorize the ACH mandate for ${buyer} for the purpose shown here. Stripe collects my bank details directly. Establishing this mandate does not confirm a payment or authorize charges beyond the mandate’s disclosed terms. Inkwell keeps the requirement, Stripe references, result and consent audit evidence. My signature will not be saved until Stripe confirms successful setup and an active mandate.`
  insist('amount' in requirement, 'A payment needs an amount.')
  const currency = requirement.currency.toUpperCase()
  const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits!
  const amount = (requirement.amount / 10 ** digits).toFixed(digits)
  return `I agree to continue to Stripe Checkout to pay ${amount} ${currency} to ${buyer} for this signing request. Stripe collects my payment details directly. Inkwell keeps the payment requirement, Stripe references, result and consent audit evidence. My signature will not be saved until Stripe confirms successful payment.`
}

export type PaymentOutcome = 'pending' | 'succeeded' | 'failed'
/** Business custody contains only provider references and a normalized outcome. */
export interface PaymentReceipt {
  reference: string
  outcome: PaymentOutcome
  livemode: boolean
  paymentIntent?: string
  setupIntent?: string
  paymentMethod?: string
  mandate?: string
  customer?: string
}

export const paymentMode = (requirement: PaymentRequirement) => requirement.kind === 'saved_card' || requirement.kind === 'ach_mandate' ? 'setup' as const : 'payment' as const
export const paymentMethodType = (requirement: PaymentRequirement) => requirement.kind === 'ach_mandate' || ('method' in requirement && requirement.method === 'ach') ? 'us_bank_account' as const : 'card' as const

export function parsePaymentRequirement(value: unknown): PaymentRequirement | undefined {
  if (value === undefined || value === null) return undefined
  const raw = object(value), kind = raw.kind
  insist(kind === 'payment' || kind === 'deposit' || kind === 'saved_card' || kind === 'ach_mandate', 'Choose payment, deposit, saved card or ACH mandate.')
  insist(typeof raw.currency === 'string' && /^[a-z]{3}$/i.test(raw.currency), 'Choose a three-letter payment currency.')
  const currency = raw.currency.toLowerCase()
  if (kind === 'saved_card' || kind === 'ach_mandate') {
    insist(Object.keys(raw).every(key => ['kind', 'currency'].includes(key)), 'A saved card or ACH mandate has a kind and currency only.')
    insist(kind !== 'ach_mandate' || currency === 'usd', 'ACH mandates use USD.')
    return { kind, currency }
  }
  insist(Object.keys(raw).every(key => ['kind', 'currency', 'amount', 'method'].includes(key)), 'A payment requirement has a kind, amount, currency and method only.')
  insist(Number.isSafeInteger(raw.amount) && (raw.amount as number) > 0 && (raw.amount as number) <= 99_999_999, 'Enter a positive payment amount in minor units, at most eight digits.')
  insist(raw.method === 'card' || raw.method === 'ach', 'Choose card or ACH for the payment.')
  insist(raw.method !== 'ach' || currency === 'usd', 'ACH payments use USD.')
  return { kind, amount: raw.amount as number, currency, method: raw.method }
}

/** Suitable for staged business-record validation; undefined means no requirement. */
export function validPaymentRequirement(value: unknown): boolean {
  try { parsePaymentRequirement(value); return true } catch { return false }
}

export function samePaymentRequirement(left: unknown, right: unknown): boolean {
  try { return JSON.stringify(parsePaymentRequirement(left) ?? null) === JSON.stringify(parsePaymentRequirement(right) ?? null) } catch { return false }
}

export function validPaymentReceipt(value: unknown, requirement?: PaymentRequirement): value is PaymentReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const receipt = value as Record<string, unknown>
  if (!['pending', 'succeeded', 'failed'].includes(receipt.outcome as string) || typeof receipt.livemode !== 'boolean') return false
  if (!Object.keys(receipt).every(key => ['reference', 'outcome', 'livemode', 'paymentIntent', 'setupIntent', 'paymentMethod', 'mandate', 'customer'].includes(key))) return false
  const reference = (key: string, prefix: string, required = false) => receipt[key] === undefined ? !required : typeof receipt[key] === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_]{1,180}$`).test(receipt[key] as string)
  if (!reference('reference', 'cs', true) || !reference('paymentIntent', 'pi') || !reference('setupIntent', 'seti') || !reference('paymentMethod', 'pm') || !reference('mandate', 'mandate') || !reference('customer', 'cus')) return false
  if (receipt.paymentIntent && receipt.setupIntent) return false
  if (receipt.outcome === 'succeeded' && (!receipt.paymentMethod || !receipt.paymentIntent && (!receipt.setupIntent || !receipt.customer))) return false
  if (requirement) {
    if (!validPaymentRequirement(requirement)) return false
    if (paymentMode(requirement) === 'payment' && (receipt.setupIntent || receipt.mandate)) return false
    if (paymentMode(requirement) === 'setup' && receipt.paymentIntent) return false
    if (requirement.kind === 'ach_mandate' && receipt.outcome === 'succeeded' && !receipt.mandate) return false
  }
  return true
}
