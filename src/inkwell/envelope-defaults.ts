import { insist, now, type Env } from './model'
import { atomic, commandWrite, roleGuard } from './storage'
import { chooseReminders, type Reminders } from './reminders'
import { defaultExpiryDays, maxExpiryDays } from './expiry'
import type { CommandContext } from './envelopes'

export interface EnvelopeDefaults { expiryDays: number; hideDocumentsWithoutFields?: boolean; reminders: Reminders | null; version: number; actor: string | null; at: string | null }
const key = 'envelope_defaults'
/** ADMIN-004: installation defaults are copied into new envelopes/templates, never applied retroactively. */
export async function envelopeDefaults(env: Env): Promise<EnvelopeDefaults> {
  const row = await env.DB.prepare('SELECT value FROM iw_settings WHERE key=?').bind(key).first<{ value: string }>()
  return row ? JSON.parse(row.value) : { expiryDays: defaultExpiryDays, reminders: null, version: 0, actor: null, at: null }
}
export async function setEnvelopeDefaults(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const actor = context.actor
  insist((actor.role === 'owner' || actor.role === 'admin') && Boolean(actor.sessionId) && !actor.agentId, 'Only a signed-in owner or admin can change envelope defaults.', 403)
  insist(Number.isSafeInteger(input.expectedVersion) && (input.expectedVersion as number) >= 0, 'Give the current envelope defaults version.')
  insist(Number.isInteger(input.expiryDays) && (input.expiryDays as number) >= 1 && (input.expiryDays as number) <= maxExpiryDays, `Set the default expiry from 1 to ${maxExpiryDays} whole days.`)
  insist(input.reminders !== undefined, 'Give reminder settings, or null to turn automatic reminders off.')
  insist(input.hideDocumentsWithoutFields === undefined || typeof input.hideDocumentsWithoutFields === 'boolean', 'Choose whether to hide documents without recipient fields.')
  const before = await envelopeDefaults(env)
  insist(input.expectedVersion === before.version, 'Envelope defaults changed. Refresh and try again.', 409)
  const defaults: EnvelopeDefaults = { hideDocumentsWithoutFields: input.hideDocumentsWithoutFields === undefined ? Boolean(before.hideDocumentsWithoutFields) : input.hideDocumentsWithoutFields, expiryDays: input.expiryDays as number, reminders: chooseReminders(input.reminders) ?? null, version: before.version + 1, actor: actor.id, at: now() }, result = { defaults }
  await atomic(env.DB, [roleGuard(actor, ['owner', 'admin']), { sql: "COALESCE((SELECT json_extract(value,'$.version') FROM iw_settings WHERE key=?),0)=?", values: [key, before.version] }], [
    env.DB.prepare('INSERT INTO iw_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(key, JSON.stringify(defaults), defaults.at, actor.id),
    commandWrite(env.DB, actor.id, context.commandId, context.fingerprint, result),
  ])
  return result
}
