export type { Field } from '../inkwell/model'
import type { RoutingRule, RoutingResult } from '../inkwell/model'
import type { Field } from '../inkwell/model'
/** ROUTE-005: a group recipient's snapshot and the member who signed or declined for it. */
export type SigningGroup = { id: string; name: string; members: { name: string; email: string }[] }
export type Signer = { visibleDocuments?: number[]; group?: SigningGroup & { signedBy?: number; declinedBy?: number }; values?: Record<string,string>; includeWhen?: RoutingRule; routeResult?: RoutingResult; activatedAt?: string; message?: string; name: string; email: string; order?: number; accessCode?: boolean; linkOnly?: boolean; inPerson?: boolean; signedAt?: string; declinedAt?: string; declineReason?: string; consentWithdrawn?: boolean; removedAt?: string; paper?: { status: 'pending' | 'accepted' | 'rejected'; pages: number; mediaType: string; uploadedAt: string; reason?: string } }
/** ROUTE-004: an internal approval rule and a draft's request (src/inkwell/internal-approval.ts). */
export type ApprovalRule = { approver: string; name?: string; email?: string; threshold?: { field: string; above: string }; updatedAt?: string; updatedBy?: string }
export type InternalApproval = { state: 'pending' | 'rejected' | 'approved'; requestedAt: string; requestedBy: { id: string; name: string; email: string }; steps: { approver: string; name: string; email: string; rules: string[]; why: string[]; decision?: 'approved' | 'rejected'; decidedAt?: string; reason?: string; bySender?: boolean }[] }
export type FreeFormPolicy = { enabled: boolean; version: number; actor: string | null; at: string | null }
/** ADMIN-004: one source's current send policy version and every saved version (src/inkwell/send-policies.ts). */
export type SendPolicy = { source: 'ad_hoc' | 'template' | 'bulk' | 'web_form' | 'api'; mode: 'off' | 'person' | 'autonomous'; templates: string[] | null; requireInternalApproval: boolean; deferredRelease: boolean; version: number; actor: string | null; at: string | null; reason: string | null }
export type SendPolicyVersion = SendPolicy & { before: Pick<SendPolicy, 'mode' | 'templates' | 'requireInternalApproval' | 'deferredRelease' | 'version'> }
export type FreeFormChange = { actor: string; at: string; before: boolean; after: boolean; version: number }
export type Envelope = { part11?: { actor: string; at: string }; documents?: import('../inkwell/documents').EnvelopeDocument[]; freeForm?: boolean; freeFormSetting?: { version: number; actor: string; at: string }; sendHold?: { at: string }; supplements?: import('../inkwell/model').Supplement[]; approvalRule?: ApprovalRule; internalApproval?: InternalApproval; approvalAvailable?: boolean; legalHold?: { reason: string; by: string; at: string }; scheduled?: { at: string; local: string; timeZone: string }; filename?: string; subject?: string; message?: string; allowPaper?: boolean; allowReassign?: boolean; access?: 'view' | 'edit'; mayShare?: boolean; shares?: { operatorId: string; name: string; email: string; access: 'view' | 'edit' }[]; manualInvitationAvailable?: boolean; ownSigningAvailable?: boolean; id: string; title: string; status: string; createdAt: string; expiresAt: string; signers: Signer[]; fields: Field[]; originalSha256: string; signedSha256?: string; certificateSha256?: string; copiedFrom?: string; reminders?: { afterDays: number; everyDays: number }; copies?: { visibleDocuments?: number[]; name: string; email: string; includeWhen?: RoutingRule; routeResult?: RoutingResult }[]; events: { action: string; at: string; actor?: string; detail?: Record<string, unknown> }[]; messages?: Message[]; recipients?: RecipientTimeline[]; timeZone?: string }
/** MANAGE-005: one recipient's place in routing, timeline and what they wait on (src/inkwell/timeline.ts). */
export type RecipientTimeline = { signer: number; order: number; place: 'signed' | 'declined' | 'current' | 'waiting' | 'stopped'; waitingOn: string | null; bounced?: boolean; steps: { step: string; at: string; detail?: string }[] }
/** DELIV-001: one message sent for an envelope and the status its provider's events support (src/inkwell/delivery.ts). */
export type Message = { id: string; kind: string; signer: number; recipient: string; subject: string; status: string; label: string; createdAt: string; sentAt?: string; deliveredAt?: string; openedAt?: string; bouncedAt?: string; failedAt?: string }
export type Actor = { id: string; name: string; email: string; role: string }
export type Person = { id: string; name: string; email: string; role: string }
/** MANAGE-001: the dashboard's status buckets and one page of the server's envelope search. */
export const buckets = ['draft', 'waiting_for_me', 'waiting_for_others', 'completed', 'declined', 'voided', 'expired', 'imported'] as const
export type Bucket = typeof buckets[number]
export type Page = { envelopes: (Envelope & { bucket: Bucket })[]; counts: Record<Bucket, number>; total: number; next: string | null }
// RECORD-005: the account's retention rule and the latest purges (envelope IDs and times only).
export type Retention = { rule: { years: number; updatedAt: string; updatedBy: string } | null; warningDays: number; purged: { envelopeId: string; ended: string; years: number; endedAt: string; warnedAt: string; purgedAt: string }[] }
export type EnvelopeDefaults = { hideDocumentsWithoutFields?: boolean; expiryDays: number; reminders: { afterDays: number; everyDays: number } | null; version: number; actor: string | null; at: string | null }
export type Workspace = { actor: Actor; people?: Person[]; signingGroups?: SigningGroup[]; settings?: { envelopeDefaults: EnvelopeDefaults; sendPolicies: SendPolicy[]; sendPolicyHistory: SendPolicyVersion[]; freeForm: FreeFormPolicy; freeFormHistory: FreeFormChange[]; healthcare: boolean; completedCopies: 'link' | 'attachment'; retention: Retention; internalApproval: ApprovalRule | null }; agents?: { id: string; createdAt?: string; revokedAt?: string; label?: string }[] }
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
/** MANAGE-005: an instant in the account's time zone and in UTC: "Oct 19, 2026, 10:02 AM EDT · 14:02 UTC". */
export const zonedAndUtc = (value: string, timeZone: string) => `${new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value))} · ${new Date(value).toISOString().slice(11, 16)} UTC`
