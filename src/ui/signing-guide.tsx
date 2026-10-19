import { useEffect, useRef, useState } from 'react'
import type { Field } from './types'
import { ErrorNotice, useAction } from './feedback'

/** The fields in reading order: by page, then top to bottom, then left to right. */
export const readingOrder = (fields: Field[]) => [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)

type Props = { fields: Field[]; values: Record<string, string>; current?: string; onCurrent: (id: string) => void; onChange: (id: string, value: string) => void; onSave: () => Promise<unknown>; consentId: string; disabled: boolean }
/** SIGNX-001: Start and then Next take the signer to each required field still empty, in reading order, with the document scrolled
 * to it (pdf-viewer.tsx) and its entry at the foot of the screen; once none is left, Next goes to the consent. The count shows
 * what remains. Each Next saves what is entered, and Finish later saves it so the same link reopens where they left off. */
export function SigningGuide({ fields, values, current, onCurrent, onChange, onSave, consentId, disabled }: Props) {
  const ordered = readingOrder(fields), filled = (field: Field) => Boolean(values[field.id]?.trim())
  const done = ordered.filter(filled).length, left = ordered.length - done, field = ordered.find(candidate => candidate.id === current)
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const save = useAction()
  useEffect(() => {
    if (!current) return
    if (current === 'review') { const consent = document.getElementById(consentId); consent?.scrollIntoView({ block: 'center' }); consent?.focus({ preventScroll: true }); return }
    input.current?.focus({ preventScroll: true })
  }, [current])
  function next() {
    const start = field ? ordered.indexOf(field) + 1 : 0
    const following = [...ordered.slice(start), ...ordered.slice(0, start)].find(candidate => !filled(candidate))
    setSaved(false); onCurrent(following?.id ?? 'review')
    if (current) void save.run(async () => { await onSave() })
  }
  return <div className="iw-guide" role="group" aria-label="Guided signing">
    <p className="iw-guide-count" role="status">{left ? `${done} of ${ordered.length} required fields complete · ${left} left` : `All ${ordered.length} required fields complete`}</p>
    {field && <label className="iw-guide-field">{field.label}<small>Field {ordered.indexOf(field) + 1} of {ordered.length} · Page {field.page + 1} · {field.type}</small><input ref={input} className={field.type === 'signature' ? 'iw-typed-signature' : undefined} disabled={disabled} maxLength={field.type === 'signature' ? 160 : 500} type={field.type === 'date' ? 'date' : 'text'} autoComplete={field.type === 'signature' ? 'name' : 'off'} enterKeyHint="next" value={values[field.id] || ''} onChange={event => onChange(field.id, event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); next() } }} /></label>}
    {current === 'review' && !left && <p>Every field is complete. Confirm your consent, then sign.</p>}
    <div className="iw-actions"><button type="button" className="iw-primary" disabled={disabled} onClick={next}>{current ? 'Next' : 'Start'}</button><button type="button" disabled={disabled || save.busy || !done} onClick={() => void save.run(async () => { await onSave(); setSaved(true) })}>Finish later</button></div>
    {saved && <p role="status">Saved. Open this same link to finish.</p>}
    <ErrorNotice error={save.error} />
  </div>
}
