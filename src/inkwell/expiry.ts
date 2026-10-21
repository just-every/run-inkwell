import { appendEvent, currentSigners, insist, party, text, type Envelope, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import { dispatchMail, noticeWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import type { CommandContext } from './envelopes'

/** DELIV-004: each envelope carries its own expiry, 120 days unless the sender sets another, at most a year out.
 * Every recipient whose turn it is and the sender are warned three days before it, and the sender can extend it before or after
 * it passes without preparing again. Account-wide and template defaults belong to ADMIN-004 and TMPL-001. */
const day = 86_400_000
export const defaultExpiryDays = 120, warningDays = 3, maxExpiryDays = 365

export function chooseExpiry(value: unknown, createdAt: string, expiryDays = defaultExpiryDays) {
  if (value === undefined) return new Date(Date.parse(createdAt) + expiryDays * day).toISOString()
  const at = Date.parse(text(value, 'an expiry date', 40))
  insist(!Number.isNaN(at), 'Provide the expiry as a date and time.')
  insist(at > Date.now(), 'Choose an expiry in the future.')
  insist(at <= Date.now() + maxExpiryDays * day, `Choose an expiry within ${maxExpiryDays} days.`)
  return new Date(at).toISOString()
}

export async function extendEnvelope(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  insist(!before.imported && ['prepared', 'awaiting_signature'].includes(before.status), 'Only an unfinished native envelope can be extended.', 409)
  insist(Number.isInteger(input.days) && (input.days as number) >= 1 && (input.days as number) <= maxExpiryDays, `Extend by 1–${maxExpiryDays} whole days.`)
  const days = input.days as number, from = before.expiresAt, expired = Date.parse(from) <= Date.now()
  const to = new Date(Math.max(Date.parse(from), Date.now()) + days * day)
  insist(to.getTime() <= Date.now() + maxExpiryDays * day, `An envelope can stay open at most ${maxExpiryDays} days from today.`)
  const after = structuredClone(before)
  after.expiresAt = to.toISOString()
  await appendEvent(after, 'envelope.extended', context.actor.id, { from, to: after.expiresAt, days, afterExpiry: expired })
  const result = { id: after.id, expiresAt: after.expiresAt }
  await commitEnvelope(env, before, after, context.actor, [commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

/** The scheduled pass: warn once for each expiry that falls within the warning window of `at`. */
export async function warnExpiring(env: Env, at: number) {
  const rows = (await env.DB.prepare("SELECT data FROM iw_envelopes WHERE json_extract(data,'$.status')='awaiting_signature' AND json_extract(data,'$.scheduled') IS NULL AND json_extract(data,'$.expiresAt')>? AND json_extract(data,'$.expiresAt')<=?")
    .bind(new Date(at).toISOString(), new Date(at + warningDays * day).toISOString()).all<{ data: string }>()).results
  const failures: unknown[] = []
  for (const row of rows) {
    const envelope: Envelope = JSON.parse(row.data)
    if (envelope.imported || envelope.events.some(e => e.action === 'envelope.expiry_warned' && e.detail.expiresAt === envelope.expiresAt)) continue
    try { await warn(env, envelope) } catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} expiry warning(s) failed.`)
  return { checked: rows.length }
}

async function warn(env: Env, before: Envelope) {
  const current = currentSigners(before), remote = current.filter(i => !before.signers[i].inPerson)
  const after = structuredClone(before), emailSent = !mailSuppressed(env)
  const notices = emailSent ? [
    // ROUTE-005: a group place warns every member at their own address.
    ...remote.flatMap(i => (before.signers[i].group?.members.map((_, m) => party(before, i, m)) ?? [before.signers[i]]).map(person => [i, person] as const)).map(([i, person]) => noticeWrite(env.DB, after, i, person.email, `Expires soon: ${after.title}`, `${person.name},\n\nYour invitation to sign ${after.title} expires ${after.expiresAt}.\nUse the link in your invitation email to review and sign before then.`)),
  ] : []
  await appendEvent(after, 'envelope.expiry_warned', 'inkwell', { expiresAt: after.expiresAt, signers: current, recipients: remote.map(i => before.signers[i].email), emailSent })
  await commitEnvelope(env, before, after, null, notices)
  await dispatchMail(env, after.id)
}
