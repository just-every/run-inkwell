import type { Env } from '../model'
import type { ImportPlan } from '../../modules/import-kit/src/d1/index'
import { atomic } from '../storage'
import { ownerPredicate } from './auth'
import type { Session } from '../../modules/operator-auth/index.mjs'

export type ImportedEnd = { id: string; at: string }
export type ArchiveClock = { job_id: string; records: string; imported_at: string | null; due: string | null; warned_at: string | null; purge_at: string | null }
export async function registerArchiveClock(env: Env, session: Session, job: string, plan: ImportPlan) {
 const records = plan.entries.flatMap(e => e.effects.filter(f => f.targetKind === 'archive').map(f => ({ id: f.targetId, at: String((f.value as Record<string, unknown>).completedAt) })))
 const predicate = ownerPredicate(session)
 await atomic(env.DB, [{ sql: predicate.sql, values: predicate.params ?? [] }], [env.DB.prepare('INSERT OR IGNORE INTO iw_import_retention(job_id,records,imported_at) VALUES(?,?,?)').bind(job, JSON.stringify(records), new Date().toISOString())])
}
export async function archiveClocks(env: Env) {
 return (await env.DB.prepare('SELECT job_id,records,imported_at,due,warned_at,purge_at FROM iw_import_retention WHERE purged_at IS NULL ORDER BY job_id').all<ArchiveClock>()).results
}
/** Shared targets connect archives: no shared original is withdrawn before its latest envelope is due. */
export function archiveGroups(rows: ArchiveClock[]) {
 const groups: ArchiveClock[][] = []
 for (const row of rows) {
  const ids = new Set((JSON.parse(row.records) as ImportedEnd[]).map(r => r.id)), joined: ArchiveClock[] = [row]
  for (let i = groups.length - 1; i >= 0; i--) if (groups[i].some(g => (JSON.parse(g.records) as ImportedEnd[]).some(r => ids.has(r.id)))) {
   for (const g of groups.splice(i, 1)[0]) { joined.push(g); for (const r of JSON.parse(g.records) as ImportedEnd[]) ids.add(r.id) }
   // Revisit earlier groups through the growing set; existing groups are disjoint.
  }
  groups.push(joined.sort((a,b) => a.job_id.localeCompare(b.job_id)))
 }
 return groups
}
export function groupRecords(group: ArchiveClock[]) {
 const records = new Map<string, ImportedEnd>()
 for (const g of group) for (const r of JSON.parse(g.records) as ImportedEnd[]) {
  if (!Number.isFinite(Date.parse(r.at))) throw new Error('Imported terminal timestamp is invalid.')
  if (!records.has(r.id) || Date.parse(records.get(r.id)!.at) < Date.parse(r.at)) records.set(r.id, r)
 }
 return [...records.values()]
}

/** Recover a crash between durable job creation and clock registration before resume can write effects. */
export async function recoverArchiveClock(env:Env, session:Session, job:string) {
 if (await env.DB.prepare('SELECT 1 FROM iw_import_retention WHERE job_id=?').bind(job).first()) return
 const {readD1ImportOriginals,planD1Import}=await import('../../modules/import-kit/src/d1/index')
 const {importContext}=await import('./auth')
 const {readArchive}=await import('./source')
 const context=importContext(env,session)
 const originals=await readD1ImportOriginals(job,context)
 const source=originals.find(o=>o.kind==='artifact' && o.original.status==='retained')
 if (!source || source.original.status!=='retained') throw new Error('Import retention clock could not be recovered from source custody.')
 const {Buffer}=await import('node:buffer')
 const archive=await readArchive(Buffer.from(source.original.base64,'base64').toString('utf8'))
 await registerArchiveClock(env,session,job,await planD1Import(archive.source,archive.mapping,context))
}
