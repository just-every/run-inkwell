import { visibleFields } from './field-rules'
import { assertLockedValues } from './prefill'
import { active, currentSigners, insist, object, type Env } from './model'
import { accessGate, disclosureGate, type SigningContext } from './signing'

/** SIGNX-001: the verified signer whose turn it is saves what they have entered so far and finishes later from the same
 * link. Saved values are unsigned entries for their own fields: they sign nothing, are not evidence and stay out of the
 * audit trail and archives. They are offered back only to that signer, after the same verification as signing, while it
 * is their turn, and are cleared when they sign (electronically or on paper) or the envelope is declined or voided. */
export async function saveProgress(env: Env, context: SigningContext, input: Record<string, unknown>) {
  insist(context.verified, 'Verify your email before saving your progress.', 401)
  active(context.envelope); insist(currentSigners(context.envelope).includes(context.recipient.signer), 'This invitation is waiting for an earlier signer, or you have already signed.', 409)
  accessGate(context); disclosureGate(context.envelope.signers[context.recipient.signer], 'saving your progress')
  const fields = context.envelope.fields.filter(field => field.signer === context.recipient.signer), values: Record<string, string> = {}
  assertLockedValues(visibleFields(fields, object(input.values)), object(input.values))
  for (const [id, value] of Object.entries(object(input.values))) {
    const field = fields.find(candidate => candidate.id === id)
    insist(field, 'Save only the fields assigned to you.')
    insist(typeof value === 'string' && value.length <= 500 && !/[\r\n\t]/.test(value), `${field.label} must be one line of at most 500 characters.`)
    if (value.trim() || field.prefill) values[id] = value
  }
  const saved = await env.DB.prepare('UPDATE iw_signers SET progress=? WHERE envelope_id=? AND signer=? AND session_hash=? AND session_expires>?').bind(Object.keys(values).length ? JSON.stringify(values) : null, context.envelope.id, context.recipient.signer, context.recipient.session_hash, Date.now()).run()
  insist(saved.meta.changes === 1, 'Your signing session ended. Verify your email again to save.', 401)
  return { saved: Object.keys(values).length }
}
