import type { Field } from './model'
export interface StampEvidence {
  field: string
  label: string
  mediaType: 'image/png' | 'image/jpeg'
  bytes: number
  sha256: string
  supplier: { kind: 'signer upload' } | { kind: 'sender/API prefill'; source: string; readOnly: boolean }
}
export function stampEvidence(fields: Field[], values: Record<string, string>): Promise<StampEvidence[]>
