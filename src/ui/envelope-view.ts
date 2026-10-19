// How one envelope reads on the Envelopes screen: its pill, signer progress, next action and the
// filters it belongs to, all derived from the stored envelope and the signed-in person.
import { canApprove, type Actor, type Envelope } from './types'

export type Tone = 'rose' | 'amber' | 'blue' | 'mint' | 'grey'
export type Filter = 'all' | 'me' | 'others' | 'attention' | 'completed' | 'voided'

/** ROUTE-002: a recipient's routing order; recipients sharing the lowest open order sign at the same time. */
export const routingOrder = (envelope: Envelope, index: number) => envelope.signers[index].order ?? index + 1
export function currentSigners(envelope: Envelope) { const open = envelope.signers.flatMap((signer, index) => signer.signedAt ? [] : [index]); const lowest = Math.min(...open.map(index => routingOrder(envelope, index))); return open.filter(index => routingOrder(envelope, index) === lowest) }
export const signedCount = (envelope: Envelope) => envelope.signers.filter(signer => signer.signedAt).length
export const preparedByAgent = (envelope: Envelope) => envelope.events.some(event => event.action === 'envelope.prepared' && event.actor?.startsWith('agent:'))
export const updatedAt = (envelope: Envelope) => envelope.events.reduce((latest, event) => event.at > latest ? event.at : latest, envelope.createdAt)
const myTurn = (envelope: Envelope, actor: Actor) => envelope.status === 'awaiting_signature' && currentSigners(envelope).some(index => envelope.signers[index].email.toLowerCase() === actor.email.toLowerCase())

export function needsMe(envelope: Envelope, actor: Actor) {
  return (envelope.status === 'prepared' && canApprove(actor)) || myTurn(envelope, actor)
}
export const inFlight = (envelope: Envelope) => envelope.status === 'prepared' || envelope.status === 'awaiting_signature'

export function matches(envelope: Envelope, actor: Actor, filter: Filter) {
  switch (filter) {
    case 'all': return true
    case 'me': return needsMe(envelope, actor)
    case 'others': return envelope.status === 'awaiting_signature' && !myTurn(envelope, actor)
    case 'attention': return envelope.status === 'prepared' || envelope.status === 'expired' || envelope.status === 'declined'
    case 'completed': return envelope.status === 'completed'
    case 'voided': return envelope.status === 'voided'
  }
}

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
    case 'prepared': return canApprove(actor) ? { label: 'Approve and send', urgent: true } : { label: 'Waiting for approval', urgent: false }
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
