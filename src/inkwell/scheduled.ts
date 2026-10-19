import type { Env } from './model'
import { warnExpiring } from './expiry'
import { sendReminders } from './reminders'

/** The hourly pass: DELIV-004 expiry warnings, then DELIV-003 reminders; one failing does not skip the other. */
export async function scheduledPass(env: Env, at: number) {
  const failures: unknown[] = []
  for (const pass of [warnExpiring, sendReminders]) try { await pass(env, at) } catch (error) { failures.push(error) }
  if (failures.length) throw new AggregateError(failures, 'The scheduled pass failed.')
}
