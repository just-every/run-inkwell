// DELIV-005: a signer's current invitation link, sealed so the sender can resend the same link. AES-GCM under a key
// derived with HKDF from the installation's SESSION_SECRET, bound to the envelope and signer place; stored only in
// iw_signers.link_sealed (a secret column, never archived or exported) and cleared when the link rotates, the signer
// signs or the envelope closes. A link that cannot be opened (sealed before this existed, or under another key) is
// rotated on resend instead, and the sender is told so.
import type { Env } from './model'

const encoder = new TextEncoder()
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const bytesOf = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))
async function sealKey(env: Env) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('inkwell'), info: encoder.encode('inkwell:signing-link-seal:v1') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function sealLink(env: Env, envelopeId: string, signer: number, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`${envelopeId}:${signer}`) }, await sealKey(env), encoder.encode(token)))
  return `v1.${base64(iv)}.${base64(sealed)}`
}
/** The link's token, or undefined when it cannot be opened with this installation's key. */
export async function openLink(env: Env, envelopeId: string, signer: number, sealed: string | null) {
  const [version, iv, data] = sealed?.split('.') ?? []
  if (version !== 'v1' || !iv || !data) return undefined
  try {
    const token = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesOf(iv), additionalData: encoder.encode(`${envelopeId}:${signer}`) }, await sealKey(env), bytesOf(data)))
    return /^[a-f0-9]{64}$/.test(token) ? token : undefined
  } catch { return undefined }
}
