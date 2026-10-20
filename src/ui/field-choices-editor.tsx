import { choiceField } from '../inkwell/business-fields'
import type { Field } from './types'

/** PREP-003: native controls in the existing inspector, with the same schema as the API. */
export function FieldChoicesEditor({ field, change }: { field: Field; change: (field: Field) => void }) {
  if (!choiceField(field)) return null
  return <fieldset className="iw-stack"><legend>Choices</legend>
    <label>Options (one per line)<textarea aria-label="Options (one per line)" rows={4} value={(field.options ?? []).join('\n')} onChange={event => change({ ...field, options: event.target.value.split('\n') })} /></label>
    <small>2–20 distinct options, up to 500 characters together. Values use these exact labels.</small>
    {field.type === 'checkbox_group' && <div className="iw-two"><label>Minimum selections<input aria-label="Minimum selections" type="number" min={0} max={field.options?.length} value={field.minimum ?? 0} onChange={event => change({ ...field, minimum: Number(event.target.value) })} /></label><label>Maximum selections<input aria-label="Maximum selections" type="number" min={0} max={field.options?.length} value={field.maximum ?? field.options?.length ?? 0} onChange={event => change({ ...field, maximum: Number(event.target.value) })} /></label></div>}
  </fieldset>
}
