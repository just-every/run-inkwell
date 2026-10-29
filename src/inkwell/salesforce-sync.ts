import { canonical, id, insist, now, object, Refusal, text, type Actor } from './model'
import { atomic, roleGuard, type Guard } from './storage'
import { assertSalesforceCredential, salesforceCredential, salesforceCredentialGuard, type SalesforceEnv } from './salesforce-provider'
import { activeSyncAuthorization, cadenceMilliseconds, salesforceDisclosure, syncAdmin, syncAudit, syncAuthorizationGuard, syncDefinition, type SyncAuthorization, type SyncDefinition, type SyncRun } from './salesforce-sync-definition'
import { contactGuard, contactWrite, currentContact, preserveUnmapped, providerContactHash, readSalesforceContactsPage, reconcileSalesforcePage, sourceWrite } from './salesforce-sync-page'
import type { Contact } from './contacts'
const runById = (env: SalesforceEnv, runId: string) => env.DB.prepare('SELECT * FROM iw_salesforce_runs WHERE id=?').bind(runId).first<SyncRun>()
const runView = (run: SyncRun) => ({ id: run.id, authorizationId: run.authorization_id, version: run.version, status: run.status, pages: run.pages, records: run.records, applied: run.applied, conflicts: run.conflicts, failures: run.failures, error: run.error, remaining: run.status === 'completed' ? 'complete' : run.status === 'stopped' ? 'stopped' : 'more_pages', createdAt: run.created_at, updatedAt: run.updated_at })
const authorizationView = (auth: SyncAuthorization) => ({ id: auth.id, version: auth.version, authorizer: auth.authorizer, authorizedAt: auth.authorized_at, state: auth.state, definition: JSON.parse(auth.definition) as SyncDefinition, nextRunAt: auth.next_run_at, stopReason: auth.stop_reason })
export async function salesforceSyncConfig(env: SalesforceEnv, actor: Actor) {
  await syncAdmin(env, actor)
  let configured = false, accountId: string | null = env.SALESFORCE_ACCOUNT_ID ?? null
  try { const credential = await salesforceCredential(env); configured = true; accountId = credential.accountId } catch (error) { if (!(error instanceof Refusal) || error.status !== 503) throw error }
  const authorization = await env.DB.prepare('SELECT * FROM iw_salesforce_authorizations ORDER BY version DESC LIMIT 1').first<SyncAuthorization>()
  return { configured, accountId, disclosure: salesforceDisclosure, authorization: authorization ? authorizationView(authorization) : null }
}
export async function salesforceSyncProgress(env: SalesforceEnv, actor: Actor) {
  await syncAdmin(env, actor)
  // Observing a removed or rotated runtime credential also retires in-flight authority.
  try { await salesforceCredential(env) } catch (error) { if (!(error instanceof Refusal) || error.status !== 503) throw error }
  const runs = (await env.DB.prepare('SELECT * FROM iw_salesforce_runs ORDER BY created_at DESC,id DESC LIMIT 50').all<SyncRun>()).results
  const conflicts = (await env.DB.prepare("SELECT id,account_id,record_id,run_id,contact_json,local_email,status FROM iw_salesforce_conflicts WHERE status='open' ORDER BY id LIMIT 100").all<{ id: string; record_id: string; run_id: string; contact_json: string; local_email: string; status: string }>()).results
  return { runs: runs.map(runView), conflicts: await Promise.all(conflicts.map(async row => ({ id: row.id, recordId: row.record_id, runId: row.run_id, status: row.status, provider: JSON.parse(row.contact_json) as Contact, local: await currentContact(env, row.local_email) }))) }
}
async function authorize(env: SalesforceEnv, actor: Actor, input: Record<string, unknown>) {
  insist(input.consent === true, 'Explicitly authorize this complete contact import definition.')
  const definition = syncDefinition(input.definition), credential = await salesforceCredential(env)
  insist(definition.accountId === credential.accountId, 'Authorize only the configured Salesforce account.')
  const version = (await env.DB.prepare('SELECT COALESCE(MAX(version),0)+1 AS version FROM iw_salesforce_authorizations').first<{ version: number }>())!.version
  const auth: SyncAuthorization = { id: id(), version, authorizer: actor.id, member_version: actor.version, credential_version: credential.version, account_id: credential.accountId, definition: canonical(definition), authorized_at: now(), state: 'active', next_run_at: null, stop_reason: null }
  await assertSalesforceCredential(env, credential)
  await atomic(env.DB, [roleGuard(actor, ['owner', 'admin']), salesforceCredentialGuard(credential)], [
    env.DB.prepare("UPDATE iw_salesforce_authorizations SET state='revoked',stop_reason='Replaced by a freshly authorized version' WHERE state='active'"),
    env.DB.prepare('INSERT INTO iw_salesforce_authorizations(id,version,authorizer,member_version,credential_version,account_id,definition,authorized_at,state,next_run_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(auth.id, auth.version, auth.authorizer, auth.member_version, auth.credential_version, auth.account_id, auth.definition, auth.authorized_at, auth.state, null),
    ...syncAudit(env, actor.id, 'salesforce.authorized', auth, 'authorized'),
  ])
  return authorizationView(auth)
}
async function start(env: SalesforceEnv, authorizationId: string, requestId: string, actor?: Actor) {
  const credential = await salesforceCredential(env), auth = await activeSyncAuthorization(env, authorizationId)
  const replay = await env.DB.prepare('SELECT * FROM iw_salesforce_runs WHERE request_id=?').bind(requestId).first<SyncRun>()
  if (replay) { insist(replay.authorization_id === auth.id, 'This run request already belongs to another authorization.', 409); return replay }
  insist(auth.credential_version === credential.version, 'Authorize the current Salesforce credential.', 403)
  const definition = JSON.parse(auth.definition) as SyncDefinition
  if (definition.cadence === 'once') insist(!await env.DB.prepare('SELECT id FROM iw_salesforce_runs WHERE authorization_id=? LIMIT 1').bind(auth.id).first(), 'This once-only authorization already has a run. Resume that run or authorize a new one.', 409)
  const run: SyncRun = { id: id(), authorization_id: auth.id, version: auth.version, request_id: requestId, status: 'ready', cursor: null, pages: 0, records: 0, applied: 0, conflicts: 0, failures: 0, error: null, lease: null, lease_at: null, created_at: now(), updated_at: now() }
  await assertSalesforceCredential(env, credential)
  await atomic(env.DB, [syncAuthorizationGuard(auth), salesforceCredentialGuard(credential), ...(actor ? [roleGuard(actor, ['owner', 'admin'])] : []), ...(definition.cadence === 'once' ? [{ sql: 'NOT EXISTS(SELECT 1 FROM iw_salesforce_runs WHERE authorization_id=?)', values: [auth.id] }] : [])], [env.DB.prepare('INSERT INTO iw_salesforce_runs(id,authorization_id,version,request_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(run.id, auth.id, auth.version, requestId, run.status, run.created_at, run.updated_at), ...syncAudit(env, actor?.id ?? 'system:salesforce', 'salesforce.run.started', auth, 'ready', run.id)])
  return run
}
/** One continuation owns a short lease, reads one provider page, then atomically applies records and durable progress. */
async function continueRun(env: SalesforceEnv, runId: string, actor?: Actor, time = Date.now()) {
  let run = await runById(env, runId)
  insist(run, 'Salesforce run not found.', 404)
  const credential = await salesforceCredential(env), auth = await activeSyncAuthorization(env, run.authorization_id)
  if (run.status === 'completed') return runView(run)
  insist(run.status !== 'stopped', 'This run has stopped. Authorize a new version.', 403)
  insist(run.lease_at === null || Date.now() - run.lease_at > 60_000, 'A continuation is already reading this page. Resume after one minute if it was interrupted.', 409)
  const lease = id(), beforeStatus = run.status, definition = JSON.parse(auth.definition) as SyncDefinition, actorId = actor?.id ?? 'system:salesforce'
  const guards: Guard[] = [syncAuthorizationGuard(auth), salesforceCredentialGuard(credential), ...(actor ? [roleGuard(actor, ['owner', 'admin'])] : [])]
  await atomic(env.DB, [...guards, { sql: 'EXISTS(SELECT 1 FROM iw_salesforce_runs WHERE id=? AND status=? AND pages=? AND lease IS ?)', values: [run.id, beforeStatus, run.pages, run.lease] }], [env.DB.prepare("UPDATE iw_salesforce_runs SET status='reading',lease=?,lease_at=?,updated_at=? WHERE id=?").bind(lease, Date.now(), now(), run.id)])
  run = { ...run, status: 'reading', lease, lease_at: Date.now() }
  const owned: Guard = { sql: "EXISTS(SELECT 1 FROM iw_salesforce_runs WHERE id=? AND status='reading' AND lease=? AND pages=?)", values: [run.id, lease, run.pages] }
  try {
    await activeSyncAuthorization(env, auth.id)
    const page = await readSalesforceContactsPage(env, credential, definition, run.cursor)
    await activeSyncAuthorization(env, auth.id)
    const changes = await reconcileSalesforcePage(env, auth.account_id, run, page.records, auth.authorizer, definition)
    await assertSalesforceCredential(env, credential)
    await activeSyncAuthorization(env, auth.id)
    const finished = page.next === null, at = now(), cadence = cadenceMilliseconds(definition)
    await atomic(env.DB, [...guards, owned, ...changes.guards], [...changes.writes,
      env.DB.prepare('UPDATE iw_salesforce_runs SET status=?,cursor=?,pages=pages+1,records=records+?,applied=applied+?,conflicts=conflicts+?,error=NULL,lease=NULL,lease_at=NULL,updated_at=? WHERE id=?').bind(finished ? 'completed' : 'ready', page.next, page.records.length, changes.applied, changes.conflicts, at, run.id),
      ...(finished ? [env.DB.prepare('UPDATE iw_salesforce_authorizations SET next_run_at=? WHERE id=?').bind(cadence === null ? null : time + cadence, auth.id)] : []),
      ...syncAudit(env, actorId, 'salesforce.run.page', auth, finished ? 'completed' : 'more_pages', run.id),
    ])
    return runView((await runById(env, run.id))!)
  } catch (error) {
    // No provider field value, body, token or untrusted provider message enters progress or logs.
    const current = await runById(env, run.id)
    if (current?.status === 'reading' && current.lease === lease) {
      const reason = error instanceof Refusal && error.status === 409 ? 'A contact or authority changed before commit. Resume to reconcile the current state.' : 'The provider page could not be verified. Check the connector and resume manually.'
      await env.DB.batch([env.DB.prepare("UPDATE iw_salesforce_runs SET status='failed',failures=failures+1,error=?,lease=NULL,lease_at=NULL,updated_at=? WHERE id=? AND lease=? AND status='reading'").bind(reason, now(), run.id, lease), ...syncAudit(env, actorId, 'salesforce.run.failed', auth, 'page_failed', run.id)])
    }
    throw error instanceof Refusal ? error : new Refusal('The Salesforce page could not be verified. Resume manually.', 502)
  }
}
async function resolve(env: SalesforceEnv, actor: Actor, input: Record<string, unknown>) {
  const conflictId = text(input.conflictId, 'a conflict', 100), choice = input.choice
  insist(choice === 'keep_local' || choice === 'use_provider', 'Keep the local edit or use the provider contact.')
  const conflict = await env.DB.prepare("SELECT * FROM iw_salesforce_conflicts WHERE id=? AND status='open'").bind(conflictId).first<{ id: string; account_id: string; record_id: string; run_id: string; local_email: string; contact_json: string }>()
  insist(conflict, 'That conflict is already resolved or missing.', 404)
  const run = (await runById(env, conflict.run_id))!, credential = await salesforceCredential(env), auth = await activeSyncAuthorization(env, run.authorization_id)
  const local = await currentContact(env, conflict.local_email), definition = JSON.parse(auth.definition) as SyncDefinition, provider = preserveUnmapped(JSON.parse(conflict.contact_json) as Contact, local, definition), target = await currentContact(env, provider.email)
  const foreign = await env.DB.prepare('SELECT record_id FROM iw_salesforce_sources WHERE account_id=? AND email=? AND record_id<>?').bind(auth.account_id, choice === 'keep_local' ? conflict.local_email : provider.email, conflict.record_id).first()
  insist(!foreign, 'Another provider identity owns this contact email. Resolve the source records before importing.', 409)
  insist(choice !== 'keep_local' || local, 'The local contact was removed; use the provider contact or leave the conflict open.', 409)
  insist(choice !== 'use_provider' || provider.email === conflict.local_email || !target, 'The provider email belongs to another local contact. Resolve the email collision first.', 409)
  const chosen = choice === 'keep_local' ? local! : provider, writes: D1PreparedStatement[] = []
  if (choice === 'use_provider') { if (provider.email !== conflict.local_email && local) writes.push(env.DB.prepare('DELETE FROM iw_contacts WHERE email=?').bind(conflict.local_email)); writes.push(contactWrite(env, provider, actor.id)) }
  writes.push(sourceWrite(env, auth.account_id, conflict.record_id, provider, choice === 'keep_local' ? await providerContactHash(provider, definition) : null, chosen.email), env.DB.prepare("UPDATE iw_salesforce_conflicts SET status='resolved' WHERE id=?").bind(conflict.id), ...syncAudit(env, actor.id, 'salesforce.conflict.resolved', auth, choice, run.id))
  await assertSalesforceCredential(env, credential)
  await atomic(env.DB, [roleGuard(actor, ['owner', 'admin']), syncAuthorizationGuard(auth), salesforceCredentialGuard(credential), contactGuard(local, conflict.local_email), contactGuard(target, provider.email), { sql: "EXISTS(SELECT 1 FROM iw_salesforce_conflicts WHERE id=? AND status='open' AND contact_json=?)", values: [conflict.id, conflict.contact_json] }], writes)
  return { id: conflict.id, status: 'resolved', choice }
}
export async function salesforceSyncOperation(env: SalesforceEnv, actor: Actor, value: unknown) {
  await syncAdmin(env, actor)
  const input = object(value)
  if (input.operation === 'authorize') return authorize(env, actor, input)
  if (input.operation === 'start') { const run = await start(env, text(input.authorizationId, 'an authorization', 100), text(input.requestId, 'a unique run request ID', 100), actor); return run.pages === 0 && run.status !== 'completed' ? continueRun(env, run.id, actor) : runView(run) }
  if (input.operation === 'continue') return continueRun(env, text(input.runId, 'a run', 100), actor)
  if (input.operation === 'resolve') return resolve(env, actor, input)
  if (input.operation === 'revoke') {
    const auth = await env.DB.prepare('SELECT * FROM iw_salesforce_authorizations WHERE id=?').bind(text(input.authorizationId, 'an authorization', 100)).first<SyncAuthorization>()
    insist(auth, 'Salesforce authorization not found.', 404)
    await atomic(env.DB, [roleGuard(actor, ['owner', 'admin'])], [env.DB.prepare("UPDATE iw_salesforce_authorizations SET state='revoked',stop_reason='Revoked by an owner or admin' WHERE id=? AND state='active'").bind(auth.id), ...syncAudit(env, actor.id, 'salesforce.authorization.revoked', auth, 'revoked')])
    return { id: auth.id, state: 'revoked' }
  }
  throw new Refusal('Choose authorize, start, continue, resolve or revoke.')
}
/** Standing authorization is sufficient for every page and future due run; each invocation remains bounded. */
export async function runSalesforceSyncSchedule(env: SalesforceEnv, time = Date.now()) {
  const authorizations = (await env.DB.prepare("SELECT * FROM iw_salesforce_authorizations WHERE state='active' AND json_extract(definition,'$.cadence')<>'once' ORDER BY version LIMIT 10").all<SyncAuthorization>()).results
  for (const auth of authorizations) {
    try {
      await salesforceCredential(env); await activeSyncAuthorization(env, auth.id)
      let run = await env.DB.prepare("SELECT * FROM iw_salesforce_runs WHERE authorization_id=? AND status IN('ready','reading') ORDER BY created_at DESC LIMIT 1").bind(auth.id).first<SyncRun>()
      if (!run && auth.next_run_at !== null && auth.next_run_at > time) continue
      // Failed runs await an explicit manual resume, rather than hidden retries.
      if (!run && await env.DB.prepare("SELECT id FROM iw_salesforce_runs WHERE authorization_id=? AND status='failed'").bind(auth.id).first()) continue
      run ??= await start(env, auth.id, `scheduled:${auth.id}:${auth.next_run_at ?? 0}`)
      await continueRun(env, run.id, undefined, time)
    } catch (error) { if (!(error instanceof Refusal)) throw error }
  }
}
