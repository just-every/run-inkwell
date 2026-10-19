import { insist, type Actor, type Envelope, type Env } from './model'

/** MANAGE-001 (first slice): the envelope dashboard's search, filters and paging run in D1, so a sender with thousands
 * of envelopes gets one page and every status count without loading the rest. Status buckets follow the dashboard:
 * drafts await approval, waiting-for-me is the signed-in person's turn, and an unfinished envelope past its expiry is
 * expired. */
export const buckets = ['draft', 'waiting_for_me', 'waiting_for_others', 'completed', 'declined', 'voided', 'expired', 'imported'] as const
type Bucket = typeof buckets[number]

const current = "(SELECT lower(json_extract(s.value,'$.email')) FROM json_each(e.data,'$.signers') s WHERE json_extract(s.value,'$.signedAt') IS NULL ORDER BY CAST(s.key AS INTEGER) LIMIT 1)"
const bucket = `CASE WHEN json_extract(e.data,'$.status') IN ('prepared','awaiting_signature') AND json_extract(e.data,'$.expiresAt')<=?1 THEN 'expired' WHEN json_extract(e.data,'$.status')='prepared' THEN 'draft' WHEN json_extract(e.data,'$.status')='awaiting_signature' THEN CASE WHEN ${current}=?2 THEN 'waiting_for_me' ELSE 'waiting_for_others' END ELSE json_extract(e.data,'$.status') END`
const like = (value: string) => '%' + value.replace(/[\\%_]/g, c => '\\' + c) + '%'

export async function searchEnvelopes(env: Env, actor: Actor, params: URLSearchParams) {
  const q = (params.get('q') ?? '').trim().toLowerCase(), status = params.get('status') ?? 'all', sender = params.get('sender') ?? ''
  const from = params.get('from') ?? '', to = params.get('to') ?? '', cursor = params.get('cursor') ?? ''
  const limit = params.has('limit') ? Number(params.get('limit')) : 50
  insist(q.length <= 200, 'Search for at most 200 characters.')
  insist(status === 'all' || buckets.includes(status as Bucket), `Filter by one of: all, ${buckets.join(', ')}.`)
  insist(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'Ask for 1–100 envelopes per page.')
  for (const [value, label] of [[from, 'from'], [to, 'to']]) insist(!value || !Number.isNaN(Date.parse(value)), `Provide ${label} as a date.`)
  const where: string[] = [], values: unknown[] = [new Date().toISOString(), actor.email.toLowerCase()]
  if (q) { where.push(`(lower(json_extract(e.data,'$.title')) LIKE ?${values.length + 1} ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(e.data,'$.signers') s WHERE lower(json_extract(s.value,'$.email')) LIKE ?${values.length + 1} ESCAPE '\\' OR lower(json_extract(s.value,'$.name')) LIKE ?${values.length + 1} ESCAPE '\\'))`); values.push(like(q)) }
  if (sender) { where.push(`json_extract(e.data,'$.createdBy')=?${values.length + 1}`); values.push(sender) }
  if (from) { where.push(`json_extract(e.data,'$.createdAt')>=?${values.length + 1}`); values.push(new Date(from).toISOString()) }
  if (to) { where.push(`json_extract(e.data,'$.createdAt')<?${values.length + 1}`); values.push(new Date(to).toISOString()) }
  const filtered = `SELECT e.id, e.data, json_extract(e.data,'$.createdAt') AS created, ${bucket} AS bucket FROM iw_envelopes e${where.length ? ' WHERE ' + where.join(' AND ') : ''}`
  const counts = Object.fromEntries(buckets.map(b => [b, 0])) as Record<Bucket, number>
  for (const row of (await env.DB.prepare(`SELECT bucket, count(*) AS n FROM (${filtered}) GROUP BY bucket`).bind(...values).all<{ bucket: Bucket; n: number }>()).results) counts[row.bucket] = row.n
  const page: string[] = [], pageValues = [...values]
  if (status !== 'all') { page.push(`bucket=?${pageValues.length + 1}`); pageValues.push(status) }
  if (cursor) {
    const [created, id] = (() => { try { return JSON.parse(atob(cursor)) as [string, string] } catch { return [] } })()
    insist(typeof created === 'string' && typeof id === 'string', 'This page link is not valid. Start the search again.')
    page.push(`(created<?${pageValues.length + 1} OR (created=?${pageValues.length + 1} AND id<?${pageValues.length + 2}))`); pageValues.push(created, id)
  }
  const rows = (await env.DB.prepare(`SELECT id, data, created, bucket FROM (${filtered})${page.length ? ' WHERE ' + page.join(' AND ') : ''} ORDER BY created DESC, id DESC LIMIT ${limit + 1}`).bind(...pageValues).all<{ id: string; data: string; created: string; bucket: Bucket }>()).results
  const more = rows.length > limit, shown = rows.slice(0, limit)
  return {
    envelopes: shown.map(row => { const envelope: Envelope = JSON.parse(row.data); return { ...envelope, status: row.bucket === 'expired' ? 'expired' : envelope.status, bucket: row.bucket } }),
    counts, total: Object.values(counts).reduce((n, c) => n + c, 0),
    next: more ? btoa(JSON.stringify([shown.at(-1)!.created, shown.at(-1)!.id])) : null,
  }
}
