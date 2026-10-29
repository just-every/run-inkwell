import { ToolRefusal, type ToolContext } from '../../modules/agent-door/index.ts'
import { withAuditDatabase } from '../account-audit-db'
import { getEnvelope, memberRoleSql } from '../storage'
import { envelopeAccess } from '../members'
import { Refusal, type Actor, type Env, type Role } from '../model'

/** Resolve the native account again; Business policy never grants a native role. */
export async function nativeActor(env: Env, ctx: Pick<ToolContext, 'person' | 'clientId'>): Promise<Actor> {
  const row = await env.DB.prepare(`SELECT o.id,o.email,o.display_name AS name,o.version,
    CASE WHEN o.role='member' THEN ${memberRoleSql('o.id')} ELSE o.role END AS role
    FROM oa_operators o WHERE o.id=? AND o.status='active'`).bind(ctx.person.id).first<Actor>()
  if (!row) throw new ToolRefusal('unauthenticated')
  if (ctx.clientId?.startsWith('preparation:')) {
    const agentId = ctx.clientId.slice('preparation:'.length)
    const active = await env.DB.prepare('SELECT 1 FROM iw_agents WHERE id=? AND owner_id=? AND owner_version=? AND revoked_at IS NULL').bind(agentId, row.id, row.version).first()
    if (!active || row.role !== 'owner') throw new ToolRefusal('unauthenticated')
    row.agentId = agentId
  }
  return row
}
export const nativeEnv = (env: Env, ctx: ToolContext): Env => ({ ...env, DB: withAuditDatabase(env.DB, ctx.actor.label) })
export function requireRole(actor: Actor, roles: Role[]) {
  if (!roles.includes(actor.role)) throw new ToolRefusal('native_forbidden')
}
export async function visibleEnvelope(env: Env, ctx: Pick<ToolContext, 'person' | 'clientId'>, value: unknown) {
  if (typeof value !== 'string') throw new ToolRefusal('resource_unavailable')
  try {
    const actor = await nativeActor(env, ctx), envelope = await getEnvelope(env.DB, value)
    if (await envelopeAccess(env, actor, envelope) === 'none') throw new ToolRefusal('resource_unavailable')
    return envelope
  } catch (error) {
    if (error instanceof Refusal || error instanceof ToolRefusal) throw new ToolRefusal('resource_unavailable')
    throw error
  }
}
export async function nativeCall<T>(run: () => Promise<T>): Promise<T> {
  try { return await run() } catch (error) {
    if (error instanceof Refusal) throw new ToolRefusal(error.status === 403 ? 'native_forbidden' : error.status === 409 ? 'revision_conflict' : 'invalid_arguments')
    throw error
  }
}
