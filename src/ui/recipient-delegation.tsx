import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { FieldEditor } from './field-editor'
import { ErrorNotice, useAction } from './feedback'
import { request, type Field } from './types'

export type DelegatedTarget = {
  place: number; name: string; email: string; phone?: string; sms?: boolean; role?: string; order: number
  unresolved: boolean; message?: string
  /** Local pages in the supplied editor PDF which this target may also see. Omitted means the whole supplied scope. */
  visiblePages?: number[]
}
export type RecipientDelegationProps = {
  base: string; role: 'specify_recipients' | 'editor'; targets: DelegatedTarget[]
  /** Fields have stable recipient places in signer, but local pages in the scoped source PDF. */
  fields: Field[]; sourceURL?: string; canonicalPages?: number[]; pageSizes?: { width: number; height: number }[]
  disabled?: boolean; onComplete: () => Promise<void>
}
type Person = { name: string; email: string; phone: string; message: string }

export function RecipientDelegation({ base, role, targets, fields, sourceURL, canonicalPages, pageSizes, disabled = false, onComplete }: RecipientDelegationProps) {
  const editor = role === 'editor'
  const initialPeople = () => Object.fromEntries(targets.map(target => [target.place, { name: target.name, email: target.email, phone: target.phone ?? '', message: target.message ?? '' }]))
  const localFields = () => fields.map(field => ({ ...field, signer: targets.findIndex(target => target.place === field.signer) }))
  const [people, setPeople] = useState<Record<number, Person>>(initialPeople)
  const [editingFields, setEditingFields] = useState<Field[]>(localFields)
  const [recipient, setRecipient] = useState(0), [consent, setConsent] = useState(false)
  const [pdf, setPdf] = useState<Uint8Array>(), [loading, setLoading] = useState(editor)
  const action = useAction(), loadAction = useAction(), submitting = useRef(false)
  const snapshot = JSON.stringify({ targets, fields, canonicalPages })
  useEffect(() => { setPeople(initialPeople()); setEditingFields(localFields()); setRecipient(0); setConsent(false) }, [base, role, snapshot])
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    setPdf(undefined); setLoading(editor)
    if (!editor) { loadAction.setError(''); return () => controller.abort() }
    void loadAction.run(async () => {
      try {
        if (!sourceURL || !canonicalPages?.length) throw new Error('The delegated document scope is unavailable. Reload the request before editing.')
        const url = new URL(sourceURL, window.location.origin)
        if (url.origin !== window.location.origin) throw new Error('Open the editor document from this application.')
        const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal })
        if (!response.ok) throw new Error('The delegated document could not be loaded. Reload the request before editing.')
        const bytes = new Uint8Array(await response.arrayBuffer()), { PDFDocument } = await import('pdf-lib')
        const count = (await PDFDocument.load(bytes)).getPageCount()
        if (count !== canonicalPages.length || (pageSizes && count !== pageSizes.length)) throw new Error('The delegated document scope changed. Reload the request before editing.')
        if (current) setPdf(bytes)
      } catch (error) { if (current) throw error }
      finally { if (current) setLoading(false) }
    })
    return () => { current = false; controller.abort() }
  }, [base, role, sourceURL, JSON.stringify(canonicalPages), JSON.stringify(pageSizes)])
  const scopeError = new Set(targets.map(target => target.place)).size !== targets.length ? 'The delegated recipient scope is invalid. Reload the request.'
    : editor && fields.some(field => !targets.some(target => target.place === field.signer) || canonicalPages?.[field.page] === undefined) ? 'A field is outside the delegated scope. Reload the request.' : ''
  const busy = disabled || action.busy || loading || loadAction.busy
  const actionable = targets.filter(target => editor || target.unresolved)
  function changePerson(place: number, field: keyof Person, value: string) {
    setPeople(previous => ({ ...previous, [place]: { ...previous[place], [field]: value } }))
  }
  function fieldProblem(next: Field[]) {
    if (fields.some(original => !next.some(field => field.id === original.id))) return 'Existing fields cannot be removed in this delegated action.'
    for (const field of next) {
      const target = targets[field.signer]
      if (!target || canonicalPages?.[field.page] === undefined || target.visiblePages && !target.visiblePages.includes(field.page)) return 'Place fields only on documents visible to both you and the chosen recipient.'
      if (target.role === 'approver' || target.role === 'specify_recipients' || target.role === 'editor' || target.role === 'needs_to_view' || target.role === 'certified_delivery') return 'This recipient action does not accept document fields.'
      if (target.role === 'form_filler' && ['signature', 'initials', 'stamp'].includes(field.type)) return 'A form filler can complete business fields, without a signature, initials or stamp.'
    }
    return ''
  }
  const setScopedFields: Dispatch<SetStateAction<Field[]>> = update => {
    const next = typeof update === 'function' ? update(editingFields) : update, problem = fieldProblem(next)
    if (problem) { action.setError(problem); return }
    action.setError(''); setEditingFields(next)
  }
  async function complete() {
    if (busy || submitting.current || !consent || scopeError || !actionable.length || editor && !pdf) return
    submitting.current = true
    try {
      await action.run(async () => {
        if (editor) { const problem = fieldProblem(editingFields); if (problem) throw new Error(problem) }
        const recipients = actionable.map(target => {
          const person = people[target.place]
          return { place: target.place, name: person.name, email: person.email, ...(target.sms ? { phone: person.phone } : {}), ...(editor ? { message: person.message } : {}) }
        })
        const changedFields = editor ? editingFields.map(({ document: _document, documentPage: _documentPage, ...field }) => ({ ...field, signer: targets[field.signer].place, page: canonicalPages![field.page] })) : undefined
        await request(`${base}/${editor ? 'edit' : 'specify-recipients'}`, { recipients, ...(editor ? { fields: changedFields } : {}), consent: true, commandId: crypto.randomUUID() })
        await onComplete()
      })
    } finally { submitting.current = false }
  }
  return <form className="iw-stack" aria-label={editor ? 'Edit delegated recipients and fields' : 'Name delegated recipients'} style={{ minWidth: 0, overflowWrap: 'anywhere' }} onSubmit={event => { event.preventDefault(); void complete() }}>
    <h2>{editor ? 'Edit later recipients' : 'Name later recipients'}</h2>
    <p>{editor ? 'Review the later recipients and fields the sender allowed you to edit, then pass the envelope on.' : 'Supply the names and email addresses the sender left open. Later recipients are invited when their routing order is reached.'}</p>
    <ErrorNotice error={scopeError} /><ErrorNotice error={loadAction.error} />{loading && <p role="status">Loading the delegated documents…</p>}
    <fieldset className="iw-stack" disabled={busy || Boolean(scopeError)}><legend>Delegated recipients</legend>{targets.map(target => {
      const person = people[target.place], label = `Recipient ${target.place + 1}, routing order ${target.order}`, editable = editor || target.unresolved
      return <div className="iw-stack" key={target.place}><h3>{label}</h3>{!editable ? <p>{target.name} · {target.email} · already named</p> : <><div className="iw-two"><label>{label} name<input aria-label={`${label} name`} required maxLength={100} value={person?.name ?? ''} onChange={event => changePerson(target.place, 'name', event.target.value)} /></label><label>{label} email<input aria-label={`${label} email`} type="email" required maxLength={254} value={person?.email ?? ''} onChange={event => changePerson(target.place, 'email', event.target.value)} /></label></div>
        {target.sms && <label>{label} mobile number<input aria-label={`${label} mobile number`} type="tel" required maxLength={32} autoComplete="tel" value={person?.phone ?? ''} onChange={event => changePerson(target.place, 'phone', event.target.value)} /><small>Keep the sender’s SMS authentication and supply this person’s mobile number.</small></label>}
        {editor && <label>{label} private message<textarea aria-label={`${label} private message`} maxLength={1000} rows={3} value={person?.message ?? ''} onChange={event => changePerson(target.place, 'message', event.target.value)} /></label>}
      </>}</div>
    })}</fieldset>
    {editor && pdf && !scopeError && <fieldset disabled={busy} className="iw-stack"><legend>Delegated fields</legend><p>Choose a later recipient and place or edit their fields on the permitted pages. Existing fields cannot be removed.</p><FieldEditor pdf={pdf} fields={editingFields} setFields={setScopedFields} signer={recipient} setSigner={setRecipient} recipients={targets.map(target => ({ name: `${people[target.place]?.name || target.name} · order ${target.order}`, locked: Boolean(target.role && !['signer', 'form_filler'].includes(target.role)) }))} busy={busy} /></fieldset>}
    {!actionable.length && <p role="status">There are no open delegated recipients to name.</p>}
    <label className="iw-check"><input type="checkbox" required disabled={busy || Boolean(scopeError)} checked={consent} onChange={event => setConsent(event.target.checked)} />{editor ? 'I have reviewed these recipient and field changes and authorize passing this envelope to the next routing step.' : 'I have reviewed these recipient identities and authorize continuing the routing.'}</label>
    <ErrorNotice error={action.error} /><button type="submit" className="iw-primary iw-fit" disabled={busy || Boolean(scopeError || loadAction.error) || !consent || !actionable.length || editor && !pdf}>{action.busy ? 'Saving…' : editor ? 'Save edits and continue' : 'Name recipients and continue'}</button>
  </form>
}
