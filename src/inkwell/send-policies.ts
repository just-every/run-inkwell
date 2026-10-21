import { canonical, insist, now, Refusal, sha256, text, type Env, type Envelope } from './model'
import { atomic, commandWrite, roleGuard, type Guard } from './storage'
import type { CommandContext } from './envelopes'

/** ADMIN-004 / SEND-001: per-source, versioned send policies at the account scope. A policy says whether a source may send
 * (`off`, `person` = with the sending person's eligibility confirmation, `autonomous` = with no per-envelope human
 * approval), for which templates, whether an internal approval (ROUTE-004) comes first and whether the send may be
 * deferred (PREP-009). Group and profile policies narrow the account policy when ADMIN-002 and ADMIN-008 ship; each
 * source that adds a door (BULK-001, FORM-001, API-001, the integrations) reads its policy here before it ships. */
export const sendSources = ['ad_hoc', 'template', 'bulk', 'web_form', 'api'] as const
export type SendSource = typeof sendSources[number]
export type SendMode = 'off' | 'person' | 'autonomous'
export interface SendPolicy { scope: 'account'; source: SendSource; mode: SendMode; templates: string[] | null; requireInternalApproval: boolean; deferredRelease: boolean; version: number; actor: string | null; at: string | null; reason: string | null }
export interface SendPolicyVersion extends SendPolicy { before: Pick<SendPolicy, 'mode' | 'templates' | 'requireInternalApproval' | 'deferredRelease' | 'version'> }
/** What an envelope records about the policy that allowed it: the source, who the send is for, and each contributing policy version. */
export interface SendPolicyRecord { source: SendSource; mode: SendMode; principal: string; credential: null; policies: { scope: 'account'; version: number }[]; templates: string[] | null; requireInternalApproval: boolean; deferredRelease: boolean; fingerprint: string }
export interface SendDecision { allowed: boolean; code?: string; reason?: string; requiresApproval: boolean; record: SendPolicyRecord; fence: Guard }
export const sourceLabel: Record<SendSource, string> = { ad_hoc: 'ad hoc', template: 'template', bulk: 'bulk', web_form: 'web form', api: 'API' }
/** Opt-in defaults: the person-based sources start with the person's confirmation, every other source starts off. */
const defaultMode: Record<SendSource, SendMode> = { ad_hoc: 'person', template: 'person', bulk: 'person', web_form: 'off', api: 'off' }
const freshSeconds = 15 * 60

interface Row { source: SendSource; version: number; mode: SendMode; templates: string | null; require_internal_approval: number; deferred_release: number; actor: string; at: string; reason: string | null; before_value?: string }
const policyOf = (row: Row): SendPolicy => ({ scope: 'account', source: row.source, mode: row.mode, templates: row.templates ? JSON.parse(row.templates) : null, requireInternalApproval: Boolean(row.require_internal_approval), deferredRelease: Boolean(row.deferred_release), version: row.version, actor: row.actor, at: row.at, reason: row.reason })
const builtIn = (source: SendSource): SendPolicy => ({ scope: 'account', source, mode: defaultMode[source], templates: null, requireInternalApproval: false, deferredRelease: true, version: 0, actor: null, at: null, reason: null })
const columns = 'source,version,mode,templates,require_internal_approval,deferred_release,actor,at,reason,before_value'

export async function sendPolicy(env: Env, source: SendSource): Promise<SendPolicy> {
  const row = await env.DB.prepare(`SELECT ${columns} FROM iw_send_policy_versions WHERE scope='account' AND source=? ORDER BY version DESC LIMIT 1`).bind(source).first<Row>()
  return row ? policyOf(row) : builtIn(source)
}
export async function sendPolicies(env: Env) { return Promise.all(sendSources.map(source => sendPolicy(env, source))) }
/** Every saved version, oldest first, each with the settings it replaced. */
export async function sendPolicyHistory(env: Env): Promise<SendPolicyVersion[]> {
  const rows = (await env.DB.prepare(`SELECT ${columns} FROM iw_send_policy_versions WHERE scope='account' ORDER BY at,source,version`).all<Row>()).results
  return rows.map(row => ({ ...policyOf(row), before: JSON.parse(row.before_value!) }))
}
const settingsOf = ({ mode, templates, requireInternalApproval, deferredRelease, version }: SendPolicy) => ({ mode, templates, requireInternalApproval, deferredRelease, version })
const versionGuard = (source: SendSource, version: number): Guard => ({ sql: "(SELECT COALESCE(MAX(version),0) FROM iw_send_policy_versions WHERE scope='account' AND source=?)=?", values: [source, version] })

/** `account.send_policy`: save a new version of one source's policy. Only a signed-in owner or admin; turning a source
 * autonomous or widening its templates also needs a sign-in no older than 15 minutes, checked in the write's own batch. */
export async function setSendPolicy(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const actor = context.actor
  insist((actor.role === 'owner' || actor.role === 'admin') && Boolean(actor.sessionId) && !actor.agentId, 'Only a signed-in owner or admin can change send policies.', 403)
  insist(input.scope === undefined || input.scope === 'account', 'Group and profile send policies arrive with ADMIN-002 and ADMIN-008; set the account policy.', 409)
  const source = input.source as SendSource
  insist(sendSources.includes(source), `Choose a send source: ${sendSources.join(', ')}.`)
  insist(Number.isSafeInteger(input.expectedVersion) && (input.expectedVersion as number) >= 0, 'Give the current version of this source’s policy.')
  const before = await sendPolicy(env, source)
  insist(input.expectedVersion === before.version, 'This send policy changed. Refresh and try again.', 409)
  const mode = input.mode === undefined ? before.mode : input.mode as SendMode
  insist(['off', 'person', 'autonomous'].includes(mode), 'Choose off, person or autonomous.')
  insist(source !== 'ad_hoc' || mode !== 'autonomous', 'An ad hoc send always needs a person’s confirmation; it can never be autonomous.')
  const flag = (value: unknown, current: boolean, name: string) => { insist(value === undefined || typeof value === 'boolean', `${name} must be true or false.`); return (value ?? current) as boolean }
  const requireInternalApproval = flag(input.requireInternalApproval, before.requireInternalApproval, 'Requiring internal approval'), deferredRelease = flag(input.deferredRelease, before.deferredRelease, 'Allowing deferred release')
  let templates = before.templates
  if (input.templates !== undefined) {
    if (input.templates === null) templates = null
    else {
      insist(Array.isArray(input.templates) && input.templates.length <= 100, 'List up to 100 template IDs, or null for all templates.')
      templates = [...new Set(input.templates.map(t => text(t, 'a template ID', 100)))].sort()
      const known = await env.DB.prepare(`SELECT id FROM iw_templates WHERE id IN (${templates.map(() => '?').join(',') || "''"})`).bind(...templates).all<{ id: string }>()
      insist(known.results.length === templates.length, 'Every listed template must exist.')
    }
  }
  insist(source !== 'ad_hoc' || templates === null, 'An ad hoc send has no template to list.')
  insist(source !== 'web_form' || mode === 'off' || (templates && templates.length > 0), 'A web form is tied to a template: list the templates it may use.')
  const reason = input.reason === undefined || input.reason === null ? null : text(input.reason, 'a reason', 500)
  const widens = before.templates !== null && (templates === null || templates.some(t => !before.templates!.includes(t)))
  const needsFresh = (mode === 'autonomous' && before.mode !== 'autonomous') || widens
  const next = { mode, templates, requireInternalApproval, deferredRelease }
  if (JSON.stringify(next) === JSON.stringify({ mode: before.mode, templates: before.templates, requireInternalApproval: before.requireInternalApproval, deferredRelease: before.deferredRelease })) return { policy: before, unchanged: true }
  const policy: SendPolicy = { scope: 'account', source, ...next, version: before.version + 1, actor: actor.id, at: now(), reason }
  const fresh: Guard[] = needsFresh ? [{ sql: 'EXISTS(SELECT 1 FROM oa_sessions WHERE id=? AND created_at>=?)', values: [actor.sessionId, Date.now() - freshSeconds * 1000] }] : []
  if (needsFresh) insist((await env.DB.prepare('SELECT created_at AS at FROM oa_sessions WHERE id=?').bind(actor.sessionId).first<{ at: number }>())!.at >= Date.now() - freshSeconds * 1000, 'Sign in again: making a source autonomous or widening its templates needs a sign-in from the last 15 minutes.', 403)
  const result = { policy }
  await atomic(env.DB, [roleGuard(actor, ['owner', 'admin']), versionGuard(source, before.version), ...fresh], [
    env.DB.prepare(`INSERT INTO iw_send_policy_versions(scope,${columns}) VALUES('account',?,?,?,?,?,?,?,?,?,?)`).bind(source, policy.version, mode, templates ? JSON.stringify(templates) : null, Number(requireInternalApproval), Number(deferredRelease), actor.id, policy.at, reason, JSON.stringify(settingsOf(before))),
    commandWrite(env.DB, actor.id, context.commandId, context.fingerprint, result)])
  return result
}

export const envelopeSource = (envelope: Envelope): SendSource => envelope.template ? 'template' : 'ad_hoc'
/** Whether `envelope` may be released now by its source's current policy, with the record it keeps and the fence that
 * keeps that verdict true in the release's own batch. `stage: 'release'` also requires an internal approval the policy
 * demands to have been given (`approved`); at the request stage it only reports that one is needed. */
export async function evaluateSendPolicy(env: Env, envelope: Envelope, principal: string, options: { deferred: boolean; approved: boolean; stage: 'request' | 'release' }): Promise<SendDecision> {
  const source = envelopeSource(envelope), policy = await sendPolicy(env, source), label = sourceLabel[source]
  let code: string | undefined, reason: string | undefined
  if (policy.mode === 'off') [code, reason] = ['send_policy_off', `The account’s send policy for ${label} sends is off. Ask an owner or admin to turn it on.`]
  else if (policy.templates && !(envelope.template && policy.templates.includes(envelope.template.id))) [code, reason] = ['send_policy_template', `The account’s send policy for ${label} sends does not include this template.`]
  else if (options.deferred && !policy.deferredRelease) [code, reason] = ['send_policy_deferred', `The account’s send policy for ${label} sends does not allow scheduling.`]
  else if (options.stage === 'release' && policy.requireInternalApproval && !options.approved) [code, reason] = ['send_policy_approval', `The account’s send policy for ${label} sends now requires an internal approval first.`]
  const effective = { source, mode: policy.mode, principal, credential: null, policies: [{ scope: 'account' as const, version: policy.version }], templates: policy.templates, requireInternalApproval: policy.requireInternalApproval, deferredRelease: policy.deferredRelease }
  const record: SendPolicyRecord = { ...effective, fingerprint: await sha256(canonical(effective)) }
  const fence = versionGuard(source, policy.version)
  return { allowed: !code, ...(code ? { code, reason } : {}), requiresApproval: policy.requireInternalApproval, record, fence: { sql: `${fence.sql} AND ?=1`, values: [...fence.values, code ? 0 : 1] } }
}
/** The refusal for a decision that does not allow the send; person-based and credential sources alike answer 403 with a code. */
export function insistAllowed(decision: SendDecision) { if (!decision.allowed) throw new Refusal(decision.reason!, 403, decision.code) }
