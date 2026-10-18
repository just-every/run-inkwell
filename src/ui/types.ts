export type Field = { id: string; signer: number; type: 'signature' | 'text' | 'date'; label: string; page: number; x: number; y: number; width: number; height: number }
export type Signer = { name: string; email: string; signedAt?: string }
export type Envelope = { manualInvitationAvailable?: boolean; id: string; title: string; status: string; createdAt: string; signers: Signer[]; fields: Field[]; originalSha256: string; signedSha256?: string; certificateSha256?: string; events: { action: string; at: string; actor?: string; detail?: Record<string, unknown> }[] }
export type Actor = { id: string; name: string; email: string; role: string }
export type Dashboard = { actor: Actor; envelopes: Envelope[]; agents?: { id: string; createdAt?: string; revokedAt?: string; label?: string }[] }
export async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const parsed: unknown = await response.json().catch(() => null)
  const payload = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined
  if (!response.ok || payload?.ok === false) {
    const detail = payload?.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : undefined
    const message = typeof payload?.error === 'string' ? payload.error : typeof detail?.message === 'string' ? detail.message : typeof payload?.message === 'string' ? payload.message : `Request failed (${response.status})`
    throw new Error(message)
  }
  return parsed as T
}
export async function command<T>(name: string, input: unknown): Promise<T> {
  const result = await request<{ result: T }>('/api/inkwell/commands', { command: name, commandId: crypto.randomUUID(), input })
  return result.result
}
export function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read the file.')); reader.readAsDataURL(file) })
}
export const dateTime = (value: string) => new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
export const canEdit = (actor: Actor) => ['owner', 'admin'].includes(actor.role)
export const canApprove = (actor: Actor) => ['owner', 'admin'].includes(actor.role)
