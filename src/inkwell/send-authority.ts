import { appendEvent, canonical, now, sha256, type Envelope, type Env } from './model'
import { dispatchMail } from './mail'
import { confirmedTemplateGuard } from './template-confirmation'
import { heldNoticeWrites } from './send-hold-notices'
import { commitEnvelope, memberRoleSql, type Guard } from './storage'

/** Fingerprint only the prepared sending definition, excluding decisions derived from it and approval history. */
export const sendingFingerprint = (e: Envelope) => sha256(canonical({
  ...(e.freeForm ? { freeForm: true } : {}),
  template: e.template ?? null, ...(e.documents?{documents:e.documents}:{}),
  title: e.title, filename: e.filename, originalSha256: e.originalSha256, expiresAt: e.expiresAt,
  signers: e.signers.map(({ routeResult, activatedAt, ...signer }) => signer), fields: e.fields,
  copies: e.copies?.map(({ routeResult, ...copy }) => copy) ?? [], supplements: e.supplements ?? [],
  subject: e.subject ?? '', message: e.message ?? '', reminders: e.reminders ?? null,
  allowPaper: Boolean(e.allowPaper), allowReassign: Boolean(e.allowReassign), approvalRule: e.approvalRule ?? null,
}))
export async function confirmedSendGuard(envelope: Envelope, operator: string, action: string) {
  const guard = sendAuthorityGuard(envelope, operator)
  const confirmation = envelope.events.findLast(e => e.action === action)
  const unchanged = confirmation?.detail.sendingSha256 === await sendingFingerprint(envelope)
  const policy = envelope.freeForm ? { sql: ' AND EXISTS(SELECT 1 FROM iw_freeform_policy WHERE id=1 AND enabled=1 AND version=?)', values: [confirmation?.detail.freeFormPolicyVersion ?? -1] } : { sql: '', values: [] }
  const template = confirmedTemplateGuard(envelope, confirmation?.detail.templateConfirmation)
  return allOf([{ sql: `${guard.sql} AND ?=1${policy.sql}`, values: [...guard.values, unchanged ? 1 : 0, ...policy.values] }, template])
}
/** SEND-001: deferred sends use current edit authority, independently of the old browser session. This predicate
 * and the envelope version are fenced in the batch that releases invitations or returns a held draft. */
export function sendAuthorityGuard(envelope: Envelope, operator: string): Guard {
  return {
    sql: `EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=? AND o.status='active' AND (o.role IN ('owner','admin') OR (o.role='member' AND ${memberRoleSql('o.id')}='sender' AND (o.id=? OR EXISTS(SELECT 1 FROM iw_shares s WHERE s.envelope_id=? AND s.operator_id=o.id AND s.access='edit')))))`,
    values: [operator, envelope.createdBy, envelope.id],
  }
}
/** Every guard must hold: the confirmation, the free-form setting and the send policy are fenced in one batch. */
export const allOf = (guards: Guard[]): Guard => ({ sql: guards.map(g => `(${g.sql})`).join(' AND '), values: guards.flatMap(g => g.values) })
export async function hasSendAuthority(env: Env, guard: Guard) {
  return Boolean((await env.DB.prepare(`SELECT (${guard.sql}) AS allowed`).bind(...guard.values).first<{ allowed: number }>())?.allowed)
}
export async function holdSend(env: Env, before: Envelope, operator: string, guard: Guard, writes: D1PreparedStatement[] = [], guards: Guard[] = [], decidingActor?: string, detail: Record<string, unknown> = {}) {
  const after = structuredClone(before), at = now()
  after.status = 'prepared'
  delete after.freeFormSetting
  delete after.scheduled
  delete after.internalApproval
  after.sendHold = { at }
  // No recipient has acted while waiting for dispatch. Discard the old approval's derived routing decisions and links.
  for (const signer of after.signers) { delete signer.routeResult; delete signer.activatedAt }
  await appendEvent(after, 'envelope.send_held', decidingActor ?? 'inkwell', { authority: operator, ...(decidingActor ? { attemptedDecision: 'approve', sendReleased: false } : {}), reason: 'The sending confirmation is no longer valid. A current editor must review and confirm again.', ...detail }, at)
  await commitEnvelope(env, before, after, null, [
    env.DB.prepare('DELETE FROM iw_signers WHERE envelope_id=?').bind(after.id),
    env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND state='pending'").bind(after.id),
    ...writes,
    ...await heldNoticeWrites(env, after, operator),
  ], [{ sql: `NOT (${guard.sql})`, values: guard.values }, ...guards])
  await dispatchMail(env, after.id)
}
