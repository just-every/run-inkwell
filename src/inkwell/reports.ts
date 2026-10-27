import { insist, type Actor, type Env } from './model'
import { accountTimeZone, zoneInstant } from './zone'

/** MANAGE-004: what happened to envelopes over a range of whole days in the account's time zone, both days included.
 * Sent counts approvals in the range, completed and declined count those outcomes in the range, and expired counts
 * sent, unfinished envelopes whose expiry passed in the range; a withdrawal of consent (SIGNX-005) counts as declined. Time to complete runs from approval to completion, in
 * hours, over the envelopes completed in the range: the median (the mean of the middle two for an even count) and the
 * mean, each rounded to 0.1 hour. Rows group by the member who prepared the envelope; a sender sees only their own.
 * Imported records are not counted. Template rows use the saved template ID across versions, labelled by the most recent included send. */
export const reportLimitDays = 731
const day = /^(\d{4})-(\d{2})-(\d{2})$/
/** Midnight at the start of `value` (YYYY-MM-DD) in the account's zone, plus `days`. */
function midnight(value: string, days = 0) {
  const [, y, m, d] = day.exec(value)!.map(Number), wall = Date.UTC(y, m - 1, d + days)
  return zoneInstant(wall)
}

interface Row { templateId: string | null; templateTitle: string | null; sender: string; name: string | null; email: string | null; sent: string | null; completed: string | null; declined: string | null; expired: string | null }
export interface SenderLine { id: string; name: string; email: string; sent: number; completed: number; declined: number; expired: number; medianHoursToComplete: number | null; averageHoursToComplete: number | null }
const round = (hours: number) => Math.round(hours * 10) / 10
function summarise(rows: Row[], from: string, to: string) {
  const within = (at: string | null) => Boolean(at && at >= from && at < to)
  const hours = rows.filter(r => within(r.completed) && r.sent).map(r => (Date.parse(r.completed!) - Date.parse(r.sent!)) / 3_600_000).sort((a, b) => a - b)
  const middle = hours.length / 2
  return { sent: rows.filter(r => within(r.sent)).length, completed: rows.filter(r => within(r.completed)).length, declined: rows.filter(r => within(r.declined)).length, expired: rows.filter(r => within(r.expired)).length,
    medianHoursToComplete: hours.length ? round(hours.length % 2 ? hours[Math.floor(middle)] : (hours[middle - 1] + hours[middle]) / 2) : null,
    averageHoursToComplete: hours.length ? round(hours.reduce((sum, h) => sum + h, 0) / hours.length) : null }
}

export async function envelopeReport(env: Env, actor: Actor, params: URLSearchParams) {
  const fromDay = params.get('from') ?? '', toDay = params.get('to') ?? ''
  insist(day.test(fromDay) && day.test(toDay) && !Number.isNaN(Date.parse(fromDay)) && !Number.isNaN(Date.parse(toDay)), 'Provide from and to as dates (YYYY-MM-DD).')
  const from = new Date(midnight(fromDay)).toISOString(), to = new Date(midnight(toDay, 1)).toISOString()
  insist(from < to, 'The range must end on or after the day it starts.')
  insist(Date.parse(to) - Date.parse(from) <= reportLimitDays * 86_400_000 + 3_600_000, `Report on at most ${reportLimitDays} days at a time.`)
  const at = (action: string) => `(SELECT json_extract(v.value,'$.at') FROM json_each(e.data,'$.events') v WHERE json_extract(v.value,'$.action')='${action}' LIMIT 1)`
  const facts = `SELECT json_extract(e.data,'$.template.id') AS templateId, json_extract(e.data,'$.template.title') AS templateTitle, json_extract(e.data,'$.createdBy') AS sender, ${at('envelope.approved')} AS sent, ${at('envelope.completed')} AS completed,
    (SELECT MIN(json_extract(s.value,'$.declinedAt')) FROM json_each(e.data,'$.signers') s) AS declined,
    CASE WHEN json_extract(e.data,'$.status') IN ('awaiting_signature','expired') AND json_extract(e.data,'$.expiresAt')<=?3 THEN json_extract(e.data,'$.expiresAt') END AS expired
    FROM iw_envelopes e WHERE json_extract(e.data,'$.testMode') IS NULL AND json_extract(e.data,'$.imported') IS NULL${actor.role === 'sender' ? ' AND json_extract(e.data,\'$.createdBy\')=?4' : ''}`
  const rows = (await env.DB.prepare(`SELECT f.*, o.display_name AS name, o.email FROM (${facts}) f LEFT JOIN oa_operators o ON o.id=f.sender WHERE f.sent IS NOT NULL AND ((f.sent>=?1 AND f.sent<?2) OR (f.completed>=?1 AND f.completed<?2) OR (f.declined>=?1 AND f.declined<?2) OR (f.expired>=?1 AND f.expired<?2)) ORDER BY f.sent DESC, f.templateTitle`)
    .bind(from, to, new Date().toISOString(), ...(actor.role === 'sender' ? [actor.id] : [])).all<Row>()).results
  const groups = new Map<string, Row[]>()
  for (const row of rows) groups.set(row.sender, [...(groups.get(row.sender) ?? []), row])
  const senders: SenderLine[] = [...groups].map(([id, list]) => ({ id, name: list[0].name ?? id, email: list[0].email ?? '', ...summarise(list, from, to) })).sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name))
  const templateGroups = new Map<string, Row[]>()
  for (const row of rows) if (row.templateId) templateGroups.set(row.templateId, [...(templateGroups.get(row.templateId) ?? []), row])
  const templates = [...templateGroups].map(([id, list]) => ({ id, title: list[0].templateTitle ?? id, ...summarise(list, from, to) })).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  return { from: fromDay, to: toDay, timeZone: accountTimeZone, totals: summarise(rows, from, to), senders, templates }
}

// A cell as CSV: quoted when needed, and never read as a spreadsheet formula.
const cell = (value: string | number | null) => { let text = value === null ? '' : String(value); if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text }
export function reportCsv(report: Awaited<ReturnType<typeof envelopeReport>>) {
  const header = ['sender', 'email', 'sent', 'completed', 'declined', 'expired', 'median_hours_to_complete', 'average_hours_to_complete', 'template_id', 'template']
  const line = (name: string, email: string, s: ReturnType<typeof summarise>, templateId = '', template = '') => [name, email, s.sent, s.completed, s.declined, s.expired, s.medianHoursToComplete, s.averageHoursToComplete, templateId, template].map(cell).join(',')
  return [header.join(','), ...report.senders.map(s => line(s.name, s.email, s)), line('All senders', '', report.totals), ...report.templates.map(t => line('', '', t, t.id, t.title))].join('\r\n') + '\r\n'
}
