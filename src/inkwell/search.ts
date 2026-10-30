import { currentSigners, insist, type Actor, type Envelope, type Env } from './model'
import { mailSuppressed } from './manual-invitations'
import { accessFrom, mayShare, type Access } from './members'
import { pendingApprovers } from './internal-approval'

/** MANAGE-001: the envelope dashboard's search, filters and paging run in D1, so a sender with thousands of envelopes
 * gets one page and every status count without loading the rest; the Envelopes screen reads only through here. Status buckets follow the dashboard:
 * drafts await approval, waiting-for-me is the signed-in person's turn, and an unfinished envelope past its expiry is
 * expired. */
export const buckets = ['draft', 'waiting_for_me', 'waiting_for_others', 'completed', 'declined', 'voided', 'expired', 'imported'] as const
type Bucket = typeof buckets[number]

// ROUTE-002: it is my turn when I am an unsigned signer at the lowest routing order still open.
const order = (s: string) => `COALESCE(json_extract(${s}.value,'$.order'),CAST(${s}.key AS INTEGER)+1)`, open = (s: string) => `(json_extract(${s}.value,'$.signedAt') IS NULL AND json_extract(${s}.value,'$.completedAt') IS NULL OR json_extract(${s}.value,'$.witnessReturnRequired')=1) AND json_extract(${s}.value,'$.removedAt') IS NULL AND COALESCE(json_extract(${s}.value,'$.routeResult.state'),'')!='skipped'`
const myTurn = `EXISTS(SELECT 1 FROM json_each(e.data,'$.signers') s WHERE ${open('s')} AND (json_extract(s.value,'$.includeWhen') IS NULL OR json_extract(s.value,'$.routeResult.state')='included') AND lower(json_extract(s.value,'$.email'))=?2 AND ${order('s')}=(SELECT MIN(${order('o')}) FROM json_each(e.data,'$.signers') o WHERE ${open('o')}))`
// ROUTE-004 / MANAGE-003: a draft waiting for my internal approval is waiting for me.
// A sender finds every envelope a request named them on (internal-approval.ts namedApprover).
const pendingMine = `json_extract(e.data,'$.internalApproval.state')='pending' AND EXISTS(SELECT 1 FROM json_each(e.data,'$.internalApproval.steps') a WHERE json_extract(a.value,'$.approver')=?3 AND json_extract(a.value,'$.decision') IS NULL)`
const namedMe = `EXISTS(SELECT 1 FROM json_each(e.data,'$.events') ev, json_each(ev.value,'$.detail.steps') a WHERE json_extract(ev.value,'$.action')='envelope.internal_approval_requested' AND json_extract(a.value,'$.approver')=?3)`
const bucket = `CASE WHEN json_extract(e.data,'$.status') IN ('prepared','awaiting_signature') AND json_extract(e.data,'$.expiresAt')<=?1 THEN 'expired' WHEN json_extract(e.data,'$.status')='prepared' THEN CASE WHEN ${pendingMine} THEN 'waiting_for_me' ELSE 'draft' END WHEN json_extract(e.data,'$.status')='awaiting_signature' THEN CASE WHEN ${myTurn} THEN 'waiting_for_me' ELSE 'waiting_for_others' END ELSE json_extract(e.data,'$.status') END`
// Envelopes an agent's preparation token prepared (DELEGATE-001), for the dashboard's agent strip.
const byAgent = `EXISTS(SELECT 1 FROM json_each(e.data,'$.events') ev WHERE json_extract(ev.value,'$.action')='envelope.prepared' AND (json_extract(ev.value,'$.actor') LIKE 'agent:%' OR json_extract(ev.value,'$.detail.preparedBy.agent.id') IS NOT NULL))`
const like = (value: string) => '%' + value.replace(/[\\%_]/g, c => '\\' + c) + '%'

export async function searchEnvelopes(env: Env, actor: Actor, params: URLSearchParams) {
  const q = (params.get('q') ?? '').trim().toLowerCase(), status = params.get('status') ?? 'all', sender = params.get('sender') ?? ''
  const from = params.get('from') ?? '', to = params.get('to') ?? '', template = params.get('template') ?? '', cursor = params.get('cursor') ?? '', preparedBy = params.get('preparedBy') ?? ''
  const limit = params.has('limit') ? Number(params.get('limit')) : 50
  insist(q.length <= 200, 'Search for at most 200 characters.')
  insist(status === 'all' || buckets.includes(status as Bucket), `Filter by one of: all, ${buckets.join(', ')}.`)
  insist(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'Ask for 1–100 envelopes per page.')
  insist(!preparedBy || preparedBy === 'agent', 'Filter preparedBy by agent only.')
  for (const [value, label] of [[from, 'from'], [to, 'to']]) insist(!value || !Number.isNaN(Date.parse(value)), `Provide ${label} as a date.`)
  const where: string[] = [], values: unknown[] = [new Date().toISOString(), actor.email.toLowerCase(), actor.id]
  if (q) { where.push(`(lower(json_extract(e.data,'$.title')) LIKE ?${values.length + 1} ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(e.data,'$.signers') s WHERE lower(json_extract(s.value,'$.email')) LIKE ?${values.length + 1} ESCAPE '\\' OR lower(json_extract(s.value,'$.name')) LIKE ?${values.length + 1} ESCAPE '\\'))`); values.push(like(q)) }
  if (params.get('folder')) { where.push(`json_extract(e.data,'$.folderId')=?${values.length+1}`); values.push(params.get('folder')) }
  const field=params.get('customField'),value=params.get('customValue'),tag=params.get('tag')
  if(field){where.push(`EXISTS(SELECT 1 FROM json_each(e.data,'$.customFields') c WHERE lower(json_extract(c.value,'$.name'))=?${values.length+1}${value!==null?` AND lower(json_extract(c.value,'$.value'))=?${values.length+2}`:''})`);values.push(field.toLowerCase());if(value!==null)values.push(value.toLowerCase())}
  if(tag){where.push(`EXISTS(SELECT 1 FROM json_each(e.data,'$.tags') t WHERE lower(t.value)=?${values.length+1})`);values.push(tag.toLowerCase())}
  if(q){where[0]=where[0].slice(0,-1)+` OR EXISTS(SELECT 1 FROM json_each(e.data,'$.customFields') c WHERE lower(json_extract(c.value,'$.value')) LIKE ?4 ESCAPE '\\') OR EXISTS(SELECT 1 FROM json_each(e.data,'$.tags') t WHERE lower(t.value) LIKE ?4 ESCAPE '\\'))`}
  if(actor.apiKeyId)where.push(actor.testMode?"json_extract(e.data,'$.testMode')=1":"json_extract(e.data,'$.testMode') IS NULL")
  if (preparedBy) where.push(byAgent)
  // TMPL-001: envelopes sent from one template, by the template ID the envelope records.
  if (template) { where.push(`(json_extract(e.data,'$.template.id')=?${values.length + 1} OR EXISTS(SELECT 1 FROM json_each(e.data,'$.templates') t WHERE json_extract(t.value,'$.id')=?${values.length + 1}))`); values.push(template) }
  if (sender) { where.push(`json_extract(e.data,'$.createdBy')=?${values.length + 1}`); values.push(sender) }
  // ACCESS-001 / ADMIN-001: a sender finds the envelopes they created, those shared with them and (ROUTE-004) those they were asked to approve.
  if (actor.role === 'sender') where.push(`(json_extract(e.data,'$.createdBy')=?3 OR EXISTS(SELECT 1 FROM iw_effective_shares x WHERE x.envelope_id=e.id AND x.operator_id=?3) OR ${namedMe})`)
  if (from) { where.push(`json_extract(e.data,'$.createdAt')>=?${values.length + 1}`); values.push(new Date(from).toISOString()) }
  if (to) { where.push(`json_extract(e.data,'$.createdAt')<?${values.length + 1}`); values.push(new Date(to).toISOString()) }
  const filtered = `SELECT e.id, e.data, json_extract(e.data,'$.createdAt') AS created, ${bucket} AS bucket, (SELECT access FROM iw_effective_shares x WHERE x.envelope_id=e.id AND x.operator_id=?3) AS share FROM iw_envelopes e${where.length ? ' WHERE ' + where.join(' AND ') : ''}`
  const counts = Object.fromEntries(buckets.map(b => [b, 0])) as Record<Bucket, number>
  const page: string[] = [], pageValues = [...values]
  if (status !== 'all') { page.push(`bucket=?${pageValues.length + 1}`); pageValues.push(status) }
  if (cursor) {
    const [created, id] = (() => { try { return JSON.parse(atob(cursor)) as [string, string] } catch { return [] } })()
    insist(typeof created === 'string' && typeof id === 'string', 'This page link is not valid. Start the search again.')
    page.push(`(created<?${pageValues.length + 1} OR (created=?${pageValues.length + 1} AND id<?${pageValues.length + 2}))`); pageValues.push(created, id)
  }
  // One materialized search supplies both totals and the page: one D1 round trip and one evaluation of the
  // recipient search, access predicates and routing buckets, with totals and results from the same snapshot.
  type PageRow = { kind: 'envelope'; id: string; data: string; created: string; bucket: Bucket; share: string | null }
  const result = await env.DB.prepare(`WITH filtered AS MATERIALIZED (${filtered}),
    page AS (SELECT id, data, created, bucket, share FROM filtered${page.length ? ' WHERE ' + page.join(' AND ') : ''} ORDER BY created DESC, id DESC LIMIT ${limit + 1})
    SELECT 'count' AS kind, NULL AS id, NULL AS data, NULL AS created, bucket, NULL AS share, count(*) AS n FROM filtered GROUP BY bucket
    UNION ALL SELECT 'envelope' AS kind, id, data, created, bucket, share, NULL AS n FROM page
    ORDER BY kind, created DESC, id DESC`).bind(...pageValues).all<PageRow | { kind: 'count'; bucket: Bucket; n: number }>()
  // Keep documents in separate rows instead of aggregating the whole page into one large SQLite string.
  for (const row of result.results) if (row.kind === 'count') counts[row.bucket] = row.n
  const rows = result.results.filter((row): row is PageRow => row.kind === 'envelope')
  const more = rows.length > limit, shown = rows.slice(0, limit)
  return {
    envelopes: shown.map(row => { const envelope: Envelope = JSON.parse(row.data); return { ...presentEnvelope(env, actor, envelope, accessFrom(actor, envelope, row.share)), bucket: row.bucket } }),
    counts, total: Object.values(counts).reduce((n, c) => n + c, 0),
    next: more ? btoa(JSON.stringify([shown.at(-1)!.created, shown.at(-1)!.id])) : null,
  }
}

/** One envelope as the signed-in person reads it: expired once past its expiry, whether they may change it (ADMIN-001)
 * or share it, and the private-link and own-turn actions they may take on it now. */
export function presentEnvelope(env: Env, actor: Actor, envelope: Envelope, access: Access) {
  const open = !envelope.imported && envelope.status === 'awaiting_signature' && Date.parse(envelope.expiresAt) > Date.now()
  return { ...envelope, access, mayShare: mayShare(actor, envelope), status: ['prepared', 'awaiting_signature'].includes(envelope.status) && Date.parse(envelope.expiresAt) <= Date.now() ? 'expired' as const : envelope.status,
    manualInvitationAvailable: actor.role === 'owner' && mailSuppressed(env) && open && currentSigners(envelope).some(i=>!envelope.signers[i].inPerson),
    // ROUTE-004: this person is a named approver who has not yet decided, and the draft has not expired.
    approvalAvailable: pendingApprovers(envelope).some(s => s.approver === actor.id) && Date.parse(envelope.expiresAt) > Date.now(),
    ownSigningAvailable: open && currentSigners(envelope).some(i => !envelope.signers[i].inPerson && envelope.signers[i].email.toLowerCase() === actor.email.toLowerCase()) }
}
