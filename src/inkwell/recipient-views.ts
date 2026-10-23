import { canSeeDocument, visibleDocumentIndexes } from './document-visibility'
import { appendEvent, insist, now, Refusal, type Env } from './model'
import { commitEnvelope, getEnvelope } from './storage'
import { accessGate, advanceAfterSigning, disclosureGate, liveGuard, recipientOf, sessionGuard, turn, type SigningContext } from './signing'
import {requireSupplements} from './supplements'
import { dispatchMail } from './mail'

type ViewRole = 'needs_to_view' | 'certified_delivery'
export const isViewRole = (role: unknown): role is ViewRole => role === 'needs_to_view' || role === 'certified_delivery'

/** Invoke only after the permitted PDF bytes have loaded and passed integrity checks. Component IDs are canonical
 * envelope indexes; the combined scoped PDF opens all of its visible components. Legacy single PDFs use index 0.
 * Authentication/metadata requests never invoke this hook. A server-observed opening does not assert human reading. */
export async function recordRecipientOpening(env: Env, context: SigningContext, documents: number[]): Promise<void> {
  const initial = context.envelope.signers[context.recipient.signer]
  if (!isViewRole(initial.role)) return
  insist(context.verified, 'Verify your identity before opening this document.', 401)
  // Ordinary opening/view tracking can append an event before this hook; read the latest routing state, while
  // retaining the exact link and verified session that requested these bytes for the transaction fences.
  const before = await getEnvelope(env.DB, context.envelope.id), index = context.recipient.signer
  const current = { ...context, envelope: before }, person = before.signers[index]
  insist(isViewRole(person.role), 'This recipient’s action changed. Open their current invitation.', 409)
  insist(!person.group && context.recipient.member === undefined, 'Document-opening roles require an individual recipient.', 409)
  accessGate(current); disclosureGate(recipientOf(current), 'opening the document', current.envelope.consumerDisclosure)
  const visible = before.documents ? visibleDocumentIndexes(before, index) : [0]
  insist(visible.length > 0, 'No documents are visible to this recipient.', 404)
  insist(Array.isArray(documents) && documents.length > 0 && documents.every(d => Number.isInteger(d) && visible.includes(d) && (!before.documents || canSeeDocument(before, d, index))), 'Open only documents visible to this recipient.', 404)
  const fingerprint = (document: number) => before.documents?.[document]?.sha256 ?? before.originalSha256
  insist(before.originalSha256 === context.envelope.originalSha256 && documents.every(d => fingerprint(d) === (context.envelope.documents?.[d]?.sha256 ?? context.envelope.originalSha256)), 'The document changed. Open the current PDF before continuing.', 409)
  const previous = person.viewedDocuments ?? []
  // Already completed requests remain harmless even after the next routing order becomes active.
  if (person.completedAt) return
  turn(current)
  const opened = [...new Set(documents)].filter(d => !previous.some(p => p.document === d && p.sha256 === fingerprint(d)))
  if (!opened.length) return
  const after = structuredClone(before), at = now(), role = person.role
  const evidence = { signer:index, role, email:person.email, observation:'authenticated_pdf_open_request', ...context.client }
  const viewedDocuments = [...previous]
  for (const document of opened) {
    const entry = { document, sha256:fingerprint(document), at }
    viewedDocuments.push(entry)
    await appendEvent(after, 'recipient.document_opened', `signer:${index+1}`, { ...evidence, ...entry }, at)
  }
  after.signers[index] = { ...person, viewedDocuments }
  const complete = visible.every(document => viewedDocuments.some(p => p.document === document && p.sha256 === fingerprint(document)))
  const writes: D1PreparedStatement[] = []
  if (complete) {
    requireSupplements(before,index,context.recipient.member)
    after.signers[index].completedAt = at
    await appendEvent(after, role === 'certified_delivery' ? 'recipient.certified_delivered' : 'recipient.viewed', `signer:${index+1}`, {
      ...evidence, documents:visible.map(document => viewedDocuments.find(p => p.document === document && p.sha256 === fingerprint(document))!),
      originalSha256:before.originalSha256, disclosureVersion:recipientOf(current).disclosure?.version,
      statement:'The server prepared the permitted PDF bytes for an authenticated opening request; this does not assert human reading.',
    }, at)
    writes.push(...await advanceAfterSigning(env, after, index))
  }
  try { await commitEnvelope(env, before, after, null, writes, [liveGuard(current), sessionGuard(current), {
    sql:'EXISTS(SELECT 1 FROM iw_signers WHERE envelope_id=? AND signer=? AND token_hash=?)',
    values:[before.id,context.recipient.row,context.recipient.token_hash],
  }]) } catch (error) {
    if (!(error instanceof Refusal) || error.status !== 409) throw error
    const latest = await getEnvelope(env.DB, before.id), recorded = latest.signers[index]?.viewedDocuments ?? [], session = sessionGuard(current)
    const sameSession = await env.DB.prepare(`SELECT 1 WHERE ${session.sql} AND EXISTS(SELECT 1 FROM iw_signers WHERE envelope_id=? AND signer=? AND token_hash=?)`)
      .bind(...session.values, before.id, context.recipient.row, context.recipient.token_hash).first()
    // A concurrent identical opening already committed; no retry and no duplicate audit/completion event.
    if (sameSession && documents.every(d => recorded.some(p => p.document === d && p.sha256 === fingerprint(d)))) return
    throw error
  }
  if (complete) await dispatchMail(env, after.id)
}
