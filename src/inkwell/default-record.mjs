/** ADMIN-004: allowed adoption methods are authenticated in the saved sending definition. */
export function validDefaultRecord(envelope, canonical) {
  const authority = envelope.events.findLast(event => ['envelope.prepared','envelope.updated','envelope.approved','envelope.internal_approval_requested'].includes(event.action))
  if(canonical(envelope.sendOrigin ?? null)!==canonical(authority?.detail.sendOrigin ?? null))return false
  const prepared=envelope.events.find(event=>event.action==='envelope.prepared')
  if(canonical(envelope.testMode??null)!==canonical(prepared?.detail.testMode??null)||canonical(envelope.bulkBatch??null)!==canonical(prepared?.detail.bulkBatch??null))return false
  if(canonical(envelope.formSubmission??null)!==canonical(prepared?.detail.formSubmission??null))return false
  const definition = envelope.events.findLast(event => ['envelope.prepared','envelope.updated'].includes(event.action))
  if (canonical(envelope.consumerDisclosure ?? null) !== canonical(definition?.detail.consumerDisclosure ?? null)) return false
  if (envelope.consumerDisclosure && (!Number.isSafeInteger(envelope.consumerDisclosure.version) || envelope.consumerDisclosure.version < 1 || typeof envelope.consumerDisclosure.text !== 'string' || !envelope.consumerDisclosure.text.trim() || envelope.consumerDisclosure.text.length > 4000 || typeof envelope.consumerDisclosure.actor !== 'string' || !Number.isFinite(Date.parse(envelope.consumerDisclosure.at)))) return false
  if (envelope.adoptionMethods === undefined) return definition?.detail.adoptionMethods === undefined
  const methods = envelope.adoptionMethods
  return Array.isArray(methods) && methods.length > 0 && methods.length <= 3 && new Set(methods).size === methods.length
    && methods.every(method => ['typed','drawn','uploaded'].includes(method))
    && canonical(definition?.detail.adoptionMethods) === canonical(methods)
    && envelope.signers.every(signer => (!signer.adoption || methods.includes(signer.adoption.method)) && (!signer.initialsAdoption || methods.includes(signer.initialsAdoption.method)))
}
