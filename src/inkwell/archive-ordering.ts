/** Base normalizes snapshot sidecars with CREATE TABLE AS. Restore their integer
 * row-order key, rather than adding a named index that enters archive schema
 * identity. Only sidecars recorded by native export jobs are eligible. */
export async function restoreArchiveOrdering(db: D1Database, job?: string) {
  const rows = (await db.prepare("SELECT id,metadata FROM rer_portability_jobs WHERE kind='export' AND phase IN ('building','complete')" + (job ? ' AND id=?' : ''))
    .bind(...(job ? [job] : [])).all<{ id: string; metadata: string }>()).results
  for (const row of rows) {
    const metadata = JSON.parse(row.metadata) as { copies: Record<string, string>; normalized?: string[] }
    for (const table of metadata.normalized ?? []) {
      const copy = metadata.copies[table]
      if (!/^rer_portability_snap_[a-f0-9]+_[0-9]+$/.test(copy)) continue
      const sidecar = copy + '_meta'
      const columns = (await db.prepare(`PRAGMA table_info("${sidecar}")`).all<{ name: string; pk: number }>()).results
      if (!columns.length || columns.find(column => column.name === 'rer_portability_row_order')?.pk === 1) continue
      // The batch preserves every saved ordinal, row mapping and erasure fence.
      // SQLite's INTEGER PRIMARY KEY supplies ordering without a named index.
      const ordered = sidecar + '_ordered'
      await db.batch([
        db.prepare(`CREATE TABLE "${ordered}" (rer_portability_row_order INTEGER PRIMARY KEY,rer_portability_copy_rowid INTEGER NOT NULL UNIQUE,rer_portability_source_rowid INTEGER,rer_portability_tombstone TEXT)`),
        db.prepare(`INSERT INTO "${ordered}" SELECT rer_portability_row_order,rer_portability_copy_rowid,rer_portability_source_rowid,rer_portability_tombstone FROM "${sidecar}"`),
        db.prepare(`DROP TABLE "${sidecar}"`),
        db.prepare(`ALTER TABLE "${ordered}" RENAME TO "${sidecar}"`),
      ])
    }
  }
}
