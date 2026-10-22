/** Role actions and nominated witnesses are business custody, including their document grants and exact fields. */
export async function validRecipientRecord(e, canonical, sha256) {
 try {
  for (const [i,s] of e.signers.entries()) {
   if (s.role && !['signer','approver','form_filler','witness'].includes(s.role)) return false;
   const fields=e.fields.filter(f=>f.signer===i);
   if (s.role==='approver' && (s.signedAt||fields.length||s.values)) return false;
   if (s.role==='form_filler' && (s.signedAt||fields.some(f=>['signature','initials','stamp'].includes(f.type)))) return false;
   if (s.completedAt) {
    const event=e.events.findLast(v=>v.detail.signer===i&&v.action===(s.role==='approver'?'recipient.approved':'recipient.filled'));
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
