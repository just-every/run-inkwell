import type { Envelope } from './model'
export function validDelegationRecord(envelope: Envelope, canonical: (value: unknown) => string): boolean
