// One envelope in the right-hand panel: its pill, signing status in order, the approval decision when a person must
// make one, the files, the integrity check, the audit trail, and voiding or erasure.
import { useState } from 'react'
import { command, request, dateTime, canApprove, canEdit, type Actor, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'
import { PdfViewer } from './pdf-viewer'
import { ArtifactIntegrity } from './artifact-integrity'
import { Check, Pill } from './marks'
import { Icon } from './icons'
import { nextSigner, pill, preparedByAgent, titleParts } from './envelope-view'

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
  const state = pill(envelope, actor), { name, detail } = titleParts(envelope.title), turn = nextSigner(envelope)
  const me = (email: string) => email.toLowerCase() === actor.email.toLowerCase()
  return <section className="iw-detail" aria-label={envelope.title}>
    <div className="iw-detail-top"><Pill {...state} /><button className="iw-icon-button" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
    <h2>{name}</h2><p className="iw-detail-sub">{detail ? `${detail} · ` : ''}Prepared {dateTime(envelope.createdAt)}</p>

    <h3>Signing status</h3>
    <ol className="iw-signers">{envelope.signers.map((signer, index) => <li key={index} className={signer.signedAt ? 'iw-signed' : index === turn && envelope.status === 'awaiting_signature' ? 'iw-turn' : undefined}>
      <span className="iw-order" aria-hidden="true">{signer.signedAt ? <Check /> : index + 1}</span>
      <div><strong>{signer.name}</strong><span className="iw-signer-email">{signer.email}</span><small>{signer.signedAt ? `Signed ${dateTime(signer.signedAt)}` : envelope.status === 'awaiting_signature' && index === turn ? me(signer.email) ? 'Waiting for your signature' : 'Invited, awaiting signature' : 'Awaiting signature'}</small></div>
    </li>)}</ol>

    {envelope.status === 'prepared' && canApprove(actor) && <div className="iw-decision">
      <div className="iw-alert"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>{preparedByAgent(envelope) ? 'Prepared by the Inkwell agent.' : 'Prepared and saved.'}</strong><p>Nothing is sent until a person approves it.</p></div></div>
      <h3>Human approval</h3>
      <p>Review the document and recipients before sending invitations. Signatures are collected sequentially.</p>
      <label className="iw-check"><input type="checkbox" checked={eligible} onChange={event => setEligible(event.target.checked)} />I reviewed this envelope, confirm it is eligible for electronic signature, and authorize the first invitation.</label>
      <div className="iw-decision-actions"><button className="iw-primary" disabled={!eligible || action.busy} onClick={() => void action.run(async () => { await command('envelope.approve', { id: envelope.id, eligible: true }); await refresh() })}>{action.busy ? 'Sending…' : 'Approve and invite first recipient'}</button><button onClick={onClose}>Keep as is</button></div>
    </div>}

    <h3>Document</h3>
    <div className="iw-artifacts"><button onClick={() => setShowPdf(value => !value)}>{showPdf ? 'Hide document' : 'View document and fields'}</button><a className="iw-button" href={`${base}/artifacts/original`} download>Original PDF</a>{envelope.status === 'completed' && <><a className="iw-button" href={`${base}/artifacts/signed`} download>Executed PDF</a><a className="iw-button" href={`${base}/artifacts/certificate`} download>Certificate</a><a className="iw-button" href={`${base}/artifacts/handoff`} download>Handoff manifest</a></>}<a className="iw-button" href={`${base}/artifacts/audit`} download>Audit JSON</a></div>
    {showPdf && <PdfViewer source={`${base}/artifacts/${envelope.status === 'completed' ? 'signed' : 'original'}`} fields={envelope.status === 'completed' ? [] : envelope.fields} />}

    <ArtifactIntegrity envelope={envelope} base={base} />
    <details className="iw-audit-trail"><summary>Audit trail ({envelope.events.length})</summary><ol className="iw-audit">{envelope.events.map((event, index) => <li key={index}><strong>{event.action.replaceAll('_', ' ')}</strong> <time>{dateTime(event.at)}</time>{event.actor && <span>{event.actor}</span>}{typeof event.detail?.reason === 'string' && <p>{event.detail.reason}</p>}</li>)}</ol></details>
    {canEdit(actor) && !finished && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setVoiding(value => !value)}>Void envelope…</button>{voiding && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.void', { id: envelope.id, reason }); setVoiding(false); await refresh() }) }}><label>Reason for voiding<textarea required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><p>Recipients will no longer be able to sign this envelope.</p><button className="iw-danger iw-fit" disabled={action.busy}>Confirm void</button></form>}</div>}
    {actor.role === 'owner' && ['prepared', 'completed', 'voided'].includes(envelope.status) && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setErasing(value => !value)}>Erase archived envelope…</button>{erasing && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await request('/api/inkwell/erase', { id: envelope.id, confirmation }); await refresh(); onClose() }) }}><p>Download the full archive from the Archive tab first if you need to preserve these records. Erasure permanently removes the document and personal data. A tombstone remains to record the erasure.</p><label>Type ERASE to confirm<input required pattern="ERASE" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button className="iw-danger iw-fit" disabled={action.busy || confirmation !== 'ERASE'}>Permanently erase</button></form>}</div>}
    <ErrorNotice error={action.error} />
  </section>
}
