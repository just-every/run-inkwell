/** Original fingerprints, permitted scope and observed openings are bound by the native audit chain.
 * This validates server-observed PDF requests; it never asserts that a person read a document. */
export function validRecipientViewRecord(e, canonical) {
 try {
  for(const [index,s] of e.signers.entries()) {
   if(!['needs_to_view','certified_delivery'].includes(s.role)) { if(s.viewedDocuments!==undefined)return false;continue; }
   if(s.group||s.signedAt||s.values||s.adoption||s.initialsAdoption||s.paper||e.fields.some(f=>f.signer===index))return false;
   const scope=e.documents?e.documents.flatMap((d,i)=>!d.visibleTo||d.visibleTo.signers.includes(index)?[i]:[]):[0];
   if(!scope.length)return false;
   const hash=i=>e.documents?.[i]?.sha256??e.originalSha256;
   const viewed=s.viewedDocuments??[];
   if(!Array.isArray(viewed)||new Set(viewed.map(v=>v.document)).size!==viewed.length)return false;
   let epoch=-1,identity;
   e.events.forEach((event,i)=>{
    if(['envelope.prepared','envelope.updated'].includes(event.action)){epoch=i;identity=event.detail.orderedSigners?.[index];}
    if(event.detail.signer!==index)return;
    if(['signer.corrected','signer.reassigned','signer.added'].includes(event.action))identity=event.detail.after;
    if(event.action==='signer.reassigned'||event.action==='signer.corrected'&&['name','email','phone','sms'].some(k=>event.detail.before?.[k]!==event.detail.after?.[k]))epoch=i;
   });
   if(identity?.role!==s.role||identity?.email!==s.email)return false;
   if(viewed.length&&(!s.disclosure?.acceptedAt||viewed.some(v=>v.at<s.disclosure.acceptedAt)))return false;
   const events=e.events.slice(epoch+1),opens=events.filter(v=>v.action==='recipient.document_opened'&&v.detail.signer===index);
   if(opens.length!==viewed.length)return false;
   for(const entry of viewed) {
    if(!Number.isInteger(entry.document)||!scope.includes(entry.document)||entry.sha256!==hash(entry.document)||!/^\d{4}-\d\d-\d\dT/.test(entry.at)||!Number.isFinite(Date.parse(entry.at)))return false;
    const matches=opens.filter(v=>v.detail.document===entry.document&&v.detail.sha256===entry.sha256&&v.at===entry.at&&v.detail.at===entry.at&&v.detail.email===s.email&&v.detail.role===s.role&&v.detail.observation==='authenticated_pdf_open_request');
    if(matches.length!==1)return false;
   }
   const action=s.role==='certified_delivery'?'recipient.certified_delivered':'recipient.viewed';
   const completed=events.filter(v=>['recipient.viewed','recipient.certified_delivered'].includes(v.action)&&v.detail.signer===index);
   const all=scope.every(i=>viewed.some(v=>v.document===i&&v.sha256===hash(i)));
   if(Boolean(s.completedAt)!==all)return false;
   if(s.completedAt) {
    const event=completed[0];
    if(completed.length!==1||event.action!==action||event.at!==s.completedAt||event.detail.role!==s.role||event.detail.email!==s.email||event.detail.originalSha256!==e.originalSha256||event.detail.observation!=='authenticated_pdf_open_request')return false;
    const expected=scope.map(i=>viewed.find(v=>v.document===i&&v.sha256===hash(i)));
    if(canonical(event.detail.documents)!==canonical(expected)||viewed.some(v=>v.at>s.completedAt))return false;
   }else if(completed.length)return false;
  }
  return true;
 }catch{return false;}
}
