import { apiCommandActor } from './api-command'
import { insertEnvelope } from './storage'
import { noticeWrites } from './notices'
import { templateConfirmation, confirmedTemplateGuard } from './template-confirmation'
import { freeFormPolicy, freeFormSendGuard } from './freeform-policy'
import { appendEvent, insist, now, object, text, type Actor, type ApprovalRule, type ApprovalStep, type Envelope, type Env, type Field } from './model'
import { atomic, commandWrite, commitEnvelope, getEnvelope, memberRoleSql, roleGuard } from './storage'
import { usdCents, usdDecimal } from './field-rules'
import { allOf, hasSendAuthority, holdSend, confirmedSendGuard, sendingFingerprint } from './send-authority'
import { evaluateSendPolicy, type SendDecision } from './send-policies'
import type { Schedule } from './schedule'
import type { CommandContext } from './envelopes'

/** ROUTE-004: internal approval before sending. An account rule (set or cleared by an owner or admin, kept with who set it
 * and when) and a template's rule (saved with the template's version and carried by every envelope prepared from it,
 * through draft edits and copies) each name one approver: an active owner, admin or sender, never a viewer. A rule with
 * no threshold covers every envelope. A rule with a threshold names a USD number field by its label (ignoring case and
 * surrounding spaces) and an amount; it covers an envelope with a number field of that label whose value is a locked
 * sender value (PREP-008) strictly above the amount, or is not a locked sender value (the amount is not known before
 * sending); an envelope with no such field is not covered. Both rules apply; each distinct approver they name must
 * approve. The person who confirms the send's eligibility (SEND-001) is the send's authority; when a rule covers the
 * envelope the draft waits, locked, with no invitations, links or in-app signing, until every named approver approves;
 * one rejection, with a reason of 3-500 characters, returns it to its sender as an editable draft. When that person is a
 * named approver, their own confirmation is that approval. A pending request keeps the rules as they were when it was
 * made, and each approver's role is checked again when they decide. A named approver may read the envelope from the
 * request onward, and keeps reading it after deciding, never editing or sharing it. ADMIN-004's sending policies require an internal approval through these rules
 * (SEND-001), and MANAGE-003's waiting-for-me list shows each approver their pending requests. */
const approverRoles = ['owner', 'admin', 'sender']
const accountKey = 'internal_approval'

/** An active person by ID or, with `byEmail`, by their email ignoring case. */
async function member(env: Env, key: string, byEmail = false) {
  return env.DB.prepare(`SELECT o.id, o.display_name AS name, o.email, CASE WHEN o.role='member' THEN ${memberRoleSql('o.id')} ELSE o.role END AS role FROM oa_operators o WHERE ${byEmail ? 'lower(o.email)=lower(?)' : 'o.id=?'} AND o.status='active'`).bind(key).first<{ id: string; name: string; email: string; role: string }>()
}

/** A rule as sent by the account settings or the template form, naming the approver by `approver` (their ID) or
 * `approverEmail`; null or absent is no rule. The approver's name and email are kept for display. */
export async function normalizeApprovalRule(env: Env, value: unknown): Promise<ApprovalRule | undefined> {
  if (value === undefined || value === null) return undefined
  const raw = object(value), approver = raw.approverEmail !== undefined ? await member(env, text(raw.approverEmail, 'the approver email', 254), true) : await member(env, text(raw.approver, 'an approver', 100))
  insist(approver && approverRoles.includes(approver.role), 'Name an active owner, admin or sender in this workspace as the approver.')
  const named = { approver: approver.id, name: approver.name, email: approver.email.toLowerCase() }
  if (raw.threshold === undefined || raw.threshold === null) return named
  const threshold = object(raw.threshold), field = text(threshold.field, 'the threshold field label', 80)
  insist(!/[\r\n\t]/.test(field), 'Use one line for the threshold field label.')
  return { ...named, threshold: { field, above: usdDecimal(usdCents(threshold.above, 'the approval threshold')) } }
}

/** Why `rule` covers an envelope with these fields, or nothing when it does not. */
export function ruleCovers(rule: ApprovalRule, fields: Field[]): string | undefined {
  if (!rule.threshold) return 'every envelope'
  const label = rule.threshold.field.trim().toLowerCase(), limit = usdCents(rule.threshold.above, 'the approval threshold')
  for (const field of fields.filter(f => f.type === 'number' && f.label.trim().toLowerCase() === label)) {
    if (!field.readOnly || !field.prefill) return `${field.label} is not a locked sender value`
    if (usdCents(field.prefill.value, field.label) > limit) return `${field.label} ${usdDecimal(usdCents(field.prefill.value, field.label))} USD is above ${rule.threshold.above} USD`
  }
  return undefined
}

export async function accountApprovalRule(env: Env) {
  const row = await env.DB.prepare('SELECT value, updated_at AS updatedAt, updated_by AS updatedBy FROM iw_settings WHERE key=?').bind(accountKey).first<{ value: string; updatedAt: string; updatedBy: string }>()
  return row ? { rule: JSON.parse(row.value) as ApprovalRule, updatedAt: row.updatedAt, updatedBy: row.updatedBy } : null
}
/** The account rule, for owners and admins. */
export async function approvalView(env: Env) {
  const current = await accountApprovalRule(env)
  return current ? { ...current.rule, updatedAt: current.updatedAt, updatedBy: current.updatedBy } : null
}

/** `account.internal_approval`: set the account rule (`rule`) or clear it (`rule: null`). */
export async function setAccountApproval(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(context.actor.role === 'owner' || context.actor.role === 'admin', 'Only an owner or admin can change account settings.', 403)
  const rule = await normalizeApprovalRule(env, input.rule), result = { rule: rule ?? null }
  await atomic(env.DB, [roleGuard(context.actor, ['owner', 'admin'])], [
    rule ? env.DB.prepare('INSERT INTO iw_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(accountKey, JSON.stringify(rule), now(), context.actor.id)
      : env.DB.prepare('DELETE FROM iw_settings WHERE key=?').bind(accountKey),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

/** The approvals sending `envelope` needs now, one per distinct approver; the confirming person's own is already given. */
export async function approvalSteps(env: Env, envelope: Envelope, actor: Pick<Actor, 'id'>, policyRequires = false): Promise<ApprovalStep[]> {
  const steps: ApprovalStep[] = [], at = now()
  // ADMIN-004: a send policy that requires an internal approval makes the account rule's approver decide, whatever its threshold.
  insist(!policyRequires || (await accountApprovalRule(env)), 'The send policy for this source requires an internal approval, but the account names no approver. Ask an owner or admin to set one.', 409)
  for (const [source, rule] of [['account', (await accountApprovalRule(env))?.rule], ...(envelope.approvalRules ?? (envelope.approvalRule ? [envelope.approvalRule] : [])).map(rule => ['template', rule] as const)] as const) {
    const why = rule && (policyRequires && source === 'account' ? 'the send policy requires an internal approval' : ruleCovers(rule, envelope.fields))
    if (!rule || !why) continue
    let step = steps.find(s => s.approver === rule.approver)
    if (!step) {
      const approver = await member(env, rule.approver)
      insist(approver && approverRoles.includes(approver.role), `The ${source} approval rule names someone who can no longer approve. Ask ${source === 'account' ? 'an owner or admin' : 'whoever edits the template'} to name another approver.`, 409)
      step = { approver: approver.id, name: approver.name, email: approver.email.toLowerCase(), rules: [], why: [] }
      steps.push(step)
    }
    if (!step.rules.includes(source)) step.rules.push(source); if (!step.why.includes(why)) step.why.push(why)
  }
  for (const step of steps) if (step.approver === actor.id) Object.assign(step, { decision: 'approved', decidedAt: at, bySender: true })
  return steps
}
export const pendingApprovers = (envelope: Envelope) => envelope.internalApproval?.state === 'pending' ? envelope.internalApproval.steps.filter(s => !s.decision) : []
/** Anyone a request named may read the envelope (ADMIN-001 view access) from that request onward, and keeps reading the
 * envelopes they decided after a later send or request no longer names them, for the audit trail. */
export const namedApprover = (envelope: Envelope, operator: string) => envelope.events.some(e => e.action === 'envelope.internal_approval_requested' && (e.detail.steps as { approver: string }[]).some(s => s.approver === operator))

export const eligibilityStatement = 'I confirm this document is eligible for electronic signature and consent to sending these fixed bytes to the listed signers in order.'
/** The confirmed send waits for the approvers: the draft is locked and nobody is invited. */
export async function requestApproval(env: Env, context: CommandContext, before: Envelope, steps: ApprovalStep[], schedule: Schedule | undefined, decision: SendDecision, creating?: D1PreparedStatement[]) {
  const after = structuredClone(before), at = now(), waiting = steps.filter(s => !s.decision)
  const policy = before.freeForm ? await freeFormPolicy(env) : undefined
  const templateSnapshot = await templateConfirmation(env, before)
  delete after.sendHold
  after.internalApproval = { state: 'pending', requestedAt: at, requestedBy: { id: context.actor.id, name: context.actor.name, email: context.actor.email.toLowerCase() }, ...(schedule ? { schedule } : {}), steps }
  await appendEvent(after, 'envelope.internal_approval_requested', context.actor.id, { ...(templateSnapshot ? { templateConfirmation: templateSnapshot } : {}), ...(policy ? { freeForm: true, freeFormPolicyVersion: policy.version } : {}), sendPolicy: decision.record, sendingSha256: await sendingFingerprint(after), sendOrigin:after.sendOrigin??null,eligible:!after.sendOrigin,consent:!after.sendOrigin,statement:after.sendOrigin?'Sending authorized by the autonomous API policy; no per-envelope human confirmation.':eligibilityStatement, originalSha256: after.originalSha256, steps: steps.map(({ approver, name, rules, why, bySender }) => ({ approver, name, rules, why, ...(bySender ? { approvedBySender: true } : {}) })), ...(schedule ? { sendAt: schedule.at, sendAtLocal: schedule.local, timeZone: schedule.timeZone } : {}) }, at)
  const result = { id: after.id, status: after.status, waitingForApproval: waiting.map(s => s.name) }
  const writes=[commandWrite(env.DB,apiCommandActor(context.actor),context.commandId,context.fingerprint,result)],guards=[...(context.guards??[]),...(policy?[freeFormSendGuard(policy)]:[]),decision.fence,confirmedTemplateGuard(before,templateSnapshot)]
  if(creating)await insertEnvelope(env.DB,after,context.actor,[...creating,...writes,...await noticeWrites(env,before,after)],guards)
  else await commitEnvelope(env,before,after,context.actor,writes,guards)
  return result
}

/** `envelope.internal_decide`: a named approver approves (`decision: 'approve'`) or rejects with a reason. The last
 * approval sends the envelope as its confirming person's approval would have (`send`); a schedule whose time has passed
 * sends now. */
export async function decideApproval(env: Env, context: CommandContext, input: Record<string, unknown>, send: (before: Envelope, after: Envelope, schedule?: Schedule) => Promise<Record<string, unknown>>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID')), request = before.internalApproval
  insist(!before.imported && before.status === 'prepared' && request?.state === 'pending', 'This envelope is not waiting for internal approval.', 409)
  const index = request.steps.findIndex(s => s.approver === context.actor.id && !s.decision)
  insist(index >= 0 && approverRoles.includes(context.actor.role), 'Only a named approver who has not yet decided can approve or reject this envelope.', 403)
  insist(input.decision === 'approve' || input.decision === 'reject', 'Choose approve or reject.')
  const after = structuredClone(before), step = after.internalApproval!.steps[index], at = now()
  if (input.decision === 'reject') {
    const reason = text(input.reason, 'a reason for the rejection', 500).replace(/\s+/g, ' ')
    insist(reason.length >= 3, 'Give a reason for the rejection (at least 3 characters).')
    Object.assign(step, { decision: 'rejected', decidedAt: at, reason }); after.internalApproval!.state = 'rejected'
    await appendEvent(after, 'envelope.internal_rejected', context.actor.id, { approver: step.approver, name: step.name, reason }, at)
    const result = { id: after.id, status: after.status, rejected: true }
    await commitEnvelope(env, before, after, null, [commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)], [roleGuard(context.actor)])
    return result
  }
  Object.assign(step, { decision: 'approved', decidedAt: at })
  await appendEvent(after, 'envelope.internal_approved', context.actor.id, { approver: step.approver, name: step.name }, at)
  const waiting = pendingApprovers(after)
  if (waiting.length) {
    const result = { id: after.id, status: after.status, waitingForApproval: waiting.map(s => s.name) }
    await commitEnvelope(env, before, after, null, [commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)], [roleGuard(context.actor)])
    return result
  }
  const confirmation = await confirmedSendGuard(before, request.requestedBy.id, 'envelope.internal_approval_requested')
  const deferred = Boolean(request.schedule && Date.parse(request.schedule.at) > Date.now()), decision = await evaluateSendPolicy(env, before, request.requestedBy.id, { deferred, approved: true, stage: 'release' })
  const authority = allOf([confirmation, ...(before.freeForm ? [freeFormSendGuard(await freeFormPolicy(env))] : []), decision.fence])
  if (!await hasSendAuthority(env, authority)) {
    const result = { id: before.id, status: 'prepared', held: true }
    await holdSend(env, before, request.requestedBy.id, authority, [commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)], [roleGuard(context.actor)], context.actor.id, decision.allowed ? {} : { reason: decision.reason, code: decision.code, sendPolicy: decision.record })
    return result
  }
  after.internalApproval!.state = 'approved'
  const schedule = request.schedule && Date.parse(request.schedule.at) > Date.now() ? request.schedule : undefined
  return send(before, after, schedule)
}
