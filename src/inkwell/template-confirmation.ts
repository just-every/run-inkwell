import { type Envelope, type Env } from './model'
import { type Guard } from './storage'

interface TemplateConfirmation { id: string; pinnedVersion: number; liveRevision: string; present: boolean; policyVersion: number }
const revisionSql = "COALESCE((SELECT revision FROM iw_template_revisions WHERE template_id=?),'')"
const policySql = "(SELECT COALESCE(MAX(version),0) FROM iw_send_policy_versions WHERE scope='account' AND source='template')"
const sources = (e: Envelope) => e.templates ?? (e.template ? [e.template] : [])
/** Freeze each source's live revision without replacing the prepared bytes or approval rules. */
export async function templateConfirmation(env: Env, envelope: Envelope): Promise<TemplateConfirmation | TemplateConfirmation[] | undefined> {
  const snapshots = await Promise.all(sources(envelope).map(async t => {
    const row = await env.DB.prepare(`SELECT ${revisionSql} AS revision, EXISTS(SELECT 1 FROM iw_templates WHERE id=?) AS present, ${policySql} AS policy`).bind(t.id,t.id).first<{revision:string;present:number;policy:number}>()
    return {id:t.id,pinnedVersion:t.version??1,liveRevision:row!.revision,present:Boolean(row!.present),policyVersion:row!.policy}
  }))
  return envelope.templates ? snapshots : snapshots[0]
}
/** Every source revision is fenced in the same invitation batch. Missing legacy snapshots hold. */
export function confirmedTemplateGuard(envelope: Envelope, value: unknown): Guard {
  const templates=sources(envelope)
  if(!templates.length)return{sql:'1=1',values:[]}
  const snapshots=(envelope.templates?value:[value]) as TemplateConfirmation[] | undefined
  if(!Array.isArray(snapshots)||snapshots.length!==templates.length)return{sql:'0=1',values:[]}
  const guards=templates.map((t,i):Guard=>{
    const s=snapshots[i]
    if(!s||s.id!==t.id||s.pinnedVersion!==(t.version??1)||typeof s.liveRevision!=='string'||typeof s.present!=='boolean'||!Number.isSafeInteger(s.policyVersion))return{sql:'0=1',values:[]}
    return{sql:`${revisionSql}=? AND EXISTS(SELECT 1 FROM iw_templates WHERE id=?)=? AND ${policySql}=?`,values:[s.id,s.liveRevision,s.id,Number(s.present),s.policyVersion]}
  })
  return{sql:guards.map(g=>`(${g.sql})`).join(' AND '),values:guards.flatMap(g=>g.values)}
}
