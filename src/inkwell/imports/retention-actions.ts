import type { Env } from '../model'
import { id, insist, text } from '../model'
import { atomic } from '../storage'
import { archiveErasureCheckpoint } from './retention-custody'
import type { Session } from '../../modules/operator-auth/index.mjs'
import { ownerPredicate, retentionPredicate } from './auth'
import { eraseImportedArchive } from './library'

import { unheldArchive } from './retention-holds'
import { archiveClocks, archiveGroups } from './retention-groups'
export async function importRecordAction(env: Env, session: Session, action: string, input: Record<string, unknown>) {
 const record = text(input.id, 'an imported record ID')
 const row = await env.DB.prepare('SELECT id FROM iw_imported_archives WHERE id=?').bind(record).first()
 insist(row, 'Imported archive not found.', 404)
 const authority = action==='erase'?ownerPredicate(session):retentionPredicate(session), unheld = unheldArchive(record)
 if (action === 'erase') {
  insist(input.confirmation === 'ERASE', 'Type ERASE to confirm permanent deletion.')
  const allowed = await env.DB.prepare(`SELECT (${unheld.sql}) AS ok`).bind(...unheld.params??[]).first<{ok:number}>()
  insist(allowed?.ok===1, 'This imported archive is on legal hold. Lift the hold before erasing it.', 409)
  const checkpoint = await archiveErasureCheckpoint(env,record)
  // Base evaluates this same authority on both sides of all native effects.
  await eraseImportedArchive(env,session,record,checkpoint)
  return {ok:true}
 }
 const at = new Date().toISOString()
 const hold = await env.DB.prepare('SELECT reason,placed_at FROM iw_import_holds WHERE record_id=?').bind(record).first<{reason:string;placed_at:string}>()
 const reason = action === 'hold' ? text(input.reason, 'a reason for the hold', 500).replace(/\s+/g,' ') : hold?.reason
 insist(reason && reason.length >= 3, 'Give a reason for the hold (at least 3 characters).')
 insist(action === 'hold' ? !hold : hold, action === 'hold' ? 'This imported record is already on legal hold.' : 'This imported record is not on legal hold.', 409)
 const groups=archiveGroups(await archiveClocks(env)), jobs=groups.find(g=>g.some(c=>(JSON.parse(c.records) as {id:string}[]).some(r=>r.id===record)))?.map(g=>g.job_id)??[]
 await atomic(env.DB,[{sql:'EXISTS(SELECT 1 FROM iw_imported_archives WHERE id=?)',values:[record]},{sql:authority.sql,values:authority.params??[]}, action==='hold' ? {sql:unheld.sql,values:unheld.params??[]} : {sql:'EXISTS(SELECT 1 FROM iw_import_holds WHERE record_id=? AND placed_at=?)',values:[record,hold!.placed_at]}],[
  action === 'hold' ? env.DB.prepare('INSERT INTO iw_import_holds(record_id,reason,actor,placed_at) VALUES(?,?,?,?)').bind(record,reason,session.operator.id,at) : env.DB.prepare('DELETE FROM iw_import_holds WHERE record_id=?').bind(record),
  env.DB.prepare('INSERT INTO iw_import_hold_events(id,record_id,action,reason,actor,at) VALUES(?,?,?,?,?,?)').bind(id(),record,action,reason,session.operator.id,at),
  // A hold invalidates every archive warning sharing this record. Lifting requires a fresh warning.
  env.DB.prepare("UPDATE iw_import_retention SET due=NULL,warned_at=NULL,purge_at=NULL WHERE job_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(jobs)),
  env.DB.prepare("UPDATE iw_import_retention_mail SET state='cancelled',body='' WHERE group_id IN (SELECT value FROM json_each(?)) AND state='pending'").bind(JSON.stringify(jobs)),
 ])
 return {ok:true}
}
