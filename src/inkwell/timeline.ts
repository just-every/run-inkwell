// MANAGE-005: each recipient's place in routing, their timeline and what they are waiting on, for the envelope detail
// page. Every step comes from a recorded fact: sent, delivered and bounced from the invitation's message status
// (DELIV-001), viewed from the first opening of the document after verification, authenticated from the first
// verification, signed from the audit trail's signature event, declined from the signer record. Times are ISO instants; the page shows each in the account's
// time zone and in UTC.
import { currentSigners, identityEvents, routingOrder, type Envelope, type Env } from './model'
import { envelopeMessages, type Message } from './delivery'
import { accountTimeZone } from './zone'
import { bouncedRecipients } from './bounces'

export type Step = 'recipients named' | 'recipient edits completed' | 'certified delivery opened' | 'documents opened' | 'sent' | 'delivered' | 'viewed' | 'authenticated' | 'signed' | 'approved' | 'filled' | 'declined' | 'bounced' | 'added' | 'corrected' | 'removed' | 'reassigned'
export type Place = 'signed' | 'declined' | 'current' | 'waiting' | 'stopped' | 'removed'
export interface RecipientTimeline { signer: number; order: number; place: Place; waitingOn: string | null; bounced?: boolean; steps: { step: Step; at: string; detail?: string }[] }

const verifications: Record<string, string> = { 'signer.provider_verified': 'provider verification', 'signer.sms_verified': 'SMS one-time code', 'signer.in_person_hosted': 'identity attested in person by the host, not verified by Inkwell', 'signer.email_verified': 'emailed code', 'signer.code_verified': 'sender-provided code', 'signer.session_verified': 'signed-in session', 'signer.link_opened': 'link only, no code' }

export async function envelopeTimeline(env: Env, envelope: Envelope) {
  const messages = await envelopeMessages(env, envelope.id)
  return { timeZone: accountTimeZone, messages, recipients: envelope.signers.map((_, signer) => recipientTimeline(envelope, messages, signer)) }
}

function recipientTimeline(envelope: Envelope, messages: Message[], signer: number): RecipientTimeline {
  // DELIV-006: after a correction of their name or email, the recipient's evidence and invitations are the new person's.
  const recipient = envelope.signers[signer], theirs = identityEvents(envelope, signer), mine = (action: string) => theirs.filter(e => e.action === action && e.detail.signer === signer)
  const invitations = messages.filter(m => m.kind === 'invitation' && m.signer === signer && (recipient.group ? recipient.group.members.some(g => g.email === m.recipient.toLowerCase()) : m.recipient.toLowerCase() === recipient.email))
  const steps: RecipientTimeline['steps'] = []
  const sent = invitations.find(m => m.sentAt), manual = mine('invitation.manual_issued')[0]
  if (sent) steps.push({ step: 'sent', at: sent.sentAt!, detail: sent.label })
  else if (manual) steps.push({ step: 'sent', at: manual.at, detail: 'Private link created by the owner; no email' })
  const delivered = invitations.filter(m => m.deliveredAt).map(m => m.deliveredAt!).sort()[0]
  if (delivered) steps.push({ step: 'delivered', at: delivered })
  const bounced = invitations.filter(m => m.bouncedAt).map(m => m.bouncedAt!).sort().at(-1)
  if (bounced) steps.push({ step: 'bounced', at: bounced })
  const viewed = mine('signer.viewed')[0]
  if (viewed) steps.push({ step: 'viewed', at: viewed.at })
  const verified = theirs.find(e => e.action in verifications && e.detail.signer === signer)
  if (verified) steps.push({ step: 'authenticated', at: verified.at, detail: (verified.action==='signer.provider_verified'?`${verified.detail.method==='identity'?'Stripe Identity ID and selfie, name matched':verified.detail.method==='knowledge'?'Authenticate knowledge questions':'Twilio voice-call code'}, verified; reference ${verified.detail.reference}`:verifications[verified.action])+(verified.action==='signer.sms_verified'?` to ${verified.detail.maskedPhone}`:'') })
  // The audit trail's time for the signature (the signer record's own time can differ by a millisecond).
  const signed = envelope.events.find(e => ['signer.signed', 'signer.signed_on_paper'].includes(e.action) && e.detail.signer === signer)
  if (recipient.signedAt) steps.push({ step: 'signed', at: signed?.at ?? recipient.signedAt, ...(recipient.paper?.status === 'accepted' ? { detail: 'On paper' } : {}) })
  if(recipient.completedAt)steps.push({step:recipient.role==='approver'?'approved':recipient.role==='form_filler'?'filled':recipient.role==='specify_recipients'?'recipients named':recipient.role==='editor'?'recipient edits completed':recipient.role==='certified_delivery'?'certified delivery opened':'documents opened',at:recipient.completedAt})
  if (recipient.declinedAt) steps.push({ step: 'declined', at: recipient.declinedAt, detail: recipient.declineReason })
  // DELIV-006: each correction of this place, with what changed.
  for (const e of envelope.events.filter(e => ['signer.added', 'signer.corrected', 'signer.removed'].includes(e.action) && e.detail.signer === signer)) {
    const was = e.detail.before as Record<string, unknown> | undefined, now = e.detail.after as Record<string, unknown> | undefined
    const changed = was && now ? Object.keys({ ...was, ...now }).filter(key => String(was[key] ?? '') !== String(now[key] ?? '')).map(key => key === 'message' ? 'private message changed' : `${key} ${was[key] ?? '—'} → ${now[key] ?? '—'}`).join('; ') : undefined
    steps.push({ step: e.action === 'signer.added' ? 'added' : e.action === 'signer.removed' ? 'removed' : 'corrected', at: e.at, ...(changed ? { detail: changed } : {}) })
  }
  // ROUTE-006: a reassignment shows both people and the reason.
  for (const e of envelope.events.filter(e => e.action === 'signer.reassigned' && e.detail.signer === signer)) {
    const from = e.detail.before as { name: string; email: string }, to = e.detail.after as { name: string; email: string }
    steps.push({ step: 'reassigned', at: e.at, detail: `${from.name} <${from.email}> to ${to.name} <${to.email}>: ${e.detail.reason}` })
  }
  steps.sort((a, b) => a.at.localeCompare(b.at))
  const order = routingOrder(envelope, signer), base = { signer, order, steps }
  if (recipient.routeResult?.state === 'skipped') return { ...base, place: 'stopped', waitingOn: null }
  if (recipient.routeResult?.state === 'unresolved') return { ...base, place: 'waiting', waitingOn: 'The sender to correct an unresolved routing condition' }
  if (recipient.removedAt) return { ...base, place: 'removed', waitingOn: null }
  if(recipient.witnessReturnRequired)return {...base,place:'current',waitingOn:'The signer to nominate a replacement witness'}
  if (recipient.signedAt||recipient.completedAt) return { ...base, place: 'signed', waitingOn: null }
  if (recipient.declinedAt) return { ...base, place: 'declined', waitingOn: null }
  if (envelope.status === 'prepared') return { ...base, place: 'waiting', waitingOn: envelope.scheduled ? `The scheduled send at ${envelope.scheduled.local} (${envelope.scheduled.timeZone})` : 'The sender’s approval' }
  if (envelope.status !== 'awaiting_signature' || envelope.imported || Date.parse(envelope.expiresAt) <= Date.now()) return { ...base, place: 'stopped', waitingOn: null }
  const current = currentSigners(envelope)
  if (!current.length) return { ...base, place: 'waiting', waitingOn: 'The sender to correct an unresolved routing condition' }
  if (!current.includes(signer)) return { ...base, place: 'waiting', waitingOn: `Routing order ${routingOrder(envelope, current[0])} to finish: ${current.map(i => envelope.signers[i].name).join(', ')}` }
  if (bouncedRecipients(envelope, messages).some(entry => entry.signer === signer)) return { ...base, place: 'current', bounced: true, waitingOn: 'The sender to correct the email address: the invitation bounced' }
  const waitingOn = recipient.paper?.status === 'pending' ? 'The sender to review the uploaded paper signature'
    : !verified && recipient.inPerson ? 'A host to confirm their identity in person' : !verified ? (manual && !sent ? 'The recipient to open the private link and enter the code' : recipient.sms ? 'The recipient to open the invitation and verify their mobile number' : 'The recipient to open the invitation and verify their email')
    : !recipient.disclosure ? 'The recipient to agree to electronic records' : recipient.role==='approver'?'The recipient to approve':recipient.role==='form_filler'?'The recipient to complete their fields':recipient.role==='specify_recipients'?'The agent to name later recipients':recipient.role==='editor'?'The editor to finish later recipient edits':['needs_to_view','certified_delivery'].includes(recipient.role??'')?'The recipient to open all visible documents':'The recipient to sign'
  return { ...base, place: 'current', waitingOn }
}
