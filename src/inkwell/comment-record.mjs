/** A correction that changes identity ends the previous person's audience, even if an email is later reused. */
export function commentEpoch(envelope, signer) {
 return envelope.events.findLast(e => e.detail.signer === signer && (e.action === 'signer.reassigned' || e.action === 'signer.corrected' && ['name','email'].some(k => e.detail.before?.[k] !== e.detail.after?.[k])))?.hash ?? 'original';
}
/** Transcript content is checksum-bound by opaque audit metadata, never copied into an event. */
export async function validCommentRecords(envelope, rows, canonical, sha256) {
 const expected = new Map();
 for (const e of envelope.events) if (e.action.startsWith('comment.')) expected.set(e.detail.thread, e.detail.transcriptSha256);
 if (rows.length !== expected.size) return false;
 for (const row of rows) {
  try {
   const thread = JSON.parse(row.data);
   if (thread.id !== row.id || thread.envelopeId !== envelope.id || !expected.has(row.id) || await sha256(canonical(thread)) !== expected.get(row.id)) return false;
   if (!Number.isInteger(thread.page) || thread.page < 0 || thread.page >= envelope.pageSizes.length || thread.document !== (envelope.documents?.findIndex(d=>thread.page>=d.pageStart&&thread.page<d.pageStart+d.pages)??0) || !thread.audience?.length || !thread.messages?.length) return false;
  } catch { return false; }
 }
 return true;
}
