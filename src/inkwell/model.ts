import type { Bindings } from '../auth.server'
export class Refusal extends Error { constructor(message: string, public status = 400, public code?: string) { super(message) } }
export function insist(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new Refusal(message, status) }
/** ACCESS-001: Base's owner and admin, and Inkwell's sender and viewer for a Base member (members.ts). */
export type Role = 'owner' | 'admin' | 'sender' | 'viewer'
export interface Actor { id: string; name: string; email: string; role: Role; version: number; sessionId?: string; agentId?: string; apiKeyId?: string; apiKeyScope?: string }
/** PREP-007: `name` is the document's own name for a field it carried (its tag's label, anchor string or AcroForm full
 * name), usable in API prefill maps; `origin` records where the field came from. */
export interface Field { document?: number; documentPage?: number; name?: string; origin?: 'text_tag' | 'anchor' | 'form_field'; id: string; label: string; type: 'signature' | 'initials' | 'date_signed' | 'full_name' | 'email' | 'company' | 'title' | 'text' | 'date' | 'checkbox' | 'number' | 'radio' | 'dropdown' | 'checkbox_group' | 'note' | 'stamp'; options?: string[]; minimum?: number; maximum?: number; pattern?: 'zip' | 'phone' | 'ssn' | 'ein' | 'email' | 'date'; masked?: boolean; signer: number; page: number; x: number; y: number; width: number; height: number; prefill?: { value: string; source: string }; readOnly?: boolean; required?: boolean; requiredWhen?: { field: string; equals: string }; condition?: { field: string; equals: string }; calculation?: { operation: 'sum' | 'difference' | 'product'; fields: string[] } }
/** IDV-001: `linkOnly` signs with the link alone (no email code); absent, the recipient verifies an emailed code. */
export interface RoutingRule { field: string; operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'at_least' | 'at_most'; value: string }
/** ROUTE-004: an internal approval rule (internal-approval.ts) and one approver's step in a request. */
export interface ApprovalRule { approver: string; name?: string; email?: string; threshold?: { field: string; above: string } }
export interface ApprovalStep { approver: string; name: string; email: string; rules: ('account' | 'template')[]; why: string[]; decision?: 'approved' | 'rejected'; decidedAt?: string; reason?: string; bySender?: boolean }
export interface InternalApproval { state: 'pending' | 'rejected' | 'approved'; requestedAt: string; requestedBy: { id: string; name: string; email: string }; schedule?: { at: string; local: string; timeZone: string }; steps: ApprovalStep[] }
export interface RoutingResult { state: 'included' | 'skipped' | 'unresolved'; at: string; value?: string }
/** ROUTE-005: a signing group in one routing place: its members as snapshotted when the draft was saved (signing-groups.ts),
 * each member's own disclosure agreement, and the member who signed, declined or uploaded a paper scan for the group. */
export interface GroupMember { name: string; email: string; disclosure?: { version: string; sha256: string; acceptedAt: string } }
export interface SignerGroup { id: string; name: string; members: GroupMember[]; signedBy?: number; declinedBy?: number }
export interface WitnessNominee { name: string; email: string }
export interface WitnessRule { minimum: 0 | 1 | 2; maximum: 1 | 2; linkOnly?: boolean; address?: boolean; named?: WitnessNominee[] }
export interface Signer { role?: 'signer' | 'approver' | 'form_filler' | 'witness'; completedAt?: string; witnesses?: WitnessRule; witnessNominees?: WitnessNominee[]; witnessFor?: number; witnessDocuments?: number[]; witnessReturnRequired?: boolean; part11?: { reason: string; reauthenticatedAt: string; method: 'single-use emailed code' | 'verified identity and single-use emailed code'; name: string; identity?: { operator: string; version: number; name: string; method: string; verifiedBy: string; verifiedAt: string; component: 'password' | 'OIDC' } }; group?: SignerGroup; includeWhen?: RoutingRule; routeResult?: RoutingResult; activatedAt?: string; name: string; email: string; order?: number; accessCode?: boolean; linkOnly?: boolean; inPerson?: boolean; hostedSender?: { name: string; email: string; version: string }; signedAt?: string; values?: Record<string, string>; declinedAt?: string; declineReason?: string; consentWithdrawn?: boolean; message?: string; disclosure?: { version: string; sha256: string; acceptedAt: string }; paper?: Paper; adoption?: Adoption; initialsAdoption?: Adoption; signingTimeZone?: string; removedAt?: string }
/** SIGNX-002: how the signer adopted the mark applied to their signature fields (marks.ts). */
export interface Adoption { method: 'typed' | 'drawn' | 'uploaded'; style?: 'sans' | 'serif' | 'serif-bold'; mediaType?: 'image/png' | 'image/jpeg'; sha256?: string }
/** SIGNX-008: a hand-signed scan the recipient uploaded instead of signing electronically, and the sender's review. */
export interface Paper { member?: number; sha256: string; pages: number; mediaType: string; uploadedAt: string; status: 'pending' | 'accepted' | 'rejected'; reviewedAt?: string; reviewedBy?: string; reason?: string }
export interface AuditEvent { action: string; at: string; actor: string; detail: Record<string, unknown>; previousHash: string; hash: string }
export interface Supplement { id: string; label: string; filename: string; sha256: string; pages: number; bytes: number; requirement: 'view' | 'acknowledge' }
export interface Envelope { part11?: { actor: string; at: string }; documents?: import('./documents').EnvelopeDocument[]; freeForm?: boolean; freeFormSetting?: { version: number; actor: string; at: string }; sendHold?: { at: string }; supplements?: Supplement[]; id: string; version: number; title: string; filename: string; status: 'prepared' | 'awaiting_signature' | 'completed' | 'declined' | 'voided' | 'expired' | 'imported'; createdAt: string; createdBy: string; expiresAt: string; signers: Signer[]; fields: Field[]; pageSizes: { width: number; height: number }[]; originalSha256: string; signedSha256?: string; certificateSha256?: string; events: AuditEvent[]; importedAt?: string; imported?: boolean; source?: unknown; copiedFrom?: string; allowPaper?: boolean; reminders?: { afterDays: number; everyDays: number }; copies?: { name: string; email: string; includeWhen?: RoutingRule; routeResult?: RoutingResult }[]; allowReassign?: boolean; subject?: string; message?: string; scheduled?: { at: string; local: string; timeZone: string }; template?: { id: string; title: string; version?: number }; legalHold?: { reason: string; by: string; at: string }; approvalRule?: ApprovalRule; internalApproval?: InternalApproval }
export type Env = Bindings
/** RECORD-002: one request's network evidence: Cloudflare's connecting IP and the user agent, as printable ASCII. */
export interface Client { ip: string; userAgent: string }
const printable = (value: string | null, max: number) => (value ?? '').replace(/[^\x20-\x7e]/g, '?').slice(0, max)
export const clientEvidence = (request: Request): Client => ({ ip: printable(request.headers.get('cf-connecting-ip'), 64), userAgent: printable(request.headers.get('user-agent'), 300) })
/** ROUTE-002: a signer's routing order. Envelopes stored before orders existed sign one at a time in list order. */
export const routingOrder = (envelope: Envelope, signer: number) => envelope.signers[signer].order ?? signer + 1
/** DELIV-006: a recipient removed by a correction keeps their place (so the audit trail's signer numbers stay true) and
 * never signs, receives or holds up anything again. */
export const removed = (envelope: Envelope, signer: number) => Boolean(envelope.signers[signer]?.removedAt)
/** DELIV-006 / ROUTE-006: the audit events about the person now at `signer`: those after the last correction or
 * reassignment that changed that place's email, so a corrected recipient's evidence never borrows the person they replaced. */
export function identityEvents(envelope: Envelope, signer: number) { let last = -1; envelope.events.forEach((e, i) => { if (['signer.corrected', 'signer.reassigned'].includes(e.action) && e.detail.signer === signer && (e.detail.after as { email?: string } | undefined)?.email !== (e.detail.before as { email?: string } | undefined)?.email) last = i }); return envelope.events.slice(last + 1) }
/** ROUTE-002: whose turn it is: every unsigned signer at the lowest routing order any unsigned signer has. Signers who
 * share that order act in parallel; higher orders wait until all of them have finished. */
export const actionAt = (s: Signer) => s.signedAt ?? s.completedAt
export const recipientSettled = (s: Signer) => Boolean(s.removedAt || s.routeResult?.state === 'skipped' || actionAt(s) && !s.witnessReturnRequired)
export function currentSigners(envelope: Envelope) { const open = envelope.signers.flatMap((s, i) => recipientSettled(s) ? [] : [i]); const lowest = Math.min(...open.map(i => routingOrder(envelope, i))); return open.filter(i => routingOrder(envelope, i) === lowest && (!envelope.signers[i].includeWhen || envelope.signers[i].routeResult?.state === 'included')) }
export function object(value: unknown): Record<string, unknown> { insist(value && typeof value === 'object' && !Array.isArray(value), 'Provide a JSON object.'); return value as Record<string, unknown> }
export function text(value: unknown, label: string, max = 200): string { insist(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value), `Provide ${label} (at most ${max} characters).`); return value.trim() }
export const now = () => new Date().toISOString()
export const id = () => crypto.randomUUID()
/** ROUTE-005: each group member's own iw_signers row (link, code and session) sits at a row number derived from the
 * group's place, so place rows stay 0-9 and envelope-wide link and session sweeps cover members too. */
export const memberRow = (place: number, member: number) => 1000 + place * 16 + member
export const rowPlace = (row: number) => row >= 1000 ? { place: Math.floor((row - 1000) / 16), member: (row - 1000) % 16 } : { place: row }
/** The SQL condition for a place's own row and every member row of it, binding `placeRows(place)`. */
export const placeRowsSql = '(signer=? OR (signer>=? AND signer<?))'
export const placeRows = (place: number) => [place, memberRow(place, 0), memberRow(place, 16)]
/** Who acts at `signer`: the person, or for a group the member who signed or declined (else the group as a whole). */
export function party(envelope: Envelope, signer: number, member?: number): { name: string; email: string } {
  const s = envelope.signers[signer], m = member ?? s.group?.signedBy ?? s.group?.declinedBy
  return s.group && m !== undefined ? { name: s.group.members[m].name, email: s.group.members[m].email } : { name: s.name, email: s.email }
}
/** IDV-003: access codes are stored keyed with the installation secret, never in the envelope or its exports. */
export function accessCodeHash(env: Env, envelopeId: string, signer: number, code: string) { return sha256(`${env.SESSION_SECRET}:access:${envelopeId}:${signer}:${code}`) }
export function randomCode() { const limit=4_294_000_000;let n:number;do n=crypto.getRandomValues(new Uint32Array(1))[0];while(n>=limit);return String(Math.floor(n/4294)).padStart(6,'0') }
export function secret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('') }
export async function sha256(value: Uint8Array | string) { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), b => b.toString(16).padStart(2, '0')).join('') }
export function canonical(value: unknown): string { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => (value as Record<string, unknown>)[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}'; return JSON.stringify(value) }
export async function appendEvent(envelope: Envelope, action: string, actor: string, detail: Record<string, unknown> = {}, at = now()) { const body = { action, at, actor, detail, previousHash: envelope.events.at(-1)?.hash ?? '' }; envelope.events.push({ ...body, hash: await sha256(canonical(body)) }) }
export async function verifyEvents(events: AuditEvent[]) { let previousHash = ''; for (const { hash, ...body } of events) { if (body.previousHash !== previousHash || await sha256(canonical(body)) !== hash) return false; previousHash = hash }; return true }
export function active(envelope: Envelope) { insist(!envelope.scheduled, 'This envelope is scheduled to be sent later.', 409); insist(!envelope.imported && envelope.status === 'awaiting_signature', envelope.status === 'voided' ? 'This envelope was voided.' : 'This envelope is not open for signing.', 409); insist(Date.parse(envelope.expiresAt) > Date.now(), 'This signing invitation has expired.', 410) }
