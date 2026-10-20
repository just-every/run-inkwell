import { markField, maskedField } from '../inkwell/business-fields'
import type { Field } from './types'

/** PREP-004: conditions and formulas use named fields, with native keyboard controls. */
export function FieldRulesEditor({ field, fields, change }: { field: Field; fields: Field[]; change: (field: Field) => void }) {
  const sources = fields.filter(f => f.id !== field.id && f.signer === field.signer && !markField(f))
  return <div className="iw-stack">
    <label>Show this field when<select aria-label="Condition field" value={field.condition?.field ?? ''} onChange={event => change({ ...field, condition: event.target.value ? { field: event.target.value, equals: 'true' } : undefined })}><option value="">Always shown</option>{sources.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
    {field.condition && <label>Equals<input aria-label="Condition value" type={sources.some(f => f.id === field.condition!.field && maskedField(f)) ? 'password' : 'text'} value={field.condition.equals} maxLength={500} onChange={event => change({ ...field, condition: { ...field.condition!, equals: event.target.value } })} /></label>}
    <label className="iw-check"><input type="checkbox" checked={field.required ?? field.type !== 'checkbox'} onChange={event => change({ ...field, required: event.target.checked })} />Required when shown</label>
    <label>Required only when<select aria-label="Required condition field" value={field.requiredWhen?.field ?? ''} onChange={event => change({ ...field, requiredWhen: event.target.value ? { field: event.target.value, equals: 'true' } : undefined })}><option value="">Use required setting above</option>{sources.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
    {field.requiredWhen && <label>Required comparison value<input aria-label="Required condition value" type={sources.some(f => f.id === field.requiredWhen!.field && maskedField(f)) ? 'password' : 'text'} value={field.requiredWhen.equals} maxLength={500} onChange={event => change({ ...field, requiredWhen: { ...field.requiredWhen!, equals: event.target.value } })} /></label>}
    {field.type === 'number' && <>
      <label>Calculate USD total<select aria-label="Calculation operation" value={field.calculation?.operation ?? ''} onChange={event => change({ ...field, calculation: event.target.value ? { operation: event.target.value as 'sum' | 'difference' | 'product', fields: [] } : undefined })}><option value="">Entered by signer</option><option value="sum">Sum</option><option value="difference">First minus the rest</option><option value="product">Product</option></select></label>
      {field.calculation && <fieldset><legend>Calculation inputs (document order)</legend><div className="iw-stack">{sources.filter(f => f.type === 'number').map(f => <label className="iw-check" key={f.id}><input type="checkbox" checked={field.calculation!.fields.includes(f.id)} onChange={event => change({ ...field, calculation: { ...field.calculation!, fields: sources.filter(s => s.type === 'number' && (s.id === f.id ? event.target.checked : field.calculation!.fields.includes(s.id))).map(s => s.id) } })} />{f.label}</label>)}</div></fieldset>}
    </>}
  </div>
}
