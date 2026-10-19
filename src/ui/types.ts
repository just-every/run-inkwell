export type Field = { id: string; signer: number; type: 'signature' | 'text' | 'date'; label: string; page: number; x: number; y: number; width: number; height: number }
export type Signer = { name: string; email: string; order?: number; accessCode?: boolean; signedAt?: string; declinedAt?: string; declineReason?: string; consentWithdrawn?: boolean; paper?: { status: 'pending' | 'accepted' | 'rejected'; pages: number; mediaType: string; uploadedAt: string; reason?: string } }
export type Envelope = { access?: 'view' | 'edit'; mayShare?: boolean; shares?: { operatorId: string; name: string; email: string; access: 'view' | 'edit' }[]; manualInvitationAvailable?: boolean; ownSigningAvailable?: boolean; id: string; title: string; status: string; createdAt: string; expiresAt: string; signers: Signer[]; fields: Field[]; originalSha256: string; signedSha256?: string; certificateSha256?: string; copiedFrom?: string; reminders?: { afterDays: number; everyDays: number }; copies?: { name: string; email: string }[]; events: { action: string; at: string; actor?: string; detail?: Record<string, unknown> }[] }
export type Actor = { id: string; name: string; email: string; role: string }
export type Person = { id: string; name: string; email: string; role: string }
/** MANAGE-001: the dashboard's status buckets and one page of the server's envelope search. */
export const buckets = ['draft', 'waiting_for_me', 'waiting_for_others', 'completed', 'declined', 'voided', 'expired', 'imported'] as const
export type Bucket = typeof buckets[number]
export type Page = { envelopes: (Envelope & { bucket: Bucket })[]; counts: Record<Bucket, number>; total: number; next: string | null }
export type Workspace = { actor: Actor; people?: Person[]; settings?: { completedCopies: 'link' | 'attachment' }; agents?: { id: string; createdAt?: string; revokedAt?: string; label?: string }[] }
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
// US dates in the viewer's own time zone: "Thu Oct 15" in lists, "Thu Oct 15, 3:12 pm" beside an action, with the year
// only when it is not this year.
const parts = (value: string | Date, options: Intl.DateTimeFormatOptions) => Object.fromEntries(new Intl.DateTimeFormat('en-US', options).formatToParts(new Date(value)).map(part => [part.type, part.value]))
export function shortDay(value: string) {
  const day = parts(value, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return `${day.weekday} ${day.month} ${day.day}${day.year === String(new Date().getFullYear()) ? '' : `, ${day.year}`}`
}
export const clockTime = (value: string | Date) => { const time = parts(value, { hour: 'numeric', minute: '2-digit' }); return `${time.hour}:${time.minute} ${time.dayPeriod.toLowerCase()}` }
export const dateTime = (value: string) => `${shortDay(value)}, ${clockTime(value)}`
// ACCESS-001: senders act on their own envelopes, the only ones they are shown; viewers only read.
export const canEdit = (actor: Actor) => ['owner', 'admin', 'sender'].includes(actor.role)
export const canApprove = (actor: Actor) => ['owner', 'admin', 'sender'].includes(actor.role)
