import { useState } from 'react'
import { command, request, dateTime, canApprove, canEdit, type Actor, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'
import { PdfViewer } from './pdf-viewer'
import { ArtifactIntegrity } from './artifact-integrity'
import { Check } from './marks'

export function EnvelopeDetail({ envelope, actor, refresh, onClose }: { envelope: Envelope; actor: Actor; refresh: () => Promise<void>; onClose: () => void }) {
  const action = useAction()
  const [eligible, setEligible] = useState(false)
  const [reason, setReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [showPdf, setShowPdf] = useState(false)
  const base = `/api/inkwell/envelopes/${encodeURIComponent(envelope.id)}`
  const finished = ['completed', 'voided', 'expired', 'imported'].includes(envelope.status)
  return <section className="iw-panel iw-stack iw-detail"><div className="iw-section-head"><div><span className={`iw-status iw-status-${envelope.status}`}>{envelope.status.replaceAll('_', ' ')}</span><h1>{envelope.title}</h1><p>Prepared {dateTime(envelope.createdAt)}</p></div><button onClick={onClose}>Close</button></div>
    <ol className="iw-signers">{envelope.signers.map((signer, index) => <li key={index}><span className="iw-order" aria-hidden="true">{index + 1}</span><strong>{signer.name}</strong><span>{signer.email}</span><small>{signer.signedAt ? <><Check />Signed {dateTime(signer.signedAt)}</> : 'Awaiting signature'}</small></li>)}</ol>
    <div className="iw-actions iw-artifacts"><button onClick={() => setShowPdf(value => !value)}>{showPdf ? 'Hide document' : 'View document and fields'}</button><a className="iw-button" href={`${base}/artifacts/original`} download>Original PDF</a>{envelope.status === 'completed' && <><a className="iw-button" href={`${base}/artifacts/signed`} download>Executed PDF</a><a className="iw-button" href={`${base}/artifacts/certificate`} download>Certificate</a><a className="iw-button" href={`${base}/artifacts/handoff`} download>Handoff manifest</a></>}<a className="iw-button" href={`${base}/artifacts/audit`} download>Audit JSON</a></div>
    {showPdf && <PdfViewer source={`${base}/artifacts/${envelope.status === 'completed' ? 'signed' : 'original'}`} fields={envelope.status === 'completed' ? [] : envelope.fields} />}
    {envelope.status === 'prepared' && canApprove(actor) && <div className="iw-callout iw-stack"><h3>Human approval</h3><p>Review the document and recipients before sending invitations. Signatures are collected sequentially.</p><label className="iw-check"><input type="checkbox" checked={eligible} onChange={event => setEligible(event.target.checked)} />I reviewed this envelope, confirm it is eligible for electronic signature, and authorize the first invitation.</label><button className="iw-primary iw-fit" disabled={!eligible || action.busy} onClick={() => void action.run(async () => { await command('envelope.approve', { id: envelope.id, eligible: true }); await refresh() })}>{action.busy ? 'Sending…' : 'Approve and invite first recipient'}</button></div>}
    <ArtifactIntegrity envelope={envelope} base={base} />
    <details className="iw-audit-trail"><summary>Audit trail ({envelope.events.length})</summary><ol className="iw-audit">{envelope.events.map((event, index) => <li key={index}><strong>{event.action.replaceAll('_', ' ')}</strong> <time>{dateTime(event.at)}</time>{event.actor && <span>{event.actor}</span>}{typeof event.detail?.reason === 'string' && <p>{event.detail.reason}</p>}</li>)}</ol></details>
    {canEdit(actor) && !finished && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setVoiding(value => !value)}>Void envelope…</button>{voiding && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.void', { id: envelope.id, reason }); setVoiding(false); await refresh() }) }}><label>Reason for voiding<textarea required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><p>Recipients will no longer be able to sign this envelope.</p><button className="iw-danger iw-fit" disabled={action.busy}>Confirm void</button></form>}</div>}
    {actor.role === 'owner' && ['prepared', 'completed', 'voided'].includes(envelope.status) && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setErasing(value => !value)}>Erase archived envelope…</button>{erasing && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await request('/api/inkwell/erase', { id: envelope.id, confirmation }); await refresh(); onClose() }) }}><p>Download the full archive from the Archive tab first if you need to preserve these records. Erasure permanently removes the document and personal data. A tombstone remains to record the erasure.</p><label>Type ERASE to confirm<input required pattern="ERASE" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button className="iw-danger iw-fit" disabled={action.busy || confirmation !== 'ERASE'}>Permanently erase</button></form>}</div>}
    <ErrorNotice error={action.error} />
  </section>
}
