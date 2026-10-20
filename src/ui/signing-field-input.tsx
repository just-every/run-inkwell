import { useId, type RefObject } from 'react'
import { maskedField, markField, validateBusinessValue } from '../inkwell/business-fields'
import type { Field } from './types'

/** PREP-004: the same accessible control on the form and in guided signing. */
export function SigningFieldInput({ field, values, disabled, onChange, inputRef, onNext, required = false, hint }: { field: Field; values: Record<string, string>; disabled: boolean; onChange: (id: string, value: string) => void; inputRef?: RefObject<HTMLInputElement | null>; onNext?: () => void; required?: boolean; hint?: string }) {
  const checkbox = field.type === 'checkbox', errorId = useId()
  let error = ''
  try { validateBusinessValue(field, values[field.id]?.trim() ?? '') } catch (failure) { error = failure instanceof Error ? failure.message : 'Check this value.' }
  const locked = Boolean(field.calculation || field.readOnly || field.type === 'date_signed')
  const details = <><small>{hint ?? `Page ${field.page + 1} · ${field.calculation ? 'Calculated USD' : field.type}`}{locked && ' · Read-only'}</small>{field.prefill && <><br /><small>Source (reported by sender/API): {field.prefill.source}. Supplied by the caller, not verified with the CRM.</small></>}</>
  const input = <input ref={inputRef} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={markField(field) ? 'iw-typed-signature' : undefined}
    required={required && !locked} readOnly={locked} disabled={disabled || (checkbox && locked)} maxLength={field.type === 'signature' ? 160 : 500}
    type={checkbox ? 'checkbox' : maskedField(field) ? 'password' : ['date', 'date_signed'].includes(field.type) ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} autoComplete={field.type === 'signature' ? 'name' : 'off'}
    {...(checkbox ? { checked: values[field.id] === 'true' } : { value: values[field.id] ?? '' })}
    onChange={event => { if (!locked) onChange(field.id, checkbox ? String(event.target.checked) : event.target.value) }}
    onKeyDown={event => { if (onNext && event.key === 'Enter') { event.preventDefault(); onNext() } }} />
  return checkbox ? <label className="iw-check">{input}<span>{field.label}<br />{details}</span></label> : <label>{field.label}<span>{details}</span>{input}{error && <small id={errorId} className="iw-error">{error}</small>}</label>
}
