import type { RefObject } from 'react'
import type { Field } from './types'

/** PREP-004: the same accessible control on the form and in guided signing. */
export function SigningFieldInput({ field, values, disabled, onChange, inputRef, onNext, required = false }: { field: Field; values: Record<string, string>; disabled: boolean; onChange: (id: string, value: string) => void; inputRef?: RefObject<HTMLInputElement | null>; onNext?: () => void; required?: boolean }) {
  const checkbox = field.type === 'checkbox'
  return <label className={checkbox ? 'iw-check' : undefined}>{field.label}<small>Page {field.page + 1} · {field.calculation ? 'Calculated USD' : field.type}</small><input ref={inputRef} className={field.type === 'signature' ? 'iw-typed-signature' : undefined} required={required && !field.calculation} readOnly={Boolean(field.calculation)} disabled={disabled} maxLength={field.type === 'signature' ? 160 : 500} type={checkbox ? 'checkbox' : field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} autoComplete={field.type === 'signature' ? 'name' : 'off'} {...(checkbox ? { checked: values[field.id] === 'true' } : { value: values[field.id] || '' })} onChange={event => onChange(field.id, checkbox ? String(event.target.checked) : event.target.value)} onKeyDown={event => { if (onNext && event.key === 'Enter') { event.preventDefault(); onNext() } }} /></label>
}
