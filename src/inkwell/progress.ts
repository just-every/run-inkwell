import { placedFields } from './freeform-fields'
import { atomic } from './storage'
import { validateBusinessValue } from './business-fields'
import { MAX_STAMP_VALUE } from './stamp-value'
import { visibleFields } from './field-rules'
import { assertLockedValues } from './prefill'
import { active, currentSigners, insist, object, type Env } from './model'
import { accessGate, disclosureGate, recipientOf, liveGuard, sessionGuard, type SigningContext } from './signing'

/** SIGNX-001: the verified signer whose turn it is saves what they have entered so far and finishes later from the same
 * link. Saved values are unsigned entries for their own fields: they sign nothing, are not evidence and stay out of the
 * audit trail and archives. They are offered back only to that signer, after the same verification as signing, while it
 * is their turn, and are cleared when they sign (electronically or on paper) or the envelope is declined or voided. */
export async function saveProgress(env: Env, context: SigningContext, input: Record<string, unknown>) {
  insist(context.verified, 'Verify your email before saving your progress.', 401)
  insist(!context.envelope.signers[context.recipient.signer].signedAt&&!context.envelope.signers[context.recipient.signer].completedAt,'This recipient has already completed their action.',409)
  active(context.envelope); insist(currentSigners(context.envelope).includes(context.recipient.signer), 'This invitation is waiting for an earlier signer, or you have already signed.', 409)
  accessGate(context); disclosureGate(recipientOf(context), 'saving your progress')
  const fields = context.envelope.freeForm ? placedFields(context.envelope, context.recipient.signer, input.fields) : context.envelope.fields.filter(field => field.signer === context.recipient.signer), values: Record<string, string> = {}
  insist(context.envelope.freeForm || input.fields === undefined, 'Fields cannot be placed in this envelope.')
  assertLockedValues(visibleFields(fields, object(input.values)), object(input.values))
  for (const [id, value] of Object.entries(object(input.values))) {
    const field = fields.find(candidate => candidate.id === id)
    insist(field, 'Save only the fields assigned to you.')
    insist(typeof value === 'string' && value.length <= (field.type === 'stamp' ? MAX_STAMP_VALUE : 500) && !/[\r\n\t]/.test(value), field.type === 'stamp' ? `Upload a stamp of at most 512 KiB for ${field.label}.` : `${field.label} must be one line of at most 500 characters.`)
    if (field.type === 'stamp') validateBusinessValue(field, value)
    if (value.trim() || field.prefill) values[id] = value
  }
  const progress = context.envelope.freeForm ? JSON.stringify({ fields, values }) : Object.keys(values).length ? JSON.stringify(values) : null
  await atomic(env.DB, [liveGuard(context), sessionGuard(context)], [env.DB.prepare('UPDATE iw_signers SET progress=? WHERE envelope_id=? AND signer=?').bind(progress, context.envelope.id, context.recipient.row)])
  return { saved: Object.keys(values).length }
}
