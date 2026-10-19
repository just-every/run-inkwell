import type { Env } from './model'
import { warnExpiring } from './expiry'
import { sendReminders } from './reminders'
import { sendScheduled } from './schedule'
import { alertBounces } from './bounces'

/** The hourly pass: PREP-009 scheduled sends, DELIV-004 expiry warnings, DELIV-002 bounce alerts not yet sent, then
 * DELIV-003 reminders; one failing does not skip the others. */
export async function scheduledPass(env: Env, at: number) {
  const failures: unknown[] = []
  for (const pass of [sendScheduled, warnExpiring, alertBounces, sendReminders]) try { await pass(env, at) } catch (error) { failures.push(error) }
  if (failures.length) throw new AggregateError(failures, 'The scheduled pass failed.')
}
