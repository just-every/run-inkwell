import { generatedField, maskedField, patterns } from '../inkwell/business-fields'
import type { Field } from './types'

export function FieldValidationEditor({ field, change }: { field: Field; change: (field: Field) => void }) {
  if (generatedField(field) || field.type === 'checkbox') return null
  return <fieldset className="iw-stack"><legend>Validation and display</legend>
    {!['number', 'date', 'email'].includes(field.type) && <label>Validation pattern<select aria-label="Validation pattern" value={field.pattern ?? ''} onChange={event => change({ ...field, pattern: event.target.value ? event.target.value as Field['pattern'] : undefined })}><option value="">Any text</option>{Object.entries(patterns).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    <label className="iw-check"><input type="checkbox" checked={maskedField(field)} disabled={field.pattern === 'ssn' || field.pattern === 'ein'} onChange={event => change({ ...field, masked: event.target.checked })} />Mask value on display</label>
    <small>Syntax checks only. Masked values remain in the executed PDF and audit download.</small>
  </fieldset>
}
