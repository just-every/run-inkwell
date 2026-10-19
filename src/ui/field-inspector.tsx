import type { Field } from './types'
import type { Alignment } from './field-layout'
import { fit } from './field-layout'
import { FieldRulesEditor } from './field-rules-editor'
import { FieldPrefillEditor } from './field-prefill-editor'
import type { EditorRecipient } from './field-editor'

type Actions = { duplicate: () => void; everyPage: () => void; align: (to: Alignment) => void; reassign: (to: number) => void; change: (field: Field) => void; remove: () => void; clear: () => void }
const alignments: [Alignment, string][] = [['left', 'Align left edges'], ['center', 'Align centers'], ['right', 'Align right edges'], ['top', 'Align top edges'], ['middle', 'Align middles'], ['bottom', 'Align bottom edges']]
const percent = (value: number) => Math.round(value * 1000) / 10

/** PREP-005: the selected fields' properties and actions, each a plain control so the keyboard reaches every one: move
 * them to another recipient, duplicate them, copy them to every page, align two or more, remove them; one selected field
 * also takes its label, type, page, place and size. */
export function FieldInspector({ selection, recipients, who, pages, fields, actions }: { selection: Field[]; recipients: EditorRecipient[]; who: string; pages: number; fields: Field[]; actions: Actions }) {
  const [only] = selection.length === 1 ? selection : []
  const signers = new Set(selection.map(field => field.signer))
  const change = (field: Field) => {
    if (field.type !== 'number') { const { calculation: _calculation, ...plain } = field; field = plain }
    if (field.type === 'signature' || field.calculation) { const { prefill: _prefill, readOnly: _readOnly, ...plain } = field; field = plain }
    actions.change(field)
  }
  const number = (key: 'x' | 'y' | 'width' | 'height', name: string) => only && <label>{name} (%)<input aria-label={`${name} (%) of the selected field`} type="number" min={0} max={100} step={.5} value={percent(only[key])} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) actions.change(fit(only, { [key]: value / 100 })) }} /></label>
  return <section className="iw-inspector iw-stack" aria-label="Selected fields">
    <h4 role="status">{selection.length === 1 ? '1 field selected' : `${selection.length} fields selected`}</h4>
    <label>Move selected fields to {who.toLowerCase()}<select value={signers.size === 1 ? String([...signers][0]) : ''} onChange={event => { if (event.target.value !== '') actions.reassign(Number(event.target.value)) }}>{signers.size > 1 && <option value="">Several</option>}{recipients.map((recipient, index) => recipient.locked ? null : <option key={index} value={index}>{index + 1}. {recipient.name || who}</option>)}</select></label>
    {only && <>
      <label>Label<input aria-label="Label of the selected field" maxLength={80} value={only.label} onChange={event => actions.change({ ...only, label: event.target.value })} /></label>
      <div className="iw-two"><label>Type<select aria-label="Type of the selected field" value={only.type} onChange={event => change({ ...only, type: event.target.value as Field['type'] })}><option value="signature">Signature</option><option value="text">Text</option><option value="date">Date</option><option value="checkbox">Checkbox</option><option value="number">Number (USD)</option></select></label>
        <label>Page<select aria-label="Page of the selected field" value={only.page} onChange={event => actions.change({ ...only, page: Number(event.target.value) })}>{Array.from({ length: Math.max(pages, only.page + 1) }, (_, page) => <option key={page} value={page}>{page + 1}</option>)}</select></label></div>
      <FieldPrefillEditor field={only} change={change} />
      <FieldRulesEditor field={only} fields={fields} change={change} />
      <div className="iw-two">{number('x', 'Left')}{number('y', 'Top')}</div>
      <div className="iw-two">{number('width', 'Width')}{number('height', 'Height')}</div>
    </>}
    <div className="iw-inspector-actions">
      <button type="button" onClick={actions.duplicate}>Duplicate</button>
      <button type="button" disabled={pages < 2} onClick={actions.everyPage}>Duplicate to every page</button>
      {selection.length > 1 && alignments.map(([to, name]) => <button key={to} type="button" onClick={() => actions.align(to)}>{name}</button>)}
      <button type="button" onClick={actions.remove}>Remove selected</button>
      <button type="button" onClick={actions.clear}>Clear selection</button>
    </div>
  </section>
}
