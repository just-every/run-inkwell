import type { Field } from './types'

// PREP-005: field geometry on the prepare screen. Positions and sizes are fractions of the page (0 to 1, from its top
// left corner), rounded to 0.0001; every edit keeps the field whole on its page. Arrow keys move or resize by 1% of the
// page; the smallest field is 3% wide and 2% high.
export const step = .01
const minWidth = .03, minHeight = .02
const round = (value: number) => Math.round(value * 10_000) / 10_000

/** The field with `patch` applied, resized to fit and moved back onto its page. */
export function fit(field: Field, patch: Partial<Field> = {}): Field {
  const next = { ...field, ...patch }
  const width = round(Math.min(1, Math.max(minWidth, next.width))), height = round(Math.min(1, Math.max(minHeight, next.height)))
  return { ...next, width, height, x: round(Math.min(1 - width, Math.max(0, next.x))), y: round(Math.min(1 - height, Math.max(0, next.y))) }
}

/** Arrow keys: move by one step, or with Shift resize (Right and Down grow, Left and Up shrink). */
export function nudge(field: Field, key: string, resize: boolean): Field | undefined {
  const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key]
  if (!delta) return undefined
  return resize ? fit(field, { width: field.width + delta[0], height: field.height + delta[1] }) : fit(field, { x: field.x + delta[0], y: field.y + delta[1] })
}

/** A copy just below the original on its page, or on every other page at the same place. */
export function duplicate(field: Field): Field { return fit(field, { id: crypto.randomUUID(), y: field.y + field.height + step }) }
export function duplicateToEveryPage(field: Field, pages: number): Field[] {
  return Array.from({ length: pages }, (_, page) => page).filter(page => page !== field.page).map(page => ({ ...field, id: crypto.randomUUID(), page }))
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
/** Lines the fields up on one edge or center line of the box around them all (fields on different pages align by their
 * place on the page). */
export function align(fields: Field[], to: Alignment): Field[] {
  const left = Math.min(...fields.map(f => f.x)), right = Math.max(...fields.map(f => f.x + f.width))
  const top = Math.min(...fields.map(f => f.y)), bottom = Math.max(...fields.map(f => f.y + f.height))
  return fields.map(f => fit(f, {
    left: { x: left }, right: { x: right - f.width }, center: { x: (left + right - f.width) / 2 },
    top: { y: top }, bottom: { y: bottom - f.height }, middle: { y: (top + bottom - f.height) / 2 },
  }[to]))
}

/** Each recipient's fields take that recipient's color (six colors, repeating from the seventh recipient). */
export const colorClass = (signer: number) => `iw-who-${signer % 6}`
