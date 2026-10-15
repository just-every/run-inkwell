import { canonicalJson, type D1TargetAdapter, type D1Sql, type TargetRow } from '../../modules/import-kit/src/d1/index'

const q = (sql: string, ...params: unknown[]): D1Sql => ({ sql, params })

/** Exact serialized metadata AND file bytes are fenced, even without a revision change. */
export const archiveTargets: D1TargetAdapter = {
 async read(db, destination, targetKind, targetId) {
  const r = await db.prepare('SELECT * FROM iw_imported_archives WHERE id=?').bind(targetId).first<{id:string;value:string;revision:string}>()
  return r ? { destination, targetKind, targetId, value: JSON.parse(r.value), revision: r.revision } : undefined
 },
 matches(row, _destination, _kind, id) {
  return row
   ? q('EXISTS(SELECT 1 FROM iw_imported_archives WHERE id=? AND source_id=? AND value=? AND revision=?)', id, (row.value as any).sourceId, canonicalJson(row.value), row.revision)
   : q('NOT EXISTS(SELECT 1 FROM iw_imported_archives WHERE id=?)', id)
 },
 write(row) {
  return [q('INSERT INTO iw_imported_archives(id,source_id,value,revision) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,value=excluded.value,revision=excluded.revision', row.targetId, (row.value as any).sourceId, canonicalJson(row.value), row.revision)]
 },
 remove(_destination, _kind, id) { return [q('DELETE FROM iw_imported_archives WHERE id=?', id)] },
 async list(db, destination) {
  const {results} = await db.prepare('SELECT * FROM iw_imported_archives ORDER BY id').all<{id:string;value:string;revision:string}>()
  return results.map(r => ({ destination, targetKind:'archive',targetId:r.id,value:JSON.parse(r.value),revision:r.revision })) as TargetRow[]
 },
 matchesCount(count) { return q('(SELECT COUNT(*) FROM iw_imported_archives)=?',count) },
}
