/** ADMIN-004: allowed adoption methods are authenticated in the saved sending definition. */
export function validDefaultRecord(envelope, canonical) {
  const definition = envelope.events.findLast(event => ['envelope.prepared','envelope.updated'].includes(event.action))
  if (envelope.adoptionMethods === undefined) return definition?.detail.adoptionMethods === undefined
  const methods = envelope.adoptionMethods
  return Array.isArray(methods) && methods.length > 0 && methods.length <= 3 && new Set(methods).size === methods.length
    && methods.every(method => ['typed','drawn','uploaded'].includes(method))
    && canonical(definition?.detail.adoptionMethods) === canonical(methods)
    && envelope.signers.every(signer => (!signer.adoption || methods.includes(signer.adoption.method)) && (!signer.initialsAdoption || methods.includes(signer.initialsAdoption.method)))
}
