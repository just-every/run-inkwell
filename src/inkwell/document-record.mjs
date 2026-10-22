/** Document definitions are fixed by the prepared/updated event; completion binds all executed fingerprints. */
export function validDocumentRecord(e,canonical) {
 if(!e.documents)return !e.events.some(event=>event.action==='envelope.prepared'&&event.detail.documents);
 const documents=e.documents,last=e.events.findLast(event=>['envelope.prepared','envelope.updated'].includes(event.action));
 let expected=last?.detail.documents;
 for(const event of e.events.filter(event=>event.action==='document.audience_updated'&&e.events.indexOf(event)>e.events.indexOf(last))){
  if(canonical(expected?.map(({signedSha256,...d})=>d))!==canonical(event.detail.before?.map(({signedSha256,...d})=>d)))return false;
  if(canonical(expected?.map(({visibleTo,signedSha256,...d})=>d))!==canonical(event.detail.after?.map(({visibleTo,signedSha256,...d})=>d)))return false;
  if(expected?.some((d,i)=>canonical(d.visibleTo?.signers??e.signers.map((_,n)=>n))!==canonical(event.detail.after?.[i]?.visibleTo?.signers??e.signers.map((_,n)=>n))))return false;
  expected=event.detail.after;
 }
 const definition=documents.map(({signedSha256,...d})=>d);
 if(!last?.detail.documents||canonical(definition)!==canonical(expected.map(({signedSha256,...d})=>d))||documents.length<1||documents.length>20||documents.reduce((n,d)=>n+d.bytes,0)>100*1024*1024)return false;
 let start=0;
 for(const d of documents){if(d.visibleTo&&(!['signers','copies'].every(k=>Array.isArray(d.visibleTo[k])&&new Set(d.visibleTo[k]).size===d.visibleTo[k].length&&d.visibleTo[k].every(n=>Number.isInteger(n)&&n>=0&&n<(k==='signers'?e.signers.length:(e.copies??[]).length)))))return false;if(!['sign','optional','view'].includes(d.mode)||!Number.isSafeInteger(d.bytes)||d.bytes<=0||!Number.isSafeInteger(d.pages)||d.pages<1||d.pages>100||d.pageStart!==start||!/^[a-f0-9]{64}$/.test(d.sha256))return false;start+=d.pages;}
 if(start!==e.pageSizes.length)return false;
 for(const f of e.fields){const d=documents[f.document];if(!d||d.mode==='view'||(d.visibleTo&&!(e.signers[f.signer]?.witnessFor===undefined?d.visibleTo.signers.includes(f.signer):e.signers[f.signer].witnessDocuments?.includes(f.document)))||f.documentPage!==f.page-d.pageStart||f.documentPage<0||f.documentPage>=d.pages)return false;}
 if(e.status==='completed'){
  if(documents.some(d=>!/^[a-f0-9]{64}$/.test(d.signedSha256??'')))return false;
  const complete=e.events.findLast(event=>event.action==='envelope.completed');if(canonical(documents.map(({visibleTo,...d})=>d))!==canonical(complete?.detail.documents?.map(({visibleTo,...d})=>d)))return false;
 }
 return true;
}
