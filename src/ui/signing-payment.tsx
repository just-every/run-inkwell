import { useState } from 'react'
import type { PaymentOutcome, PaymentRequirement } from '../inkwell/payment-requirement'
import { request as signingRequest } from './types'

export interface SigningPaymentStatus { requirement: PaymentRequirement; outcome?: PaymentOutcome; reference?: string }
export interface SigningPaymentProps {
  base: string
  status: SigningPaymentStatus
  request?: <T>(url: string, body?: unknown) => Promise<T>
  onChecked: () => Promise<void>
  disabled?: boolean
}

/** Collection stays on Stripe's page. Checking an outcome never submits a signature. */
export function SigningPayment({ base, status, request = signingRequest, onChecked, disabled = false }: SigningPaymentProps) {
  const [consent, setConsent] = useState(false), [url, setUrl] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const requirement = status.requirement, setup = requirement.kind === 'saved_card' || requirement.kind === 'ach_mandate', complete = status.outcome === 'succeeded'
  const title = requirement.kind === 'saved_card' ? 'Save a card' : requirement.kind === 'ach_mandate' ? 'Authorize an ACH mandate' : requirement.kind === 'deposit' ? 'Pay the deposit' : 'Make the payment'
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: requirement.currency.toUpperCase() })
  const amount = 'amount' in requirement ? formatter.format(requirement.amount / 10 ** formatter.resolvedOptions().maximumFractionDigits!) : undefined
  async function act(work: () => Promise<void>) {
    setBusy(true); setError('')
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : 'The payment could not be checked. Try again.') } finally { setBusy(false) }
  }
  return <section className="iw-stack" aria-label="Payment required for signing">
    <h2>{title}{amount ? ` · ${amount}` : ''}</h2>
    <p>{complete ? 'Stripe has confirmed this requirement. You can finish signing.' : setup ? 'Complete this requirement on Stripe before signing. Your card or bank details go directly to Stripe.' : 'Complete the payment on Stripe before signing. Your card or bank details go directly to Stripe.'}</p>
    {complete ? <p role="status">{setup ? 'Payment method confirmed.' : 'Payment confirmed.'}</p> : <>
      {status.outcome === 'failed' && <p role="status">Stripe has not confirmed this requirement. Your signature has not been saved. Open checkout to try again.</p>}
      {status.outcome === 'pending' && <p role="status">Waiting for Stripe confirmation. Finish checkout, then check the status here.</p>}
      <label className="iw-check"><input type="checkbox" checked={consent} disabled={busy || disabled} onChange={event => setConsent(event.target.checked)} />{requirement.kind === 'saved_card' ? 'I agree to save my card with Stripe for future payments to the sender.' : requirement.kind === 'ach_mandate' ? 'I agree to continue to Stripe to authorize future ACH payments to the sender.' : `I agree to continue to Stripe to ${requirement.kind === 'deposit' ? 'pay this deposit' : 'make this payment'}.`}</label>
      <div className="iw-actions">
        <button type="button" className="iw-primary iw-fit" disabled={busy || disabled || !consent} onClick={() => void act(async () => {
          const result = await request<{ url: string }>(`${base}/payment/start`, { consent: true })
          const checkout = new URL(result.url)
          if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.stripe.com' || checkout.username || checkout.password) throw new Error('The checkout address is invalid.')
          setUrl(checkout.href)
          await onChecked()
        })}>{busy ? 'Please wait…' : 'Prepare Stripe checkout'}</button>
        {url && <a className="iw-button iw-fit" href={url} target="_blank" rel="noreferrer">Continue to Stripe</a>}
        <button type="button" className="iw-fit" disabled={busy || disabled || !status.reference && !url} onClick={() => void act(async () => { await request(`${base}/payment/check`, {}); await onChecked() })}>Check payment status</button>
      </div>
      {url && <p>Checkout opens in a new tab. Return here after completing it, then check the payment status.</p>}
    </>}
    {error && <p className="iw-error" role="alert">{error}</p>}
  </section>
}
