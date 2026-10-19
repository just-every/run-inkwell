import { appendEvent, currentSigners, insist, object, routingOrder, type Envelope, type Env } from './model'
import { commitEnvelope } from './storage'
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
/** When a current recipient was invited: at approval for the first order, otherwise when the last lower order signed. */
function invitedAt(envelope: Envelope, signer: number) {
  const lower = envelope.signers.filter((_, i) => routingOrder(envelope, i) < routingOrder(envelope, signer)).map(s => s.signedAt!)
  return Date.parse(lower.length ? lower.sort().at(-1)! : envelope.events.find(e => e.action === 'envelope.approved')!.at)
}

/** The scheduled pass at `at`: send every reminder that is due. */
export async function sendReminders(env: Env, at: number) {
  if (mailSuppressed(env) || !businessDay(localDate(at)) || localHour(at) < reminderHour) return { sent: 0 }
  const rows = (await env.DB.prepare("SELECT data FROM iw_envelopes WHERE json_extract(data,'$.status')='awaiting_signature' AND json_extract(data,'$.reminders') IS NOT NULL AND json_extract(data,'$.expiresAt')>?")
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
  if (before.imported || !due.length) return 0
  const after = structuredClone(before)
  for (const i of due) await appendEvent(after, 'signer.reminded', 'inkwell', { signer: i, email: after.signers[i].email, passAt: new Date(at).toISOString(), count: after.events.filter(e => e.action === 'signer.reminded' && e.detail.signer === i).length + 1, emailSent: true })
  await commitEnvelope(env.DB, before, after, null, due.map(i => noticeWrite(env.DB, after, i, after.signers[i].email, `Reminder to sign: ${after.title}`, `${after.signers[i].name},\n\nThis is a reminder that ${after.title} is waiting for your signature.\nUse the link in your invitation email to review and sign. The invitation expires ${after.expiresAt}.`)))
  await dispatchMail(env, after.id)
  return due.length
}
