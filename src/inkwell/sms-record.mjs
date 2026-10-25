/** Phone/method custody follows the same hash-chained prepared/update/correction/reassignment events as email. */
export function validSmsRecord(e) {
  try {
    const mobile = (s) => ({ phone:s.phone ?? null, sms:s.sms === true, providerAuth:s.providerAuth ?? null })
    for (const [index, s] of e.signers.entries()) {
      if (s.phone !== undefined && !/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(s.phone)) return false
      if (s.providerAuth && (!['identity','voice','knowledge'].includes(s.providerAuth) || s.sms || s.linkOnly || s.inPerson || s.group || s.unresolvedIdentity || s.providerAuth==='voice'&&!s.phone)) return false
      if (s.sms !== undefined && typeof s.sms !== 'boolean') return false
      if (s.sms && (!s.phone || s.linkOnly || s.inPerson || s.group)) return false
      let expected
      for (const event of e.events) {
        if (event.action === 'envelope.prepared' || event.action === 'envelope.updated') expected = (event.detail.orderedSigners)?.[index]
        if (event.detail.signer === index && ['signer.corrected','signer.reassigned','signer.added'].includes(event.action)) {
          if (event.detail.before && expected && JSON.stringify(mobile(expected)) !== JSON.stringify(mobile(event.detail.before))) return false
          expected = event.detail.after
        }
      }
      if (s.phone || s.sms || s.providerAuth || expected?.phone || expected?.sms || expected?.providerAuth) {
        if (!expected || JSON.stringify(mobile(expected)) !== JSON.stringify(mobile(s))) return false
      }
    }
    return true
  } catch { return false }
}
