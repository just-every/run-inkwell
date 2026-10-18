import { useState } from 'react'
import { command, request, dateTime, canApprove, canEdit, type Actor, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'
import { PdfViewer } from './pdf-viewer'
import { ArtifactIntegrity } from './artifact-integrity'
import { Check } from './marks'

type Invitation = { url: string; code: string; recipient: string; expiresAt: string }
type InvitationResult = { invitation?: Invitation }

export function EnvelopeDetail({ envelope, actor, refresh, onClose }: { envelope: Envelope; actor: Actor; refresh: () => Promise<void>; onClose: () => void }) {
  const action = useAction()
  const [eligible, setEligible] = useState(false)
  const [reason, setReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [showPdf, setShowPdf] = useState(false)
  const [invitation, setInvitation] = useState<Invitation>()
  const [copied, setCopied] = useState(false)
  const base = `/api/inkwell/envelopes/${encodeURIComponent(envelope.id)}`
  const finished = ['completed', 'voided', 'expired', 'imported'].includes(envelope.status)
  const currentRecipient = envelope.signers.find(signer => !signer.signedAt)?.email
  const privateInvitation = envelope.manualInvitationAvailable && !finished && invitation?.recipient === currentRecipient ? invitation : undefined
  async function saveInvitation(result: InvitationResult) {
    setCopied(false)
    setInvitation(actor.role === 'owner' ? result.invitation : undefined)
    await refresh()
  }
  return <section className="iw-panel iw-stack iw-detail"><div className="iw-section-head"><div><span className={`iw-status iw-status-${envelope.status}`}>{envelope.status.replaceAll('_', ' ')}</span><h1>{envelope.title}</h1><p>Prepared {dateTime(envelope.createdAt)}</p></div><button onClick={onClose}>Close</button></div>
    <ol className="iw-signers">{envelope.signers.map((signer, index) => <li key={index}><span className="iw-order" aria-hidden="true">{index + 1}</span><strong>{signer.name}</strong><span>{signer.email}</span><small>{signer.signedAt ? <><Check />Signed {dateTime(signer.signedAt)}</> : 'Awaiting signature'}</small></li>)}</ol>
    <div className="iw-actions iw-artifacts"><button onClick={() => setShowPdf(value => !value)}>{showPdf ? 'Hide document' : 'View document and fields'}</button><a className="iw-button" href={`${base}/artifacts/original`} download>Original PDF</a>{envelope.status === 'completed' && <><a className="iw-button" href={`${base}/artifacts/signed`} download>Executed PDF</a><a className="iw-button" href={`${base}/artifacts/certificate`} download>Certificate</a><a className="iw-button" href={`${base}/artifacts/handoff`} download>Handoff manifest</a></>}<a className="iw-button" href={`${base}/artifacts/audit`} download>Audit JSON</a></div>
    {showPdf && <PdfViewer source={`${base}/artifacts/${envelope.status === 'completed' ? 'signed' : 'original'}`} fields={envelope.status === 'completed' ? [] : envelope.fields} />}
    {envelope.status === 'prepared' && canApprove(actor) && <div className="iw-callout iw-stack"><h3>Human approval</h3><p>Review the document and recipients before sending invitations. Signatures are collected sequentially.</p><label className="iw-check"><input type="checkbox" checked={eligible} onChange={event => setEligible(event.target.checked)} />I reviewed this envelope, confirm it is eligible for electronic signature, and authorize the first invitation.</label><button className="iw-primary iw-fit" disabled={!eligible || action.busy} onClick={() => void action.run(async () => { await saveInvitation(await command<InvitationResult>('envelope.approve', { id: envelope.id, eligible: true })) })}>{action.busy ? 'Sending…' : 'Approve and invite first recipient'}</button></div>}
    {actor.role === 'owner' && (privateInvitation || envelope.manualInvitationAvailable) && <div className="iw-manual-invitation">
      <p>Email was not sent because mail is not set up.</p>
      {privateInvitation && <>
        <div className="iw-invitation-link"><span>For {privateInvitation.recipient}:</span><a href={privateInvitation.url}>{privateInvitation.url}</a><button aria-live="polite" disabled={action.busy} onClick={() => void action.run(async () => { await navigator.clipboard.writeText(privateInvitation.url); setCopied(true) })}>{copied ? 'Copied' : 'Copy link'}</button></div>
        <p>Verification code: <strong>{privateInvitation.code}</strong> · valid for 10 minutes.</p>
        <p>Share this link and code privately with the recipient. The link expires {dateTime(privateInvitation.expiresAt)}.</p>
      </>}
      <p>If the link is lost or the code expires, create a new link. This replaces the previous link, code, and signing session.</p>
      {envelope.manualInvitationAvailable && <button className="iw-fit" disabled={action.busy} onClick={() => void action.run(async () => { setInvitation(undefined); setCopied(false); await saveInvitation(await command<InvitationResult>('envelope.invite', { id: envelope.id })) })}>{action.busy ? 'Creating…' : 'Create new signing link'}</button>}
    </div>}
    <ArtifactIntegrity envelope={envelope} base={base} />
    <details className="iw-audit-trail"><summary>Audit trail ({envelope.events.length})</summary><ol className="iw-audit">{envelope.events.map((event, index) => <li key={index}><strong>{event.action.replaceAll('_', ' ')}</strong> <time>{dateTime(event.at)}</time>{event.actor && <span>{event.actor}</span>}{typeof event.detail?.reason === 'string' && <p>{event.detail.reason}</p>}</li>)}</ol></details>
    {canEdit(actor) && !finished && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setVoiding(value => !value)}>Void envelope…</button>{voiding && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.void', { id: envelope.id, reason }); setVoiding(false); await refresh() }) }}><label>Reason for voiding<textarea required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><p>Recipients will no longer be able to sign this envelope.</p><button className="iw-danger iw-fit" disabled={action.busy}>Confirm void</button></form>}</div>}
    {actor.role === 'owner' && ['prepared', 'completed', 'voided'].includes(envelope.status) && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setErasing(value => !value)}>Erase archived envelope…</button>{erasing && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await request('/api/inkwell/erase', { id: envelope.id, confirmation }); await refresh(); onClose() }) }}><p>Download the full archive from the Archive tab first if you need to preserve these records. Erasure permanently removes the document and personal data. A tombstone remains to record the erasure.</p><label>Type ERASE to confirm<input required pattern="ERASE" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button className="iw-danger iw-fit" disabled={action.busy || confirmation !== 'ERASE'}>Permanently erase</button></form>}</div>}
    <ErrorNotice error={action.error} />
  </section>
}
