// How one envelope reads on the Envelopes screen: its pill, signer progress and next action, derived from the stored
// envelope and the signed-in person. Which status bucket it belongs to is the server's (src/inkwell/search.ts).
import { canApprove, type Actor, type Envelope } from './types'

export type Tone = 'rose' | 'amber' | 'blue' | 'mint' | 'grey'

/** ROUTE-002: a recipient's routing order; recipients sharing the lowest open order sign at the same time. */
export const routingOrder = (envelope: Envelope, index: number) => envelope.signers[index].order ?? index + 1
export function currentSigners(envelope: Envelope) { const open = envelope.signers.flatMap((signer, index) => signer.signedAt ? [] : [index]); const lowest = Math.min(...open.map(index => routingOrder(envelope, index))); return open.filter(index => routingOrder(envelope, index) === lowest) }
export const signedCount = (envelope: Envelope) => envelope.signers.filter(signer => signer.signedAt).length
export const preparedByAgent = (envelope: Envelope) => envelope.events.some(event => event.action === 'envelope.prepared' && event.actor?.startsWith('agent:'))
const myTurn = (envelope: Envelope, actor: Actor) => envelope.status === 'awaiting_signature' && currentSigners(envelope).some(index => envelope.signers[index].email.toLowerCase() === actor.email.toLowerCase())

export function pill(envelope: Envelope, actor: Actor): { label: string; tone: Tone } {
  switch (envelope.status) {
    case 'prepared': return { label: 'Needs approval', tone: 'rose' }
    case 'awaiting_signature': return myTurn(envelope, actor) ? { label: 'Waiting for you', tone: 'amber' } : signedCount(envelope) ? { label: 'In progress', tone: 'blue' } : { label: 'Waiting', tone: 'amber' }
    case 'completed': return { label: 'Completed', tone: 'mint' }
    case 'declined': return { label: 'Declined', tone: 'rose' }
    case 'expired': return { label: 'Expired', tone: 'rose' }
    case 'voided': return { label: 'Voided', tone: 'grey' }
    default: return { label: envelope.status.replaceAll('_', ' '), tone: 'grey' }
  }
}

/** The next step, with an urgent dot when it is the signed-in person's to take. */
export function nextAction(envelope: Envelope, actor: Actor): { label: string; urgent: boolean } {
  switch (envelope.status) {
    case 'prepared': return envelope.access === 'edit' ? { label: 'Approve and send', urgent: true } : { label: 'Waiting for approval', urgent: false }
    case 'awaiting_signature': return myTurn(envelope, actor) ? { label: 'Your turn to sign', urgent: true } : { label: `Waiting on ${currentSigners(envelope).map(index => envelope.signers[index].name).join(' and ') || 'the next signer'}`, urgent: false }
    case 'completed': return { label: 'Executed PDF ready', urgent: false }
    case 'declined': { const by = envelope.signers.find(signer => signer.declinedAt); return { label: `${by?.consentWithdrawn ? 'Consent withdrawn by' : 'Declined by'} ${by?.name ?? 'a signer'}`, urgent: false } }
    case 'expired': return { label: 'Prepare a new one', urgent: true }
    case 'voided': return { label: 'Voided', urgent: false }
    default: return { label: 'Imported record', urgent: false }
  }
}

/** "Company · Document" titles split into the row's two lines; other titles stay whole. */
export function titleParts(title: string) {
  const at = title.indexOf(' · ')
  return at > 0 ? { name: title.slice(0, at), detail: title.slice(at + 3) } : { name: title, detail: '' }
}
