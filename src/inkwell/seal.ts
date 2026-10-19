// Secrets the installation keeps but never archives or exports: AES-GCM under a key derived with HKDF from its
// SESSION_SECRET, one key per purpose, each sealed value bound to where it is kept (`bound`). DELIV-005 seals signing
// links with it; DELIV-008 seals members' webhook URLs.
import type { Env } from './model'

const encoder = new TextEncoder()
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const bytesOf = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))
async function sealKey(env: Env, purpose: string) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('inkwell'), info: encoder.encode(`inkwell:${purpose}:v1`) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function seal(env: Env, purpose: string, bound: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(bound) }, await sealKey(env, purpose), encoder.encode(value)))
  return `v1.${base64(iv)}.${base64(sealed)}`
}
/** The value, or undefined when it cannot be opened with this installation's key. */
export async function unseal(env: Env, purpose: string, bound: string, sealed: string | null) {
  const [version, iv, data] = sealed?.split('.') ?? []
  if (version !== 'v1' || !iv || !data) return undefined
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesOf(iv), additionalData: encoder.encode(bound) }, await sealKey(env, purpose), bytesOf(data))) } catch { return undefined }
}
