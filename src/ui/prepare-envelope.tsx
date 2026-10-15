import { useState, type FormEvent } from 'react'
import { command, fileBase64, type Field, type Signer } from './types'
import { ErrorNotice, useAction } from './feedback'
import { PdfViewer } from './pdf-viewer'

export function PrepareEnvelope({ onSaved, onCancel }: { onSaved: (id: string) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File>()
  const [pdf, setPdf] = useState<Uint8Array>()
  const [signers, setSigners] = useState<Signer[]>([{ name: '', email: '' }, { name: '', email: '' }])
  const [fields, setFields] = useState<Field[]>([])
  const [signer, setSigner] = useState(0)
  const [type, setType] = useState<Field['type']>('signature')
  const [label, setLabel] = useState('Signature')
  const [width, setWidth] = useState(.26)
  const [height, setHeight] = useState(.055)
  const action = useAction()
  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => {
      if (!file || !pdf) throw new Error('Choose a PDF before saving.')
      if (signers.some((_, index) => !fields.some(field => field.signer === index && field.type === 'signature'))) throw new Error('Place at least one signature field for every recipient.')
      const result = await command<{ id: string }>('envelope.prepare', { title, filename: file.name, pdfBase64: await fileBase64(file), signers, fields })
      await onSaved(result.id)
    })
  }
  function updateSigner(index: number, key: 'name' | 'email', value: string) { setSigners(current => current.map((recipient, i) => i === index ? { ...recipient, [key]: value } : recipient)) }
  return <section className="iw-panel iw-prepare"><div className="iw-section-head"><div><h1>Prepare an envelope</h1><p>Upload the final PDF, set the signing order, then place fields.</p></div><button type="button" onClick={onCancel} disabled={action.busy}>Cancel</button></div>
    <form onSubmit={submit} className="iw-stack">
      <div className="iw-two"><label>Envelope title<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Fixed PDF document<input type="file" required accept="application/pdf,.pdf" disabled={action.busy} onChange={event => { const selected = event.target.files?.[0]; setFile(undefined); setPdf(undefined); setFields([]); if (selected) void action.run(async () => { const bytes = new Uint8Array(await selected.arrayBuffer()); setFile(selected); setPdf(bytes); if (!title) setTitle(selected.name.replace(/\.pdf$/i, '')) }) }} /></label></div>
      <fieldset disabled={action.busy}><legend>Recipients <span>· sign in this order</span></legend><div className="iw-stack">{signers.map((recipient, index) => <div key={index} className="iw-recipient"><strong className="iw-order">{index + 1}</strong><label><span className="iw-sr">Name</span><input aria-label={`Recipient ${index + 1} name`} required value={recipient.name} maxLength={160} onChange={event => updateSigner(index, 'name', event.target.value)} /></label><label><span className="iw-sr">Email</span><input aria-label={`Recipient ${index + 1} email`} type="email" required value={recipient.email} onChange={event => updateSigner(index, 'email', event.target.value)} /></label>{signers.length > 1 && <button className="iw-text-button" type="button" aria-label={`Remove recipient ${index + 1}`} onClick={() => { setSigners(current => current.filter((_, i) => i !== index)); setFields(current => current.filter(field => field.signer !== index).map(field => ({ ...field, signer: field.signer > index ? field.signer - 1 : field.signer }))); setSigner(0) }}>Remove</button>}</div>)}{signers.length < 5 && <button className="iw-fit" type="button" onClick={() => setSigners(current => [...current, { name: '', email: '' }])}>Add recipient</button>}</div></fieldset>
      {pdf && <div className="iw-editor"><aside className="iw-field-tools iw-stack"><h3>Place fields</h3><label>Recipient<select value={signer} onChange={event => setSigner(Number(event.target.value))}>{signers.map((recipient, index) => <option key={index} value={index}>{index + 1}. {recipient.name || 'Recipient'}</option>)}</select></label><label>Field type<select value={type} onChange={event => { const value = event.target.value as Field['type']; setType(value); setLabel(value === 'signature' ? 'Signature' : value === 'date' ? 'Date' : 'Text') }}><option value="signature">Signature</option><option value="text">Text</option><option value="date">Date</option></select></label><label>Field label<input value={label} maxLength={80} onChange={event => setLabel(event.target.value)} /></label><div className="iw-two"><label>Width (%)<input type="number" min={10} max={80} value={Math.round(width * 100)} onChange={event => setWidth(Math.min(.8, Math.max(.1, Number(event.target.value) / 100)))} /></label><label>Height (%)<input type="number" min={3} max={20} value={Math.round(height * 100)} onChange={event => setHeight(Math.min(.2, Math.max(.03, Number(event.target.value) / 100)))} /></label></div><p className="iw-muted">Click a page to place the selected field. Keyboard: focus a page and press Enter to place at its center.</p><div className="iw-placed">{fields.map((field, index) => <div key={field.id}><span>{field.signer + 1}. {field.label} · p{field.page + 1}</span><button type="button" aria-label={`Remove field ${index + 1}`} onClick={() => setFields(current => current.filter(item => item.id !== field.id))}>×</button></div>)}</div></aside><PdfViewer source={pdf} fields={fields} onPlace={(page, x, y) => { if (!action.busy) setFields(current => [...current, { id: crypto.randomUUID(), signer, type, label: label.trim() || type, page, x: Math.max(0, Math.min(1 - width, x)), y: Math.max(0, Math.min(1 - height, y)), width, height }]) }} /></div>}
      <ErrorNotice error={action.error} /><div className="iw-actions iw-submit"><button className="iw-primary" disabled={action.busy || !file} type="submit">{action.busy ? 'Saving…' : 'Save prepared envelope'}</button><p className="iw-muted">A human must approve eligibility before the first invitation is sent.</p></div>
    </form>
  </section>
}
