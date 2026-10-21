// SIGNX-009: current reference-document metadata is a projection of the immutable event record.
// This same check protects live verification and archive staging.
export function validSupplementRecord(envelope, canonical) {
  const documents = new Map();
  for (const e of envelope.events) {
    if (e.action === 'envelope.prepared') for (const s of e.detail.supplements ?? []) documents.set(s.id, s);
    if (e.action === 'envelope.supplement_added') documents.set(e.detail.supplement.id, e.detail.supplement);
    if (e.action === 'envelope.supplement_removed') documents.delete(e.detail.supplementId);
  }
  const current = envelope.supplements ?? [];
  if (documents.size !== current.length || current.length > 20) return false;
  for (const s of current) {
    if (!s.id || !s.label || !s.filename || !/^[a-f0-9]{64}$/.test(s.sha256) || !Number.isInteger(s.pages) || s.pages < 1 || !Number.isInteger(s.bytes) || s.bytes < 1 || !['view', 'acknowledge'].includes(s.requirement) || canonical(s) !== canonical(documents.get(s.id))) return false;
  }
  return true;
}
