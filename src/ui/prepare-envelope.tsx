import { useEffect, useState, type FormEvent } from 'react'
import { command, fileBase64, type Envelope, type Field } from './types'

// IDV-003: an optional access code per recipient, shared out of band and entered before the document opens.
// ROUTE-002: each recipient's routing order; recipients who share a number sign at the same time.
// PREP-009: a private message per recipient; `keep` holds an access code already set on a saved draft.
type Recipient = { name: string; email: string; accessCode: string; order: number; keep?: boolean; message?: string }
// DELIV-007 / ROUTE-001: people who only receive the completed copy, with no action link.
type Copy = { name: string; email: string }
import { ErrorNotice, useAction } from './feedback'
import { PdfViewer } from './pdf-viewer'
import { Icon } from './icons'

/** A new envelope, or with `draft` a saved draft reopened with everything editable until it is approved (PREP-009). */
export function PrepareEnvelope({ draft, onSaved, onCancel }: { draft?: Envelope; onSaved: (id: string) => Promise<void>; onCancel: () => void }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [title, setTitle] = useState('')
  const [expiryDays, setExpiryDays] = useState(120)
  const [allowPaper, setAllowPaper] = useState(false)
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
  useEffect(() => {
    if (!draft) return
    void action.run(async () => {
      const response = await fetch(`/api/inkwell/envelopes/${encodeURIComponent(draft.id)}/artifacts/original`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error('Could not load the draft’s PDF.')
      const bytes = new Uint8Array(await response.arrayBuffer())
      setFile(new File([bytes], draft.filename ?? 'document.pdf', { type: 'application/pdf' })); setPdf(bytes); setTitle(draft.title)
      setSigners(draft.signers.map((signer, index) => ({ name: signer.name, email: signer.email, accessCode: '', order: signer.order ?? index + 1, keep: Boolean(signer.accessCode), message: signer.message ?? '' })))
      setFields(draft.fields); setCopies(draft.copies ?? []); setAllowPaper(Boolean(draft.allowPaper)); setSubject(draft.subject ?? ''); setMessage(draft.message ?? '')
      setExpiryDays(Math.min(365, Math.max(1, Math.round((Date.parse(draft.expiresAt) - Date.now()) / 86_400_000))))
      if (draft.reminders) { setRemind(true); setAfterDays(draft.reminders.afterDays); setEveryDays(draft.reminders.everyDays) }
    })
  }, [draft?.id])
  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => {
      if (!file || !pdf) throw new Error('Choose a PDF before saving.')
      if (signers.some((_, index) => !fields.some(field => field.signer === index && field.type === 'signature'))) throw new Error('Place at least one signature field for every recipient.')
      const input = { title, filename: file.name, pdfBase64: await fileBase64(file), signers: signers.map(({ accessCode, keep, message: note, ...recipient }) => ({ ...recipient, ...(accessCode ? { accessCode } : keep ? { keepAccessCode: true } : {}), ...(note?.trim() ? { message: note } : {}) })), fields, ...(subject.trim() ? { subject } : {}), ...(message.trim() ? { message } : {}), expiresAt: new Date(Date.now() + expiryDays * 86_400_000).toISOString(), ...(copies.length ? { copies } : {}), ...(allowPaper ? { allowPaperSigning: true } : {}), ...(remind ? { reminders: { afterDays, everyDays } } : {}) }
      const result = draft ? await command<{ id: string }>('envelope.update', { id: draft.id, ...input }) : await command<{ id: string }>('envelope.prepare', input)
      await onSaved(result.id)
    })
  }
  function updateSigner(index: number, key: keyof Recipient, value: string | number) { setSigners(current => current.map((recipient, i) => i === index ? { ...recipient, [key]: value } : recipient)) }
  return <section className="iw-panel iw-prepare"><div className="iw-section-head"><div><h1>{draft ? 'Edit draft' : 'Prepare an envelope'}</h1><p>Upload the final PDF, set the routing order, then place fields.</p></div><button type="button" onClick={onCancel} disabled={action.busy}>Cancel</button></div>
    <form onSubmit={submit} className="iw-stack">
      <div className="iw-two"><label>Envelope title<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Fixed PDF document<input type="file" required={!file} accept="application/pdf,.pdf" disabled={action.busy} onChange={event => { const selected = event.target.files?.[0]; setFile(undefined); setPdf(undefined); setFields([]); if (selected) void action.run(async () => { const bytes = new Uint8Array(await selected.arrayBuffer()); setFile(selected); setPdf(bytes); if (!title) setTitle(selected.name.replace(/\.pdf$/i, '')) }) }} /></label></div>
      <fieldset disabled={action.busy}><legend>Recipients <span>· in routing order; the same number signs at the same time</span></legend><div className="iw-stack">{signers.map((recipient, index) => <div key={index} className="iw-recipient"><input className="iw-order" aria-label={`Recipient ${index + 1} routing order`} type="number" required min={1} max={100} step={1} value={recipient.order} onChange={event => updateSigner(index, 'order', Math.round(Number(event.target.value)))} /><label><span className="iw-sr">Name</span><input aria-label={`Recipient ${index + 1} name`} placeholder="Full name" required value={recipient.name} maxLength={160} onChange={event => updateSigner(index, 'name', event.target.value)} /></label><label><span className="iw-sr">Email</span><input aria-label={`Recipient ${index + 1} email`} placeholder="Email" type="email" required value={recipient.email} onChange={event => updateSigner(index, 'email', event.target.value)} /></label><label><span className="iw-sr">Access code</span><input aria-label={`Recipient ${index + 1} access code`} placeholder={recipient.keep ? 'Keep current code' : 'Access code'} autoComplete="off" pattern="\S{4,32}" title="4–32 characters, no spaces" maxLength={32} value={recipient.accessCode} onChange={event => updateSigner(index, 'accessCode', event.target.value)} /></label>{signers.length > 1 && <button className="iw-text-button" type="button" aria-label={`Remove recipient ${index + 1}`} onClick={() => { setSigners(current => current.filter((_, i) => i !== index)); setFields(current => current.filter(field => field.signer !== index).map(field => ({ ...field, signer: field.signer > index ? field.signer - 1 : field.signer }))); setSigner(0) }}>Remove</button>}</div>)}{signers.length < 5 && <button className="iw-fit" type="button" onClick={() => setSigners(current => [...current, { name: '', email: '', accessCode: '', order: Math.max(...current.map(recipient => recipient.order)) + 1 }])}>Add recipient</button>}</div></fieldset>
      <fieldset disabled={action.busy}><legend>Receive a copy <span>· the executed PDF and certificate when everyone has signed</span></legend><div className="iw-stack">{copies.map((copy, index) => <div key={index} className="iw-recipient"><span className="iw-order" aria-hidden="true"><Icon name="envelope" /></span><label><span className="iw-sr">Name</span><input aria-label={`Copy recipient ${index + 1} name`} placeholder="Full name" required value={copy.name} maxLength={100} onChange={event => setCopies(current => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label><label><span className="iw-sr">Email</span><input aria-label={`Copy recipient ${index + 1} email`} placeholder="Email" type="email" required value={copy.email} onChange={event => setCopies(current => current.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} /></label><button className="iw-text-button" type="button" aria-label={`Remove copy recipient ${index + 1}`} onClick={() => setCopies(current => current.filter((_, i) => i !== index))}>Remove</button></div>)}{copies.length < 20 && <button className="iw-fit" type="button" onClick={() => setCopies(current => [...current, { name: '', email: '' }])}>Add copy recipient</button>}</div></fieldset>
      <fieldset disabled={action.busy}><legend>Message <span>· in each invitation; a private message goes only to its recipient</span></legend><div className="iw-stack"><label>Email subject<input maxLength={200} placeholder={`Please sign: ${title || 'your document'}`} value={subject} onChange={event => setSubject(event.target.value)} /></label><label>Message to everyone<textarea maxLength={2000} rows={3} value={message} onChange={event => setMessage(event.target.value)} /></label>{signers.map((recipient, index) => <label key={index}>Private message for {recipient.name || `recipient ${index + 1}`}<textarea maxLength={1000} rows={2} value={recipient.message ?? ''} onChange={event => updateSigner(index, 'message', event.target.value)} /></label>)}</div></fieldset>
      <label className="iw-fit">Expires after (days)<input type="number" required min={1} max={365} step={1} disabled={action.busy} value={expiryDays} onChange={event => setExpiryDays(Math.round(Number(event.target.value)))} /><small className="iw-muted">Recipients and you are warned three days before. You can extend it later.</small></label>
      <label className="iw-check"><input type="checkbox" disabled={action.busy} checked={allowPaper} onChange={event => setAllowPaper(event.target.checked)} />Allow recipients to sign on paper and upload a scan for you to review</label>
      <label className="iw-check"><input type="checkbox" disabled={action.busy} checked={remind} onChange={event => setRemind(event.target.checked)} />Remind the recipients whose turn it is by email</label>
      {remind && <div className="iw-two"><label>First reminder after (business days)<input type="number" required min={1} max={30} step={1} disabled={action.busy} value={afterDays} onChange={event => setAfterDays(Math.round(Number(event.target.value)))} /></label><label>Then every (business days)<input type="number" required min={1} max={30} step={1} disabled={action.busy} value={everyDays} onChange={event => setEveryDays(Math.round(Number(event.target.value)))} /></label><small className="iw-muted">Business days are Monday to Friday, Eastern time; reminders go out from 9 am and stop once they sign.</small></div>}
      {pdf && <div className="iw-editor"><aside className="iw-field-tools iw-stack"><h3>Place fields</h3><label>Recipient<select value={signer} onChange={event => setSigner(Number(event.target.value))}>{signers.map((recipient, index) => <option key={index} value={index}>{index + 1}. {recipient.name || 'Recipient'}</option>)}</select></label><label>Field type<select value={type} onChange={event => { const value = event.target.value as Field['type']; setType(value); setLabel(value === 'signature' ? 'Signature' : value === 'date' ? 'Date' : 'Text') }}><option value="signature">Signature</option><option value="text">Text</option><option value="date">Date</option></select></label><label>Field label<input value={label} maxLength={80} onChange={event => setLabel(event.target.value)} /></label><div className="iw-two"><label>Width (%)<input type="number" min={10} max={80} value={Math.round(width * 100)} onChange={event => setWidth(Math.min(.8, Math.max(.1, Number(event.target.value) / 100)))} /></label><label>Height (%)<input type="number" min={3} max={20} value={Math.round(height * 100)} onChange={event => setHeight(Math.min(.2, Math.max(.03, Number(event.target.value) / 100)))} /></label></div><p className="iw-muted">Click a page to place the selected field. Keyboard: focus a page and press Enter to place at its center.</p><div className="iw-placed">{fields.map((field, index) => <div key={field.id}><span>{field.signer + 1}. {field.label} · p{field.page + 1}</span><button type="button" aria-label={`Remove field ${index + 1}`} onClick={() => setFields(current => current.filter(item => item.id !== field.id))}>×</button></div>)}</div></aside><PdfViewer source={pdf} fields={fields} onPlace={(page, x, y) => { if (!action.busy) setFields(current => [...current, { id: crypto.randomUUID(), signer, type, label: label.trim() || type, page, x: Math.max(0, Math.min(1 - width, x)), y: Math.max(0, Math.min(1 - height, y)), width, height }]) }} /></div>}
      <ErrorNotice error={action.error} /><div className="iw-actions iw-submit"><button className="iw-primary" disabled={action.busy || !file} type="submit">{action.busy ? 'Saving…' : draft ? 'Save draft' : 'Save prepared envelope'}</button><p className="iw-muted">A human must approve eligibility before the first invitation is sent.</p></div>
    </form>
  </section>
}
