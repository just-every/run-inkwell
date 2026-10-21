/** Document definitions are fixed by the prepared/updated event; completion binds all executed fingerprints. */
export function validDocumentRecord(e,canonical) {
 if(!e.documents)return !e.events.some(event=>event.action==='envelope.prepared'&&event.detail.documents);
 const documents=e.documents,last=e.events.findLast(event=>['envelope.prepared','envelope.updated'].includes(event.action));
 const definition=documents.map(({signedSha256,...d})=>d);
 if(!last?.detail.documents||canonical(definition)!==canonical(last.detail.documents.map(({signedSha256,...d})=>d))||documents.length<1||documents.length>20||documents.reduce((n,d)=>n+d.bytes,0)>100*1024*1024)return false;
 let start=0;
 for(const d of documents){if(!['sign','optional','view'].includes(d.mode)||!Number.isSafeInteger(d.bytes)||d.bytes<=0||!Number.isSafeInteger(d.pages)||d.pages<1||d.pages>100||d.pageStart!==start||!/^[a-f0-9]{64}$/.test(d.sha256))return false;start+=d.pages;}
 if(start!==e.pageSizes.length)return false;
 for(const f of e.fields){const d=documents[f.document];if(!d||d.mode==='view'||f.documentPage!==f.page-d.pageStart||f.documentPage<0||f.documentPage>=d.pages)return false;}
 if(e.status==='completed'){
  if(documents.some(d=>!/^[a-f0-9]{64}$/.test(d.signedSha256??'')))return false;
  const complete=e.events.findLast(event=>event.action==='envelope.completed');if(canonical(documents)!==canonical(complete?.detail.documents))return false;
 }
 return true;
}
