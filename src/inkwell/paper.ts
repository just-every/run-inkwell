import { active, appendEvent, currentSigners, insist, now, sha256, text, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { blobWrites, MAX_PDF, readBlob } from './blobs'
import { readBytes } from './body'
import { scanPages } from './pdf'
import { dispatchMail, noticeWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { accessGate, advanceAfterSigning, disclosureGate, paperKind, type SigningContext } from './signing'
import type { CommandContext } from './envelopes'

/** SIGNX-008: on an envelope that allows it, the current signer signs the downloaded document by hand and uploads a
 * scan or photo. Nothing advances until the sender accepts it; accepted, it counts as that signer's wet-ink signature
 * and its pages join the executed PDF. A rejected upload can be replaced, or the signer signs electronically. */
export async function uploadPaper(env: Env, context: SigningContext, request: Request) {
  insist(context.verified, 'Verify your email before uploading a paper signature.', 401)
  const before = context.envelope, index = context.recipient.signer, signer = before.signers[index]
  insist(before.allowPaper, 'The sender does not allow paper signing for this envelope.', 403)
  active(before)
  insist(currentSigners(before).includes(index), 'This invitation is waiting for an earlier signer, or you have already signed.', 409)
  accessGate(context)
  disclosureGate(signer, 'uploading a paper signature')
  insist(signer.paper?.status !== 'pending', 'Your paper signature is already waiting for the sender’s review.', 409)
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim() ?? ''
  const bytes = await readBytes(request, MAX_PDF)
  insist(bytes.length > 0, 'Upload the signed scan or photo.')
  const pages = await scanPages(bytes, mediaType), fingerprint = await sha256(bytes)
  const after = structuredClone(before)
  after.signers[index] = { ...signer, paper: { sha256: fingerprint, pages, mediaType, uploadedAt: now(), status: 'pending' } }
  await appendEvent(after, 'signer.paper_uploaded', `signer:${index + 1}`, { signer: index, email: signer.email, sha256: fingerprint, pages, mediaType, bytes: bytes.length, ...context.client })
  const sender = await env.DB.prepare('SELECT email,display_name FROM oa_operators WHERE id=?').bind(after.createdBy).first<{ email: string; display_name: string }>()
  await commitEnvelope(env, before, after, null, [
    env.DB.prepare('DELETE FROM iw_blobs WHERE envelope_id=? AND kind=?').bind(after.id, paperKind(index)),
    ...blobWrites(env.DB, after.id, paperKind(index), bytes),
    ...(sender && !mailSuppressed(env) ? [noticeWrite(env.DB, after, index, sender.email, `Paper signature to review: ${after.title}`, `${sender.display_name},\n\n${signer.name} signed ${after.title} on paper and uploaded ${pages} page(s).\nOpen the envelope in Inkwell to accept or reject the upload.`)] : []),
  ], [{ sql: 'EXISTS(SELECT 1 FROM iw_signers WHERE envelope_id=? AND signer=? AND session_hash=? AND session_expires>?)', values: [after.id, index, context.recipient.session_hash, Date.now()] }])
  await readBlob(env.DB, after.id, paperKind(index), fingerprint)
  await dispatchMail(env, after.id)
  return { id: after.id, status: 'pending', sha256: fingerprint, pages }
}

export async function reviewPaper(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  active(before)
  // ROUTE-002: signers sharing a routing order may each have a scan waiting; `signer` picks one, else the first.
  const waiting = currentSigners(before).filter(i => before.signers[i].paper?.status === 'pending')
  const index = input.signer === undefined ? waiting[0] : input.signer as number, signer = before.signers[index]
  insist(waiting.includes(index) && signer?.paper?.status === 'pending', 'No paper signature is waiting for review.', 409)
  insist(typeof input.accept === 'boolean', 'Choose to accept or reject the paper signature.')
  const after = structuredClone(before), reviewedAt = now(), paper = signer.paper
  if (!input.accept) {
    const reason = text(input.reason, 'a reason for rejecting', 500).replace(/\s+/g, ' ')
    after.signers[index] = { ...signer, paper: { ...paper, status: 'rejected', reviewedAt, reviewedBy: context.actor.id, reason } }
    await appendEvent(after, 'signer.paper_rejected', context.actor.id, { signer: index, sha256: paper.sha256, reason })
    const result = { id: after.id, status: after.status, paper: 'rejected' }
    await commitEnvelope(env, before, after, context.actor, [
      ...(mailSuppressed(env) ? [] : [noticeWrite(env.DB, after, index, signer.email, `Paper signature not accepted: ${after.title}`, `${signer.name},\n\nThe sender did not accept your paper signature for ${after.title}.\nReason: ${reason}\n\nOpen your signing link to upload a new scan or sign electronically.`)]),
      commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
    await dispatchMail(env, after.id)
    return result
  }
  after.signers[index] = { ...signer, signedAt: reviewedAt, paper: { ...paper, status: 'accepted', reviewedAt, reviewedBy: context.actor.id } }
  await appendEvent(after, 'signer.signed_on_paper', context.actor.id, { signer: index, email: signer.email, wetInk: true, sha256: paper.sha256, pages: paper.pages, originalSha256: after.originalSha256 })
  const writes = await advanceAfterSigning(env, after, index)
  const result = { id: after.id, status: after.status, paper: 'accepted' }
  await commitEnvelope(env, before, after, context.actor, [...writes, commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  if (after.status === 'completed') { await readBlob(env.DB, after.id, 'signed', after.signedSha256); await readBlob(env.DB, after.id, 'certificate', after.certificateSha256) }
  await dispatchMail(env, after.id)
  return result
}
