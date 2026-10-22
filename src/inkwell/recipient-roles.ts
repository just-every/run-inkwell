import { insist, object, text, type Field, type Signer, type WitnessNominee, type WitnessRule } from './model'

export function recipientRole(value: unknown): NonNullable<Signer['role']> {
  insist(value === undefined || ['signer', 'approver', 'form_filler'].includes(String(value)), 'Choose signer, approver or form filler.')
  return value === undefined ? 'signer' : value as NonNullable<Signer['role']>
}

export function witnessNames(value: unknown): WitnessNominee[] {
  insist(Array.isArray(value) && value.length <= 2, 'Nominate at most two witnesses.')
  const names = value.map(item => {
    const v = object(item), email = text(v.email, 'the witness email', 254).toLowerCase(), name = text(v.name, 'the witness name', 100)
    insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[\r\n\t]/.test(name), 'Give each witness a name and valid email.')
    return { name, email }
  })
  insist(new Set(names.map(n => n.email)).size === names.length, 'Each witness must use a different email.')
  return names
}

export function witnessRule(value: unknown, role: Signer['role']): WitnessRule | undefined {
  if (value === undefined) return undefined
  insist(!role || role === 'signer', 'Only a signer can have witnesses.')
  const v = object(value)
  insist([0, 1, 2].includes(Number(v.minimum)) && [1, 2].includes(Number(v.maximum)) && Number(v.minimum) <= Number(v.maximum), 'Require or allow up to two witnesses.')
  insist(v.linkOnly === undefined || typeof v.linkOnly === 'boolean', 'Choose email code or link only for witnesses.')
  insist(v.address === undefined || typeof v.address === 'boolean', 'Choose whether witnesses enter their address.')
  const named = v.named === undefined ? undefined : witnessNames(v.named)
  insist(!named || named.length <= Number(v.maximum), 'Name no more than the allowed witnesses.')
  return { minimum: Number(v.minimum) as 0 | 1 | 2, maximum: Number(v.maximum) as 1 | 2, ...(v.linkOnly ? { linkOnly: true } : {}), ...(v.address ? { address: true } : {}), ...(named?.length ? { named } : {}) }
}

export function validateRoleFields(signers: Signer[], fields: Field[]) {
  for (const [i, s] of signers.entries()) {
    const own = fields.filter(f => f.signer === i)
    if (s.role === 'approver') insist(own.length === 0, 'An approver approves without signing or filling fields.')
    if (s.role === 'form_filler') insist(own.length > 0 && own.every(f => !['signature', 'initials', 'stamp'].includes(f.type)), 'A form filler needs business fields and cannot sign or adopt a mark.')
  }
}

/** Witness places are reserved before send so nominations cannot exceed the envelope's recipient limit. */
export function validateRecipientCount(signers: Signer[], copies: number) {
  const base = signers.filter(s => !s.removedAt && s.witnessFor === undefined)
  insist(base.length + copies + base.reduce((n, s) => n + (s.witnesses?.maximum ?? 0), 0) <= 100, 'An envelope has at most 100 recipients, including copy recipients and reserved witness places.')
}
