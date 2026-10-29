import { recipientArtifact, recipientDocuments, remapCopyAudience } from './document-visibility'
import { party as actingParty, appendEvent, clientEvidence, insist, now, object, randomCode, secret, sha256, text, type Client, type Envelope, type Env } from './model'
import { atomic, commandWrite, commitEnvelope, getEnvelope, roleGuard, type Guard } from './storage'
import { mailSuppressed } from './manual-invitations'
import { insistAccess } from './members'
import { readBlob } from './blobs'
import { normalizeRoutingRule } from './routing'
import { envelopeArtifact } from './envelopes'
import { copyWrite, dispatchMail } from './mail'
import type { CommandContext } from './envelopes'

/** DELIV-007: when an envelope completes, every signer and copy recipient receives the executed PDF and certificate,
 * as a secure link that opens only after a code sent to their own mailbox, or as attachments when the account chose
 * attachments and both files together are at most 10 MB (decimal).
 * The completed envelope keeps both files in the sender's account. With mail not set up nothing is sent or recorded. */
export const copyLimit = 20, attachmentLimit = 10_000_000
export type Delivery = 'link' | 'attachment'
export interface Party { name: string; email: string; role: 'signer' | 'copy' }
/** Signers first, in their list order, then copy recipients; a party's index is its place in this list. */
/** ROUTE-005: a group's copy goes to the member who signed for it, never to the other members. */
export const parties = (envelope: Envelope): Party[] => [...envelope.signers.map((_, i) => ({ ...actingParty(envelope, i), role: 'signer' as const })), ...(envelope.copies ?? []).map(c => ({ ...c, role: 'copy' as const }))]

/** ROUTE-001's "receives a copy" role: 0–20 people with no action link, each email distinct from every signer's.
 * ROUTE-003: before completion each may carry an include rule (validated against the fields by validateCopyRouting). */
export function chooseCopies(value: unknown, signers: { email: string }[], rules = true) {
  if (value === undefined) return []
  insist(Array.isArray(value) && value.length <= copyLimit, `Add at most ${copyLimit} copy recipients.`)
  const copies = value.map(item => {
    const c = object(item), email = text(c.email, 'the copy recipient email', 254).toLowerCase(), includeWhen = normalizeRoutingRule(c.includeWhen)
    insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Provide a valid copy recipient email.')
    insist(rules || !includeWhen, 'A completed copy sent after completion has no routing rule.')
    return { name: text(c.name, 'the copy recipient name', 100), email, ...(includeWhen ? { includeWhen } : {}) }
  })
  const emails = [...signers.map(s => s.email), ...copies.map(c => c.email)]
  insist(new Set(emails).size === emails.length, 'Each signer and copy recipient must use a different email.')
  return copies
}

export async function completedCopyDelivery(env: Env): Promise<Delivery> {
  return (await env.DB.prepare("SELECT value FROM iw_settings WHERE key='completed_copies'").first<{ value: string }>())?.value === 'attachment' ? 'attachment' : 'link'
}
export async function setCompletedCopies(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(context.actor.role === 'owner' || context.actor.role === 'admin', 'Only an owner or admin can change account settings.', 403)
  const delivery = input.delivery
  insist(delivery === 'link' || delivery === 'attachment', 'Choose link or attachment.')
  const result = { delivery }
  await atomic(env.DB, [roleGuard(context.actor, ['owner', 'admin'])], [
    env.DB.prepare("INSERT INTO iw_settings(key,value,updated_at,updated_by) VALUES('completed_copies',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(delivery, now(), context.actor.id),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

/** At completion: the parties who get a completed-copy message. The envelope's own sender is not emailed a copy: their
 * account already files it (ROUTE-009 self-signing sends no mail at all). Removed signers and anyone skipped by a
 * ROUTE-003 rule (signer or copy recipient) get nothing. With mail not set up, nobody. */
export async function completedCopyRecipients(env: Env, after: Envelope) {
  if (mailSuppressed(env)) return []
  const sender = (await env.DB.prepare('SELECT lower(email) AS email FROM oa_operators WHERE id=?').bind(after.createdBy).first<{ email: string }>())?.email
  const skipped = (index: number) => (index < after.signers.length ? after.signers[index] : after.copies![index - after.signers.length]).routeResult?.state === 'skipped'
  return parties(after).flatMap((party, index) => party.email === sender || after.signers[index]?.removedAt || skipped(index) ? [] : [index])
}
/** After the certificate exists: one completed-copy message per listed party, and a link row for each when links are
 * used. `bytes` is the executed PDF and certificate together. */
export async function completedCopyWrites(env: Env, after: Envelope, bytes: number, list: number[]) {
  return list.length ? copyWrites(env, after, bytes, list, 'envelope.copies_queued', 'inkwell') : []
}
async function copyWrites(env: Env, after: Envelope, bytes: number, indexes: number[], action: string, actor: string) {
  const chosen = await completedCopyDelivery(env)
  const delivery: Delivery = chosen === 'attachment' && bytes <= attachmentLimit ? 'attachment' : 'link'
  const writes: D1PreparedStatement[] = [], all = parties(after), list = indexes.map(i => all[i])
  for (const index of indexes) {
    const party = all[index]
    const token = delivery === 'link' ? secret() : undefined
    if (token) writes.push(env.DB.prepare('INSERT INTO iw_copy_links(token_hash,envelope_id,party,email) VALUES(?,?,?,?)').bind(await sha256(token), after.id, index, party.email))
    writes.push(copyWrite(env, after, index, party, token))
  }
  await appendEvent(after, action, actor, { delivery, chosen, bytes, recipients: list.map(p => ({ email: p.email, role: p.role })) })
  return writes
}

/** ROUTE-009: after completion, whoever may change the envelope sends the completed copy to 1–20 more people, who
 * become copy recipients, within the envelope's limit of 20. */
export async function sendCompletedCopy(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  await insistAccess(env, context.actor, before, 'edit')
  insist(before.status === 'completed' && !before.imported, 'Only a completed envelope has a completed copy to send.', 409)
  insist(!mailSuppressed(env), 'Mail is not set up. Download the executed PDF and certificate instead.', 409)
  insist(Array.isArray(input.recipients) && input.recipients.length >= 1, 'Add at least one person to send the copy to.')
  const added = chooseCopies(input.recipients, [...before.signers, ...(before.copies ?? [])], false)
  insist(added.length + (before.copies?.length ?? 0) <= copyLimit, `An envelope has at most ${copyLimit} copy recipients.`)
  const after = structuredClone(before), start = parties(before).length
  after.copies = [...(before.copies ?? []), ...added]
  remapCopyAudience(after,before.copies??[],true)
  if(input.documents!==undefined){
    insist(Array.isArray(input.documents)&&new Set(input.documents).size===input.documents.length&&input.documents.every(n=>Number.isInteger(n)&&after.documents?.[n]),'Choose existing documents for this completed copy.')
    for(const [i,d] of (after.documents??[]).entries()){
      const audience=d.visibleTo??{signers:after.signers.map((_,n)=>n),copies:after.copies.map((_,n)=>n)}
      d.visibleTo={signers:audience.signers,copies:audience.copies.filter(n=>n<(before.copies?.length??0)||(input.documents as number[]).includes(i))}
    }
  }
  if(JSON.stringify(before.documents)!==JSON.stringify(after.documents))await appendEvent(after,'document.audience_updated',context.actor.id,{before:before.documents,after:after.documents})
  const bytes = (await readBlob(env, after.id, 'signed', after.signedSha256!)).length + (await readBlob(env, after.id, 'certificate', after.certificateSha256!)).length
  const writes = await copyWrites(env, after, bytes, added.map((_, i) => start + i), 'envelope.copy_sent', context.actor.id)
  const result = { id: after.id, sent: added.map(c => c.email) }
  await commitEnvelope(env, before, after, context.actor, [...writes, commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  await dispatchMail(env, after.id)
  return result
}

interface CopyLink { token_hash: string; envelope_id: string; party: number; email: string; code_hash: string | null; code_expires: number | null; code_attempts: number; code_sent_at: number | null; code_generation: number; session_hash: string | null; session_expires: number | null }
export interface CopyContext { link: CopyLink; envelope: Envelope; token: string; verified: boolean; client: Client }
const cookieName = 'inkwell_copy'
export async function copyContext(env: Env, token: string, request: Request): Promise<CopyContext> {
  insist(/^[a-f0-9]{64}$/.test(token), 'Completed copy not found.', 404)
  const link = await env.DB.prepare('SELECT * FROM iw_copy_links WHERE token_hash=?').bind(await sha256(token)).first<CopyLink>()
  insist(link, 'Completed copy not found.', 404)
  const envelope = await getEnvelope(env.DB, link.envelope_id)
  insist(envelope.status === 'completed' && !envelope.imported, 'Completed copy not found.', 404)
  const cookie = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
  const verified = Boolean(cookie && link.session_hash && link.session_expires && link.session_expires > Date.now() && await sha256(cookie) === link.session_hash)
  return { link, envelope, token, verified, client: clientEvidence(request) }
}
export function copyView(context: CopyContext) {
  const party = parties(context.envelope)[context.link.party]
  return { title: context.envelope.title, completedAt: context.envelope.events.find(e => e.action === 'envelope.completed')?.at, recipient: { name: party.name, email: party.email, role: party.role }, verified: context.verified, ...(context.verified&&context.envelope.documents?{documents:recipientDocuments(context.envelope,context.link.party)}:{}) }
}
const linkGuard = (context: CopyContext, extra: string, values: unknown[]): Guard => ({ sql: `EXISTS(SELECT 1 FROM iw_copy_links WHERE token_hash=? AND ${extra})`, values: [context.link.token_hash, ...values] })
/** A six-digit code to the recipient's own mailbox: one a minute, ten per link, each valid for 10 minutes. */
export async function requestCopyCode(env: Env, context: CopyContext) {
  insist(!mailSuppressed(env), 'Mail is not set up. Ask the sender for the completed documents.', 409)
  const l = context.link
  insist(!l.code_sent_at || l.code_sent_at < Date.now() - 60_000, 'Wait one minute before requesting another code.', 429)
  insist(l.code_generation < 10, 'The code request limit was reached. Contact the sender.', 429)
  const code = randomCode(), generation = l.code_generation + 1, at = Date.now(), after = structuredClone(context.envelope)
  await appendEvent(after, 'copy.code_requested', `copy:${l.party + 1}`, { party: l.party, email: l.email })
  await commitEnvelope(env, context.envelope, after, null, [
    env.DB.prepare('UPDATE iw_copy_links SET code_hash=?,code_expires=?,code_attempts=0,code_sent_at=?,code_generation=? WHERE token_hash=?').bind(await sha256(`${env.SESSION_SECRET}:copy:${l.token_hash}:${generation}:${code}`), at + 10 * 60_000, at, generation, l.token_hash),
    copyWrite(env, after, l.party, parties(after)[l.party], undefined, code)], [linkGuard(context, 'code_generation=?', [l.code_generation])])
  await dispatchMail(env, after.id)
  return { ok: true }
}
/** Five tries per code; the right one opens this link in this browser for 24 hours. */
export async function verifyCopyCode(env: Env, context: CopyContext, input: Record<string, unknown>) {
  const l = context.link, code = text(input.code, 'the six-digit code', 6)
  insist(/^\d{6}$/.test(code), 'Enter the six-digit code from your email.')
  insist(l.code_hash && l.code_expires && l.code_expires > Date.now() && l.code_attempts < 5, 'This code expired, was already used, or reached its attempt limit. Request a new code.', 401)
  const correct = await sha256(`${env.SESSION_SECRET}:copy:${l.token_hash}:${l.code_generation}:${code}`) === l.code_hash
  const guards = [linkGuard(context, 'code_hash=? AND code_attempts=? AND code_attempts<5 AND code_expires>?', [l.code_hash, l.code_attempts, Date.now()])], after = structuredClone(context.envelope)
  if (!correct) {
    await appendEvent(after, 'copy.code_rejected', `copy:${l.party + 1}`, { party: l.party, ...context.client })
    await commitEnvelope(env, context.envelope, after, null, [env.DB.prepare('UPDATE iw_copy_links SET code_attempts=code_attempts+1 WHERE token_hash=?').bind(l.token_hash)], guards)
    insist(false, 'The code is incorrect.', 401)
  }
  const session = secret()
  await appendEvent(after, 'copy.email_verified', `copy:${l.party + 1}`, { party: l.party, email: l.email, ...context.client })
  await commitEnvelope(env, context.envelope, after, null, [env.DB.prepare('UPDATE iw_copy_links SET code_hash=NULL,code_expires=NULL,session_hash=?,session_expires=? WHERE token_hash=?').bind(await sha256(session), Date.now() + 24 * 60 * 60_000, l.token_hash)], guards)
  return `${cookieName}=${session}; Path=/api/copy/${context.token}; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(env.AUTH_ORIGIN).protocol === 'https:' ? '; Secure' : ''}`
}
export async function copyArtifact(env: Env, context: CopyContext, kind: string) {
  insist(context.verified, 'Confirm the code sent to your email before downloading.', 401)
  insist(['signed', 'certificate'].includes(kind)||/^executed-[0-9]+$/.test(kind), 'Choose the executed PDF or the certificate.', 404)
  return recipientArtifact(env, context.envelope, context.link.party, kind)
}
