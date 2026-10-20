import { choiceField, fieldTypes } from '../inkwell/business-fields'
import { useId, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import type { Field } from './types'
import { PdfViewer } from './pdf-viewer'
import { pageAt, type FieldEditing } from './editable-field'
import { align, colorClass, duplicate, duplicateToEveryPage, fit, nudge, type Alignment } from './field-layout'
import { FieldInspector } from './field-inspector'

export type EditorRecipient = { name: string; locked: boolean }

/** PREP-005: the prepare screen's field editor. The sender picks whose field it is (each recipient has a color), its
 * type, label and size, then places it by clicking a page or its thumbnail, by dragging the chip onto either, or with the
 * keyboard (a focused page places at its center). Placed fields are selected by click or from the list, moved and
 * resized by dragging or arrow keys, duplicated (once, or to every page), aligned, reassigned to another recipient and
 * given their label, type, page, place and size in the inspector. A locked recipient's fields (DELIV-006) stay as they
 * are. */
export function FieldEditor({ pdf, fields, setFields, signer, setSigner, recipients, asTemplate, busy }: { pdf: Uint8Array; fields: Field[]; setFields: Dispatch<SetStateAction<Field[]>>; signer: number; setSigner: (index: number) => void; recipients: EditorRecipient[]; asTemplate?: boolean; busy: boolean }) {
  const [type, setType] = useState<Field['type']>('signature')
  const [label, setLabel] = useState('Signature')
  const [width, setWidth] = useState(.26)
  const [height, setHeight] = useState(.055)
  const [chosen, setChosen] = useState<string[]>([])
  const [pages, setPages] = useState(0)
  const [ghost, setGhost] = useState<{ x: number; y: number }>()
  const hint = useId()
  const locked = (index: number) => Boolean(recipients[index]?.locked)
  const who = asTemplate ? 'Role' : 'Recipient'
  const recipientName = (index: number) => recipients[index]?.name || `${who.toLowerCase()} ${index + 1}`
  const selected = chosen.filter(id => fields.some(field => field.id === id && !locked(field.signer)))
  const selection = fields.filter(field => selected.includes(field.id))
  function place(page: number, x: number, y: number) {
    if (busy || locked(signer)) return
    setFields(current => [...current, fit({ id: crypto.randomUUID(), signer, type, label: label.trim() || type, page, x, y, width, height, ...(choiceField({ type } as Field) ? { options: ['Option 1', 'Option 2'] } : {}) })])
  }
  const replace = (changed: Field[]) => setFields(current => current.map(field => changed.find(next => next.id === field.id) ?? field))
  const editing: FieldEditing = {
    selected, hint, recipient: recipientName, locked: field => locked(field.signer),
    select: (id, additive) => setChosen(current => additive ? (current.includes(id) ? current.filter(item => item !== id) : [...current, id]) : [id]),
    change: field => replace([field]),
    remove: id => setFields(current => current.filter(field => field.id !== id)),
  }
  const actions = {
    duplicate: () => { const copies = selection.map(duplicate); setFields(current => [...current, ...copies]); setChosen(copies.map(field => field.id)) },
    everyPage: () => setFields(current => [...current, ...selection.flatMap(field => duplicateToEveryPage(field, pages))]),
    align: (to: Alignment) => replace(align(selection, to)),
    reassign: (to: number) => replace(selection.map(field => ({ ...field, signer: to }))),
    change: (field: Field) => replace([field]),
    remove: () => { setFields(current => current.filter(field => !selected.includes(field.id))); setChosen([]) },
    clear: () => setChosen([]),
  }
  // Dragging the chip: a marker follows the pointer and the field lands where it is let go on a page or thumbnail.
  function dragChip(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || busy) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setGhost({ x: event.clientX, y: event.clientY })
  }
  function dropChip(event: PointerEvent<HTMLDivElement>) {
    if (!ghost) return
    setGhost(undefined)
    const target = pageAt(event.clientX, event.clientY)
    if (target) place(target.page, target.x - width / 2, target.y - height / 2)
  }
  return <div className="iw-editor"><aside className="iw-field-tools iw-stack"><h3>Place fields</h3>
    <label>{who}<select value={signer} onChange={event => setSigner(Number(event.target.value))}>{recipients.map((recipient, index) => recipient.locked ? null : <option key={index} value={index}>{index + 1}. {recipient.name || who}</option>)}</select></label>
    <ul className="iw-who-legend" aria-label={`${who} colors`}>{recipients.map((recipient, index) => recipient.locked ? null : <li key={index}><span className={`iw-who-swatch ${colorClass(index)}`} aria-hidden="true" />{index + 1}. {recipient.name || who}</li>)}</ul>
    <label>Field type<select value={type} onChange={event => { const value = event.target.value as Field['type']; setType(value); setLabel(fieldTypes.find(([type]) => type === value)?.[1] ?? 'Text') }}>{fieldTypes.map(([type, name]) => <option key={type} value={type}>{name}</option>)}</select></label>
    <label>Field label<input value={label} maxLength={80} onChange={event => setLabel(event.target.value)} /></label>
    <div className="iw-two"><label>Width (%)<input type="number" min={10} max={80} value={Math.round(width * 100)} onChange={event => setWidth(Math.min(.8, Math.max(.1, Number(event.target.value) / 100)))} /></label><label>Height (%)<input type="number" min={3} max={20} value={Math.round(height * 100)} onChange={event => setHeight(Math.min(.2, Math.max(.03, Number(event.target.value) / 100)))} /></label></div>
    <p className="iw-muted" id={hint}>Click a page or its thumbnail to place the field, or drag the chip above the pages onto either. Keyboard: focus a page and press Enter to place at its center; on a field’s selection checkbox, arrow keys move it, Shift with arrow keys resizes it, Enter selects it (Shift+Enter adds it to the selection) and Delete removes it.</p>
    {selection.length > 0 && <FieldInspector selection={selection} recipients={recipients} who={who} pages={pages} fields={fields} actions={actions} />}
    <div className="iw-placed">{fields.map((field, index) => <div key={field.id} data-field-id={field.id}><label className="iw-check"><input type="checkbox" disabled={locked(field.signer)} checked={selected.includes(field.id)} aria-describedby={hint} onKeyDown={event => {
      if (locked(field.signer)) return
      if (event.key === 'Enter') { event.preventDefault(); editing.select(field.id, true); return }
      const next = nudge(field, event.key, event.shiftKey)
      if (next) { event.preventDefault(); replace([next]) }
      if (event.key === 'Delete') { event.preventDefault(); setFields(current => current.filter(item => item.id !== field.id)) }
    }} onChange={() => editing.select(field.id, true)} aria-label={`Select field ${index + 1}: ${field.label}, ${recipientName(field.signer)}, page ${field.page + 1}`} /><span className={`iw-who-swatch ${colorClass(field.signer)}`} aria-hidden="true" /><span>{field.signer + 1}. {field.label} · p{field.page + 1}</span></label><button type="button" aria-label={`Remove field ${index + 1}`} disabled={locked(field.signer)} onClick={() => setFields(current => current.filter(item => item.id !== field.id))}>×</button></div>)}</div>
  </aside><PdfViewer source={pdf} fields={fields} onPlace={place} editing={editing} onPages={setPages} toolbar={<div className={`iw-drag-chip ${colorClass(signer)}`} aria-hidden="true" onPointerDown={dragChip} onPointerMove={event => { if (ghost) setGhost({ x: event.clientX, y: event.clientY }) }} onPointerUp={dropChip} onPointerCancel={() => setGhost(undefined)}>Drag a {label.trim() || type} field onto a page</div>} />
    {ghost && <div className={`iw-drag-ghost ${colorClass(signer)}`} aria-hidden="true" style={{ left: ghost.x, top: ghost.y }}>{label.trim() || type}</div>}
  </div>
}
