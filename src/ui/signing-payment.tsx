import { useState } from 'react'
import { paymentConsentText, type PaymentAuthority, type PaymentOutcome, type PaymentRequirement } from '../inkwell/payment-requirement'
import { request as signingRequest } from './types'

export interface SigningPaymentStatus { needsConsent?:boolean;
  requirement: PaymentRequirement
  buyer: PaymentAuthority['buyer']
  requirementVersion: string
  outcome?: PaymentOutcome
  reference?: string
}
export interface SigningPaymentProps {
  base: string
  status: SigningPaymentStatus
  request?: <T>(url: string, body?: unknown) => Promise<T>
  onChecked: () => Promise<void>
  disabled?: boolean
}

/** Collection stays on Stripe's page. Checking an outcome never submits a signature. */
export function SigningPayment({ base, status, request = signingRequest, onChecked, disabled = false }: SigningPaymentProps) {
  const [consentedTo, setConsentedTo] = useState<string>(), [checkoutPage, setCheckoutPage] = useState<{ authority: string; url: string }>(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const requirement = status.requirement, setup = requirement.kind === 'saved_card' || requirement.kind === 'ach_mandate', complete = status.outcome === 'succeeded'&&!status.needsConsent
  const consentText = paymentConsentText(requirement, status.buyer.name)
  const authority = JSON.stringify([base, status.requirementVersion, status.buyer.reference, consentText])
  const consent = consentedTo === authority, url = checkoutPage?.authority === authority ? checkoutPage.url : undefined
  const title = requirement.kind === 'saved_card' ? 'Save a card' : requirement.kind === 'ach_mandate' ? 'Authorize an ACH mandate' : requirement.kind === 'deposit' ? 'Pay the deposit' : 'Make the payment'
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: requirement.currency.toUpperCase() })
  const amount = 'amount' in requirement ? formatter.format(requirement.amount / 10 ** formatter.resolvedOptions().maximumFractionDigits!) : undefined
  async function act(work: () => Promise<void>) {
    setBusy(true); setError('')
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : 'The payment could not be checked. Try again.') } finally { setBusy(false) }
  }
  return <section className="iw-stack" aria-label="Payment required for signing">
    <h2>{title}{amount ? ` · ${amount}` : ''}</h2>
    <p>Buyer: {status.buyer.name}. Provider: Stripe.{amount ? ` Amount: ${amount} ${requirement.currency.toUpperCase()}.` : ''}</p>
    <p>{complete ? 'Stripe has confirmed this requirement. You can finish signing.' : setup ? 'Complete this requirement on Stripe before signing. Your card or bank details go directly to Stripe.' : 'Complete the payment on Stripe before signing. Your card or bank details go directly to Stripe.'}</p>
    {complete ? <p role="status">{setup ? 'Payment method confirmed.' : 'Payment confirmed.'}</p> : <>
      {status.needsConsent&&status.outcome==='succeeded'&&<p>Consent is required again. Inkwell will verify the existing Stripe reference without starting another charge.</p>}
      {status.outcome === 'failed' && <p role="status">Stripe has not confirmed this requirement. Your signature has not been saved. Open checkout to try again.</p>}
      {status.outcome === 'pending' && <p role="status">Waiting for Stripe confirmation. Finish checkout, then check the status here.</p>}
      {requirement.kind === 'ach_mandate' && <p>Purpose: establish an ACH mandate with {status.buyer.name} for this signing request only. Stripe presents the mandate terms before authorization.</p>}
      <p>Review <a href="https://stripe.com/legal/consumer" target="_blank" rel="noreferrer">Stripe’s terms</a> and <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">privacy notice</a>. Stripe presents the applicable payment or mandate terms in Checkout. Payment consent is separate from electronic signature consent.</p>
      <label className="iw-check"><input type="checkbox" checked={consent} disabled={busy || disabled} onChange={event => { setConsentedTo(event.target.checked ? authority : undefined); if (!event.target.checked) setCheckoutPage(undefined) }} />{consentText}</label>
      <div className="iw-actions">
        <button type="button" className="iw-primary iw-fit" disabled={busy || disabled || !consent} onClick={() => void act(async () => {
          const result = await request<{ url?: string; confirmed?:boolean }>(`${base}/payment/start`, { consent: true, requirementVersion: status.requirementVersion })
          if(result.confirmed){await onChecked();return}
          if(!result.url)throw new Error('Stripe returned no checkout address.')
          const checkout = new URL(result.url)
          if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.stripe.com' || checkout.username || checkout.password) throw new Error('The checkout address is invalid.')
          setCheckoutPage({ authority, url: checkout.href })
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
