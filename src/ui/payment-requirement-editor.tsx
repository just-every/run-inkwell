import { useEffect, useState } from 'react'
import type { PaymentRequirement } from '../inkwell/payment-requirement'

const currencyFormat = (currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
const places = (currency: string) => currencyFormat(currency).resolvedOptions().maximumFractionDigits!
function majorAmount(value: PaymentRequirement | undefined) {
  return value && 'amount' in value ? String(value.amount / 10 ** places(value.currency)) : ''
}
function minorAmount(value: string, currency: string) {
  const decimals = places(currency)
  if (!new RegExp(`^[0-9]+(?:\\.[0-9]{1,${Math.max(1, decimals)}})?$`).test(value) || decimals === 0 && value.includes('.')) return 0
  const [whole, fraction = ''] = value.split('.')
  const amount = Number(whole + fraction.padEnd(decimals, '0'))
  return Number.isSafeInteger(amount) ? amount : 0
}

export function paymentRequirementSummary(value: PaymentRequirement): string {
  if (value.kind === 'saved_card') return 'Save a card with Stripe'
  if (!('amount' in value)) return 'Authorize an ACH mandate with Stripe'
  const amount = currencyFormat(value.currency).format(value.amount / 10 ** places(value.currency))
  return `${value.kind === 'deposit' ? 'Deposit' : 'Payment'} of ${amount} by ${value.method === 'ach' ? 'ACH' : 'card'}`
}

export function PaymentRequirementSummary({ label, value }: { label: string; value: PaymentRequirement }) {
  return <p style={{ gridColumn: '1 / -1' }}>{label}: {paymentRequirementSummary(value)} before signing.</p>
}

export interface PaymentRequirementEditorProps {
  label: string
  value?: PaymentRequirement
  consent?: boolean
  readOnly?: boolean
  disabled?: boolean
  onChange: (value: PaymentRequirement | undefined, consent: boolean) => void
}

/** The sender configures the obligation; the recipient separately consents on Stripe's collection flow. */
export function PaymentRequirementEditor({ label, value, consent = false, readOnly = false, disabled = false, onChange }: PaymentRequirementEditorProps) {
  const [amount, setAmount] = useState(majorAmount(value))
  const [currency, setCurrency] = useState(value?.currency ?? 'usd')
  useEffect(() => { setAmount(majorAmount(value)); setCurrency(value?.currency ?? 'usd') }, [value?.kind, value?.currency])
  if (readOnly) return value ? <PaymentRequirementSummary label={label} value={value} /> : null
  const charged = value && 'amount' in value ? value : undefined
  const ach = value?.kind === 'ach_mandate' || value && 'method' in value && value.method === 'ach'
  return <details className="iw-stack" style={{ gridColumn: '1 / -1' }}>
    <summary>{label} · {value ? paymentRequirementSummary(value) : 'Payment at signing'}</summary>
    <div className="iw-stack">
      <label>Stripe requirement<select aria-label={`${label} Stripe requirement`} disabled={disabled} value={value?.kind ?? ''} onChange={event => {
        const kind = event.target.value as PaymentRequirement['kind'] | ''
        if (!kind) { onChange(undefined, false); return }
        const nextCurrency = kind === 'ach_mandate' ? 'usd' : value?.currency ?? 'usd'
        onChange(kind === 'saved_card' || kind === 'ach_mandate' ? { kind, currency: nextCurrency } : { kind, amount: minorAmount(amount, nextCurrency), currency: nextCurrency, method: charged ? charged.method : 'card' }, false)
      }}><option value="">No requirement</option><option value="payment">Payment</option><option value="deposit">Deposit</option><option value="saved_card">Saved card</option><option value="ach_mandate">ACH mandate</option></select></label>
      {value && <>
        {charged && <label>Payment method<select aria-label={`${label} payment method`} disabled={disabled} value={charged.method} onChange={event => {
          const method = event.target.value as 'card' | 'ach', nextCurrency = method === 'ach' ? 'usd' : value.currency
          onChange({ ...charged, method, currency: nextCurrency, amount: minorAmount(amount, nextCurrency) }, false)
        }}><option value="card">Card</option><option value="ach">ACH bank payment</option></select></label>}
        <label>Currency<input aria-label={`${label} payment currency`} required pattern="[A-Za-z]{3}" maxLength={3} disabled={disabled || Boolean(ach)} value={currency.toUpperCase()} onChange={event => {
          const nextCurrency = event.target.value.toLowerCase(); setCurrency(nextCurrency)
          if (/^[a-z]{3}$/.test(nextCurrency)) onChange(charged ? { ...charged, currency: nextCurrency, amount: minorAmount(amount, nextCurrency) } : { ...value, currency: nextCurrency }, false)
        }} /></label>
        {charged && <label>Amount ({value.currency.toUpperCase()})<input aria-label={`${label} payment amount`} required inputMode="decimal" pattern={places(value.currency) === 0 ? '[0-9]+' : `[0-9]+([.][0-9]{1,${places(value.currency)}})?`} disabled={disabled} value={amount} onChange={event => { setAmount(event.target.value); onChange({ ...charged, amount: minorAmount(event.target.value, value.currency) }, false) }} /></label>}
        <label className="iw-check"><input type="checkbox" required checked={consent} disabled={disabled} onChange={event => onChange(value, event.target.checked)} />I authorize this requirement through our Stripe account before this recipient signs.</label>
      </>}
    </div>
  </details>
}
