import { MAX_STAMP_VALUE } from './stamp-value'
import { generatedField } from './business-fields'
import { insist, object, type Field } from './model'

/** PREP-008: business values are part of the prepared field definition, never signatures.
 * A source is a caller-reported label, not a provider verification. Existing document access gates protect it. */
export function normalizePrefill(field: Field, raw: Field) {
  insist(raw.readOnly === undefined || typeof raw.readOnly === 'boolean', 'Read-only must be true or false.')
  if (raw.prefill !== undefined) {
    insist(!generatedField(field) && !field.calculation, 'Signatures, initials, date signed and calculated fields cannot be prefilled.')
    const prefill = object(raw.prefill)
    insist(typeof prefill.value === 'string' && prefill.value.length <= (field.type === 'stamp' ? MAX_STAMP_VALUE : 500) && prefill.value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(prefill.value), field.type === 'stamp' ? `Prefill ${field.label} with a PNG or JPEG stamp of at most 512 KiB.` : `Prefill ${field.label} with one line of at most 500 characters.`)
    insist(typeof prefill.source === 'string' && prefill.source.trim().length > 0 && prefill.source.length <= 200 && !/[\x00-\x1f\x7f]/.test(prefill.source), 'Name the reported source in one line of at most 200 characters.')
    const value = prefill.value.trim()
    if (field.type === 'checkbox') insist(['true', 'false'].includes(value), `Prefill ${field.label} with true or false.`)
    if (field.type === 'date') insist(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, `Enter a valid date for ${field.label}.`)
    if (field.type === 'number') {
      insist(/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value), `Prefill ${field.label} with a USD number with at most two decimal places.`)
      const [whole, fraction = ''] = value.replace(/^[+-]/, '').split('.'), cents = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'))
      insist(cents <= BigInt(Number.MAX_SAFE_INTEGER), `The USD value for ${field.label} is outside the safe cents range.`)
      field.prefill = { value: `${value.startsWith('-') && cents !== 0n ? '-' : ''}${cents / 100n}.${String(cents % 100n).padStart(2,'0')}`, source: prefill.source.trim() }
    } else field.prefill = { value, source: prefill.source.trim() }
  }
  insist(!raw.readOnly || field.prefill, `A read-only field needs a prefilled value: ${field.label}.`)
  if (raw.readOnly) field.readOnly = true
}

/** Templates accept an explicit field-ID map from the sending API client; unknown targets refuse the entire draft. */
export function applyPrefillPayload(fields: Field[], payload: unknown): Field[] {
  if (payload === undefined) return fields
  const entries = object(payload)
  insist(Object.keys(entries).every(id => fields.some(field => field.id === id)), 'Prefill only fields in this template.')
  return fields.map(field => {
    if (!Object.hasOwn(entries, field.id)) return field
    const entry = object(entries[field.id])
    return { ...field, prefill: { value: entry.value as string, source: entry.source as string }, ...(entry.readOnly === undefined ? {} : { readOnly: entry.readOnly as boolean }) }
  })
}

/** Explicit attempts to change locked business terms refuse at both save-progress and signing public doors. */
export function assertLockedValues(fields: Field[], values: Record<string, unknown>) {
  for (const field of fields) if (field.readOnly && Object.hasOwn(values, field.id)) {
    const value = values[field.id]
    insist(typeof value === 'string' && value.trim() === field.prefill?.value, `${field.label} is read-only; the sender's value cannot be changed.`)
  }
}

export function recipientFields(fields: Field[], mayReadDocument: boolean): Field[] {
  return fields.map(({ prefill, ...field }) => mayReadDocument && prefill ? { ...field, prefill } : field)
}
