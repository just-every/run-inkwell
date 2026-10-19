import { active, appendEvent, currentSigners, insist, now, object, routingOrder, text, type Envelope, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope } from './storage'
import type { CommandContext } from './envelopes'
import { envelopeMessages } from './delivery'
import { bouncedRecipients } from './bounces'
import { dispatchMail, noticeWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { accountTimeZone } from './zone'

/** DELIV-003: an envelope can remind each recipient whose turn it is, first after `afterDays` business days from their
 * invitation and then every `everyDays` business days after the previous reminder. Business days are Monday to Friday
 * in the account's time zone (America/New_York until ADMIN-004 lets the owner choose another US zone); a reminder
 * goes out on the first hourly pass at or after 09:00 local time on the day it is due. Reminders stop at signature,
 * decline, void or expiry, never reach a recipient still waiting for an earlier order or one whose paper scan awaits
 * review, and are not sent or recorded when mail is not set up. Account and template defaults belong to ADMIN-004
 * and TMPL-001. */
export interface Reminders { afterDays: number; everyDays: number }
export const reminderHour = 9, maxReminderDays = 30

export function chooseReminders(value: unknown): Reminders | undefined {
  if (value === undefined || value === null) return undefined
  const input = object(value)
  for (const key of ['afterDays', 'everyDays'] as const) insist(Number.isInteger(input[key]) && (input[key] as number) >= 1 && (input[key] as number) <= maxReminderDays, `Set reminders in whole business days from 1 to ${maxReminderDays}.`)
  return { afterDays: input.afterDays as number, everyDays: input.everyDays as number }
}

const localDate = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: accountTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
const localHour = (at: number) => Number(new Intl.DateTimeFormat('en-US', { timeZone: accountTimeZone, hour: 'numeric', hourCycle: 'h23' }).format(at))
const weekday = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay()
const businessDay = (date: string) => weekday(date) !== 0 && weekday(date) !== 6
/** Business days after `from` up to and including `to`, both local dates. */
function businessDaysBetween(from: string, to: string) {
  let count = 0
  for (let day = Date.parse(from + 'T12:00:00Z') + 86_400_000; day <= Date.parse(to + 'T12:00:00Z'); day += 86_400_000) if (businessDay(new Date(day).toISOString().slice(0, 10))) count++
  return count
}
/** When a current recipient was invited: at approval (or the scheduled send, PREP-009) for the first order, otherwise
 * when the last lower order signed. */
function invitedAt(envelope: Envelope, signer: number) {
  const lower = envelope.signers.filter((s, i) => !s.removedAt && routingOrder(envelope, i) < routingOrder(envelope, signer)).map(s => s.signedAt!)
  return Date.parse(lower.length ? lower.sort().at(-1)! : (envelope.events.find(e => e.action === 'envelope.sent_scheduled') ?? envelope.events.find(e => e.action === 'envelope.approved')!).at)
}

/** The scheduled pass at `at`: send every reminder that is due. */
export async function sendReminders(env: Env, at: number) {
  if (mailSuppressed(env) || !businessDay(localDate(at)) || localHour(at) < reminderHour) return { sent: 0 }
  const rows = (await env.DB.prepare("SELECT data FROM iw_envelopes WHERE json_extract(data,'$.status')='awaiting_signature' AND json_extract(data,'$.reminders') IS NOT NULL AND json_extract(data,'$.scheduled') IS NULL AND json_extract(data,'$.expiresAt')>?")
    .bind(new Date(at).toISOString()).all<{ data: string }>()).results
  const failures: unknown[] = []
  let sent = 0
  for (const row of rows) {
    const envelope: Envelope = JSON.parse(row.data)
    try { sent += await remind(env, envelope, at) } catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} reminder(s) failed.`)
  return { sent }
}

async function remind(env: Env, before: Envelope, at: number) {
  const settings = before.reminders!, today = localDate(at)
  const due = currentSigners(before).filter(i => {
    if (before.signers[i].paper?.status === 'pending') return false
    const last = before.events.filter(e => e.action === 'signer.reminded' && e.detail.signer === i).at(-1)
    return businessDaysBetween(localDate(last ? Date.parse(last.detail.passAt as string) : invitedAt(before, i)), today) >= (last ? settings.everyDays : settings.afterDays)
  })
  // DELIV-002: a recipient whose invitation bounced is not reminded until the sender corrects the address.
  const bounced = due.length ? bouncedRecipients(before, await envelopeMessages(env, before.id)).map(entry => entry.signer) : []
  due.splice(0, due.length, ...due.filter(i => !bounced.includes(i)))
  if (before.imported || !due.length) return 0
  const after = structuredClone(before)
  for (const i of due) await appendEvent(after, 'signer.reminded', 'inkwell', { signer: i, email: after.signers[i].email, passAt: new Date(at).toISOString(), count: after.events.filter(e => e.action === 'signer.reminded' && e.detail.signer === i).length + 1, emailSent: true })
  await commitEnvelope(env, before, after, null, due.map(i => reminderWrite(env, after, i)))
  await dispatchMail(env, after.id)
  return due.length
}
const reminderWrite = (env: Env, envelope: Envelope, i: number) => noticeWrite(env.DB, envelope, i, envelope.signers[i].email, `Reminder to sign: ${envelope.title}`, `${envelope.signers[i].name},\n\nThis is a reminder that ${envelope.title} is waiting for your signature.\nUse the link in your invitation email to review and sign. The invitation expires ${envelope.expiresAt}.`)

/** MANAGE-005: the detail page's remind action. One reminder now to each recipient whose turn it is, never to one still
 * waiting for an earlier order, one whose paper scan awaits review or one whose invitation bounced (DELIV-002); recorded like a scheduled reminder, so the next
 * automatic one (DELIV-003) counts its business days from this one. Refused when mail is not set up. */
export async function remindNow(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  active(before)
  insist(!mailSuppressed(env), 'Mail is not set up, so no reminder can be emailed. Create a new signing link instead.', 409)
  const bounced = bouncedRecipients(before, await envelopeMessages(env, before.id)).map(entry => entry.signer)
  const due = currentSigners(before).filter(i => before.signers[i].paper?.status !== 'pending' && !bounced.includes(i))
  insist(due.length, bounced.length ? 'The current recipient’s invitation bounced: correct their email address instead.' : 'The current recipient’s paper signature is waiting for your review, so nobody is reminded.', 409)
  const after = structuredClone(before), at = now()
  for (const i of due) await appendEvent(after, 'signer.reminded', context.actor.id, { signer: i, email: after.signers[i].email, passAt: at, count: after.events.filter(e => e.action === 'signer.reminded' && e.detail.signer === i).length + 1, emailSent: true, manual: true })
  const result = { id: after.id, reminded: due.map(i => after.signers[i].email) }
  await commitEnvelope(env, before, after, context.actor, [commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result), ...due.map(i => reminderWrite(env, after, i))])
  await dispatchMail(env, after.id)
  return result
}
