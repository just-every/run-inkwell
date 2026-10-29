import { insist } from './model'
import { atomic } from './storage'

const sources = [
  ['envelopes', 'iw_envelopes', 'id', 'data'],
  ['threads', 'iw_comment_threads', 'id', 'data'],
  ['replies', 'iw_followup_replies', 'id', 'data'],
  ['questions', 'iw_agent_requests', 'id', 'data'],
  ['inbound', 'iw_agent_inbound', 'envelope_id', 'data'],
  ['attachments', 'iw_agent_attachments', 'id', 'data'],
  ['imports', 'iw_imported_archives', 'id', 'value'],
] as const
const suffixes = { envelopes: 'e', blobs: 'b', threads: 't', imports: 'i', replies: 'r', questions: 'q', inbound: 'a', attachments: 'p' } as const
/** Used only to retire existing snapshots; new jobs never create schema objects. */
function legacyTable(job: string, kind: keyof typeof suffixes) {
  insist(/^[a-f0-9-]{36}$/.test(job), 'Export job not found.', 404)
  return 'iw_exit_' + job.replaceAll('-', '') + '_' + suffixes[kind]
}
export function discardSnapshotQueries(job: string) {
  return [
    { sql: 'DELETE FROM iw_exit_snapshot_records WHERE job=?', params: [job] },
    { sql: 'DELETE FROM iw_exit_snapshot_blobs WHERE job=?', params: [job] },
    ...Object.keys(suffixes).map(kind => ({ sql: `DROP TABLE IF EXISTS "${legacyTable(job, kind as keyof typeof suffixes)}"`, params: [] as string[] })),
  ]
}
export function snapshotWrites(db: D1Database, job: string, selected: string[], all: boolean, owner: boolean) {
  const recordWhere = all ? '1' : 'id IN (SELECT value FROM json_each(?))'
  const recordArgs = all ? [] : [JSON.stringify(selected)]
  const records = sources.map(([kind, source, key, data]) => {
    const own = ['envelopes', 'imports'].includes(kind)
    const where = kind === 'envelopes' ? recordWhere : kind === 'imports'
      ? !owner ? '0' : all ? '1' : "'import:'||id IN (SELECT value FROM json_each(?))"
      : "envelope_id IN (SELECT id FROM iw_exit_snapshot_records WHERE job=? AND kind='envelopes')"
    const args = own ? kind === 'imports' && !owner ? [] : recordArgs : [job]
    return db.prepare(`INSERT INTO iw_exit_snapshot_records(job,kind,id,envelope_id,ordinal,signer,data)
      SELECT ?,?,${key},${own ? 'NULL' : 'envelope_id'},rowid,${kind === 'replies' ? 'signer' : 'NULL'},${data} FROM ${source} WHERE ${where}`).bind(job, kind, ...args)
  })
  records.push(db.prepare(`INSERT INTO iw_exit_snapshot_blobs SELECT ?,b.envelope_id,b.kind,b.part,b.data FROM iw_blobs b
    JOIN iw_exit_snapshot_records e ON e.job=? AND e.kind='envelopes' AND e.id=b.envelope_id`).bind(job, job))
  return records
}
/** Upgrade retained jobs atomically, preserving bytes, row order and job ids.
 * The version fence makes concurrent upgrade attempts fail without copying twice.
 */
export async function upgradeExitSnapshots(db: D1Database) {
  const jobs = (await db.prepare("SELECT id FROM iw_exit_exports WHERE state='ready' AND snapshot_version=1").all<{ id: string }>()).results
  for (const { id } of jobs) {
    const writes = sources.map(([kind, _source, key, data]) => db.prepare(`INSERT INTO iw_exit_snapshot_records(job,kind,id,envelope_id,ordinal,signer,data)
      SELECT ?,?,${key},${['envelopes', 'imports'].includes(kind) ? 'NULL' : 'envelope_id'},rowid,${kind === 'replies' ? 'signer' : 'NULL'},${data} FROM "${legacyTable(id, kind)}"`).bind(id, kind))
    writes.push(db.prepare(`INSERT INTO iw_exit_snapshot_blobs SELECT ?,envelope_id,kind,part,data FROM "${legacyTable(id, 'blobs')}"`).bind(id))
    writes.push(...Object.keys(suffixes).map(kind => db.prepare(`DROP TABLE "${legacyTable(id, kind as keyof typeof suffixes)}"`)))
    writes.push(db.prepare('UPDATE iw_exit_exports SET snapshot_version=2 WHERE id=?').bind(id))
    await atomic(db, [{ sql: "EXISTS(SELECT 1 FROM iw_exit_exports WHERE id=? AND state='ready' AND snapshot_version=1)", values: [id] }], writes)
  }
}
