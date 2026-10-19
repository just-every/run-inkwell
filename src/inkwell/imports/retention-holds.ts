import type { D1Sql } from '../../modules/import-kit/src/d1/index'

/** A shared JSON original cannot be withdrawn while any record in its connected archives is held. */
export function unheldArchive(record:string):D1Sql {
 return {sql:`NOT EXISTS(WITH RECURSIVE peers(id) AS (VALUES(?) UNION SELECT json_extract(n.value,'$.id') FROM peers p JOIN iw_import_retention r JOIN json_each(r.records) m ON json_extract(m.value,'$.id')=p.id JOIN json_each(r.records) n WHERE r.purged_at IS NULL) SELECT 1 FROM iw_import_holds h JOIN peers p ON p.id=h.record_id)`,params:[record]}
}
export function unheldJob(job:string):D1Sql {
 return {sql:`NOT EXISTS(SELECT 1 FROM iw_import_retention r,json_each(r.records) e JOIN iw_import_holds h ON h.record_id=json_extract(e.value,'$.id') WHERE r.job_id=?)`,params:[job]}
}
