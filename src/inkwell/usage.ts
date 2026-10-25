import { insist, now, Refusal, type Env } from './model'
import { atomic, commandWrite, roleGuard } from './storage'
import type { CommandContext } from './envelopes'

export const usageMonth = () => now().slice(0, 7)
export interface UsagePolicy { version: number; capMicros: number | null; reserveMicros: number }
export async function usagePolicy(env: Env): Promise<UsagePolicy> {
  return (await env.DB.prepare('SELECT version,cap_micros AS capMicros,reserve_micros AS reserveMicros FROM iw_usage_policy WHERE id=1').first<UsagePolicy>())!
}
export async function usageView(env: Env, month = usageMonth()) {
  insist(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), 'Choose a month as YYYY-MM.')
  const policy = await usagePolicy(env)
  const sms = (await env.DB.prepare(`SELECT COUNT(*) AS attempts,COALESCE(SUM(charged_micros),0) AS chargedMicros,
    COALESCE(SUM(MAX(reserved_micros,COALESCE(charged_micros,0))),0) AS committedMicros,
    COALESCE(SUM(charged_micros IS NULL),0) AS unpriced FROM iw_usage_sms WHERE month=?`).bind(month).first<{ attempts: number; chargedMicros: number; committedMicros: number; unpriced: number }>())!
  const sent = (await env.DB.prepare('SELECT total FROM iw_usage_envelopes WHERE month=?').bind(month).first<{ total: number }>())?.total ?? 0
  const stopped = policy.capMicros !== null && (policy.reserveMicros <= 0 || sms.committedMicros + policy.reserveMicros > policy.capMicros)
  const warning = policy.capMicros !== null && (stopped || sms.committedMicros >= policy.capMicros * .8)
  const notices = (await env.DB.prepare('SELECT threshold,at,committed_micros AS committedMicros,cap_micros AS capMicros FROM iw_usage_notices WHERE month=? ORDER BY policy_version,threshold').bind(month).all<{ threshold: number; at: string; committedMicros: number; capMicros: number }>()).results
  const history = (await env.DB.prepare('SELECT version,actor,at,before_value AS beforeValue,after_value AS afterValue FROM iw_usage_policy_history ORDER BY version DESC LIMIT 50').all<{ version: number; actor: string; at: string; beforeValue: string; afterValue: string }>()).results.map(row => ({ version: row.version, actor: row.actor, at: row.at, before: JSON.parse(row.beforeValue) as UsagePolicy, after: JSON.parse(row.afterValue) as UsagePolicy }))
  return { month, currency: 'USD', policy, sms: { ...sms, stopped, warning }, notices, history, envelopesSent: sent }
}
/** Kept in the invitation transaction: restoring old record events never manufactures a new send. */
export function envelopeUsageWrite(env: Env) {
  return env.DB.prepare('INSERT INTO iw_usage_envelopes(month,total) VALUES(?,1) ON CONFLICT(month) DO UPDATE SET total=total+1').bind(usageMonth())
}
export async function admitSmsUsage(env: Env) {
  const view = await usageView(env)
  if (view.sms.stopped) {
    await cancelCappedSms(env)
    throw new Refusal('SMS monthly cap reached. Ask an owner or admin to review Usage and cost in Settings. Email verification remains available for email recipients.', 409)
  }
}
/** A cap stops queued work too; raising it never releases cancelled messages. */
export async function cancelCappedSms(env: Env) {
  await env.DB.prepare("UPDATE iw_sms SET state='cancelled',body='',cancellation_reason='monthly_cap' WHERE state='pending'").run()
}
const micros = (value: unknown, nullable = false): number | null => {
  if (nullable && value === null) return null
  insist(typeof value === 'string' && /^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(value), 'Enter a USD amount with at most six decimal places.')
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'))
}
export async function setUsagePolicy(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(['owner', 'admin'].includes(context.actor.role) && context.actor.sessionId && !context.actor.agentId && !context.actor.apiKeyId, 'Only a signed-in owner or admin can change usage caps.', 403)
  insist(input.consent === true, 'Explicitly approve the per-attempt SMS allowance and monthly cap.')
  const before = await usagePolicy(env), capMicros = micros(input.capUsd, true), reserveMicros = micros(input.reserveUsd)!
  insist(capMicros === null || reserveMicros > 0, 'A capped SMS service needs a positive per-attempt allowance, including provider fees.')
  insist(input.expectedVersion === before.version, 'Usage settings changed. Refresh and try again.', 409)
  const policy = { version: before.version + 1, capMicros, reserveMicros }, result = { policy }
  await atomic(env.DB, [roleGuard(context.actor, ['owner', 'admin']), { sql: 'EXISTS(SELECT 1 FROM iw_usage_policy WHERE id=1 AND version=?)', values: [before.version] }], [
    env.DB.prepare('INSERT INTO iw_usage_policy_history VALUES(?,?,?,?,?)').bind(policy.version, context.actor.id, now(), JSON.stringify(before), JSON.stringify(policy)),
    env.DB.prepare('UPDATE iw_usage_policy SET version=?,cap_micros=?,reserve_micros=? WHERE id=1').bind(policy.version, capMicros, reserveMicros),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result),
  ])
  return result
}
/** Provider prices are negative charges in Twilio receipts. No price is never treated as free. */
export function smsReceiptCharge(value: unknown, currency: unknown): number | null {
  if (currency !== 'USD' || typeof value !== 'string' || !/^-?\d{1,6}(\.\d{1,6})?$/.test(value)) return null
  return Math.round(Math.abs(Number(value)) * 1_000_000)
}
