import type { Bindings } from '../auth.server'
export class Refusal extends Error { constructor(message: string, public status = 400) { super(message) } }
export function insist(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new Refusal(message, status) }
/** ACCESS-001: Base's owner and admin, and Inkwell's sender and viewer for a Base member (members.ts). */
export type Role = 'owner' | 'admin' | 'sender' | 'viewer'
export interface Actor { id: string; name: string; email: string; role: Role; version: number; sessionId?: string; agentId?: string }
export interface Field { id: string; label: string; type: 'signature' | 'text' | 'date'; signer: number; page: number; x: number; y: number; width: number; height: number }
/** IDV-001: `linkOnly` signs with the link alone (no email code); absent, the recipient verifies an emailed code. */
export interface Signer { name: string; email: string; order?: number; accessCode?: boolean; linkOnly?: boolean; signedAt?: string; values?: Record<string, string>; declinedAt?: string; declineReason?: string; consentWithdrawn?: boolean; message?: string; disclosure?: { version: string; sha256: string; acceptedAt: string }; paper?: Paper; adoption?: Adoption; removedAt?: string }
/** SIGNX-002: how the signer adopted the mark applied to their signature fields (marks.ts). */
export interface Adoption { method: 'typed' | 'drawn' | 'uploaded'; style?: 'sans' | 'serif' | 'serif-bold'; mediaType?: 'image/png' | 'image/jpeg'; sha256?: string }
/** SIGNX-008: a hand-signed scan the recipient uploaded instead of signing electronically, and the sender's review. */
export interface Paper { sha256: string; pages: number; mediaType: string; uploadedAt: string; status: 'pending' | 'accepted' | 'rejected'; reviewedAt?: string; reviewedBy?: string; reason?: string }
export interface AuditEvent { action: string; at: string; actor: string; detail: Record<string, unknown>; previousHash: string; hash: string }
export interface Envelope { id: string; version: number; title: string; filename: string; status: 'prepared' | 'awaiting_signature' | 'completed' | 'declined' | 'voided' | 'expired' | 'imported'; createdAt: string; createdBy: string; expiresAt: string; signers: Signer[]; fields: Field[]; pageSizes: { width: number; height: number }[]; originalSha256: string; signedSha256?: string; certificateSha256?: string; events: AuditEvent[]; imported?: boolean; source?: unknown; copiedFrom?: string; allowPaper?: boolean; reminders?: { afterDays: number; everyDays: number }; copies?: { name: string; email: string }[]; allowReassign?: boolean; subject?: string; message?: string; scheduled?: { at: string; local: string; timeZone: string }; template?: { id: string; title: string; version?: number } }
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
export function currentSigners(envelope: Envelope) { const open = envelope.signers.flatMap((s, i) => s.signedAt || s.removedAt ? [] : [i]); const lowest = Math.min(...open.map(i => routingOrder(envelope, i))); return open.filter(i => routingOrder(envelope, i) === lowest) }
export function object(value: unknown): Record<string, unknown> { insist(value && typeof value === 'object' && !Array.isArray(value), 'Provide a JSON object.'); return value as Record<string, unknown> }
export function text(value: unknown, label: string, max = 200): string { insist(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value), `Provide ${label} (at most ${max} characters).`); return value.trim() }
export const now = () => new Date().toISOString()
export const id = () => crypto.randomUUID()
/** IDV-003: access codes are stored keyed with the installation secret, never in the envelope or its exports. */
export function accessCodeHash(env: Env, envelopeId: string, signer: number, code: string) { return sha256(`${env.SESSION_SECRET}:access:${envelopeId}:${signer}:${code}`) }
export function randomCode() { const limit=4_294_000_000;let n:number;do n=crypto.getRandomValues(new Uint32Array(1))[0];while(n>=limit);return String(Math.floor(n/4294)).padStart(6,'0') }
export function secret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('') }
export async function sha256(value: Uint8Array | string) { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), b => b.toString(16).padStart(2, '0')).join('') }
export function canonical(value: unknown): string { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => (value as Record<string, unknown>)[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}'; return JSON.stringify(value) }
export async function appendEvent(envelope: Envelope, action: string, actor: string, detail: Record<string, unknown> = {}) { const body = { action, at: now(), actor, detail, previousHash: envelope.events.at(-1)?.hash ?? '' }; envelope.events.push({ ...body, hash: await sha256(canonical(body)) }) }
export async function verifyEvents(events: AuditEvent[]) { let previousHash = ''; for (const { hash, ...body } of events) { if (body.previousHash !== previousHash || await sha256(canonical(body)) !== hash) return false; previousHash = hash }; return true }
export function active(envelope: Envelope) { insist(!envelope.scheduled, 'This envelope is scheduled to be sent later.', 409); insist(!envelope.imported && envelope.status === 'awaiting_signature', envelope.status === 'voided' ? 'This envelope was voided.' : 'This envelope is not open for signing.', 409); insist(Date.parse(envelope.expiresAt) > Date.now(), 'This signing invitation has expired.', 410) }
