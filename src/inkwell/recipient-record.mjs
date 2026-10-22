import {validDelegationRecord} from './delegation-record.mjs';
import {validRecipientViewRecord} from './recipient-view-record.mjs';
/** Role actions and nominated witnesses are business custody, including their document grants and exact fields. */
export async function validRecipientRecord(e, canonical, sha256) {
 try {
  if(!validRecipientViewRecord(e,canonical)||!validDelegationRecord(e,canonical))return false;
  for (const [i,s] of e.signers.entries()) {
   if (s.role && !['signer','approver','form_filler','witness','specify_recipients','editor','needs_to_view','certified_delivery'].includes(s.role)) return false;
   const fields=e.fields.filter(f=>f.signer===i);
   if(s.role && !['signer','witness','form_filler'].includes(s.role) && (s.signedAt||fields.length||s.values||s.adoption||s.paper))return false;
   if(s.unresolvedIdentity && (s.name||s.email||s.signedAt||s.completedAt))return false;
   if (s.role==='approver' && (s.signedAt||fields.length||s.values)) return false;
   if (s.role==='form_filler' && (s.signedAt||fields.some(f=>['signature','initials','stamp'].includes(f.type)))) return false;
   if (s.completedAt && !['needs_to_view','certified_delivery'].includes(s.role)) {
    const event=e.events.findLast(v=>v.detail.signer===i&&v.action===({approver:'recipient.approved',form_filler:'recipient.filled',specify_recipients:'recipient.specified',editor:'recipient.edited'}[s.role]));
    if(!event||event.at!==s.completedAt||event.detail.consent!==true||event.detail.role!==s.role||event.detail.email!==s.email) return false;
    if(s.role==='form_filler'&&event.detail.valuesSha256!==await sha256(canonical(s.values)))return false;
   }
   if(s.witnessFor===undefined) {if(s.role==='witness')return false;continue;}
   const parent=e.signers[s.witnessFor],activation=e.events.find(v=>v.action==='witness.activated'&&v.detail.witness===i&&v.detail.signer===s.witnessFor);
   if(s.role!=='witness'||!parent?.signedAt||!parent.witnesses||!activation)return false;
   const definition=({name,email,role,witnessFor,witnessDocuments,order,linkOnly,includeWhen,routeResult})=>({name,email,role,witnessFor,witnessDocuments,order,linkOnly,includeWhen,routeResult});
   if(canonical(definition(s))!==canonical(definition(activation.detail.recipient)))return false;
   const signedDocs=e.documents?.flatMap((d,k)=>(!d.visibleTo||d.visibleTo.signers.includes(s.witnessFor))&&(parent.paper?.status==='accepted'?d.mode!=='view':e.fields.some(f=>f.signer===s.witnessFor&&f.document===k&&f.type==='signature'&&parent.values?.[f.id]))?[k]:[]);
   if(canonical(s.witnessDocuments)!==canonical(signedDocs))return false;
   if(s.removedAt) {if(fields.length||!s.declinedAt||!e.events.some(v=>v.action==='witness.declined'&&v.detail.witness===i&&v.at===s.declinedAt))return false;}
   else if(!e.freeForm&&canonical(fields)!==canonical(activation.detail.fields))return false;
  }
  return true;
 }catch{return false;}
}
