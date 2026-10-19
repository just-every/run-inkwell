import type { Env } from '../model'
import { canonicalJson, sha256, type D1Sql } from '../../modules/import-kit/src/d1/index'
import { loadPlans } from '../../modules/import-kit/src/d1/plans'
import type { ArchiveClock, ImportedEnd } from './retention-groups'

const targetIdentity = (id:string) => sha256(canonicalJson(['inkwell','archive',id]))

/** Ordinary undo retains source custody. Only permanent-erasure tombstones retire its clock. */
export async function retainedArchiveRecords(env:Env, records:ImportedEnd[]) {
 const erased = new Set((await env.DB.prepare("SELECT identity FROM ik_d1_erased_targets WHERE destination='inkwell' AND identity IN (SELECT value FROM json_each(?))").bind(JSON.stringify(records.map(r=>targetIdentity(r.id)))).all<{identity:string}>()).results.map(r=>r.identity))
 return records.filter(r=>!erased.has(targetIdentity(r.id)))
}

/** Keep authority valid after this purge's own tombstones, but reject a concurrent owner erasure. */
export function unerasedArchives(ids:string[],purgedAt?:string):D1Sql {
 return {sql:`NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE EXISTS(SELECT 1 FROM ik_d1_erased_targets t WHERE t.destination='inkwell' AND t.identity=json_extract(e.value,'$.identity'))${purgedAt ? ' AND NOT EXISTS(SELECT 1 FROM iw_retention_purges p WHERE p.envelope_id=json_extract(e.value,\'$.id\') AND p.purged_at=?)' : ''})`,params:[JSON.stringify(ids.map(id=>({id,identity:targetIdentity(id)}))),...(purgedAt?[purgedAt]:[])]}
}

/** The canonical plan keeps the actual title after undo; verify chunked plans before using it. */
export async function retainedArchiveTitles(env:Env,group:ArchiveClock[],ids:string[]) {
 const rows = (await env.DB.prepare('SELECT id,plan_json FROM ik_jobs WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(group.map(g=>g.job_id))).all<{id:string;plan_json:string}>()).results
 const titles = new Map<string,string>()
 for (const plan of (await loadPlans(rows,env.DB)).values()) for (const entry of plan.entries) if (!entry.erased) for (const effect of entry.effects) {
  if (effect.targetKind==='archive' && ids.includes(effect.targetId)) {
   const title = (effect.value as Record<string,unknown>).title
   if (typeof title==='string' && title.trim()) titles.set(effect.targetId,title)
  }
 }
 if (ids.some(id=>!titles.has(id))) throw new Error('Retained import title is missing from canonical custody.')
 return [...new Set(ids.map(id=>titles.get(id)!))].join('; ')
}
