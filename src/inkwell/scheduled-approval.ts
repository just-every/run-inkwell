import { appendEvent, now, Refusal, type Envelope, type Env } from './model'
import { approvalSteps } from './internal-approval'
import { commitEnvelope, type Guard } from './storage'
import { dispatchMail } from './mail'
import { holdSend, sendingFingerprint } from './send-authority'
import type { SendDecision } from './send-policies'

/** ADMIN-004 A8: a new internal-approval requirement moves a scheduled send into ROUTE-004.
 * Preserve the original eligibility authority, but require a new decision even when that person is the approver. */
export async function requestScheduledApproval(env: Env, before: Envelope, principal: string, guard: Guard, denied: Guard, decision: SendDecision) {
  const rule = await env.DB.prepare("SELECT value FROM iw_settings WHERE key='internal_approval'").first<{ value: string }>()
  let steps
  try { steps = await approvalSteps(env, before, { id: '' }, true) }
  catch (error) {
    if (!(error instanceof Refusal)) throw error
    return holdSend(env, before, principal, denied, [], [], undefined, { code: 'send_policy_approval', reason: error.message, sendPolicy: decision.record })
  }
  const person = await env.DB.prepare('SELECT id,email,display_name AS name FROM oa_operators WHERE id=?').bind(principal).first<{ id: string; email: string; name: string }>()
  const after = structuredClone(before), at = now()
  after.status = 'prepared'
  delete after.scheduled
  delete after.freeFormSetting
  for (const signer of after.signers) { delete signer.routeResult; delete signer.activatedAt }
  after.internalApproval = { state: 'pending', requestedAt: at, requestedBy: person!, steps }
  await appendEvent(after, 'envelope.internal_approval_requested', 'inkwell', {
    ...before.events.findLast(e => e.action === 'envelope.approved')!.detail,
    sendingSha256: await sendingFingerprint(after), sendPolicy: decision.record,
    policyAddedApproval: true, eligibilityFrom: 'envelope.approved',
    steps: steps.map(({ approver, name, rules, why }) => ({ approver, name, rules, why })),
  }, at)
  await commitEnvelope(env, before, after, null, [
    env.DB.prepare('DELETE FROM iw_signers WHERE envelope_id=?').bind(after.id),
    env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND state='pending'").bind(after.id),
  ], [guard, { sql: "EXISTS(SELECT 1 FROM iw_settings WHERE key='internal_approval' AND value=?)", values: [rule!.value] }])
  await dispatchMail(env, after.id)
}
