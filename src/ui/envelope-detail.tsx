import { Part11Profile } from './part11'
import { Comments } from './comments'
import { EnvelopeSupplements } from './supplements'
import { EnvelopeFollowup } from './followup'
import { displayFieldValue, displayReferencedValue } from '../inkwell/business-fields'
import { HostSigning } from './host-signing'
import { RoutingPreview, routingRuleText } from './routing-rules'
// One envelope in the right-hand panel: its pill, signing status in order, the approval decision when a person must
// make one, the files, the integrity check, the audit trail, and voiding or erasure. The panel's body scrolls; the
// decision the panel asks for (approve, or review and sign) sits in its foot, always in view.
import { useEffect, useState } from 'react'
import { command, request, dateTime, zonedAndUtc, canEdit, type Actor, type Envelope, type Signer } from './types'
import { EnvelopeShares } from './envelope-shares'
import { ErrorNotice, useAction } from './feedback'
import { PdfViewer } from './pdf-viewer'
import { ArtifactIntegrity } from './artifact-integrity'
import { SendCopy } from './send-copy'
import { LegalHold } from './legal-hold'
import { InternalApprovalStatus } from './internal-approval'
import { Check, Pill } from './marks'
import { Icon } from './icons'
import { currentSigners, pill, routingOrder, preparedByAgent, titleParts } from './envelope-view'

// DELIV-001: what each kind of message is, as the Messages list names it.
// MANAGE-005: the timeline's step names.
const steps: Record<string, string> = { sent: 'Sent', delivered: 'Delivered', viewed: 'Viewed', authenticated: 'Authenticated', signed: 'Signed', approved: 'Approved', filled: 'Fields completed', witness_declined: 'Witness declined', witness_nominated: 'Witness nominated', declined: 'Declined', bounced: 'Bounced', added: 'Added', corrected: 'Corrected', removed: 'Removed', reassigned: 'Reassigned', skipped: 'Skipped', unresolved: 'Routing unresolved', included: 'Included', route_skipped: 'Skipped by routing condition', route_unresolved: 'Routing unresolved', route_included: 'Included by routing condition', route_activated: 'Turn activated' }
const messageKinds: Record<string, string> = { invitation: 'Invitation', code: 'Verification code', notice: 'Notice', copy: 'Completed copy', copy_code: 'Completed-copy code' }
const recipientAction = (signer: Signer) => signer.witnessReturnRequired ? 'witness nomination' : signer.role === 'approver' ? 'approval' : signer.role === 'form_filler' ? 'completed fields' : signer.role === 'witness' ? 'witness signature' : 'signature'
function recipientStatus(signer: Signer, invited: boolean, mine: boolean, stopped: boolean) {
  if (signer.role === 'witness' && signer.declinedAt) return `Witness declined ${dateTime(signer.declinedAt)} · ${signer.declineReason ?? ''} · returned to signer for a replacement`
  if (signer.removedAt) return `Removed by a correction ${dateTime(signer.removedAt)}`
  if (signer.declinedAt) return `${signer.consentWithdrawn ? 'Withdrew consent' : 'Declined'}${signer.group?.declinedBy !== undefined ? ` (${signer.group.members[signer.group.declinedBy].name})` : ''} ${dateTime(signer.declinedAt)} · ${signer.declineReason ?? ''}`
  if (signer.witnessReturnRequired) return 'Signature recorded · waiting for the signer to nominate a replacement witness'
  if (signer.completedAt) return `${signer.role === 'approver' ? 'Approved' : signer.role === 'form_filler' ? 'Fields completed' : 'Completed'} ${dateTime(signer.completedAt)}`
  if (signer.signedAt) return `${signer.paper?.status === 'accepted' ? 'Signed on paper' : signer.role === 'witness' ? 'Witnessed' : 'Signed'}${signer.group?.signedBy !== undefined ? ` for the group by ${signer.group.members[signer.group.signedBy].name}` : ''} ${dateTime(signer.signedAt)}`
  if (signer.routeResult?.state === 'skipped') return `Skipped by routing condition ${dateTime(signer.routeResult.at)}`
  if (signer.routeResult?.state === 'unresolved') return 'Routing unresolved · sender correction required'
  if (signer.includeWhen && !signer.routeResult) return 'Conditional · awaiting routing evaluation'
  if (signer.paper?.status === 'pending') return 'Paper signature to review'
  if (stopped) return 'Not invited'
  if (invited && signer.inPerson) return 'Waiting for an in-person host'
  return `${invited ? mine ? 'Waiting for your' : 'Invited, awaiting' : 'Awaiting'} ${recipientAction(signer)}`
}
type Invitation = { url: string; code: string; recipient: string; expiresAt: string }
type InvitationResult = { invitations?: Invitation[]; signInApp?: boolean }
type OwnSigningResult = { signing: { url: string } }

export function EnvelopeDetail({ envelope, actor, refresh, onClose, onOpen, onEdit, onCorrect }: { envelope: Envelope; actor: Actor; refresh: () => Promise<void>; onClose: () => void; onOpen: (id: string) => void; onEdit: (envelope: Envelope) => void; onCorrect: (envelope: Envelope) => void }) {
  const action = useAction()
  const [freeFormAllowed, setFreeFormAllowed] = useState(false)
  useEffect(() => { if (envelope.freeForm && envelope.status === 'prepared') void action.run(async () => { const result = await request<{ policy: { enabled: boolean } }>('/api/inkwell/freeform-policy'); setFreeFormAllowed(result.policy.enabled) }) }, [envelope.id, envelope.events.length])
  // TMPL-003: the template this envelope was just saved as.
  const [savedAs, setSavedAs] = useState('')
  const [eligible, setEligible] = useState(false)
  // PREP-009: approve now and send at a wall-clock time in a US time zone.
  const [later, setLater] = useState(false)
  const [sendAt, setSendAt] = useState('')
  const [zone, setZone] = useState('America/New_York')
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
  // ADMIN-001: the server says whether this person may change this envelope (theirs, shared to edit, or any for admins).
  const mayEdit = envelope.access === 'edit'
  const finished = ['completed', 'declined', 'voided', 'expired', 'imported'].includes(envelope.status)
  const copyable = ['awaiting_signature', 'completed', 'declined', 'voided', 'expired'].includes(envelope.status) && mayEdit
  const turn = envelope.status === 'awaiting_signature' ? currentSigners(envelope) : []
  const queued = (email: string) => envelope.events.some(event => ['envelope.copies_queued', 'envelope.copy_sent'].includes(event.action) && (event.detail?.recipients as { email: string }[] | undefined)?.some(recipient => recipient.email === email))
  const privateInvitations = envelope.manualInvitationAvailable && !finished ? invitations.filter(invitation => turn.some(index => envelope.signers[index].email === invitation.recipient)) : []
  const paperSigner = turn.find(index => envelope.signers[index].paper?.status === 'pending')
  async function saveInvitation(result: InvitationResult) {
    setCopied(undefined)
    setInvitations(current => actor.role === 'owner' ? [...current.filter(invitation => !result.invitations?.some(next => next.recipient === invitation.recipient)), ...(result.invitations ?? [])] : [])
    await refresh()
  }
  // MANAGE-005: each recipient's timeline, and the remind action for whoever's turn it is.
  const timeline = (index: number) => envelope.recipients?.find(recipient => recipient.signer === index)
  const [reminded, setReminded] = useState<string[]>()
  // DELIV-005: resend the invitation to a recipient whose turn it is, on the same link or a new one.
  const [resent, setResent] = useState<string>()
  // DELIV-002: the corrected address typed for each bounced recipient.
  const [corrections, setCorrections] = useState<Record<number, string>>({})
  const state = pill(envelope, actor), { name, detail } = titleParts(envelope.title)
  const me = (email: string) => email.toLowerCase() === actor.email.toLowerCase()
  // ROUTE-004: a draft waiting for internal approval is not approved again by its sender.
  const deciding = envelope.status === 'prepared' && mayEdit && envelope.internalApproval?.state !== 'pending', signingHere = Boolean(envelope.ownSigningAvailable)
  // DELIV-006: correct is offered to whoever may change the envelope while it is open for signing.
  const correctable = mayEdit && envelope.status === 'awaiting_signature' && !envelope.scheduled && Date.parse(envelope.expiresAt) > Date.now()
  const remindable = mayEdit && envelope.status === 'awaiting_signature' && !envelope.scheduled && !envelope.manualInvitationAvailable && !signingHere && turn.some(index => !envelope.signers[index].inPerson && envelope.signers[index].paper?.status !== 'pending')
  const resendable = remindable ? turn.filter(index => !envelope.signers[index].inPerson && envelope.signers[index].paper?.status !== 'pending' && !timeline(index)?.bounced) : []
  // ROUTE-009: an approver who signs at the first routing order signs here right after approving; nobody emails them.
  const myRecipient = envelope.signers.find(signer => me(signer.email) && (signer.witnessReturnRequired || (!signer.signedAt && !signer.completedAt && !signer.removedAt)))
  const ownAction = myRecipient?.witnessReturnRequired ? 'Nominate a replacement witness' : myRecipient?.role === 'approver' ? 'Review and approve' : myRecipient?.role === 'form_filler' ? 'Review and fill fields' : 'Review and sign'
  const signsFirst = deciding && currentSigners(envelope).some(index => !envelope.signers[index].inPerson && me(envelope.signers[index].email))
  async function approve() {
    const result = await command<InvitationResult>('envelope.approve', { id: envelope.id, eligible: true, ...(later ? { sendAt: { at: sendAt, timeZone: zone } } : {}) })
    if (!result.signInApp) return saveInvitation(result)
    const { signing } = await command<OwnSigningResult>('envelope.open_signing', { id: envelope.id }); window.location.assign(signing.url)
  }
  return <section className="iw-detail" aria-label={envelope.title}><div className="iw-detail-body">
    <div className="iw-detail-top"><Pill {...state} /><button className="iw-icon-button" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
    {envelope.sendHold && <div className="iw-alert" role="status"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>Sending held.</strong><p>The sending confirmation is no longer valid. A current editor must review and confirm again.</p></div></div>}
    <h2>{name}</h2>{(envelope.part11 || envelope.status==='prepared' && ['owner','admin'].includes(actor.role)) && <Part11Profile id={envelope.id} enabled={Boolean(envelope.part11)} available={envelope.status==='prepared' && ['owner','admin'].includes(actor.role)} refresh={refresh} />}{envelope.freeForm && <p className="iw-muted">Free-form signing{envelope.freeFormSetting ? ` · setting version ${envelope.freeFormSetting.version}` : ' · signers place their own fields'}</p>}<p className="iw-detail-sub">{detail && <span>{detail}</span>}<span className="iw-detail-date">Prepared {dateTime(envelope.createdAt)}</span>{['prepared', 'awaiting_signature', 'expired'].includes(envelope.status) && envelope.expiresAt && <span className="iw-detail-date">{envelope.status === 'expired' ? 'Expired' : 'Expires'} {dateTime(envelope.expiresAt)}</span>}{envelope.reminders && ['prepared', 'awaiting_signature'].includes(envelope.status) && <span>Reminders after {envelope.reminders.afterDays}, then every {envelope.reminders.everyDays} business days</span>}{envelope.copiedFrom && <span>Copied from envelope {envelope.copiedFrom.slice(0, 8)}</span>}</p>

    <EnvelopeSupplements envelope={envelope} editable={deciding} refresh={refresh} />
    <Comments key={`comments-${envelope.id}-${envelope.status}`} base={base} />
    <h3>Signing status</h3>{mayEdit && !envelope.scheduled && turn.filter(index => envelope.signers[index].inPerson && !me(envelope.signers[index].email)).map(index => <HostSigning key={index} id={envelope.id} signer={index} name={envelope.signers[index].name} />)}
    <ol className="iw-signers">{envelope.signers.map((signer, index) => <li key={index} className={signer.removedAt ? 'iw-declined' : signer.declinedAt ? 'iw-declined' : signer.signedAt || signer.completedAt ? 'iw-signed' : turn.includes(index) ? 'iw-turn' : undefined}>
      <span className="iw-order" aria-hidden="true">{signer.signedAt || signer.completedAt ? <Check /> : routingOrder(envelope, index)}</span>
      <div><strong>{signer.name}</strong><span className="iw-signer-email">{signer.group ? `Signing group: ${signer.group.members.map(m => `${m.name} <${m.email}>`).join(', ')}` : signer.email}{signer.accessCode ? ' · access code' : ''}{signer.inPerson ? ' · in person' : ''}</span><small>{recipientStatus(signer, turn.includes(index), me(signer.email), envelope.status === 'declined')}</small>{signer.role && signer.role !== 'signer' && <small>{signer.role === 'approver' ? 'Approver' : signer.role === 'form_filler' ? 'Form filler' : `Witness for ${envelope.signers[signer.witnessFor ?? -1]?.name ?? 'their signer'}`}</small>}{signer.witnesses && <small>Witnesses: {signer.witnesses.minimum} required, up to {signer.witnesses.maximum}</small>}
        {signer.includeWhen && <small>{routingRuleText(signer.includeWhen, envelope.fields)}{signer.routeResult?.value !== undefined ? ` · source answer: ${displayReferencedValue(envelope.fields, signer.includeWhen.field, signer.routeResult.value)}` : ''}</small>}
        {signer.routeResult?.state !== 'skipped' && signer.routeResult?.state !== 'unresolved' && timeline(index)?.waitingOn && <small>Waiting on: {timeline(index)!.waitingOn}</small>}
        {signer.routeResult?.state !== 'skipped' && timeline(index)?.bounced && mayEdit && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.correct_bounced', { id: envelope.id, signer: index, email: corrections[index] ?? '' }); setCorrections(current => ({ ...current, [index]: '' })); await refresh() }) }}><label>Corrected email for {signer.name}<input id={`corrected-email-${envelope.id}-${index}`} type="email" required value={corrections[index] ?? ''} onChange={event => { const value = event.target.value; setCorrections(current => ({ ...current, [index]: value })) }} /></label><button className="iw-primary iw-fit" disabled={action.busy}>Correct and resend</button></form>}
        {timeline(index)?.steps.length ? <ul className="iw-timeline" aria-label={`${signer.name} timeline`}>{timeline(index)!.steps.map(step => <li key={step.step + step.at}><strong>{signer.role === 'witness' && signer.declinedAt && step.step === 'removed' ? 'Witness invitation retired after decline' : steps[step.step] ?? step.step}</strong> <time dateTime={step.at}>{zonedAndUtc(step.at, envelope.timeZone ?? 'America/New_York')}</time>{step.detail && step.step !== 'sent' ? ` · ${step.detail}` : ''}</li>)}</ul> : null}</div>
    </li>)}</ol>
    {(remindable || correctable) && <div className="iw-actions">{remindable && <button disabled={action.busy} onClick={() => void action.run(async () => { const result = await command<{ reminded: string[] }>('envelope.remind', { id: envelope.id }); setReminded(result.reminded); await refresh() })}>{action.busy ? 'Sending…' : 'Remind'}</button>}{resendable.flatMap(index => [false, true].map(newLink => <button key={`${index}-${newLink}`} disabled={action.busy} onClick={() => void action.run(async () => { const result = await command<{ email: string; newLink: boolean; reason?: string }>('envelope.resend', { id: envelope.id, signer: index, ...(newLink ? { newLink } : {}) }); setResent(result.reason ?? `Invitation resent to ${result.email}${result.newLink ? ' with a new link; the previous link no longer works' : ' with the same link'}`); await refresh() })}>{newLink ? 'Resend with a new link' : 'Resend'}{resendable.length > 1 ? ` to ${envelope.signers[index].name}` : ''}</button>))}{correctable && <button disabled={action.busy} onClick={() => onCorrect(envelope)}>Correct…</button>}{reminded && <span role="status">Reminder sent to {reminded.join(', ')}</span>}{resent && <span role="status">{resent}</span>}</div>}
    {envelope.copies?.length ? <><h3>Receive a copy</h3><ul className="iw-signers">{envelope.copies.map(copy => <li key={copy.email}><span className="iw-order" aria-hidden="true">{envelope.status === 'completed' && copy.routeResult?.state !== 'skipped' ? <Check /> : '·'}</span><div><strong>{copy.name}</strong><span className="iw-signer-email">{copy.email}</span><small>{copy.routeResult?.state === 'skipped' ? 'Skipped by routing condition: no completed copy' : envelope.status !== 'completed' ? copy.includeWhen ? 'Gets the completed copy if its rule holds at completion' : 'Gets the completed copy when every recipient has finished' : `${copy.routeResult?.state === 'unresolved' ? 'Routing rule unresolved at completion · ' : copy.routeResult?.state === 'included' ? 'Included by routing condition · ' : ''}${queued(copy.email) ? 'Completed copy queued for email' : 'No copy emailed: mail was not set up'}`}</small>{copy.includeWhen && <small>{routingRuleText(copy.includeWhen, envelope.fields)}{copy.routeResult?.value !== undefined ? ` · source answer: ${displayReferencedValue(envelope.fields, copy.includeWhen.field, copy.routeResult.value)}` : ''}</small>}</div></li>)}</ul></> : null}

    <EnvelopeFollowup key={envelope.id} envelope={envelope} editable={mayEdit} refresh={refresh} />
    <InternalApprovalStatus envelope={envelope} refresh={refresh} />
    {deciding && <div className="iw-decision">
      <div className="iw-alert"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>{preparedByAgent(envelope) ? 'Prepared by the Inkwell agent.' : 'Prepared and saved.'}</strong><p>Nothing is sent until a person approves it.</p></div></div>
      <h3>Human approval</h3>
      <RoutingPreview signers={envelope.signers} fields={envelope.fields} copies={envelope.copies} />
      <p>Review the document and recipients before sending invitations. Signatures are collected in routing order; recipients who share a number sign at the same time.</p>
    </div>}
    {signingHere && <div className="iw-decision"><div className="iw-alert iw-alert-turn"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>Waiting for you.</strong><p>{ownAction} on your own request page. Opening it replaces the link you were sent.</p></div></div></div>}

    {mayEdit && paperSigner !== undefined && <div className="iw-decision iw-stack"><div className="iw-alert iw-alert-turn"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>Paper signature to review.</strong><p>{envelope.signers[paperSigner].name} signed on paper and uploaded {envelope.signers[paperSigner].paper?.pages} page(s). Accept it as their wet-ink signature, or reject it with a reason.</p></div></div><div className="iw-actions"><a className="iw-button" href={`${base}/artifacts/paper-${paperSigner}`} download>View upload</a><button className="iw-primary" disabled={action.busy} onClick={() => void action.run(async () => { await command('envelope.paper_review', { id: envelope.id, signer: paperSigner, accept: true }); await refresh() })}>Accept paper signature</button><button disabled={action.busy} onClick={() => setRejecting(value => !value)}>Reject…</button></div>{rejecting && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.paper_review', { id: envelope.id, signer: paperSigner, accept: false, reason: rejectReason }); setRejecting(false); setRejectReason(''); await refresh() }) }}><label>Reason for rejecting<textarea required minLength={3} maxLength={500} value={rejectReason} onChange={event => setRejectReason(event.target.value)} /></label><button className="iw-danger iw-fit" disabled={action.busy}>Reject upload</button></form>}</div>}
    {actor.role === 'owner' && !signingHere && (privateInvitations.length > 0 || envelope.manualInvitationAvailable) && <div className="iw-manual-invitation">
      <p>Email was not sent because mail is not set up.</p>
      {privateInvitations.map(invitation => <div key={invitation.url}>
        <div className="iw-invitation-link"><span>For {invitation.recipient}:</span><a href={invitation.url}>{invitation.url}</a><button aria-live="polite" disabled={action.busy} onClick={() => void action.run(async () => { await navigator.clipboard.writeText(invitation.url); setCopied(invitation.url) })}>{copied === invitation.url ? 'Copied' : 'Copy link'}</button></div>
        <p>Verification code: <strong>{invitation.code}</strong> · valid for 10 minutes.</p>
        <p>Share this link and code privately with the recipient. The link expires {dateTime(invitation.expiresAt)}.</p>
      </div>)}
      <p>If the link is lost or the code expires, create a new link. This replaces the previous link, code, and signing session.</p>
      {envelope.manualInvitationAvailable && turn.filter(index=>!envelope.signers[index].inPerson).map(index => <button key={index} className="iw-fit" disabled={action.busy} onClick={() => void action.run(async () => { setCopied(undefined); await saveInvitation(await command<InvitationResult>('envelope.invite', { id: envelope.id, signer: index })) })}>{action.busy ? 'Creating…' : turn.length > 1 ? `Create new signing link for ${envelope.signers[index].name}` : 'Create new signing link'}</button>)}
    </div>}

    <div className="iw-detail-records"><h3>Document</h3>
    {envelope.signers.some(s => s.values) && <section aria-label="Entered field values"><h3>Entered fields</h3><dl>{envelope.fields.flatMap(field => { const value = envelope.signers[field.signer]?.values?.[field.id]; return value ? [<div key={field.id}><dt>{field.label}</dt><dd>{displayFieldValue(field, value)}</dd></div>] : [] })}</dl></section>}
    {envelope.documents&&<section className="iw-stack" aria-label="Envelope documents"><h3>Documents</h3><ol className="iw-stack">{envelope.documents.map((d,i)=><li key={i}><strong>{d.filename}</strong><p>{d.pages} page(s) · {d.mode==='view'?'View only':d.mode==='optional'?'Optional to sign':'Required to sign'}</p><a href={`${base}/artifacts/document-${i}`} download>Original {d.filename}</a>{d.signedSha256&&<> · <a href={`${base}/artifacts/executed-${i}`} download>Executed {d.filename}</a></>}</li>)}</ol></section>}
    <div className="iw-artifacts"><button onClick={() => setShowPdf(value => !value)}>{showPdf ? 'Hide document' : 'View document and fields'}</button><a className="iw-button" href={`${base}/artifacts/original`} download>Original PDF</a>{envelope.status === 'completed' && <><a className="iw-button" href={`${base}/artifacts/signed`} download>Executed PDF</a><a className="iw-button" href={`${base}/artifacts/certificate`} download>Certificate</a><a className="iw-button" href={`${base}/artifacts/handoff`} download>Handoff manifest</a></>}{envelope.status === 'declined' && envelope.certificateSha256 && <a className="iw-button" href={`${base}/artifacts/certificate`} download>Decline certificate</a>}<a className="iw-button" href={`${base}/artifacts/audit`} download>Audit JSON</a><a className="iw-button" href={`${base}/artifacts/custody`} download>Record custody export</a></div>
    {showPdf && <PdfViewer source={`${base}/artifacts/${envelope.status === 'completed' ? 'signed' : 'original'}`} fields={envelope.status === 'completed' ? [] : envelope.fields} />}

    {envelope.status === 'completed' && mayEdit && <SendCopy documents={envelope.documents} id={envelope.id} refresh={refresh} />}
    {envelope.mayShare && <EnvelopeShares envelope={envelope} refresh={refresh} />}
    <ArtifactIntegrity envelope={envelope} base={base} />
    {envelope.messages?.length ? <details className="iw-audit-trail"><summary>Messages ({envelope.messages.length})</summary><ol className="iw-audit">{envelope.messages.map(message => <li key={message.id}><strong>{messageKinds[message.kind] ?? message.kind} to {message.recipient}</strong> <span>{message.label}</span><p>{[['Queued', message.createdAt], ['Sent', message.sentAt], ['Delivered', message.deliveredAt], ['Opened', message.openedAt], ['Bounced', message.bouncedAt], ['Failed', message.failedAt]].filter(([, at]) => at).map(([what, at]) => `${what} ${dateTime(at!)}`).join(' · ')}</p></li>)}</ol></details> : null}
    <details className="iw-audit-trail"><summary>Audit trail ({envelope.events.length})</summary><ol className="iw-audit">{envelope.events.map((event, index) => <li key={index}><strong>{event.action.replaceAll('_', ' ')}</strong> <time>{dateTime(event.at)}</time>{event.actor && <span>{event.actor}</span>}{typeof event.detail?.reason === 'string' && <p>{event.detail.reason}</p>}</li>)}</ol></details>
    {copyable && <div className="iw-quiet"><button disabled={action.busy} onClick={() => void action.run(async () => { const copy = await command<{ id: string }>('envelope.copy', { id: envelope.id }); await refresh(); onOpen(copy.id) })}>{action.busy ? 'Copying…' : 'Copy to a new envelope'}</button></div>}
    {canEdit(actor) && envelope.status !== 'imported' && <div className="iw-quiet"><button disabled={action.busy} onClick={() => void action.run(async () => { await command('template.from_envelope', { id: envelope.id }); setSavedAs(envelope.title) })}>Save as template</button>{savedAs && <p role="status" className="iw-muted">Saved as the template {savedAs}. Find it under Templates.</p>}</div>}
    {mayEdit && ['prepared', 'awaiting_signature', 'expired'].includes(envelope.status) && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setExtending(value => !value)}>Extend expiry…</button>{extending && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.extend', { id: envelope.id, days: extendDays }); setExtending(false); await refresh() }) }}><label>Extend by (days)<input type="number" required min={1} max={365} step={1} value={extendDays} onChange={event => setExtendDays(Math.round(Number(event.target.value)))} /></label><p>{envelope.status === 'expired' ? 'The envelope reopens from today with the same document, recipients and links.' : `The new expiry counts from ${dateTime(envelope.expiresAt)}. Links and signatures so far stay as they are.`}</p><button className="iw-primary iw-fit" disabled={action.busy}>Extend</button></form>}</div>}
    {mayEdit && !finished && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setVoiding(value => !value)}>Void envelope…</button>{voiding && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.void', { id: envelope.id, reason }); setVoiding(false); await refresh() }) }}><label>Reason for voiding<textarea required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><p>Recipients will no longer be able to sign this envelope.</p><button className="iw-danger iw-fit" disabled={action.busy}>Confirm void</button></form>}</div>}
    {['owner', 'admin'].includes(actor.role) && <LegalHold envelope={envelope} refresh={refresh} />}
    {actor.role === 'owner' && !envelope.legalHold && ['prepared', 'completed', 'declined', 'voided'].includes(envelope.status) && <div className="iw-quiet"><button disabled={action.busy} onClick={() => setErasing(value => !value)}>Erase archived envelope…</button>{erasing && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await request('/api/inkwell/erase', { id: envelope.id, confirmation }); await refresh(); onClose() }) }}><p>Download the full archive from the Archive tab first if you need to preserve these records. Erasure permanently removes the document and personal data. A tombstone remains to record the erasure.</p><label>Type ERASE to confirm<input required pattern="ERASE" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button className="iw-danger iw-fit" disabled={action.busy || confirmation !== 'ERASE'}>Permanently erase</button></form>}</div>}
    </div></div>
    <ErrorNotice error={action.error} />
    {deciding && <div className="iw-detail-foot">
      <label className="iw-check"><input type="checkbox" checked={eligible} onChange={event => setEligible(event.target.checked)} />I reviewed this envelope, confirm it is eligible for electronic signature, and authorize the first invitation.</label>
      <label className="iw-check"><input type="checkbox" checked={later} onChange={event => setLater(event.target.checked)} />Send later</label>
      {later && <div className="iw-two"><label>Send at<input type="datetime-local" required value={sendAt} onChange={event => setSendAt(event.target.value)} /></label><label>Time zone<select value={zone} onChange={event => setZone(event.target.value)}>{[['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'], ['America/Phoenix', 'Arizona'], ['America/Los_Angeles', 'Pacific'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>}
      {envelope.freeForm && !freeFormAllowed && <p role="status">Free-form signing is off. An owner or admin must allow it before this draft can be sent.</p>}
      <div className="iw-decision-actions"><button className="iw-primary" disabled={Boolean(envelope.freeForm && !freeFormAllowed) || !eligible || (later && !sendAt) || action.busy} onClick={() => void action.run(approve)}>{action.busy ? 'Sending…' : later ? 'Approve and schedule' : signsFirst ? 'Approve and sign now' : 'Approve and invite first recipient'}</button><button onClick={() => onEdit(envelope)}>Edit draft</button><button onClick={onClose}>Keep as is</button></div>
    </div>}
    {signingHere && <div className="iw-detail-foot"><div className="iw-decision-actions"><button className="iw-primary" disabled={action.busy} onClick={() => void action.run(async () => { const { signing } = await command<OwnSigningResult>('envelope.open_signing', { id: envelope.id }); window.location.assign(signing.url) })}>{action.busy ? 'Opening…' : ownAction}</button></div></div>}
  </section>
}
