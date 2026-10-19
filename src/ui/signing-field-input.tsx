import type { RefObject } from 'react'
import type { Field } from './types'

/** PREP-004: the same accessible control on the form and in guided signing. */
export function SigningFieldInput({ field, values, disabled, onChange, inputRef, onNext, required = false, hint }: { field: Field; values: Record<string, string>; disabled: boolean; onChange: (id: string, value: string) => void; inputRef?: RefObject<HTMLInputElement | null>; onNext?: () => void; required?: boolean; hint?: string }) {
  const checkbox = field.type === 'checkbox'
  const locked = Boolean(field.calculation || field.readOnly)
  const details = <><small>{hint ?? `Page ${field.page + 1} · ${field.calculation ? 'Calculated USD' : field.type}`}{locked && ' · Read-only'}</small>{field.prefill && <><br /><small>Source (reported by sender/API): {field.prefill.source}. Supplied by the caller, not verified with the CRM.</small></>}</>
  const input = <input ref={inputRef} className={field.type === 'signature' ? 'iw-typed-signature' : undefined}
    required={required && !locked} readOnly={locked} disabled={disabled || (checkbox && locked)} maxLength={field.type === 'signature' ? 160 : 500}
    type={checkbox ? 'checkbox' : field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} autoComplete={field.type === 'signature' ? 'name' : 'off'}
    {...(checkbox ? { checked: values[field.id] === 'true' } : { value: values[field.id] ?? '' })}
    onChange={event => { if (!locked) onChange(field.id, checkbox ? String(event.target.checked) : event.target.value) }}
    onKeyDown={event => { if (onNext && event.key === 'Enter') { event.preventDefault(); onNext() } }} />
  return checkbox ? <label className="iw-check">{input}<span>{field.label}<br />{details}</span></label> : <label>{field.label}<span>{details}</span>{input}</label>
}
