import { policySendQuota, ApiRateLimit } from './api-limits'
import { freeFormPolicy, freeFormSendGuard, snapshotFreeFormPolicy } from './freeform-policy'
import { appendEvent, currentSigners, insist, object, secret, sha256, text, type Envelope, type Env } from './model'
import { sealLink } from './links'
import { memberLinkWrites } from './signing-groups'
import { commitEnvelope } from './storage'
import { dispatchMail, invitationWrite } from './mail'
import { allOf, hasSendAuthority, holdSend, confirmedSendGuard } from './send-authority'
import { requestScheduledApproval } from './scheduled-approval'
import { evaluateSendPolicy } from './send-policies'
import { zoneInstant, zoneOffset } from './zone'

/** PREP-009: sending at a chosen wall-clock time in a US time zone. The person's eligibility approval with that time is
 * the send's authority (approved for later); the first invitations go on the first hourly pass at or after it, and
 * nobody can sign before then. A time that does not exist in the zone (the spring-forward hour) is refused. Scheduled
 * sends under the account's sending policy join with ADMIN-004 (SEND-001). */
export const usTimeZones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']
export type Schedule = NonNullable<Envelope['scheduled']>
export function chooseSchedule(value: unknown, expiresAt: string): Schedule | undefined {
  if (value === undefined || value === null) return undefined
  const input = object(value), local = text(input.at, 'the send time', 16), timeZone = text(input.timeZone, 'a time zone', 40)
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  insist(parts, 'Give the send time as YYYY-MM-DDTHH:MM.')
  insist(usTimeZones.includes(timeZone), `Choose a US time zone: ${usTimeZones.join(', ')}.`)
  const [, y, m, d, hh, mm] = parts.map(Number), wall = Date.UTC(y, m - 1, d, hh, mm), at = zoneInstant(wall, timeZone)
  insist(at + zoneOffset(at, timeZone) === wall, 'That time does not exist in that time zone.')
  insist(at > Date.now(), 'Schedule the send for a future time.')
  insist(at < Date.parse(expiresAt), 'Schedule the send before the envelope expires.')
  return { at: new Date(at).toISOString(), local, timeZone }
}

/** The hourly pass: send every approved envelope whose time has come. Approvers who sign at the first order still sign
 * in the app (ROUTE-009) and are not emailed. */
export async function sendScheduled(env: Env, at: number) {
  const rows = (await env.DB.prepare("SELECT data FROM iw_envelopes WHERE json_extract(data,'$.status')='awaiting_signature' AND json_extract(data,'$.scheduled.at')<=?").bind(new Date(at).toISOString()).all<{ data: string }>()).results
  const failures: unknown[] = []
  for (const row of rows) try { await send(env, JSON.parse(row.data), at) } catch (error) { failures.push(error) }
  if (failures.length) throw new AggregateError(failures, `${failures.length} scheduled send(s) failed.`)
}
async function send(env: Env, before: Envelope, at: number) {
  const authority = before.events.findLast(e => e.action === 'envelope.approved')?.actor ?? ''
  const confirmation = await confirmedSendGuard(before, authority, 'envelope.approved')
  const policy = before.freeForm ? await freeFormPolicy(env) : undefined
  // ADMIN-004 / SEND-001: the source's current send policy is read again at release; off, a narrowed template list, no
  // deferral holds the send. A new approval requirement enters ROUTE-004; allowed changes use the current version.
  const decision = await evaluateSendPolicy(env, before, authority, { deferred: true, approved: Boolean(before.internalApproval), stage: 'release' })
  const base = allOf([confirmation, ...(policy ? [freeFormSendGuard(policy)] : [])])
  const guard = allOf([base, decision.fence])
  if (decision.code === 'send_policy_approval' && await hasSendAuthority(env, base))
    return requestScheduledApproval(env, before, authority, allOf([base, decision.versionFence]), guard, decision)
  if (!await hasSendAuthority(env, guard)) return holdSend(env, before, authority, guard, [], [], undefined, decision.allowed ? {} : { reason: decision.reason, code: decision.code, sendPolicy: decision.record })
  let quota
  try{quota=await policySendQuota(env,before)}catch(error){if(!(error instanceof ApiRateLimit))throw error;return holdSend(env,before,authority,{sql:'0=1',values:[]},[],[],undefined,{code:'rate_limited',reason:'The account or sending credential reached its send limit. A current editor must review and confirm again.'})}
  const after = structuredClone(before), schedule = after.scheduled!
  if (policy) snapshotFreeFormPolicy(after, policy)
  delete after.scheduled
  const inApp = (after.events.findLast(e => e.action === 'envelope.approved')?.detail.signsInApp as number[] | undefined) ?? []
  const first = currentSigners(after).filter(i => !inApp.includes(i) && !after.signers[i].inPerson)
  await appendEvent(after, 'envelope.sent_scheduled', 'inkwell', { ...(after.freeForm ? { freeForm: true, freeFormSetting: after.freeFormSetting } : {}), sendPolicy: decision.record, scheduledFor: schedule.at, local: schedule.local, timeZone: schedule.timeZone, passAt: new Date(at).toISOString(), invited: first })
  const writes: D1PreparedStatement[] = [...quota.writes]
  for (const i of first) { if (after.signers[i].group) { writes.push(...await memberLinkWrites(env, after, i, false, true)); continue }; const token = secret(); writes.push(env.DB.prepare('UPDATE iw_signers SET token_hash=?,link_sealed=? WHERE envelope_id=? AND signer=?').bind(await sha256(token), await sealLink(env, after.id, i, token), after.id, i), invitationWrite(env, after, i, token)) }
  await commitEnvelope(env, before, after, null, writes, [guard,...quota.guards])
  await dispatchMail(env, after.id)
}
