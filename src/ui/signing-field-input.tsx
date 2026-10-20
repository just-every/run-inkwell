import { useId, type RefObject } from 'react'
import { choiceField, selectedOptions, maskedField, markField, validateBusinessValue } from '../inkwell/business-fields'
import type { Field } from './types'

/** PREP-004: the same accessible control on the form and in guided signing. */
export function SigningFieldInput({ field, values, disabled, onChange, inputRef, onNext, required = false, hint }: { field: Field; values: Record<string, string>; disabled: boolean; onChange: (id: string, value: string) => void; inputRef?: RefObject<HTMLInputElement | HTMLSelectElement | null>; onNext?: () => void; required?: boolean; hint?: string }) {
  const checkbox = field.type === 'checkbox', errorId = useId()
  let error = ''
  try { validateBusinessValue(field, values[field.id]?.trim() ?? '') } catch (failure) { error = failure instanceof Error ? failure.message : 'Check this value.' }
  const locked = Boolean(field.calculation || field.readOnly || field.type === 'date_signed')
  const details = <><small>{hint ?? `Page ${field.page + 1} · ${field.calculation ? 'Calculated USD' : field.type}`}{locked && ' · Read-only'}</small>{field.prefill && <><br /><small>Source (reported by sender/API): {field.prefill.source}. Supplied by the caller, not verified with the CRM.</small></>}</>
  if (choiceField(field)) {
    const value = values[field.id] ?? '', selection = selectedOptions(value)
    const errorNotice = error && <small id={errorId} className="iw-error">{error}</small>
    if (field.type === 'dropdown') return <label>{field.label}<span>{details}</span><select ref={inputRef as RefObject<HTMLSelectElement | null>} value={value} required={required && !locked} disabled={disabled || locked} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => onChange(field.id, event.target.value)}><option value="">Choose an option</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select>{errorNotice}</label>
    return <fieldset className="iw-stack" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}><legend>{field.label}{required ? ' (required)' : ' (optional)'}</legend><div>{details}</div>{field.type === 'checkbox_group' && <small>Choose {field.minimum === field.maximum ? field.maximum : `${field.minimum ?? 0}–${field.maximum ?? field.options?.length}`} options.</small>}{field.options?.map((option, index) => <label key={option} className="iw-check"><input ref={index === 0 ? inputRef as RefObject<HTMLInputElement | null> : undefined} type={field.type === 'radio' ? 'radio' : 'checkbox'} name={field.type === 'radio' ? errorId : undefined} value={option} required={field.type === 'radio' && required && !locked} disabled={disabled || locked} checked={field.type === 'radio' ? value === option : selection.includes(option)} onChange={event => onChange(field.id, field.type === 'radio' ? option : JSON.stringify(field.options!.filter(item => item === option ? event.target.checked : selection.includes(item))))} />{option}</label>)}{field.type === 'radio' && !required && !locked && <button type="button" disabled={disabled || !value} onClick={() => onChange(field.id, '')}>Clear {field.label}</button>}{errorNotice}</fieldset>
  }
  const input = <input ref={inputRef as RefObject<HTMLInputElement | null>} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={markField(field) ? 'iw-typed-signature' : undefined}
    required={required && !locked} readOnly={locked} disabled={disabled || (checkbox && locked)} maxLength={field.type === 'signature' ? 160 : 500}
    type={checkbox ? 'checkbox' : maskedField(field) ? 'password' : ['date', 'date_signed'].includes(field.type) ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} autoComplete={field.type === 'signature' ? 'name' : 'off'}
    {...(checkbox ? { checked: values[field.id] === 'true' } : { value: values[field.id] ?? '' })}
    onChange={event => { if (!locked) onChange(field.id, checkbox ? String(event.target.checked) : event.target.value) }}
    onKeyDown={event => { if (onNext && event.key === 'Enter') { event.preventDefault(); onNext() } }} />
  return checkbox ? <label className="iw-check">{input}<span>{field.label}<br />{details}</span></label> : <label>{field.label}<span>{details}</span>{input}{error && <small id={errorId} className="iw-error">{error}</small>}</label>
}
