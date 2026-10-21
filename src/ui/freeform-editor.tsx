import { useId, useState } from 'react'
import type { Field } from './types'
import { fieldTypes } from '../inkwell/business-fields'
import { FieldInspector } from './field-inspector'
import { PdfViewer } from './pdf-viewer'
import { type FieldEditing } from './editable-field'
import { align, colorClass, duplicate, duplicateToEveryPage, fit, nudge, type Alignment } from './field-layout'
import { ErrorNotice } from './feedback'

const types = fieldTypes.filter(([type]) => ['signature', 'initials', 'date_signed', 'full_name', 'text'].includes(type))
const overlaps = (a: Field, b: Field) => a.page === b.page && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** PREP-011 uses PREP-005's page editing and inspector. Signed fields are context only; every mutation stays with this signer. */
export function FreeformEditor({ source, fields, signedFields, signer, name, pages, onChange, busy, current }: { source: string; fields: Field[]; signedFields: Field[]; signer: number; name: string; pages: number; onChange: (fields: Field[]) => void; busy: boolean; current?: string }) {
  const [type, setType] = useState<Field['type']>('signature')
  const [label, setLabel] = useState('Signature')
  const [page, setPage] = useState(0)
  const [x, setX] = useState(.1), [y, setY] = useState(.65)
  const [width, setWidth] = useState(.26), [height, setHeight] = useState(.055)
  const [chosen, setChosen] = useState<string[]>([])
  const [error, setError] = useState('')
  const hint = useId()
  const selected = chosen.filter(id => fields.some(field => field.id === id)), selection = fields.filter(field => selected.includes(field.id))
  const recipients = Array.from({ length: signer + 1 }, (_, index) => ({ name: index === signer ? name : `Earlier signer ${index + 1}`, locked: index !== signer }))
  function update(next: Field[]) {
    if (busy) return
    if (next.length > 100) { setError('You can place up to 100 fields. Remove a field before adding another.'); return }
    if (next.some(field => signedFields.some(signed => overlaps(field, signed)))) { setError('A field cannot overlap an earlier signer’s signed field. Choose another position.'); return }
    setError(''); onChange(next)
  }
  const replace = (changes: Field[]) => update(fields.map(field => changes.find(next => next.id === field.id) ?? field))
  function place(page: number, left: number, top: number) {
    const field = fit({ id: crypto.randomUUID(), signer, type, label: label.trim() || types.find(([value]) => value === type)![1], page, x: left, y: top, width, height })
    update([...fields, field]); setChosen([field.id])
  }
  const editing: FieldEditing = {
    selected, hint, recipient: index => index === signer ? name : `Earlier signer ${index + 1}`,
    locked: field => busy || !fields.some(own => own.id === field.id),
    select: (id, additive) => setChosen(current => additive ? current.includes(id) ? current.filter(item => item !== id) : [...current, id] : [id]),
    change: field => replace([field]), remove: id => update(fields.filter(field => field.id !== id)),
  }
  const actions = {
    duplicate: () => { const copies = selection.map(duplicate); update([...fields, ...copies]); setChosen(copies.map(field => field.id)) },
    everyPage: () => update([...fields, ...selection.flatMap(field => duplicateToEveryPage(field, pages))]),
    align: (to: Alignment) => replace(align(selection, to)),
    reassign: (to: number) => { if (to !== signer) throw new Error('You can place fields only for yourself.'); replace(selection.map(field => ({ ...field, signer }))) }, change: (field: Field) => replace([field]),
    remove: () => { update(fields.filter(field => !selected.includes(field.id))); setChosen([]) }, clear: () => setChosen([]),
  }
  return <div className="iw-stack">
    <aside className="iw-field-tools iw-stack" aria-label="Place your fields">
      <h3>Place your fields</h3>
      <p>Place at least one signature, then complete your fields. Earlier signed fields are locked. You can place up to 100 fields.</p>
      <fieldset className="iw-stack" disabled={busy}><legend>New field</legend>
        <label>Field type<select aria-label="Field type" value={type} onChange={event => { const next = event.target.value as Field['type']; setType(next); setLabel(types.find(([value]) => value === next)![1]) }}>{types.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
        <label>Field label<input maxLength={80} value={label} onChange={event => setLabel(event.target.value)} /></label>
        <label>Page<select aria-label="New field page" value={page} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: pages }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}</select></label>
        <div className="iw-two"><label>Left (%)<input aria-label="New field left (%)" type="number" min={0} max={100} step={.5} value={x * 100} onChange={event => setX(Number(event.target.value) / 100)} /></label><label>Top (%)<input aria-label="New field top (%)" type="number" min={0} max={100} step={.5} value={y * 100} onChange={event => setY(Number(event.target.value) / 100)} /></label></div>
        <div className="iw-two"><label>Width (%)<input aria-label="New field width (%)" type="number" min={3} max={100} step={.5} value={width * 100} onChange={event => setWidth(Number(event.target.value) / 100)} /></label><label>Height (%)<input aria-label="New field height (%)" type="number" min={2} max={100} step={.5} value={Math.round(height * 1000) / 10} onChange={event => setHeight(Number(event.target.value) / 100)} /></label></div>
        <button type="button" disabled={!pages || fields.length >= 100} onClick={() => place(page, x, y)}>Add field</button>
      </fieldset>
      <p id={hint} className="iw-muted">Add with the controls above, or focus a page and press Enter to place at its center. Select a field below to edit its page, position and size. Arrow keys move it; Shift with arrow keys resizes it; Delete removes it.</p>
      <ErrorNotice error={error} />
      {selection.length > 0 && <fieldset disabled={busy}><FieldInspector freeForm selection={selection} recipients={recipients} who="Signer" pages={pages} fields={fields} actions={actions} /></fieldset>}
      <div className="iw-placed">{fields.map((field, index) => <div key={field.id} data-field-id={field.id}><label className="iw-check"><input type="checkbox" disabled={busy} checked={selected.includes(field.id)} aria-describedby={hint} aria-label={`Select field ${index + 1}: ${field.label}, page ${field.page + 1}`} onChange={() => editing.select(field.id, true)} onKeyDown={event => {
        if (busy) return
        if (event.key === 'Enter') { event.preventDefault(); editing.select(field.id, event.shiftKey); return }
        const next = nudge(field, event.key, event.shiftKey)
        if (next) { event.preventDefault(); replace([next]) }
        if (event.key === 'Delete') { event.preventDefault(); editing.remove(field.id) }
      }} /><span className={`iw-who-swatch ${colorClass(signer)}`} aria-hidden="true" />{field.label} · p{field.page + 1}</label><button type="button" disabled={busy} aria-label={`Remove field ${index + 1}`} onClick={() => editing.remove(field.id)}>×</button></div>)}</div>
      {signedFields.length > 0 && <section aria-label="Earlier signed fields"><h4>Earlier signed fields · locked</h4><ul>{signedFields.map(field => <li key={field.id}>{field.label} · {field.type.replaceAll('_', ' ')} · page {field.page + 1} · signed, read-only</li>)}</ul></section>}
    </aside>
    <PdfViewer source={source} fields={[...signedFields, ...fields]} activeField={current} editing={editing} onPlace={busy ? undefined : place} />
  </div>
}
