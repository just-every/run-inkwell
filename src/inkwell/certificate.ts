import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { routingOrder, type AuditEvent, type Envelope } from './model'
import { encodable } from './pdf'
import { localStamp } from './zone'
import { adoptionOf, describeAdoption } from './marks'

/** RECORD-002: the certificate of completion (or of a decline or withdrawal). For every recipient it lists their routing
 * order, each authentication with its method, result, IP address and user agent, any access code, the disclosure they
 * accepted, the signature they adopted and how, and their signing or decline with its IP address and user agent; for
 * the envelope, every document's fingerprint and the full hash-chained audit trail. Every timestamp is shown in UTC
 * and in the account's US time zone. An IP address shows as "not recorded" when the request carried none. */
export async function certificatePdf(envelope: Envelope) {
  const declined = envelope.signers.find(s => s.declinedAt), withdrawn = declined?.consentWithdrawn
  const disclosures = [...new Map(envelope.signers.flatMap(s => s.disclosure ? [[s.disclosure.version, s.disclosure.sha256]] : [])).entries()]
  const lines = [
    withdrawn ? 'Inkwell consent withdrawal certificate' : declined ? 'Inkwell decline certificate' : 'Inkwell completion certificate',
    envelope.title, `Envelope: ${envelope.id}`, ...(envelope.copiedFrom ? [`Copied from envelope: ${envelope.copiedFrom}`] : []),
    `Original SHA-256: ${envelope.originalSha256}`,
    ...disclosures.map(([version, hash]) => `Electronic record and signature disclosure: version ${version} (SHA-256 ${hash})`),
    ...(declined ? [
      `${withdrawn ? 'Consent withdrawn' : 'Declined'}: ${stamp(declined.declinedAt!)} by ${declined.name} <${declined.email}>`,
      `${withdrawn ? 'Withdrawal' : 'Decline'} reason: ${declined.declineReason}`,
      `No executed PDF exists: the envelope stopped at the ${withdrawn ? 'withdrawal' : 'decline'} and no later signer was invited.`,
    ] : [`Signed SHA-256: ${envelope.signedSha256}`, `Completed: ${stamp(envelope.signers.map(s => s.signedAt!).sort().at(-1)!)}`]),
    'Evidence: each signer\'s authentication below, routing order and explicit signing consent.',
    'This certificate records the application audit trail; it is not a digital seal.', '',
    ...envelope.signers.flatMap((s, i) => [
      `Signer ${i + 1}: ${s.name} <${s.email}>`, `Routing order: ${routingOrder(envelope, i)}`,
      ...authLines(envelope, i), ...(s.accessCode ? [accessLine(envelope, i)] : []),
      ...(s.disclosure ? [`Disclosure ${s.disclosure.version} accepted at: ${stamp(s.disclosure.acceptedAt)}`] : []),
      ...adoptionLines(envelope, i),
      ...(s.paper?.status === 'accepted' ? [`Scan SHA-256: ${s.paper.sha256}`, `Scan: ${s.paper.pages} page(s) appended to the executed PDF; accepted at ${stamp(s.paper.reviewedAt!)}`] : []),
      s.signedAt ? `Signed at: ${stamp(s.signedAt)}${network(envelope, i, ['signer.signed', 'signer.paper_uploaded'])}`
        : s.declinedAt ? `${s.consentWithdrawn ? 'Consent withdrawn' : 'Declined'} at: ${stamp(s.declinedAt)} · Reason: ${s.declineReason}${network(envelope, i, ['signer.declined', 'signer.consent_withdrawn'])}`
        : routingOrder(envelope, i) === routingOrder(envelope, envelope.signers.indexOf(declined!)) ? `Not signed: invited, but the envelope stopped at the ${withdrawn ? 'withdrawal' : 'decline'}`
        : `Not signed: never invited after the ${withdrawn ? 'withdrawal' : 'decline'}`,
      '',
    ]),
    ...envelope.events.flatMap(e => [`${stamp(e.at)} ${e.action}`, `Actor: ${e.actor}`, `Event hash: ${e.hash}`]),
  ]
  const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica)
  let page = document.addPage([595, 842]), y = 790
  for (const line of lines) {
    encodable(font, line)
    for (const part of wrap(line)) { if (y < 50) { page = document.addPage([595, 842]); y = 790 }; page.drawText(part, { x: 40, y, size: 9, font, color: rgb(.08, .12, .2) }); y -= 15 }
  }
  return document.save()
}

/** Lines of at most `width` characters, broken between words; only a word longer than a line is cut. */
function wrap(line: string, width = 90) {
  const out: string[] = []
  let current = ''
  for (const word of line.split(' ')) {
    if (current && current.length + 1 + word.length <= width) { current += ' ' + word; continue }
    if (current) out.push(current)
    current = word
    while (current.length > width) { out.push(current.slice(0, width)); current = current.slice(width) }
  }
  out.push(current)
  return out
}
const stamp = (at: string) => `${at} UTC (${localStamp(at)})`
const forSigner = (envelope: Envelope, signer: number, actions: string[]) => envelope.events.filter(e => actions.includes(e.action) && e.detail.signer === signer)
const client = (event: AuditEvent | undefined) => ` · IP ${(event?.detail.ip as string) || 'not recorded'} · User agent: ${(event?.detail.userAgent as string) || 'not recorded'}`
const network = (envelope: Envelope, signer: number, actions: string[]) => client(forSigner(envelope, signer, actions).at(-1))
/** Each signing session's authentication: an emailed code, a sender-provided code, or the member's own Inkwell session
 * (MANAGE-003), with how many incorrect codes came before it. */
function authLines(envelope: Envelope, signer: number) {
  const rejected = forSigner(envelope, signer, ['signer.code_rejected']).length
  return forSigner(envelope, signer, ['signer.email_verified', 'signer.code_verified', 'signer.session_verified']).map(e => `Authenticated at ${stamp(e.at)}: ${e.action === 'signer.session_verified' ? `signed-in Inkwell session of member ${e.detail.operator}${e.detail.signIn ? ` (signed in by ${e.detail.signIn})` : ''}` : e.action === 'signer.code_verified' ? 'sender-provided verification code' : 'emailed verification code'}, verified${rejected && e.action !== 'signer.session_verified' ? ` (${rejected} incorrect code${rejected === 1 ? '' : 's'} on record)` : ''}${client(e)}`)
}
function accessLine(envelope: Envelope, signer: number) {
  const at = forSigner(envelope, signer, ['signer.access_code_verified'])[0]?.at, rejected = forSigner(envelope, signer, ['signer.access_code_rejected']).length
  return `${at ? `Access code: entered at ${stamp(at)}` : 'Access code: required, never entered'}${rejected ? ` (${rejected} incorrect)` : ''}`
}
/** SIGNX-002: the adopted signature and how it was made: a typed name in its style, a drawn or uploaded image with its
 * fingerprint, a member's saved mark reused (ROUTE-009), or wet ink on paper (SIGNX-008). */
function adoptionLines(envelope: Envelope, signer: number) {
  const s = envelope.signers[signer]
  if (s.paper?.status === 'accepted') return ['Signed on paper (wet ink)', 'Adopted signature: handwritten on the paper scan']
  const signed = forSigner(envelope, signer, ['signer.signed']).at(-1), saved = signed?.detail.saved === true || signed?.detail.adoption === 'saved' ? signed!.detail.operator as string : undefined
  return envelope.fields.filter(f => f.signer === signer && f.type === 'signature' && s.values?.[f.id]).map(f => `Adopted signature (${f.label}): "${s.values![f.id]}", ${describeAdoption(adoptionOf(envelope, signer), saved)}`)
}
