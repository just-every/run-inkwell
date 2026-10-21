import { useState } from 'react'
import type { Supplement } from '../inkwell/model'
import { PdfViewer } from './pdf-viewer'
import { command, dateTime, request, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'

export type SupplementView = Supplement & { viewedAt?: string; acknowledgedAt?: string }
/** Small extension of the existing document and field panels; all styling comes from the seed's approved controls. */
export function SignerSupplements({ documents, base, refresh, canAct }: { documents: SupplementView[]; base: string; refresh: () => Promise<void>; canAct: boolean }) {
  const [opened, setOpened] = useState<string>(), action = useAction()
  const show = async (s: Supplement) => {
    // Fetch and verify server custody before reporting that it opened. The viewer receives these same bytes.
    const response = await fetch(`${base}/supplements/${s.id}/document`, { credentials: 'same-origin' })
    if (!response.ok) { const error = await response.json() as { error?: string }; throw new Error(error.error ?? 'Could not open the supplemental document.') }
    const url = URL.createObjectURL(await response.blob())
    setOpened(current => { if (current) URL.revokeObjectURL(current.split('|')[1]); return `${s.id}|${url}` })
    await refresh()
  }
  if (!documents.length) return null
  return <section className="iw-callout iw-stack" aria-label="Supplemental documents"><h2>Supplemental documents</h2><p>Reference documents from the sender. These documents are not signed.</p>
    {documents.map(s => <div className="iw-stack" key={s.id}><h3>{s.label}</h3><p>{s.pages} page(s) · {s.requirement === 'acknowledge' ? 'Acknowledgment required before signing' : 'Open before signing'}</p><button type="button" className="iw-fit" disabled={action.busy} onClick={() => void action.run(() => show(s))}>Open {s.label}</button>
      {s.viewedAt && <p role="status">Opened {dateTime(s.viewedAt)}</p>}
      {s.acknowledgedAt ? <p role="status">Acknowledged {dateTime(s.acknowledgedAt)}</p> : s.requirement === 'acknowledge' && canAct && <button type="button" className="iw-fit" disabled={action.busy || !s.viewedAt} onClick={() => void action.run(async () => { await request(`${base}/supplements/${s.id}/acknowledge`, { acknowledge: true }); await refresh() })}>I acknowledge {s.label}</button>}
      {opened?.startsWith(`${s.id}|`) && <div role="group" aria-label={`${s.label} document`}><PdfViewer source={opened.split('|')[1]} /></div>}
    </div>)}<ErrorNotice error={action.error} /></section>
}

export function EnvelopeSupplements({ envelope, editable, refresh }: { envelope: Envelope; editable: boolean; refresh: () => Promise<void> }) {
  const action = useAction(), [label, setLabel] = useState(''), [requirement, setRequirement] = useState('acknowledge'), [file, setFile] = useState<File>(), [inputKey, setInputKey] = useState(0)
  const base = `/api/inkwell/envelopes/${envelope.id}/artifacts`
  return <section className="iw-stack" aria-label="Supplemental documents"><h3>Supplemental documents</h3>
    {(envelope.supplements ?? []).map(s => <div className="iw-stack" key={s.id}><a href={`${base}/supplement-${s.id}`} download>{s.label}</a><p>{s.pages} page(s) · {s.requirement === 'acknowledge' ? 'Acknowledgment required' : 'View required'} · Not signed</p>{editable && <button className="iw-fit" disabled={action.busy} onClick={() => void action.run(async () => { await command('envelope.remove_supplement', { id: envelope.id, supplementId: s.id }); await refresh() })}>Remove {s.label}</button>}</div>)}
    {editable && <form className="iw-stack iw-callout" onSubmit={e => { e.preventDefault(); void action.run(async () => {
      if (!file) throw new Error('Choose a supplemental PDF.')
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      await command('envelope.supplement', { id: envelope.id, label, filename: file.name, pdfBase64: btoa(binary), requirement })
      setFile(undefined); setLabel(''); setInputKey(v => v + 1); await refresh()
    }) }}><p>Add reference PDFs before requesting approval. Each is limited to 2 MiB and remains fixed after approval.</p><label>Supplement label<input required value={label} maxLength={100} onChange={e => setLabel(e.target.value)} /></label><label>Supplemental PDF<input key={inputKey} required type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0])} /></label><label>Recipient requirement<select value={requirement} onChange={e => setRequirement(e.target.value)}><option value="acknowledge">Acknowledge before signing</option><option value="view">Open before signing</option></select></label><button className="iw-fit" disabled={action.busy}>Add supplemental document</button></form>}
    <ErrorNotice error={action.error} /></section>
}
