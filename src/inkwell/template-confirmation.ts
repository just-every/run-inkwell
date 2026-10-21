import { type Envelope, type Env } from './model'
import { type Guard } from './storage'

interface TemplateConfirmation { id: string; pinnedVersion: number; liveRevision: string; present: boolean; policyVersion: number }
const revisionSql = "COALESCE((SELECT revision FROM iw_template_revisions WHERE template_id=?),'')"
const policySql = "(SELECT COALESCE(MAX(version),0) FROM iw_send_policy_versions WHERE scope='account' AND source='template')"
/** SEND-001: snapshot live metadata without ever replacing the prepared bytes or frozen approval rule.
 * Revisions are local fences, excluded from archive restore; restoring old content advances them too. */
export async function templateConfirmation(env: Env, envelope: Envelope): Promise<TemplateConfirmation | undefined> {
  if (!envelope.template) return undefined
  const row = await env.DB.prepare(`SELECT ${revisionSql} AS revision, EXISTS(SELECT 1 FROM iw_templates WHERE id=?) AS present, ${policySql} AS policy`).bind(envelope.template.id, envelope.template.id).first<{ revision: string; present: number; policy: number }>()
  return { id: envelope.template.id, pinnedVersion: envelope.template.version ?? 1, liveRevision: row!.revision, present: Boolean(row!.present), policyVersion: row!.policy }
}
/** The same snapshot is fenced at confirmation and at every release, in the invitation batch.
 * Missing legacy snapshots hold; a fresh confirmation may snapshot a deleted template's tombstone. */
export function confirmedTemplateGuard(envelope: Envelope, value: unknown): Guard {
  if (!envelope.template) return { sql: '1=1', values: [] }
  const snapshot = value as TemplateConfirmation | undefined
  if (!snapshot || snapshot.id !== envelope.template.id || snapshot.pinnedVersion !== (envelope.template.version ?? 1) || typeof snapshot.liveRevision !== 'string' || !Number.isSafeInteger(snapshot.policyVersion)) return { sql: '0=1', values: [] }
  return { sql: `${revisionSql}=? AND EXISTS(SELECT 1 FROM iw_templates WHERE id=?)=? AND ${policySql}=?`, values: [snapshot.id, snapshot.liveRevision, snapshot.id, Number(snapshot.present), snapshot.policyVersion] }
}
