import { appendEvent, active, id, insist, now, sha256, text, type Envelope, type Env, type Supplement } from './model'
import { blobWrites, download, fromBase64, readBlob } from './blobs'
import { parsePdf, validatePdfText } from './pdf'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { accessGate, disclosureGate, liveGuard, notGroupSigner, recipientOf, sessionGuard, turn, type SigningContext } from './signing'
import type { CommandContext } from './envelopes'

export const supplementKind = (supplementId: string) => `supplement-${supplementId}`
/** SIGNX-009: sender-supplied reference PDFs are fixed before approval, never signature fields. */
export async function addSupplement(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  editable(before)
  insist((before.supplements?.length ?? 0) < 20, 'Add at most 20 supplemental documents.')
  const label = text(input.label, 'a supplemental document label', 100), filename = text(input.filename, 'a PDF filename', 240)
  insist(!/[\r\n\t]/.test(label) && !/[\x00-\x1f/\\]/.test(filename) && filename.toLowerCase().endsWith('.pdf'), 'Use a single-line label and a PDF filename.')
  insist(input.requirement === 'view' || input.requirement === 'acknowledge', 'Choose view or acknowledge for the supplemental document.')
  const bytes = fromBase64(input.pdfBase64), { pageSizes } = await parsePdf(bytes)
  await validatePdfText([label, filename])
  const supplement: Supplement = { id: id(), label, filename, sha256: await sha256(bytes), bytes: bytes.length, pages: pageSizes.length, requirement: input.requirement }
  const after = structuredClone(before); after.supplements = [...after.supplements ?? [], supplement]
  await appendEvent(after, 'envelope.supplement_added', context.actor.id, { supplement })
  const result = { id: after.id, supplementId: supplement.id }
  await commitEnvelope(env, before, after, context.actor, [...blobWrites(env.DB, after.id, supplementKind(supplement.id), bytes), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}
export async function removeSupplement(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID')); editable(before)
  const supplement = findSupplement(before, text(input.supplementId, 'a supplemental document ID'))
  const after = structuredClone(before); after.supplements = after.supplements!.filter(s => s.id !== supplement.id)
  await appendEvent(after, 'envelope.supplement_removed', context.actor.id, { supplementId: supplement.id, sha256: supplement.sha256 })
  const result = { id: after.id, removed: supplement.id }
  await commitEnvelope(env, before, after, context.actor, [env.DB.prepare('DELETE FROM iw_blobs WHERE envelope_id=? AND kind=?').bind(after.id, supplementKind(supplement.id)), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}
function editable(envelope: Envelope) {
  insist(!envelope.imported && envelope.status === 'prepared' && envelope.internalApproval?.state !== 'pending', 'Supplemental documents are fixed when approval is requested. Edit them only in an unlocked draft.', 409)
}
export function findSupplement(envelope: Envelope, supplementId: string) {
  const supplement = envelope.supplements?.find(s => s.id === supplementId)
  insist(supplement, 'Supplemental document not found.', 404); return supplement
}
/** A recipient replacement resets unsigned acknowledgments, as it resets that person's disclosure. */
export function supplementEvents(envelope: Envelope, signer: number, member?: number) {
  let boundary = -1
  envelope.events.forEach((e, i) => {
    if (['signer.corrected', 'signer.reassigned'].includes(e.action) && e.detail.signer === signer) {
      const before = e.detail.before as { name?: string; email?: string }, after = e.detail.after as typeof before
      if (before?.name !== after?.name || before?.email !== after?.email) boundary = i
    }
  })
  return envelope.events.slice(boundary + 1).filter(e => e.detail.signer === signer && e.detail.member === member)
}
export function supplementStatus(envelope: Envelope, signer: number, member?: number) {
  if(envelope.signers[signer].witnessFor!==undefined)return []
  const events = supplementEvents(envelope, signer, member)
  return (envelope.supplements ?? []).map(s => ({ ...s,
    viewedAt: events.find(e => e.action === 'signer.supplement_viewed' && e.detail.supplementId === s.id && e.detail.sha256 === s.sha256)?.at,
    acknowledgedAt: events.find(e => e.action === 'signer.supplement_acknowledged' && e.detail.supplementId === s.id && e.detail.sha256 === s.sha256)?.at,
  }))
}
export function requireSupplements(envelope: Envelope, signer: number, member?: number) {
  for (const s of supplementStatus(envelope, signer, member)) insist(s.requirement === 'acknowledge' ? s.acknowledgedAt : s.viewedAt, s.requirement === 'acknowledge' ? `Acknowledge ${s.label} before signing.` : `Open ${s.label} before signing.`, 409)
}
function signerRead(context: SigningContext) {
  insist(context.envelope.signers[context.recipient.signer].witnessFor===undefined,'Witnesses may read only their signer’s signed documents.',403)
  insist(context.verified, 'Verify your email before opening supplemental documents.', 401)
  notGroupSigner(context); accessGate(context)
  if (context.envelope.status !== 'completed') active(context.envelope)
  disclosureGate(recipientOf(context), 'opening supplemental documents')
}
export async function supplementDocument(env: Env, context: SigningContext, supplementId: string) {
  signerRead(context)
  const supplement = findSupplement(context.envelope, supplementId), bytes = await readBlob(env.DB, context.envelope.id, supplementKind(supplementId), supplement.sha256)
  if (!supplementStatus(context.envelope, context.recipient.signer, context.recipient.member).find(s => s.id === supplementId)?.viewedAt && context.envelope.status !== 'completed') {
    turn(context)
    const after = structuredClone(context.envelope)
    await appendEvent(after, 'signer.supplement_viewed', `signer:${context.recipient.signer + 1}`, { signer: context.recipient.signer, ...(context.recipient.member === undefined ? {} : { member: context.recipient.member }), email: recipientOf(context).email, supplementId, sha256: supplement.sha256, ...context.client })
    await commitEnvelope(env, context.envelope, after, null, [], [liveGuard(context), sessionGuard(context)])
  }
  return download(bytes, supplement.filename, 'application/pdf', true)
}
export async function acknowledgeSupplement(env: Env, context: SigningContext, supplementId: string, input: Record<string, unknown>) {
  signerRead(context); turn(context)
  const supplement = findSupplement(context.envelope, supplementId)
  insist(input.acknowledge === true, 'Explicitly acknowledge the supplemental document.')
  const status = supplementStatus(context.envelope, context.recipient.signer, context.recipient.member).find(s => s.id === supplementId)!
  insist(status.viewedAt, `Open ${supplement.label} before acknowledging it.`, 409)
  if (status.acknowledgedAt) return { acknowledgedAt: status.acknowledgedAt }
  await readBlob(env.DB, context.envelope.id, supplementKind(supplementId), supplement.sha256)
  const after = structuredClone(context.envelope), acknowledgedAt = now()
  await appendEvent(after, 'signer.supplement_acknowledged', `signer:${context.recipient.signer + 1}`, { signer: context.recipient.signer, ...(context.recipient.member === undefined ? {} : { member: context.recipient.member }), email: recipientOf(context).email, supplementId, sha256: supplement.sha256, statement: `I acknowledge ${supplement.label}.`, ...context.client }, acknowledgedAt)
  await commitEnvelope(env, context.envelope, after, null, [], [liveGuard(context), sessionGuard(context)])
  return { acknowledgedAt }
}
export async function copySupplementWrites(env: Env, source: Envelope, destination: string) {
  return (await Promise.all((source.supplements ?? []).map(async s => blobWrites(env.DB, destination, supplementKind(s.id), await readBlob(env.DB, source.id, supplementKind(s.id), s.sha256))))).flat()
}
