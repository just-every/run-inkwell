import { processRemoteJobs } from './remote-import-jobs'
import { cleanupRemotePreviews } from './remote-import'
import { runHubspotSyncSchedule } from './hubspot-sync'
import { dispatchHubspotWritebacks } from './hubspot-writeback'
import { withAuditDatabase } from './account-audit-db'
import { dispatchPendingFiling } from './filing'
import { purgeFormAttempts } from './web-forms'
import { warnApiKeys } from './api-key-warnings'
import { chaseStalled } from './followup-engine'
import type { Env } from './model'
import { warnExpiring } from './expiry'
import { sendReminders } from './reminders'
import { sendScheduled } from './schedule'
import { alertBounces } from './bounces'
import { dispatchNotices } from './notices'
import { applyRetention } from './retention'

/** The hourly pass: PREP-009 scheduled sends, DELIV-004 expiry warnings, DELIV-002 bounce alerts not yet sent, then
 * DELIV-003 reminders, then DELIV-008 channel posts still waiting, then RECORD-005 retention warnings and purges; one failing does not skip the others. */
export async function scheduledPass(env: Env, at: number) {
  env = { ...env, DB: withAuditDatabase(env.DB, {kind:'system', id:'system:scheduled'}) }
  const failures: unknown[] = []
  for (const pass of [processRemoteJobs, cleanupRemotePreviews, runHubspotSyncSchedule, dispatchHubspotWritebacks, sendScheduled, dispatchPendingFiling, purgeFormAttempts, warnApiKeys, warnExpiring, alertBounces, chaseStalled, sendReminders, dispatchNotices, applyRetention]) try { await pass(env, at) } catch (error) { failures.push(error) }
  if (failures.length) throw new AggregateError(failures, 'The scheduled pass failed.')
}
