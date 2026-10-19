import { useEffect, useState, type FormEvent } from 'react'
import { command, fileBase64, type Envelope, type Field } from './types'

// IDV-003: an optional access code per recipient, shared out of band and entered before the document opens.
// ROUTE-002: each recipient's routing order; recipients who share a number sign at the same time.
// PREP-009: a private message per recipient; `keep` holds an access code already set on a saved draft.
// DELIV-006: when correcting a sent envelope, `locked` marks a recipient who has acted (fixed for good) and `removed` one
// the correction takes off; both keep their place so every field and audit event still names the right recipient.
// TMPL-001: in a template a recipient is a role: `name` is the role's name, there is no email, and `needsCode` asks the
// sender for that person's access code at each send.
type Recipient = { name: string; email: string; accessCode: string; order: number; keep?: boolean; message?: string; locked?: string; removed?: boolean; existing?: boolean; needsCode?: boolean }
// DELIV-007 / ROUTE-001: people who only receive the completed copy, with no action link.
type Copy = { name: string; email: string }
import { ErrorNotice, useAction } from './feedback'
import { PdfViewer } from './pdf-viewer'
import { Icon } from './icons'
import { ContactPicker, type Contact } from './contacts'

/** A new envelope, or with `draft` a saved draft reopened with everything editable until it is approved (PREP-009), or
 * with `correcting` a sent envelope corrected in flight (DELIV-006): the PDF and title stay fixed, recipients who have
 * acted and their fields are locked, and only what the correction changes is sent. With `asTemplate` it saves a template
 * (TMPL-001): roles in place of people, and no copy recipients. */
export function PrepareEnvelope({ draft, correcting, asTemplate, onSaved, onCancel }: { draft?: Envelope; correcting?: Envelope; asTemplate?: boolean; onSaved: (id: string) => Promise<void>; onCancel: () => void }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [title, setTitle] = useState('')
  const [expiryDays, setExpiryDays] = useState(120)
  const [expiryChanged, setExpiryChanged] = useState(false)
  const [allowPaper, setAllowPaper] = useState(false)
  // ROUTE-006: recipients may reassign their signing to someone else only when the sender allows it.
  const [allowReassign, setAllowReassign] = useState(false)
  // DELIV-003: optional reminders in business days, first after the invitation, then repeating.
  const [remind, setRemind] = useState(false)
  const [afterDays, setAfterDays] = useState(2)
  const [everyDays, setEveryDays] = useState(2)
  const [file, setFile] = useState<File>()
  const [pdf, setPdf] = useState<Uint8Array>()
  const [signers, setSigners] = useState<Recipient[]>([{ name: '', email: '', accessCode: '', order: 1 }, { name: '', email: '', accessCode: '', order: 2 }])
  const [copies, setCopies] = useState<Copy[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [signer, setSigner] = useState(0)
  const [type, setType] = useState<Field['type']>('signature')
  const [label, setLabel] = useState('Signature')
  const [width, setWidth] = useState(.26)
  const [height, setHeight] = useState(.055)
  const action = useAction()
  const source = draft ?? correcting
  const locked = (index: number) => Boolean(signers[index]?.locked || signers[index]?.removed)
  useEffect(() => {
    if (!source) return
    const draft = source
    void action.run(async () => {
      const response = await fetch(`/api/inkwell/envelopes/${encodeURIComponent(draft.id)}/artifacts/original`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error('Could not load the draft’s PDF.')
      const bytes = new Uint8Array(await response.arrayBuffer())
      setFile(new File([bytes], draft.filename ?? 'document.pdf', { type: 'application/pdf' })); setPdf(bytes); setTitle(draft.title)
      setSigners(draft.signers.map((signer, index) => ({ name: signer.name, email: signer.email, accessCode: '', order: signer.order ?? index + 1, keep: Boolean(signer.accessCode), message: signer.message ?? '', ...(correcting ? { existing: true, ...(signer.removedAt ? { removed: true } : {}), ...(signer.signedAt ? { locked: 'Signed' } : signer.paper?.status === 'pending' ? { locked: 'Signed on paper' } : {}) } : {}) })))
      if (correcting) setSigner(Math.max(0, draft.signers.findIndex(signer => !signer.signedAt && !signer.removedAt && signer.paper?.status !== 'pending')))
      setFields(draft.fields); setCopies(draft.copies ?? []); setAllowPaper(Boolean(draft.allowPaper)); setAllowReassign(Boolean(draft.allowReassign)); setSubject(draft.subject ?? ''); setMessage(draft.message ?? '')
      setExpiryDays(Math.min(365, Math.max(1, Math.round((Date.parse(draft.expiresAt) - Date.now()) / 86_400_000))))
      if (draft.reminders) { setRemind(true); setAfterDays(draft.reminders.afterDays); setEveryDays(draft.reminders.everyDays) }
    })
  }, [source?.id])
  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => {
      if (!file || !pdf) throw new Error('Choose a PDF before saving.')
      if (signers.some((recipient, index) => !recipient.removed && !fields.some(field => field.signer === index && field.type === 'signature'))) throw new Error('Place at least one signature field for every recipient.')
      if (correcting) {
        const correction = { id: correcting.id, signers: signers.map(({ name, email, order, accessCode, message: note, removed }) => removed ? { remove: true } : { name, email, order, message: note ?? '', ...(accessCode ? { accessCode } : {}) }), fields, copies, subject, message, ...(expiryChanged ? { expiresAt: new Date(Date.now() + expiryDays * 86_400_000).toISOString() } : {}) }
        await command('envelope.correct', correction)
        return onSaved(correcting.id)
      }
      if (asTemplate) {
        const template = await command<{ id: string }>('template.save', { title, filename: file.name, pdfBase64: await fileBase64(file), roles: signers.map(({ name, order, needsCode, message: note }) => ({ role: name, order, ...(needsCode ? { accessCode: true } : {}), ...(note?.trim() ? { message: note } : {}) })), fields, ...(subject.trim() ? { subject } : {}), ...(message.trim() ? { message } : {}), expiryDays, ...(allowPaper ? { allowPaperSigning: true } : {}), ...(allowReassign ? { allowReassignment: true } : {}), ...(remind ? { reminders: { afterDays, everyDays } } : {}) })
        return onSaved(template.id)
      }
      const input = { title, filename: file.name, pdfBase64: await fileBase64(file), signers: signers.map(({ accessCode, keep, message: note, ...recipient }) => ({ ...recipient, ...(accessCode ? { accessCode } : keep ? { keepAccessCode: true } : {}), ...(note?.trim() ? { message: note } : {}) })), fields, ...(subject.trim() ? { subject } : {}), ...(message.trim() ? { message } : {}), expiresAt: new Date(Date.now() + expiryDays * 86_400_000).toISOString(), ...(copies.length ? { copies } : {}), ...(allowPaper ? { allowPaperSigning: true } : {}), ...(allowReassign ? { allowReassignment: true } : {}), ...(remind ? { reminders: { afterDays, everyDays } } : {}) }
      const result = draft ? await command<{ id: string }>('envelope.update', { id: draft.id, ...input }) : await command<{ id: string }>('envelope.prepare', input)
      await onSaved(result.id)
    })
  }
  // ROUTE-008: a picked contact fills the first empty recipient (or a new one), or joins the copy recipients.
  function pick(contact: Contact, as: 'signer' | 'copy') {
    const person = { name: contact.name, email: contact.email }
    if (as === 'copy') { action.setError(copies.length >= 20 ? 'An envelope has at most 20 copy recipients.' : ''); if (copies.length < 20) setCopies(current => [...current, person]); return }
    const empty = signers.findIndex(recipient => !recipient.name.trim() && !recipient.email.trim())
    if (empty >= 0) { setSigners(current => current.map((recipient, i) => i === empty ? { ...recipient, ...person } : recipient)); return }
    action.setError(signers.length >= 5 ? 'An envelope has at most five signers.' : '')
    if (signers.length < 5) setSigners(current => [...current, { ...person, accessCode: '', order: Math.max(...current.map(recipient => recipient.order)) + 1 }])
  }
  function updateSigner(index: number, key: keyof Recipient, value: string | number) { setSigners(current => current.map((recipient, i) => i === index ? { ...recipient, [key]: value } : recipient)) }
  return <section className="iw-panel iw-prepare"><div className="iw-section-head"><div><h1>{asTemplate ? 'New template' : correcting ? 'Correct envelope' : draft ? 'Edit draft' : 'Prepare an envelope'}</h1><p>{asTemplate ? 'Upload the PDF, name each role in routing order, then place fields. Sending from it asks only for each role’s person.' : correcting ? 'Signatures already given stay. A corrected or removed recipient’s old link stops working; whoever’s turn it is gets a new invitation.' : 'Upload the final PDF, set the routing order, then place fields.'}</p></div><button type="button" onClick={onCancel} disabled={action.busy}>Cancel</button></div>
    <form onSubmit={submit} className="iw-stack">
      <div className="iw-two"><label>{asTemplate ? 'Template name' : 'Envelope title'}<input required maxLength={200} disabled={Boolean(correcting)} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Fixed PDF document<input type="file" required={!file} hidden={Boolean(correcting)} accept="application/pdf,.pdf" disabled={action.busy} onChange={event => { const selected = event.target.files?.[0]; setFile(undefined); setPdf(undefined); setFields([]); if (selected) void action.run(async () => { const bytes = new Uint8Array(await selected.arrayBuffer()); setFile(selected); setPdf(bytes); if (!title) setTitle(selected.name.replace(/\.pdf$/i, '')) }) }} /></label></div>
      <fieldset disabled={action.busy}><legend>{asTemplate ? 'Roles' : 'Recipients'} <span>· in routing order; the same number signs at the same time</span></legend><div className="iw-stack">{!asTemplate && <ContactPicker onPick={pick} />}{signers.map((recipient, index) => recipient.removed ? null : <div key={index} className="iw-recipient"><input className="iw-order" disabled={Boolean(recipient.locked)} aria-label={`Recipient ${index + 1} routing order`} type="number" required min={1} max={100} step={1} value={recipient.order} onChange={event => updateSigner(index, 'order', Math.round(Number(event.target.value)))} /><label><span className="iw-sr">Name</span><input aria-label={`${asTemplate ? 'Role' : 'Recipient'} ${index + 1} name`} disabled={Boolean(recipient.locked)} placeholder={asTemplate ? 'Role, for example Client' : 'Full name'} required value={recipient.name} maxLength={160} onChange={event => updateSigner(index, 'name', event.target.value)} /></label>{asTemplate ? <label className="iw-check"><input type="checkbox" aria-label={`Role ${index + 1} needs an access code`} checked={Boolean(recipient.needsCode)} onChange={event => setSigners(current => current.map((r, i) => i === index ? { ...r, needsCode: event.target.checked } : r))} />Access code at each send</label> : <><label><span className="iw-sr">Email</span><input aria-label={`Recipient ${index + 1} email`} disabled={Boolean(recipient.locked)} placeholder="Email" type="email" required value={recipient.email} onChange={event => updateSigner(index, 'email', event.target.value)} /></label><label><span className="iw-sr">Access code</span><input aria-label={`Recipient ${index + 1} access code`} disabled={Boolean(recipient.locked)} placeholder={recipient.keep ? 'Keep current code' : 'Access code'} autoComplete="off" pattern="\S{4,32}" title="4–32 characters, no spaces" maxLength={32} value={recipient.accessCode} onChange={event => updateSigner(index, 'accessCode', event.target.value)} /></label></>}{recipient.locked && <span className="iw-muted">{recipient.locked} · cannot change</span>}{signers.filter(r => !r.removed).length > 1 && !recipient.locked && <button className="iw-text-button" type="button" aria-label={`Remove recipient ${index + 1}`} onClick={() => { if (recipient.existing) { setSigners(current => current.map((r, i) => i === index ? { ...r, removed: true } : r)); setFields(current => current.filter(field => field.signer !== index)); return } setSigners(current => current.filter((_, i) => i !== index)); setFields(current => current.filter(field => field.signer !== index).map(field => ({ ...field, signer: field.signer > index ? field.signer - 1 : field.signer }))); setSigner(0) }}>Remove</button>}</div>)}{signers.filter(r => !r.removed).length < 5 && signers.length < 10 && <button className="iw-fit" type="button" onClick={() => setSigners(current => [...current, { name: '', email: '', accessCode: '', order: Math.max(...current.map(recipient => recipient.order)) + 1 }])}>{asTemplate ? 'Add role' : 'Add recipient'}</button>}</div></fieldset>
      {!asTemplate && <fieldset disabled={action.busy}><legend>Receive a copy <span>· the executed PDF and certificate when everyone has signed</span></legend><div className="iw-stack">{copies.map((copy, index) => <div key={index} className="iw-recipient"><span className="iw-order" aria-hidden="true"><Icon name="envelope" /></span><label><span className="iw-sr">Name</span><input aria-label={`Copy recipient ${index + 1} name`} placeholder="Full name" required value={copy.name} maxLength={100} onChange={event => setCopies(current => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label><label><span className="iw-sr">Email</span><input aria-label={`Copy recipient ${index + 1} email`} placeholder="Email" type="email" required value={copy.email} onChange={event => setCopies(current => current.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} /></label><button className="iw-text-button" type="button" aria-label={`Remove copy recipient ${index + 1}`} onClick={() => setCopies(current => current.filter((_, i) => i !== index))}>Remove</button></div>)}{copies.length < 20 && <button className="iw-fit" type="button" onClick={() => setCopies(current => [...current, { name: '', email: '' }])}>Add copy recipient</button>}</div></fieldset>}
      <fieldset disabled={action.busy}><legend>Message <span>· in each invitation; a private message goes only to its recipient</span></legend><div className="iw-stack"><label>Email subject<input maxLength={200} placeholder={`Please sign: ${title || 'your document'}`} value={subject} onChange={event => setSubject(event.target.value)} /></label><label>Message to everyone<textarea maxLength={2000} rows={3} value={message} onChange={event => setMessage(event.target.value)} /></label>{signers.map((recipient, index) => recipient.removed ? null : <label key={index}>Private message for {recipient.name || `recipient ${index + 1}`}<textarea maxLength={1000} rows={2} disabled={Boolean(recipient.locked)} value={recipient.message ?? ''} onChange={event => updateSigner(index, 'message', event.target.value)} /></label>)}</div></fieldset>
      <label className="iw-fit">Expires after (days)<input type="number" required min={1} max={365} step={1} disabled={action.busy} value={expiryDays} onChange={event => { setExpiryChanged(true); setExpiryDays(Math.round(Number(event.target.value))) }} /><small className="iw-muted">Recipients and you are warned three days before. You can extend it later.</small></label>
      {!correcting && <><label className="iw-check"><input type="checkbox" disabled={action.busy} checked={allowPaper} onChange={event => setAllowPaper(event.target.checked)} />Allow recipients to sign on paper and upload a scan for you to review</label>
      <label className="iw-check"><input type="checkbox" disabled={action.busy} checked={allowReassign} onChange={event => setAllowReassign(event.target.checked)} />Allow recipients to reassign their signing to someone else, with a reason</label>
      <label className="iw-check"><input type="checkbox" disabled={action.busy} checked={remind} onChange={event => setRemind(event.target.checked)} />Remind the recipients whose turn it is by email</label>
      {remind && <div className="iw-two"><label>First reminder after (business days)<input type="number" required min={1} max={30} step={1} disabled={action.busy} value={afterDays} onChange={event => setAfterDays(Math.round(Number(event.target.value)))} /></label><label>Then every (business days)<input type="number" required min={1} max={30} step={1} disabled={action.busy} value={everyDays} onChange={event => setEveryDays(Math.round(Number(event.target.value)))} /></label><small className="iw-muted">Business days are Monday to Friday, Eastern time; reminders go out from 9 am and stop once they sign.</small></div>}</>}
      {pdf && <div className="iw-editor"><aside className="iw-field-tools iw-stack"><h3>Place fields</h3><label>{asTemplate ? 'Role' : 'Recipient'}<select value={signer} onChange={event => setSigner(Number(event.target.value))}>{signers.map((recipient, index) => locked(index) ? null : <option key={index} value={index}>{index + 1}. {recipient.name || (asTemplate ? 'Role' : 'Recipient')}</option>)}</select></label><label>Field type<select value={type} onChange={event => { const value = event.target.value as Field['type']; setType(value); setLabel(value === 'signature' ? 'Signature' : value === 'date' ? 'Date' : 'Text') }}><option value="signature">Signature</option><option value="text">Text</option><option value="date">Date</option></select></label><label>Field label<input value={label} maxLength={80} onChange={event => setLabel(event.target.value)} /></label><div className="iw-two"><label>Width (%)<input type="number" min={10} max={80} value={Math.round(width * 100)} onChange={event => setWidth(Math.min(.8, Math.max(.1, Number(event.target.value) / 100)))} /></label><label>Height (%)<input type="number" min={3} max={20} value={Math.round(height * 100)} onChange={event => setHeight(Math.min(.2, Math.max(.03, Number(event.target.value) / 100)))} /></label></div><p className="iw-muted">Click a page to place the selected field. Keyboard: focus a page and press Enter to place at its center.</p><div className="iw-placed">{fields.map((field, index) => <div key={field.id}><span>{field.signer + 1}. {field.label} · p{field.page + 1}</span><button type="button" aria-label={`Remove field ${index + 1}`} disabled={locked(field.signer)} onClick={() => setFields(current => current.filter(item => item.id !== field.id))}>×</button></div>)}</div></aside><PdfViewer source={pdf} fields={fields} onPlace={(page, x, y) => { if (!action.busy && !locked(signer)) setFields(current => [...current, { id: crypto.randomUUID(), signer, type, label: label.trim() || type, page, x: Math.max(0, Math.min(1 - width, x)), y: Math.max(0, Math.min(1 - height, y)), width, height }]) }} /></div>}
      <ErrorNotice error={action.error} /><div className="iw-actions iw-submit"><button className="iw-primary" disabled={action.busy || !file} type="submit">{action.busy ? 'Saving…' : asTemplate ? 'Save template' : correcting ? 'Save correction' : draft ? 'Save draft' : 'Save prepared envelope'}</button><p className="iw-muted">{asTemplate ? 'Each envelope sent from it is approved like any other before its first invitation.' : correcting ? 'Every change is recorded in the audit trail with its before and after values.' : 'A human must approve eligibility before the first invitation is sent.'}</p></div>
    </form>
  </section>
}
