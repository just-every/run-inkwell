// DELIV-005: a signer's current invitation link, sealed so the sender can resend the same link. AES-GCM under a key
// derived with HKDF from the installation's SESSION_SECRET, bound to the envelope and signer place; stored only in
// iw_signers.link_sealed (a secret column, never archived or exported) and cleared when the link rotates, the signer
// signs or the envelope closes. A link that cannot be opened (sealed before this existed, or under another key) is
// rotated on resend instead, and the sender is told so.
import type { Env } from './model'
import { seal, unseal } from './seal'

export const sealLink = (env: Env, envelopeId: string, signer: number, token: string) => seal(env, 'signing-link-seal', `${envelopeId}:${signer}`, token)
/** The link's token, or undefined when it cannot be opened with this installation's key. */
export async function openLink(env: Env, envelopeId: string, signer: number, sealed: string | null) {
  const token = await unseal(env, 'signing-link-seal', `${envelopeId}:${signer}`, sealed)
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined
}
