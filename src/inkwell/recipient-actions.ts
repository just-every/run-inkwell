import { accessGate, advanceAfterSigning, disclosureGate, liveGuard, recipientOf, sessionGuard, turn, type SigningContext } from './signing'
import { appendEvent, canonical, insist, now, object, sha256, text, type Env } from './model'
import { commandWrite, commitEnvelope, previousCommand } from './storage'
import { assertLockedValues } from './prefill'
import { resolveFieldValues, requiredField, visibleFields } from './field-rules'
import { signingDay, validateBusinessValue } from './business-fields'
import { validateSigningValues } from './pdf'
import { requireSupplements } from './supplements'
import { dispatchMail } from './mail'

/** Approving and supplying business fields finish a routing place without adopting a signature. */
export async function completeRecipient(env: Env, context: SigningContext, input: Record<string, unknown>, role: 'approver' | 'form_filler') {
  insist(context.verified, 'Verify your email before completing your action.', 401)
  const before = context.envelope, index = context.recipient.signer, person = before.signers[index]
  insist(person.role === role, 'Use only the action assigned to your recipient role.', 403)
  const commandId = text(input.commandId, 'a command ID', 100), fingerprint = await sha256(canonical({ role, values: input.values, consent: input.consent })), key = `recipient:${before.id}:${context.recipient.row}`
  const previous = await previousCommand(env.DB, key, commandId, fingerprint)
  if (previous) { await dispatchMail(env, before.id); return previous }
  turn(context); accessGate(context); disclosureGate(recipientOf(context), role === 'approver' ? 'approving' : 'completing your fields')
  requireSupplements(before, index, context.recipient.member)
  insist(input.consent === true, 'Explicit confirmation of your action is required.')
  const fields = before.fields.filter(f => f.signer === index), values: Record<string,string> = {}, completedAt = now()
  if (role === 'approver') insist(fields.length === 0 && input.values === undefined, 'An approver approves without supplying field values.')
  else {
    const raw = object(input.values)
    insist(Object.keys(raw).every(id => fields.some(f => f.id === id)), 'Complete only the fields assigned to you.')
    const supplied = { ...raw, ...Object.fromEntries(fields.filter(f => f.type === 'date_signed').map(f => [f.id, signingDay(completedAt, 'America/New_York')])) }, resolved = resolveFieldValues(fields, supplied)
    const visible = visibleFields(fields, resolved)
    assertLockedValues(visible, raw)
    for (const f of visible) {
      if (!requiredField(f, fields, resolved) && !resolved[f.id]) continue
      const value = text(resolved[f.id], f.label, 500)
      insist(!/[\r\n\t]/.test(value), 'Field values must fit on one line.')
      if (f.type === 'checkbox' && requiredField(f, fields, resolved)) insist(value === 'true', `Check ${f.label}.`)
      validateBusinessValue(f,value); values[f.id] = value
    }
    await validateSigningValues(before,index,values,{method:'typed',style:'sans'})
  }
  const after = structuredClone(before)
  after.signers[index] = { ...person, completedAt, ...(role === 'form_filler' ? { values } : {}) }
  await appendEvent(after, role === 'approver' ? 'recipient.approved' : 'recipient.filled', `signer:${index+1}`, { signer:index, role, email:person.email, consent:true, ...(role === 'form_filler' ? {valuesSha256:await sha256(canonical(values))} : {}), ...context.client }, completedAt)
  const result = { id:after.id, status:after.status, completedAt }
  const writes = await advanceAfterSigning(env,after,index)
  result.status = after.status
  await commitEnvelope(env,before,after,null,[...writes,commandWrite(env.DB,key,commandId,fingerprint,result)],[liveGuard(context),sessionGuard(context)])
  await dispatchMail(env,after.id)
  return result
}
