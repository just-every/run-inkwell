import { appendEvent, currentSigners, insist, object, secret, sha256, text, type Envelope, type Env } from './model'
import { sealLink } from './links'
import { commitEnvelope } from './storage'
import { dispatchMail, invitationWrite } from './mail'
import { zoneInstant, zoneOffset } from './zone'

/** PREP-009: sending at a chosen wall-clock time in a US time zone. The person's eligibility approval with that time is
 * the send's authority (approved for later); the first invitations go on the first hourly pass at or after it, and
 * nobody can sign before then. A time that does not exist in the zone (the spring-forward hour) is refused. Scheduled
 * sends under the account's sending policy join with ADMIN-004 (SEND-001). */
export const usTimeZones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']
export type Schedule = NonNullable<Envelope['scheduled']>
export function chooseSchedule(value: unknown, expiresAt: string): Schedule | undefined {
  if (value === undefined || value === null) return undefined
  const input = object(value), local = text(input.at, 'the send time', 16), timeZone = text(input.timeZone, 'a time zone', 40)
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  insist(parts, 'Give the send time as YYYY-MM-DDTHH:MM.')
  insist(usTimeZones.includes(timeZone), `Choose a US time zone: ${usTimeZones.join(', ')}.`)
  const [, y, m, d, hh, mm] = parts.map(Number), wall = Date.UTC(y, m - 1, d, hh, mm), at = zoneInstant(wall, timeZone)
  insist(at + zoneOffset(at, timeZone) === wall, 'That time does not exist in that time zone.')
  insist(at > Date.now(), 'Schedule the send for a future time.')
  insist(at < Date.parse(expiresAt), 'Schedule the send before the envelope expires.')
  return { at: new Date(at).toISOString(), local, timeZone }
}

/** The hourly pass: send every approved envelope whose time has come. Approvers who sign at the first order still sign
 * in the app (ROUTE-009) and are not emailed. */
export async function sendScheduled(env: Env, at: number) {
  const rows = (await env.DB.prepare("SELECT data FROM iw_envelopes WHERE json_extract(data,'$.status')='awaiting_signature' AND json_extract(data,'$.scheduled.at')<=?").bind(new Date(at).toISOString()).all<{ data: string }>()).results
  const failures: unknown[] = []
  for (const row of rows) try { await send(env, JSON.parse(row.data), at) } catch (error) { failures.push(error) }
  if (failures.length) throw new AggregateError(failures, `${failures.length} scheduled send(s) failed.`)
}
async function send(env: Env, before: Envelope, at: number) {
  const after = structuredClone(before), schedule = after.scheduled!
  delete after.scheduled
  const inApp = (after.events.find(e => e.action === 'envelope.approved')?.detail.signsInApp as number[] | undefined) ?? []
  const first = currentSigners(after).filter(i => !inApp.includes(i))
  await appendEvent(after, 'envelope.sent_scheduled', 'inkwell', { scheduledFor: schedule.at, local: schedule.local, timeZone: schedule.timeZone, passAt: new Date(at).toISOString(), invited: first })
  const writes: D1PreparedStatement[] = []
  for (const i of first) { const token = secret(); writes.push(env.DB.prepare('UPDATE iw_signers SET token_hash=?,link_sealed=? WHERE envelope_id=? AND signer=?').bind(await sha256(token), await sealLink(env, after.id, i, token), after.id, i), invitationWrite(env, after, i, token)) }
  await commitEnvelope(env.DB, before, after, null, writes)
  await dispatchMail(env, after.id)
}
