import { archiveMailErasure } from './retention-mail-erasure'
import { id, type Env } from '../model'
import { atomic, type Guard } from '../storage'
import { mailSuppressed } from '../manual-invitations'
import { retireD1ImportCustody, type D1Sql } from '../../modules/import-kit/src/d1/index'
import { archiveTargets } from './targets'
import { MAPPING, NAMESPACE } from './source'
import { archiveClocks, archiveGroups, groupRecords, type ArchiveClock } from './retention-groups'
import { archiveErasureCheckpoint } from './retention-custody'
import { dispatchArchiveRetentionMail } from './retention-mail'

const day = 86_400_000
const q = (sql:string,...params:unknown[]):D1Sql => ({sql,params})
const prepared = (env:Env,rows:D1Sql[]) => rows.map(r=>env.DB.prepare(r.sql).bind(...r.params??[]))
export type RetentionRule = {years:number;updatedAt:string;updatedBy:string}
const ruleGuard = (rule:RetentionRule):D1Sql => q("EXISTS(SELECT 1 FROM iw_settings WHERE key='retention_years' AND value=? AND updated_at=? AND updated_by=?)",String(rule.years),rule.updatedAt,rule.updatedBy)
/** The complete clock inventory fences a concurrent import or hold/lift, including shared targets. */
function inventoryGuard(rows:ArchiveClock[]):D1Sql {
 return q(`NOT EXISTS(SELECT 1 FROM ik_jobs j WHERE j.destination='inkwell' AND j.namespace='docuseal-completed-archive' AND NOT EXISTS(SELECT 1 FROM iw_import_retention r WHERE r.job_id=j.id)) AND (SELECT COUNT(*) FROM iw_import_retention WHERE purged_at IS NULL)=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM iw_import_retention r WHERE r.job_id=json_extract(e.value,'$.job_id') AND r.records=json_extract(e.value,'$.records') AND r.imported_at IS json_extract(e.value,'$.imported_at') AND r.due IS json_extract(e.value,'$.due') AND r.warned_at IS json_extract(e.value,'$.warned_at') AND r.purge_at IS json_extract(e.value,'$.purge_at') AND r.purged_at IS NULL))`,JSON.stringify(rows),JSON.stringify(rows))
}
function noHolds(ids:string[]):D1Sql {
 return q('NOT EXISTS(SELECT 1 FROM iw_import_holds WHERE record_id IN (SELECT value FROM json_each(?))) AND NOT EXISTS(SELECT 1 FROM iw_envelopes WHERE id IN (SELECT value FROM json_each(?)) AND json_extract(data,\'$.legalHold\') IS NOT NULL)',JSON.stringify(ids),JSON.stringify(ids))
}
const guards = (rows:D1Sql[]):Guard[] => rows.map(r=>({sql:r.sql,values:r.params??[]}))

/** A source archive is retained until its latest envelope falls due. Undo keeps working until actual erasure. */
export async function applyArchiveRetention(env:Env, rule:RetentionRule, at:number, dueFor:(at:string,years:number)=>string) {
 let clocks = await archiveClocks(env)
 const groups = archiveGroups(clocks)
 for (const group of groups) {
  const records = groupRecords(group)
  if (!records.length) continue
  const ids = records.map(r=>r.id), due = dueFor(new Date(Math.max(...records.map(r=>Date.parse(r.at)))).toISOString(),rule.years)
  if (await env.DB.prepare('SELECT 1 FROM iw_import_holds WHERE record_id IN (SELECT value FROM json_each(?)) LIMIT 1').bind(JSON.stringify(ids)).first()) continue
  const standing = group.every(g=>g.due===due && g.warned_at && g.purge_at)
  if (!standing) {
   if (at < Date.parse(due)-30*day) continue
   const warned = new Date(at).toISOString(), purge = new Date(Math.max(Date.parse(due),at+30*day)).toISOString()
   const admins = (await env.DB.prepare("SELECT id,email,display_name AS name FROM oa_operators WHERE status='active' AND role IN ('owner','admin')").all<{id:string;email:string;name:string}>()).results
   const titles = (await env.DB.prepare('SELECT json_extract(value,\'$.title\') AS title FROM iw_imported_archives WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{title:string}>()).results.map(r=>r.title)
   const title = titles.length ? titles.join('; ') : `DocuSeal import ${group[0].job_id}`
   const writes:D1Sql[] = group.map(g=>q('UPDATE iw_import_retention SET due=?,warned_at=?,purge_at=? WHERE job_id=?',due,warned,purge,g.job_id))
   for (const admin of admins) {
    writes.push(q('INSERT INTO iw_notices(id,operator_id,envelope_id,event,at,title,recipient) VALUES(?,?,?,?,?,?,?)',id(),admin.id,`import:${group[0].job_id}`,'retention',warned,title,''))
    if (!mailSuppressed(env)) writes.push(q('INSERT INTO iw_import_retention_mail(id,group_id,recipient,subject,body) VALUES(?,?,?,?,?)',id(),group[0].job_id,admin.email,`Will be purged: ${title}`,`${admin.name},\n\n${title} will be permanently erased on ${purge} under the account's ${rule.years}-year retention rule. Its latest source terminal instant is ${new Date(Math.max(...records.map(r=>Date.parse(r.at)))).toISOString()}.\nTo keep it, place a legal hold on an imported record in this archive before then.\n${new URL('/app',env.AUTH_ORIGIN).href}`))
   }
   await atomic(env.DB,guards([ruleGuard(rule),inventoryGuard(clocks),noHolds(ids)]),prepared(env,writes))
  } else {
   const purgeAt = Math.max(...group.map(g=>Date.parse(g.purge_at!)))
   if (at < purgeAt) continue
   const atText = new Date(at).toISOString()
   // This is scheduled retention authority, never a fabricated owner session.
   const authority = [ruleGuard(rule),inventoryGuard(clocks),noHolds(ids),q(`NOT EXISTS(SELECT 1 FROM json_each(?) e JOIN iw_import_retention r ON r.job_id=e.value WHERE r.due<>? OR julianday(?)<julianday(r.purge_at) OR julianday(r.purge_at)<julianday(r.due) OR julianday(r.purge_at)<julianday(r.warned_at)+30)`,JSON.stringify(group.map(g=>g.job_id)),due,atText)]
   const predicate:D1Sql = {sql:authority.map(p=>`(${p.sql})`).join(' AND '),params:authority.flatMap(p=>p.params??[])}
   for (const record of records) {
    const native = [q('DELETE FROM iw_imported_archives WHERE id=?',record.id),q('INSERT OR IGNORE INTO iw_retention_purges(envelope_id,ended,years,ended_at,warned_at,purged_at) VALUES(?,?,?,?,?,?)',record.id,'completed',rule.years,record.at,group.map(g=>g.warned_at!).sort().at(-1),atText),q('DELETE FROM iw_import_hold_events WHERE record_id=?',record.id)]
    await retireD1ImportCustody({target:{kind:'archive',id:record.id}},native,{destination:'inkwell',namespace:NAMESPACE,mappingVersion:MAPPING,storage:{database:env.DB,targets:archiveTargets},originalErasurePolicy:'withdraw-affected-artifacts',authorization:{principalId:'system:retention',predicate:action=>action==='erase'?predicate:q('0')}},await archiveErasureCheckpoint(env,record.id))
   }
   const finish = group.flatMap(g=>[q("UPDATE iw_import_retention SET purged_at=?,records='[]' WHERE job_id=?",atText,g.job_id),...archiveMailErasure([g.job_id]),q('DELETE FROM iw_notice_posts WHERE notice_id IN (SELECT id FROM iw_notices WHERE envelope_id=?)',`import:${g.job_id}`),q('DELETE FROM iw_notices WHERE envelope_id=?',`import:${g.job_id}`)])
   await atomic(env.DB,guards([predicate]),prepared(env,finish))
  }
  clocks = await archiveClocks(env)
 }
 await dispatchArchiveRetentionMail(env)
}
