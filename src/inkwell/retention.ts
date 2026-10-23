import { createPortability } from '@runeditrun/rer/modules/portability'
import policy from './archive-policy.mjs'
import { appendEvent, id, insist, now, text, type Env, type Envelope } from './model'
import { atomic, commandWrite, commitEnvelope, getEnvelope, roleGuard } from './storage'
import { dispatchMail, noticeWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { erasureWrites } from './erasure'
import type { CommandContext } from './envelopes'
import { importedEnding } from './retention-imported-envelope'
import { applyArchiveRetention } from './imports/retention'
import { dispatchArchiveRetentionMail } from './imports/retention-mail'

/** RECORD-005: retention and legal hold. One account rule, set or cleared by an owner or admin (ADMIN-004), keeps every
 * envelope that has ended (completed, declined, voided, or expired and not extended) a whole number of years (1–99); an
 * envelope still open for signing is never purged. Imported records use their source terminal instant or a recorded import instant. An envelope
 * falls due at the instant it ended plus that many calendar years in UTC (a 29 February end falls due on 1 March). The
 * hourly pass warns every active owner and admin once, 30 days before it falls due
 * (or at once when the rule is set or shortened past that), in their activity feed and by email, naming the envelope, the
 * rule and the purge date; it purges at the later of the due date and 30 days after that warning, never without one. A
 * purge is the owner's erasure (erasure.ts), and the retention ledger keeps only the envelope ID, how it ended, the
 * rule and the ended, warned and purged times. A warning stands only while its due date does, so an expired envelope
 * the sender extends is no longer due. A legal hold, placed and lifted by an owner or admin with a reason and audited in the
 * envelope's own trail, stops the warning, the purge and any erase request; lifting it restarts the 30-day warning. Folder
 * rules replace the account rule for envelopes assigned to that folder. */
const day = 86_400_000
export const retentionWarningDays = 30, maxRetentionYears = 99
const key = 'retention_years'

export async function retentionRule(env: Env) {
  const row = await env.DB.prepare('SELECT value, updated_at AS updatedAt, updated_by AS updatedBy FROM iw_settings WHERE key=?').bind(key).first<{ value: string; updatedAt: string; updatedBy: string }>()
  return row ? { years: Number(row.value), updatedAt: row.updatedAt, updatedBy: row.updatedBy } : null
}
/** The rule and the latest purges, for owners and admins. */
export async function retentionView(env: Env) {
  const purged = (await env.DB.prepare('SELECT envelope_id AS envelopeId, ended, years, ended_at AS endedAt, warned_at AS warnedAt, purged_at AS purgedAt FROM iw_retention_purges ORDER BY purged_at DESC LIMIT 50').all<{ envelopeId: string; ended: string; years: number; endedAt: string; warnedAt: string; purgedAt: string }>()).results
  return { rule: await retentionRule(env), warningDays: retentionWarningDays, purged }
}

export async function setRetention(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(context.actor.role === 'owner' || context.actor.role === 'admin', 'Only an owner or admin can change account settings.', 403)
  const years = input.years
  insist(years === null || (Number.isInteger(years) && (years as number) >= 1 && (years as number) <= maxRetentionYears), `Choose a whole number of years from 1 to ${maxRetentionYears}, or no rule.`)
  const result = { years }
  await atomic(env.DB, [roleGuard(context.actor, ['owner', 'admin'])], [
    years === null ? env.DB.prepare('DELETE FROM iw_settings WHERE key=?').bind(key)
      : env.DB.prepare('INSERT INTO iw_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(key, String(years), now(), context.actor.id),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

export async function holdEnvelope(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(context.actor.role === 'owner' || context.actor.role === 'admin', 'Only an owner or admin can place a legal hold.', 403)
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID')), reason = text(input.reason, 'a reason for the hold', 500).replace(/\s+/g, ' ')
  insist(reason.length >= 3, 'Give a reason for the hold (at least 3 characters).')
  insist(!before.legalHold, 'This envelope is already on legal hold.', 409)
  const after = structuredClone(before), at = now()
  after.legalHold = { reason, by: context.actor.id, at }
  await appendEvent(after, 'envelope.legal_hold_placed', context.actor.id, { reason }, at)
  const result = { id: after.id, legalHold: after.legalHold }
  await commitEnvelope(env, before, after, context.actor, [env.DB.prepare("UPDATE iw_import_retention_mail SET state='cancelled',body='' WHERE group_id=? AND state='pending'").bind(`envelope:${before.id}`), commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

export async function liftHold(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(context.actor.role === 'owner' || context.actor.role === 'admin', 'Only an owner or admin can lift a legal hold.', 403)
  const before = await getEnvelope(env.DB, text(input.id, 'an envelope ID'))
  insist(before.legalHold, 'This envelope is not on legal hold.', 409)
  const after = structuredClone(before)
  delete after.legalHold
  await appendEvent(after, 'envelope.legal_hold_lifted', context.actor.id, { reason: before.legalHold.reason, placedAt: before.legalHold.at })
  const result = { id: after.id, legalHold: null }
  await commitEnvelope(env, before, after, context.actor, [commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)])
  return result
}

/** The same UTC instant `years` calendar years later; Date rolls 29 February to 1 March. */
export function retentionDue(endedAt: string, years: number) { const due = new Date(endedAt); due.setUTCFullYear(due.getUTCFullYear() + years); return due.toISOString() }
/** How and when an envelope ended, seen at `at`: its completion, the decline or withdrawal, the void, or its expiry once
 * passed (prepared or sent, never signed by everyone); an imported record uses its source terminal instant or its recorded import instant; an open envelope has no ending. */
export function ending(envelope: Envelope, at: number): { ended: string; at: string; basis?: string } | undefined {
  if (envelope.imported || envelope.status === 'imported') return importedEnding(envelope)
  const last = (actions: string[]) => [...envelope.events].reverse().find(e => actions.includes(e.action))?.at
  const when = envelope.status === 'completed' ? last(['envelope.completed']) : envelope.status === 'declined' ? last(['signer.declined', 'signer.consent_withdrawn']) : envelope.status === 'voided' ? last(['envelope.voided'])
    : ['prepared', 'awaiting_signature', 'expired'].includes(envelope.status) && Date.parse(envelope.expiresAt) <= at ? envelope.expiresAt : undefined
  return when ? { ended: ['prepared', 'awaiting_signature'].includes(envelope.status) ? 'expired' : envelope.status, at: when } : undefined
}
/** The warning that still stands: the latest one, if it was for this due date and no hold was lifted after it. */
function standingWarning(envelope: Envelope, due: string) {
  let warning: Envelope['events'][number] | undefined
  for (const event of envelope.events) {
    if (event.action === 'envelope.legal_hold_lifted') warning = undefined
    if (event.action === 'envelope.retention_warned') warning = event.detail.due === due ? event : undefined
  }
  return warning
}

/** The hourly pass at `at`: warn for envelopes within 30 days of falling due, purge those whose warning has run out. */
export async function applyRetention(env: Env, at: number) {
  const rule = await retentionRule(env)

  const rows = (await env.DB.prepare("SELECT data FROM iw_envelopes WHERE json_extract(data,'$.legalHold') IS NULL AND (json_extract(data,'$.status') IN ('completed','declined','voided','imported') OR json_extract(data,'$.imported')=1 OR (json_extract(data,'$.status') IN ('prepared','awaiting_signature','expired') AND json_extract(data,'$.expiresAt')<=?))").bind(new Date(at).toISOString()).all<{ data: string }>()).results
  const failures: unknown[] = []
  for (const row of rows) {
    const envelope: Envelope = JSON.parse(row.data), end = ending(envelope, at)
    if (!end) continue
    const effective=await envelopeRetentionRule(env,envelope,rule)
    if (!effective) continue
    const due = retentionDue(end.at, effective.years), warning = standingWarning(envelope, due)
    try {
      if (!warning) { if (Date.parse(due) - retentionWarningDays * day <= at) await warn(env, envelope, effective, end, due, at) }
      else if (at >= Date.parse(String(warning.detail.purgeAt))) await purge(env, envelope, effective, end, String(warning.detail.warnedAt), at)
    } catch (error) { failures.push(error) }
  }
  try { if(rule) await applyArchiveRetention(env, rule, at, retentionDue) } catch (error) { failures.push(error) }
  if (failures.length) throw new AggregateError(failures, `${failures.length} retention step(s) failed.`)
  return { checked: rows.length }
}

async function warn(env: Env, before: Envelope, rule: EnvelopeRetention, end: { ended: string; at: string; basis?: string }, due: string, at: number) {
  const years = rule.years
  const warnedAt = new Date(at).toISOString(), purgeAt = new Date(Math.max(Date.parse(due), at + retentionWarningDays * day)).toISOString()
  const admins = (await env.DB.prepare("SELECT id, email, display_name AS name FROM oa_operators WHERE status='active' AND role IN ('owner','admin') ORDER BY created_at, id").all<{ id: string; email: string; name: string }>()).results
  const after = structuredClone(before), emailSent = !mailSuppressed(env)
  const writes = admins.flatMap(admin => [
    env.DB.prepare('INSERT INTO iw_notices(id,operator_id,envelope_id,event,at,title,recipient) VALUES(?,?,?,?,?,?,?)').bind(id(), admin.id, after.id, 'retention', warnedAt, after.title, ''),
    ...(emailSent && !before.imported && before.status !== 'imported' ? [noticeWrite(env.DB, after, 0, admin.email, `Will be purged: ${after.title}`, `${admin.name},\n\n${after.title}, ${end.ended} ${end.at}${end.basis ? ` (${end.basis})` : ''}, will be permanently erased on ${purgeAt} under the ${rule.folderId?'folder':'account'}'s ${years}-year retention rule.\nTo keep it, place a legal hold on it in Inkwell before then.\n${new URL('/app', env.AUTH_ORIGIN).href}`)] : [])])
  if (emailSent && (before.imported || before.status === 'imported')) for (const admin of admins) writes.push(env.DB.prepare('INSERT INTO iw_import_retention_mail(id,group_id,recipient,subject,body) VALUES(?,?,?,?,?)').bind(id(),`envelope:${before.id}`,admin.email,`Will be purged: ${after.title}`,`${admin.name},\n\n${after.title}, ${end.ended} ${end.at}${end.basis ? ` (${end.basis})` : ''}, will be permanently erased on ${purgeAt} under the ${rule.folderId?'folder':'account'}'s ${years}-year retention rule.\nPlace a legal hold on it in Inkwell to keep it.\n${new URL('/app', env.AUTH_ORIGIN).href}`))
  await appendEvent(after, 'envelope.retention_warned', 'inkwell', { years, folderId:rule.folderId??null, ended: end.ended, endedAt: end.at, ...(end.basis ? {basis:end.basis} : {}), due, warnedAt, purgeAt, recipients: admins.map(a => a.email), emailSent })
  await commitEnvelope(env, before, after, null, writes, [rule.guard])
  if (before.imported || before.status === 'imported') await dispatchArchiveRetentionMail(env)
  else await dispatchMail(env, after.id)
}

async function purge(env: Env, before: Envelope, rule: EnvelopeRetention, end: { ended: string; at: string }, warnedAt: string, at: number) {
  const years = rule.years
  const service = await createPortability({ db: env.DB, policy })
  await atomic(env.DB, [rule.guard, { sql: "EXISTS(SELECT 1 FROM iw_envelopes WHERE id=? AND version=? AND json_extract(data,'$.legalHold') IS NULL)", values: [before.id, before.version] }], [
    ...await erasureWrites(env.DB, service, before.id),
    env.DB.prepare('INSERT INTO iw_retention_purges(envelope_id,ended,years,ended_at,warned_at,purged_at) VALUES(?,?,?,?,?,?)').bind(before.id, end.ended, years, end.at, warnedAt, new Date(at).toISOString())])
}

function retentionAuthority(rule:{years:number;updatedAt:string;updatedBy:string}) { return {sql:"EXISTS(SELECT 1 FROM iw_settings WHERE key='retention_years' AND value=? AND updated_at=? AND updated_by=?)",values:[String(rule.years),rule.updatedAt,rule.updatedBy]} }

interface EnvelopeRetention { years:number; updatedAt:string; updatedBy:string; folderId?:string; guard:import('./storage').Guard }
async function envelopeRetentionRule(env:Env,envelope:Envelope,account:Awaited<ReturnType<typeof retentionRule>>):Promise<EnvelopeRetention|null> {
 const folder=envelope.folderId?await env.DB.prepare('SELECT retention_years,version,updated_at,updated_by FROM iw_envelope_folders WHERE id=?').bind(envelope.folderId).first<{retention_years:number|null;version:number;updated_at:string;updated_by:string}>():null
 const folderGuard=folder?{sql:'EXISTS(SELECT 1 FROM iw_envelope_folders WHERE id=? AND version=?)',values:[envelope.folderId!,folder.version]}:{sql:'NOT EXISTS(SELECT 1 FROM iw_envelope_folders WHERE id=?)',values:[envelope.folderId??'']}
 if(folder?.retention_years)return {years:folder.retention_years,updatedAt:folder.updated_at,updatedBy:folder.updated_by,folderId:envelope.folderId,guard:folderGuard}
 if(!account)return null
 const guard=retentionAuthority(account)
 return {...account,guard:{sql:`(${guard.sql}) AND (${folderGuard.sql})`,values:[...guard.values,...folderGuard.values]}}
}
