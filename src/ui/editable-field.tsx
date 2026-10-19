import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { Field } from './types'
import { colorClass, fit, nudge } from './field-layout'

/** PREP-005: what the prepare screen lets the page do with its fields. */
export type FieldEditing = {
  selected: string[]
  recipient: (signer: number) => string
  locked: (field: Field) => boolean
  hint: string
  select: (id: string, additive: boolean) => void
  change: (field: Field) => void
  remove: (id: string) => void
}

/** The page under a point: a full page or a thumbnail, each marked with `data-place-page`. */
export function pageAt(clientX: number, clientY: number) {
  const target = document.elementsFromPoint(clientX, clientY).find(el => el instanceof HTMLElement && el.dataset.placePage !== undefined) as HTMLElement | undefined
  if (!target) return undefined
  const rect = target.getBoundingClientRect()
  return { page: Number(target.dataset.placePage), x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
}

/** A placed field on the full page: drag to move it (onto another page or its thumbnail too), drag its corner to resize
 * it, click to select it (Shift, Ctrl or Command adds to the selection). Keyboard: arrows move, Shift+arrows resize,
 * Enter or Space selects (with Shift adds), Delete removes. */
export function EditableField({ field, editing }: { field: Field; editing: FieldEditing }) {
  const drag = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Field; moved: boolean; additive: boolean }>(undefined)
  const selected = editing.selected.includes(field.id)
  function down(event: PointerEvent<HTMLElement>, mode: 'move' | 'resize') {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    if (!additive && !selected) editing.select(field.id, false)
    drag.current = { mode, startX: event.clientX, startY: event.clientY, start: field, moved: false, additive }
  }
  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current, page = event.currentTarget.closest('.iw-pdf-page')
    if (!current || !page) return
    const rect = page.getBoundingClientRect(), dx = (event.clientX - current.startX) / rect.width, dy = (event.clientY - current.startY) / rect.height
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 3) return
    current.moved = true
    editing.change(current.mode === 'move' ? fit(current.start, { x: current.start.x + dx, y: current.start.y + dy }) : fit(current.start, { width: current.start.width + dx, height: current.start.height + dy }))
  }
  function up(event: PointerEvent<HTMLElement>) {
    const current = drag.current
    drag.current = undefined
    if (!current) return
    if (!current.moved) { if (current.additive) editing.select(field.id, true); return }
    if (current.mode !== 'move') return
    // Dropped on another page or a thumbnail: the field lands there, keeping where it was grabbed.
    const target = pageAt(event.clientX, event.clientY), rect = event.currentTarget.closest('.iw-pdf-page')?.getBoundingClientRect()
    if (!target || !rect || target.page === field.page) return
    const grabX = (current.startX - rect.left) / rect.width - current.start.x, grabY = (current.startY - rect.top) / rect.height - current.start.y
    editing.change(fit(current.start, { page: target.page, x: target.x - grabX, y: target.y - grabY }))
  }
  function key(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); editing.select(field.id, event.shiftKey); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); editing.remove(field.id); return }
    const next = nudge(field, event.key, event.shiftKey)
    if (next) { event.preventDefault(); editing.change(next) }
  }
  const box = { left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }
  if (editing.locked(field)) return <div data-field-id={field.id} className={`iw-field iw-field-edit ${colorClass(field.signer)}`} style={box}><span>{field.signer + 1}: {field.label}</span></div>
  return <div data-field-id={field.id} data-page={field.page} data-signer={field.signer} className={`iw-field iw-field-edit ${colorClass(field.signer)}${selected ? ' iw-field-selected' : ''}`} style={box}
    aria-hidden="true" tabIndex={-1} aria-label={`${field.label}, ${field.type} field for ${editing.recipient(field.signer)}, page ${field.page + 1}`} aria-describedby={editing.hint}
    onPointerDown={event => down(event, 'move')} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = undefined }} onKeyDown={key}>
    <span>{field.signer + 1}: {field.label}</span>
    <span className="iw-field-handle" aria-hidden="true" onPointerDown={event => down(event, 'resize')} />
  </div>
}
