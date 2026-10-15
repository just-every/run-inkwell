import type { Bindings } from '../auth.server'
export class Refusal extends Error { constructor(message: string, public status = 400) { super(message) } }
export function insist(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new Refusal(message, status) }
export type Role = 'owner' | 'admin' | 'member'
export interface Actor { id: string; name: string; email: string; role: Role; version: number; sessionId?: string; agentId?: string }
export interface Field { id: string; label: string; type: 'signature' | 'text' | 'date'; signer: number; page: number; x: number; y: number; width: number; height: number }
export interface Signer { name: string; email: string; signedAt?: string; values?: Record<string, string> }
export interface AuditEvent { action: string; at: string; actor: string; detail: Record<string, unknown>; previousHash: string; hash: string }
export interface Envelope { id: string; version: number; title: string; filename: string; status: 'prepared' | 'awaiting_signature' | 'completed' | 'voided' | 'expired' | 'imported'; createdAt: string; createdBy: string; expiresAt: string; signers: Signer[]; fields: Field[]; pageSizes: { width: number; height: number }[]; originalSha256: string; signedSha256?: string; certificateSha256?: string; events: AuditEvent[]; imported?: boolean; source?: unknown }
export type Env = Bindings
export function object(value: unknown): Record<string, unknown> { insist(value && typeof value === 'object' && !Array.isArray(value), 'Provide a JSON object.'); return value as Record<string, unknown> }
export function text(value: unknown, label: string, max = 200): string { insist(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value), `Provide ${label} (at most ${max} characters).`); return value.trim() }
export const now = () => new Date().toISOString()
export const id = () => crypto.randomUUID()
export function secret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('') }
export async function sha256(value: Uint8Array | string) { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), b => b.toString(16).padStart(2, '0')).join('') }
export function canonical(value: unknown): string { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => (value as Record<string, unknown>)[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}'; return JSON.stringify(value) }
export async function appendEvent(envelope: Envelope, action: string, actor: string, detail: Record<string, unknown> = {}) { const body = { action, at: now(), actor, detail, previousHash: envelope.events.at(-1)?.hash ?? '' }; envelope.events.push({ ...body, hash: await sha256(canonical(body)) }) }
export async function verifyEvents(events: AuditEvent[]) { let previousHash = ''; for (const { hash, ...body } of events) { if (body.previousHash !== previousHash || await sha256(canonical(body)) !== hash) return false; previousHash = hash }; return true }
export function active(envelope: Envelope) { insist(!envelope.imported && envelope.status === 'awaiting_signature', envelope.status === 'voided' ? 'This envelope was voided.' : 'This envelope is not open for signing.', 409); insist(Date.parse(envelope.expiresAt) > Date.now(), 'This signing invitation has expired.', 410) }
