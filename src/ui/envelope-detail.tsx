// One envelope in the right-hand panel: its pill, signing status in order, the approval decision when a person must
// make one, the files, the integrity check, the audit trail, and voiding or erasure. The panel's body scrolls; the
// decision the panel asks for (approve, or review and sign) sits in its foot, always in view.
import { useState } from 'react'
import { command, request, dateTime, canApprove, canEdit, type Actor, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'
import { PdfViewer } from './pdf-viewer'
import { ArtifactIntegrity } from './artifact-integrity'
import { SendCopy } from './send-copy'
import { Check, Pill } from './marks'
import { Icon } from './icons'
import { currentSigners, pill, routingOrder, preparedByAgent, titleParts } from './envelope-view'

type Invitation = { url: string; code: string; recipient: string; expiresAt: string }
type InvitationResult = { invitations?: Invitation[]; signInApp?: boolean }
type OwnSigningResult = { signing: { url: string } }

export function EnvelopeDetail({ envelope, actor, refresh, onClose, onOpen }: { envelope: Envelope; actor: Actor; refresh: () => Promise<void>; onClose: () => void; onOpen: (id: string) => void }) {
  const action = useAction()
  const [eligible, setEligible] = useState(false)
  const [reason, setReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [extending, setExtending] = useState(false)
  const [extendDays, setExtendDays] = useState(14)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [erasing, setErasing] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [showPdf, setShowPdf] = useState(false)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [copied, setCopied] = useState<string>()
  const base = `/api/inkwell/envelopes/${encodeURIComponent(envelope.id)}`
  const finished = ['completed', 'declined', 'voided', 'expired', 'imported'].includes(envelope.status)
  const copyable = ['awaiting_signature', 'completed', 'declined', 'voided', 'expired'].includes(envelope.status) && canEdit(actor)
  const turn = envelope.status === 'awaiting_signature' ? currentSigners(envelope) : []
  const privateInvitations = envelope.manualInvitationAvailable && !finished ? invitations.filter(invitation => turn.some(index => envelope.signers[index].email === invitation.recipient)) : []
  const paperSigner = turn.find(index => envelope.signers[index].paper?.status === 'pending')
  async function saveInvitation(result: InvitationResult) {
    setCopied(undefined)
    setInvitations(current => actor.role === 'owner' ? [...current.filter(invitation => !result.invitations?.some(next => next.recipient === invitation.recipient)), ...(result.invitations ?? [])] : [])
    await refresh()
  }
  const state = pill(envelope, actor), { name, detail } = titleParts(envelope.title)
  const me = (email: string) => email.toLowerCase() === actor.email.toLowerCase()
  const deciding = envelope.status === 'prepared' && canApprove(actor), signingHere = Boolean(envelope.ownSigningAvailable)
  // ROUTE-009: an approver who signs at the first routing order signs here right after approving; nobody emails them.
  const signsFirst = deciding && currentSigners(envelope).some(index => me(envelope.signers[index].email))
  async function approve() {
    const result = await command<InvitationResult>('envelope.approve', { id: envelope.id, eligible: true })
    if (!result.signInApp) return saveInvitation(result)
    const { signing } = await command<OwnSigningResult>('envelope.open_signing', { id: envelope.id }); window.location.assign(signing.url)
  }
  return <section className="iw-detail" aria-label={envelope.title}><div className="iw-detail-body">
    <div className="iw-detail-top"><Pill {...state} /><button className="iw-icon-button" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
    <h2>{name}</h2><p className="iw-detail-sub">{detail && <span>{detail}</span>}<span className="iw-detail-date">Prepared {dateTime(envelope.createdAt)}</span>{['prepared', 'awaiting_signature', 'expired'].includes(envelope.status) && envelope.expiresAt && <span className="iw-detail-date">{envelope.status === 'expired' ? 'Expired' : 'Expires'} {dateTime(envelope.expiresAt)}</span>}{envelope.reminders && ['prepared', 'awaiting_signature'].includes(envelope.status) && <span>Reminders after {envelope.reminders.afterDays}, then every {envelope.reminders.everyDays} business days</span>}{envelope.copiedFrom && <span>Copied from envelope {envelope.copiedFrom.slice(0, 8)}</span>}</p>

    <h3>Signing status</h3>
    <ol className="iw-signers">{envelope.signers.map((signer, index) => <li key={index} className={signer.declinedAt ? 'iw-declined' : signer.signedAt ? 'iw-signed' : turn.includes(index) ? 'iw-turn' : undefined}>
      <span className="iw-order" aria-hidden="true">{signer.signedAt ? <Check /> : routingOrder(envelope, index)}</span>
      <div><strong>{signer.name}</strong><span className="iw-signer-email">{signer.email}{signer.accessCode ? ' · access code' : ''}</span><small>{signer.declinedAt ? `${signer.consentWithdrawn ? 'Withdrew consent' : 'Declined'} ${dateTime(signer.declinedAt)} · ${signer.declineReason}` : signer.signedAt ? `${signer.paper?.status === 'accepted' ? 'Signed on paper' : 'Signed'} ${dateTime(signer.signedAt)}` : signer.paper?.status === 'pending' ? 'Paper signature to review' : envelope.status === 'declined' ? 'Not invited' : turn.includes(index) ? me(signer.email) ? 'Waiting for your signature' : 'Invited, awaiting signature' : 'Awaiting signature'}</small></div>
    </li>)}</ol>
    {envelope.copies?.length ? <><h3>Receive a copy</h3><ul className="iw-signers">{envelope.copies.map(copy => <li key={copy.email}><span className="iw-order" aria-hidden="true">{envelope.status === 'completed' ? <Check /> : '·'}</span><div><strong>{copy.name}</strong><span className="iw-signer-email">{copy.email}</span><small>{envelope.status !== 'completed' ? 'Gets the completed copy when everyone has signed' : envelope.events.some(event => event.action === 'envelope.copies_queued') ? 'Completed copy queued for email' : 'No copy emailed: mail was not set up'}</small></div></li>)}</ul></> : null}

    {deciding && <div className="iw-decision">
      <div className="iw-alert"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>{preparedByAgent(envelope) ? 'Prepared by the Inkwell agent.' : 'Prepared and saved.'}</strong><p>Nothing is sent until a person approves it.</p></div></div>
      <h3>Human approval</h3>
      <p>Review the document and recipients before sending invitations. Signatures are collected in routing order; recipients who share a number sign at the same time.</p>
    </div>}
    {signingHere && <div className="iw-decision"><div className="iw-alert iw-alert-turn"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>Waiting for you.</strong><p>Review the document and sign it on your own signing page. Opening it replaces the link you were sent.</p></div></div></div>}

    {canEdit(actor) && paperSigner !== undefined && <div className="iw-decision iw-stack"><div className="iw-alert iw-alert-turn"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>Paper signature to review.</strong><p>{envelope.signers[paperSigner].name} signed on paper and uploaded {envelope.signers[paperSigner].paper?.pages} page(s). Accept it as their wet-ink signature, or reject it with a reason.</p></div></div><div className="iw-actions"><a className="iw-button" href={`${base}/artifacts/paper-${paperSigner}`} download>View upload</a><button className="iw-primary" disabled={action.busy} onClick={() => void action.run(async () => { await command('envelope.paper_review', { id: envelope.id, signer: paperSigner, accept: true }); await refresh() })}>Accept paper signature</button><button disabled={action.busy} onClick={() => setRejecting(value => !value)}>Reject…</button></div>{rejecting && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.paper_review', { id: envelope.id, signer: paperSigner, accept: false, reason: rejectReason }); setRejecting(false); setRejectReason(''); await refresh() }) }}><label>Reason for rejecting<textarea required minLength={3} maxLength={500} value={rejectReason} onChange={event => setRejectReason(event.target.value)} /></label><button className="iw-danger iw-fit" disabled={action.busy}>Reject upload</button></form>}</div>}
    {actor.role === 'owner' && !signingHere && (privateInvitations.length > 0 || envelope.manualInvitationAvailable) && <div className="iw-manual-invitation">
      <p>Email was not sent because mail is not set up.</p>
      {privateInvitations.map(invitation => <div key={invitation.url}>
        <div className="iw-invitation-link"><span>For {invitation.recipient}:</span><a href={invitation.url}>{invitation.url}</a><button aria-live="polite" disabled={action.busy} onClick={() => void action.run(async () => { await navigator.clipboard.writeText(invitation.url); setCopied(invitation.url) })}>{copied === invitation.url ? 'Copied' : 'Copy link'}</button></div>
        <p>Verification code: <strong>{invitation.code}</strong> · valid for 10 minutes.</p>
        <p>Share this link and code privately with the recipient. The link expires {dateTime(invitation.expiresAt)}.</p>
      </div>)}
      <p>If the link is lost or the code expires, create a new link. This replaces the previous link, code, and signing session.</p>
      {envelope.manualInvitationAvailable && turn.map(index => <button key={index} className="iw-fit" disabled={action.busy} onClick={() => void action.run(async () => { setCopied(undefined); await saveInvitation(await command<InvitationResult>('envelope.invite', { id: envelope.id, signer: index })) })}>{action.busy ? 'Creating…' : turn.length > 1 ? `Create new signing link for ${envelope.signers[index].name}` : 'Create new signing link'}</button>)}
    </div>}

    <div className="iw-detail-records"><h3>Document</h3>
    <div className="iw-artifacts"><button onClick={() => setShowPdf(value => !value)}>{showPdf ? 'Hide document' : 'View document and fields'}</button><a className="iw-button" href={`${base}/artifacts/original`} download>Original PDF</a>{envelope.status === 'completed' && <><a className="iw-button" href={`${base}/artifacts/signed`} download>Executed PDF</a><a className="iw-button" href={`${base}/artifacts/certificate`} download>Certificate</a><a className="iw-button" href={`${base}/artifacts/handoff`} download>Handoff manifest</a></>}{envelope.status === 'declined' && envelope.certificateSha256 && <a className="iw-button" href={`${base}/artifacts/certificate`} download>Decline certificate</a>}<a className="iw-button" href={`${base}/artifacts/audit`} download>Audit JSON</a></div>
    {showPdf && <PdfViewer source={`${base}/artifacts/${envelope.status === 'completed' ? 'signed' : 'original'}`} fields={envelope.status === 'completed' ? [] : envelope.fields} />}

    {envelope.status === 'completed' && canEdit(actor) && <SendCopy id={envelope.id} refresh={refresh} />}
    <ArtifactIntegrity envelope={envelope} base={base} />
    <details className="iw-audit-trail"><summary>Audit trail ({envelope.events.length})</summary><ol className="iw-audit">{envelope.events.map((event, index) => <li key={index}><strong>{event.action.replaceAll('_', ' ')}</strong> <time>{dateTime(event.at)}</time>{event.actor && <span>{event.actor}</span>}{typeof event.detail?.reason === 'string' && <p>{event.detail.reason}</p>}</li>)}</ol></details>
    {copyable && <div className="iw-quiet"><button disabled={action.busy} onClick={() => void action.run(async () => { const copy = await command<{ id: string }>('envelope.copy', { id: envelope.id }); await refresh(); onOpen(copy.id) })}>{action.busy ? 'Copying…' : 'Copy to a new envelope'}</button></div>}
    {canEdit(actor) && ['prepared', 'awaiting_signature', 'expired'].includes(envelope.status) && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setExtending(value => !value)}>Extend expiry…</button>{extending && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.extend', { id: envelope.id, days: extendDays }); setExtending(false); await refresh() }) }}><label>Extend by (days)<input type="number" required min={1} max={365} step={1} value={extendDays} onChange={event => setExtendDays(Math.round(Number(event.target.value)))} /></label><p>{envelope.status === 'expired' ? 'The envelope reopens from today with the same document, recipients and links.' : `The new expiry counts from ${dateTime(envelope.expiresAt)}. Links and signatures so far stay as they are.`}</p><button className="iw-primary iw-fit" disabled={action.busy}>Extend</button></form>}</div>}
    {canEdit(actor) && !finished && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setVoiding(value => !value)}>Void envelope…</button>{voiding && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.void', { id: envelope.id, reason }); setVoiding(false); await refresh() }) }}><label>Reason for voiding<textarea required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><p>Recipients will no longer be able to sign this envelope.</p><button className="iw-danger iw-fit" disabled={action.busy}>Confirm void</button></form>}</div>}
    {actor.role === 'owner' && ['prepared', 'completed', 'declined', 'voided'].includes(envelope.status) && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setErasing(value => !value)}>Erase archived envelope…</button>{erasing && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await request('/api/inkwell/erase', { id: envelope.id, confirmation }); await refresh(); onClose() }) }}><p>Download the full archive from the Archive tab first if you need to preserve these records. Erasure permanently removes the document and personal data. A tombstone remains to record the erasure.</p><label>Type ERASE to confirm<input required pattern="ERASE" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button className="iw-danger iw-fit" disabled={action.busy || confirmation !== 'ERASE'}>Permanently erase</button></form>}</div>}
    </div></div>
    <ErrorNotice error={action.error} />
    {deciding && <div className="iw-detail-foot">
      <label className="iw-check"><input type="checkbox" checked={eligible} onChange={event => setEligible(event.target.checked)} />I reviewed this envelope, confirm it is eligible for electronic signature, and authorize the first invitation.</label>
      <div className="iw-decision-actions"><button className="iw-primary" disabled={!eligible || action.busy} onClick={() => void action.run(approve)}>{action.busy ? 'Sending…' : signsFirst ? 'Approve and sign now' : 'Approve and invite first recipient'}</button><button onClick={onClose}>Keep as is</button></div>
    </div>}
    {signingHere && <div className="iw-detail-foot"><div className="iw-decision-actions"><button className="iw-primary" disabled={action.busy} onClick={() => void action.run(async () => { const { signing } = await command<OwnSigningResult>('envelope.open_signing', { id: envelope.id }); window.location.assign(signing.url) })}>{action.busy ? 'Opening…' : 'Review and sign'}</button></div></div>}
  </section>
}
