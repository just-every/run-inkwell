import { insist, type Env } from './model'

export interface AccountAuditEntry {
  id: string
  at: string
  actorId: string
  action: string
  target: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}
export interface AccountAuditPage { entries: AccountAuditEntry[]; nextCursor: string | null }
type Row = Omit<AccountAuditEntry, 'before' | 'after'> & { beforeJson: string | null; afterJson: string | null }

function cursor(value: string) {
  try {
    const parsed: unknown = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')))
    insist(Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(parsed[0]) && typeof parsed[1] === 'string' && /^[a-f0-9]{32}$/.test(parsed[1]), 'Invalid account audit cursor.')
    return parsed as [string, string]
  } catch { insist(false, 'Invalid account audit cursor.') }
}
const encodeCursor = (entry: AccountAuditEntry) => btoa(JSON.stringify([entry.at, entry.id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Authorization belongs to the owner or admin HTTP handler. The opaque id breaks
 * timestamp ties, so a page boundary never drops simultaneous audit entries. */
export async function listAccountAudit(env: Pick<Env, 'DB'>, params = new URLSearchParams()): Promise<AccountAuditPage> {
  const requested = params.get('limit') ?? '50'
  insist(/^\d+$/.test(requested) && Number(requested) >= 1 && Number(requested) <= 200, 'Choose an audit page size from 1 to 200.')
  const limit = Number(requested), where: string[] = [], values: unknown[] = []
  for (const [parameter, column] of [['actor', 'actor_id'], ['action', 'action'], ['target', 'target']] as const) {
    const value = params.get(parameter)?.trim()
    if (value) { insist(value.length <= 300, 'An audit filter is too long.'); where.push(`${column}=?`); values.push(value) }
  }
  const q = params.get('q')?.trim()
  if (q) {
    insist(q.length <= 300, 'The audit search is too long.')
    where.push("(instr(lower(actor_id),lower(?))>0 OR instr(lower(action),lower(?))>0 OR instr(lower(target),lower(?))>0 OR instr(lower(COALESCE(before_json,'')),lower(?))>0 OR instr(lower(COALESCE(after_json,'')),lower(?))>0)")
    values.push(q, q, q, q, q)
  }
  const next = params.get('cursor')
  if (next) { const [at, id] = cursor(next); where.push('(at<? OR (at=? AND id<?))'); values.push(at, at, id) }
  const rows = (await env.DB.prepare(`SELECT id,at,actor_id AS actorId,action,target,before_json AS beforeJson,after_json AS afterJson FROM iw_account_audit_visible${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY at DESC,id DESC LIMIT ?`).bind(...values, limit + 1).all<Row>()).results
  const entries = rows.slice(0, limit).map(({ beforeJson, afterJson, ...entry }) => ({ ...entry, before: beforeJson === null ? null : JSON.parse(beforeJson) as Record<string, unknown>, after: afterJson === null ? null : JSON.parse(afterJson) as Record<string, unknown> }))
  return { entries, nextCursor: rows.length > limit ? encodeCursor(entries[entries.length - 1]) : null }
}

// Prefix spreadsheet formula initiators, including leading whitespace or control
// characters. Quote every field and escape embedded quotes and newlines per CSV.
const csvCell = (value: string) => `"${(/^[\s\x00-\x1f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" : '') + value.replace(/"/g, '""')}"`
function pageCsv(data: AccountAuditPage | readonly AccountAuditEntry[]): string {
  const entries: readonly AccountAuditEntry[] = Array.isArray(data) ? data : (data as AccountAuditPage).entries
  const rows = [['id', 'at', 'actor_id', 'action', 'target', 'before', 'after'], ...entries.map(entry => [entry.id, entry.at, entry.actorId, entry.action, entry.target, entry.before === null ? '' : JSON.stringify(entry.before), entry.after === null ? '' : JSON.stringify(entry.after)])]
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Export all matching pages, independently of the screen's current cursor. */
export function auditCsv(data: AccountAuditPage | readonly AccountAuditEntry[]): string
export function auditCsv(env: Pick<Env, 'DB'>, params?: URLSearchParams): Promise<string>
export function auditCsv(data: AccountAuditPage | readonly AccountAuditEntry[] | Pick<Env, 'DB'>, params = new URLSearchParams()): string | Promise<string> {
  if (!('DB' in data)) return pageCsv(data)
  return (async () => {
    const filters = new URLSearchParams(params)
    filters.delete('cursor')
    filters.set('limit', '200')
    const pages: string[] = []
    do {
      const page = await listAccountAudit(data, filters)
      const csv = pageCsv(page)
      pages.push(pages.length ? csv.slice(csv.indexOf('\r\n') + 2) : csv)
      if (!page.nextCursor) break
      filters.set('cursor', page.nextCursor)
    } while (true)
    return pages.join('')
  })()
}

