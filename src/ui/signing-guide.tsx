import { selectedOptions, validateBusinessValue } from '../inkwell/business-fields'
import { requiredField } from '../inkwell/field-rules'
import { SigningFieldInput } from './signing-field-input'
import { useEffect, useRef, useState } from 'react'
import type { Field } from './types'
import { ErrorNotice, useAction } from './feedback'

/** The fields in reading order: by page, then top to bottom, then left to right. */
export const readingOrder = (fields: Field[]) => [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)

type Props = { saveAvailable?: boolean; allFields?: Field[]; fields: Field[]; values: Record<string, string>; current?: string; onCurrent: (id: string) => void; onChange: (id: string, value: string) => void; onSave: () => Promise<unknown>; consentId: string; disabled: boolean }
/** SIGNX-001: Start and then Next take the signer to each required field still empty, in reading order, with the document scrolled
 * to it (pdf-viewer.tsx) and its entry at the foot of the screen; once none is left, Next goes to the consent. The count shows
 * what remains. Each Next saves what is entered, and Finish later saves it so the same link reopens where they left off. */
export function SigningGuide({ fields, allFields = fields, values, current, onCurrent, onChange, onSave, consentId, disabled, saveAvailable }: Props) {
  const ordered = readingOrder(fields), filled = (field: Field) => { if (!requiredField(field, allFields, values)) return true; const value = values[field.id] ?? ''; if (field.type === 'checkbox_group') { try { validateBusinessValue(field, value); return selectedOptions(value).length > 0 } catch { return false } }; return field.type === 'checkbox' ? value === 'true' : Boolean(value.trim()) }
  const required = ordered.filter(field => requiredField(field, allFields, values))
  const done = required.filter(filled).length, left = required.length - done, field = ordered.find(candidate => candidate.id === current)
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement | HTMLSelectElement>(null), guide = useRef<HTMLDivElement>(null)
  const save = useAction()
  useEffect(() => {
    if (!current) return
    if (current === 'review') { const consent = document.getElementById(consentId); consent?.scrollIntoView({ block: 'center' }); consent?.focus({ preventScroll: true }); return }
    input.current?.focus({ preventScroll: true })
  }, [current])
  // SIGNX-003: the page knows the guide's height, so focus and scrolling keep every control above it (editor.css).
  useEffect(() => {
    const root = document.documentElement, observer = new ResizeObserver(([entry]) => root.style.setProperty('--iw-guide-height', `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`))
    observer.observe(guide.current!)
    return () => { observer.disconnect(); root.style.removeProperty('--iw-guide-height') }
  }, [])
  function next() {
    const start = field ? ordered.indexOf(field) + 1 : 0
    const following = [...ordered.slice(start), ...ordered.slice(0, start)].find(candidate => !filled(candidate))
    setSaved(false); onCurrent(following?.id ?? 'review')
    if (current) void save.run(async () => { await onSave() })
  }
  return <div ref={guide} className="iw-guide" role="group" aria-label="Guided signing">
    <p className="iw-guide-count" role="status">{left ? `${done} of ${required.length} required fields complete · ${left} left` : `All ${required.length} required fields complete`}</p>
    {field && <div className="iw-guide-field"><SigningFieldInput field={field} hint={`Field ${ordered.indexOf(field) + 1} of ${ordered.length} · Page ${field.page + 1} · ${field.type.replaceAll('_', ' ')}`} required={requiredField(field, allFields, values)} values={values} disabled={disabled} onChange={onChange} inputRef={input} onNext={next} /></div>}
    {current === 'review' && !left && <p>Every field is complete. Confirm your consent, then sign.</p>}
    <div className="iw-actions"><button type="button" className="iw-primary" disabled={disabled} onClick={next}>{current ? 'Next' : 'Start'}</button><button type="button" disabled={disabled || save.busy || !(saveAvailable ?? done > 0)} onClick={() => void save.run(async () => { await onSave(); setSaved(true) })}>Finish later</button></div>
    {saved && <p role="status">Saved. Open this same link to finish.</p>}
    <ErrorNotice error={save.error} />
  </div>
}
