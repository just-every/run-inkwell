import { insist, type Actor, type Signer } from './model'
import { canSeeDocument } from './document-visibility'
import type { EnvelopeDocument } from './documents'

export function delegatedPlaces(value: unknown): number[] {
  insist(Array.isArray(value) && value.length > 0 && value.length <= 99 && value.every(p=>Number.isInteger(p) && p >= 0 && p < 100) && new Set(value).size===value.length, 'Explicitly grant one or more existing recipient places.')
  return [...value] as number[]
}
/** Authority is a sender-approved list of stable later places; it never grants account access. */
export function validateDelegationGrants(people: Signer[]) {
  for (const [i,s] of people.entries()) {
    const delegated = s.role==='specify_recipients' || s.role==='editor'
    insist(delegated === Boolean(s.delegates?.length), 'Only a recipient who names or edits needs explicit later-recipient grants.')
    for (const p of s.delegates ?? []) {
      const target=people[p]
      insist(target && p!==i && (target.order??p+1)>(s.order??i+1) && !target.group && !target.inPerson && target.witnessFor===undefined && !target.removedAt && !['specify_recipients','editor','witness'].includes(target.role??'signer'), 'Grant an existing individual recipient at a later routing order; delegation cannot delegate authority again.')
      if(s.role==='specify_recipients') insist(target.unresolvedIdentity, 'A naming agent may fill only identities the sender explicitly left open.')
    }
    if(s.unresolvedIdentity) insist(people.some((agent,k)=>agent.role==='specify_recipients' && agent.delegates?.includes(i) && (agent.order??k+1)<(s.order??i+1)), 'Every open identity needs an explicitly granted earlier naming agent.')
  }
}
export function validateActionDocuments(people:Signer[],documents?:EnvelopeDocument[]) {
  if(!documents)return
  const envelope={signers:people,documents} as import('./model').Envelope
  for(const [i,s] of people.entries()) if(s.role && ['needs_to_view','certified_delivery','editor'].includes(s.role)) insist(documents.some((_,d)=>canSeeDocument(envelope,d,i)), 'A document-opening recipient or editor must have a visible document.')
}
/** Copying a sent request resets the sender's original open places, while retaining only surviving place grants. */
export function copiedDelegation(source:import('./model').Envelope,kept:number[],place:number) {
 const s=source.signers[place],delegates=s.delegates?.filter(p=>kept.includes(p)).map(p=>kept.indexOf(p)),open=source.signers.some(agent=>agent.role==='specify_recipients'&&agent.delegates?.includes(place))
 return {...(delegates?.length?{delegates}:{}),...(open?{unresolvedIdentity:true as const,name:'',email:'',phone:undefined,sms:undefined}:s.unresolvedIdentity?{unresolvedIdentity:true as const}:{})}
}

/** Pending ct approval, only a signed-in owner/admin may create recipient-delegation authority. */
export function requireDelegationAuthority(people:Signer[],actor?:Actor) {
 if(people.some(s=>s.delegates?.length)) insist(actor && ['owner','admin'].includes(actor.role) && actor.sessionId && !actor.agentId && !actor.apiKeyId,'Only a signed-in owner or admin can grant later-recipient authority.',403)
}
