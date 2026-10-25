import { StampInput } from './stamp-input'
import { choiceField, generatedField, maskedField, selectedOptions } from '../inkwell/business-fields'
import type { Field } from './types'

/** PREP-008: provenance is a label supplied by the sender or API caller. */
export function FieldPrefillEditor({ field, change }: { field: Field; change: (field: Field) => void }) {
  if (generatedField(field) || field.calculation) return null
  const setValue = (value: string) => {
    if (!value.trim()) {
      const { prefill: _prefill, readOnly: _readOnly, ...empty } = field
      change(empty)
    } else change({ ...field, prefill: { value, source: field.prefill?.source || 'Sender input' } })
  }
  return <fieldset className="iw-stack"><legend>Sender prefill</legend>
    {field.type === 'stamp' ? <StampInput label="Prefill value" value={field.prefill?.value ?? ''} masked={maskedField(field)} onChange={setValue} /> : field.type === 'checkbox_group' ? <fieldset className="iw-stack"><legend>Prefill value</legend>{field.options?.map(option => <label className="iw-check" key={option}><input type="checkbox" checked={selectedOptions(field.prefill?.value ?? '').includes(option)} onChange={event => { const selected = field.options!.filter(item => item === option ? event.target.checked : selectedOptions(field.prefill?.value ?? '').includes(item)); setValue(selected.length ? JSON.stringify(selected) : '') }} />{option}</label>)}</fieldset> : <label>Prefill value{choiceField(field) ? <select aria-label="Prefill value" value={field.prefill?.value ?? ''} onChange={event => setValue(event.target.value)}><option value="">No prefill</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select> : field.type === 'checkbox' ? <select aria-label="Prefill value" value={field.prefill?.value ?? ''} onChange={event => setValue(event.target.value)}><option value="">No prefill</option><option value="true">Checked</option><option value="false">Unchecked</option></select> : <input aria-label="Prefill value" type={maskedField(field) ? 'password' : field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} maxLength={500} value={field.prefill?.value ?? ''} onChange={event => setValue(event.target.value)} />}</label>}
    {field.prefill && <label>Source (reported by sender or API)<input aria-label="Source (reported by sender or API)" maxLength={200} value={field.prefill.source} onChange={event => change({ ...field, prefill: { ...field.prefill!, source: event.target.value } })} /><small className="iw-muted">Supplied by the caller, not verified with the CRM.</small></label>}
    <label className="iw-check"><input type="checkbox" checked={Boolean(field.readOnly)} disabled={!field.prefill?.value.trim()} onChange={event => change({ ...field, readOnly: event.target.checked })} />Read-only for signer</label>
  </fieldset>
}
