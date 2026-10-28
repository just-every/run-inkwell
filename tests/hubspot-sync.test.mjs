import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

const definition = cadence => ({ accountId: '12345', scope: { kind: 'all' }, properties: ['firstname', 'lastname', 'email', 'phone', 'company'], mappings: { name: 'full_name', email: 'email', phone: 'phone', company: 'company' }, destination: 'shared_contacts', updateBehavior: 'preserve_local_edits', cadence })
const record = (n, overrides = {}) => ({ id: `synthetic-inkwell-${n}`, properties: { firstname: `Synthetic ${n}`, lastname: 'Contact', email: `synthetic-inkwell-${n}@example.test`, phone: '+1 202 555 0100', company: 'Synthetic company', ...overrides } })
const bindings = { HUBSPOT_ACCESS_TOKEN: 'synthetic-inkwell-1', HUBSPOT_ACCOUNT_ID: '12345' }
const progress = async (h, cookie = h.owner) => (await h.send('/api/inkwell/hubspot/progress', undefined, cookie)).value
const operation = async (h, value, cookie = h.owner, status = 200) => (await h.post('/api/inkwell/hubspot/sync', value, cookie, status)).value
const authorize = (h, cadence = 'once', cookie = h.owner, extra = {}) => operation(h, { operation: 'authorize', consent: true, definition: { ...definition(cadence), ...extra } }, cookie)
const start = (h, auth, requestId, cookie = h.owner, status = 200) => operation(h, { operation: 'start', authorizationId: auth.id, requestId }, cookie, status)
const resume = (h, run, cookie = h.owner, status = 200) => operation(h, { operation: 'continue', runId: run.id }, cookie, status)
const contacts = async (h, cookie = h.owner) => (await h.send('/api/inkwell/contacts', undefined, cookie)).value.contacts

test('INTEG-015 ROUTE-008: one versioned recurring authorization spans provider pages, resumes a failed page, deduplicates repeated syncs and resolves local edits without deleting absent contacts; audit retains exact scope without values', async () => {
 let calls = 0, failure = true, changed = false, changedAgain = false
 const clock = Date.parse('2026-10-27T12:00:00.000Z')
 const h = await harness({ bindings, now: clock, networkEdge: async request => {
  if (new URL(request.url).hostname !== 'api.hubapi.com') return
  calls++; assert.equal(request.headers.get('authorization'), 'Bearer synthetic-inkwell-1')
  if (request.method === 'POST') { const body = await request.json(); assert.deepEqual(body.inputs, [{ id: 'synthetic-inkwell-1' }]); return Response.json({ status: 'COMPLETE', results: [record(1, { firstname: 'Provider changed again' })] }) }
  assert.equal(request.method, 'GET')
  const url = new URL(request.url); assert.equal(url.pathname, '/crm/v3/objects/contacts'); assert.equal(url.searchParams.get('properties'), 'company,email,firstname,lastname,phone')
  if (url.searchParams.has('after')) { assert.equal(url.searchParams.get('after'), 'synthetic-inkwell-2'); if (failure) { failure = false; return new Response('untrusted-provider-body', { status: 500 }) }; return Response.json({ results: [record(2)] }) }
  return Response.json({ results: [record(1, changed ? { firstname: changedAgain ? 'Provider changed again' : 'Provider changed' } : {})], paging: { next: { after: 'synthetic-inkwell-2', link: 'https://untrusted.invalid/ignored' } } })
 } })
 try {
  await h.command('account.healthcare', { enabled: true })
  const config = await h.send('/api/inkwell/hubspot/config', undefined, h.owner)
  assert.equal(config.status, 200); assert.equal(config.value.configured, true); assert.match(config.value.disclosure, /Owners, admins and senders/)
  const auth = await authorize(h, 'daily'); assert.equal(auth.version, 1); assert.equal(auth.state, 'active')
  h.advanceTo(clock + 60_000)
  const first = await start(h, auth, 'synthetic-inkwell-run-1'); assert.equal(first.pages, 1); assert.equal(first.records, 1); assert.equal(first.applied, 1); assert.equal(first.remaining, 'more_pages')
  assert.equal((await start(h, auth, 'synthetic-inkwell-run-1')).id, first.id); assert.equal(calls, 1, 'replaying a launch does not read a page twice')
  await h.db.prepare("UPDATE iw_hubspot_runs SET status='reading',lease='synthetic-inkwell-interrupted',lease_at=? WHERE id=?").bind(clock + 60_000, first.id).run()
  await resume(h, first, h.owner, 409); assert.equal(calls, 1, 'a live continuation lease prevents a duplicate provider read')
  await h.db.prepare('UPDATE iw_hubspot_runs SET lease_at=? WHERE id=?').bind(clock - 61_000, first.id).run()
  h.advanceTo(clock + 120_000)
  await resume(h, first, h.owner, 502)
  let state = await progress(h); assert.equal(state.runs[0].failures, 1); assert.equal(state.runs[0].pages, 1); assert.equal((await contacts(h)).length, 1)
  h.advanceTo(clock + 180_000)
  const complete = await resume(h, first); assert.equal(complete.status, 'completed'); assert.equal(complete.pages, 2); assert.equal(complete.records, 2); assert.equal(complete.applied, 2)
  await resume(h, first); assert.equal(calls, 3, 'a completed continuation never reads again')
  const history = (await h.send('/api/inkwell/audit?limit=200&target=' + encodeURIComponent('hubspot:' + auth.id), undefined, h.owner)).value.entries
  const runAudit = history.filter(item => item.after?.runId === first.id)
  assert.deepEqual(runAudit.map(item => [item.action, item.after.outcome, item.at]).sort(), [
   ['hubspot.run.started', 'ready', '2026-10-27T12:01:00.000Z'],
   ['hubspot.run.page', 'more_pages', '2026-10-27T12:01:00.000Z'],
   ['hubspot.run.failed', 'page_failed', '2026-10-27T12:02:00.000Z'],
   ['hubspot.run.page', 'completed', '2026-10-27T12:03:00.000Z'],
  ].sort(), 'every run transition retains its actual time and outcome once, including failure and completion replay')
  for (const item of runAudit) {
   assert.equal(item.actorId, auth.authorizer); assert.equal(item.after.authorizationId, auth.id)
   assert.equal(item.after.version, 1); assert.deepEqual(item.after.scope, { accountId: '12345', scope: { kind: 'all' }, properties: ['company', 'email', 'firstname', 'lastname', 'phone'], mappings: { name: 'full_name', email: 'email', phone: 'phone', company: 'company' }, destination: 'shared_contacts', updateBehavior: 'preserve_local_edits', cadence: 'daily' })
  }
  const authorized = history.filter(item => item.action === 'hubspot.authorized')
  assert.equal(authorized.length, 1); assert.equal(authorized[0].at, '2026-10-27T12:00:00.000Z')
  assert.equal(authorized[0].after.outcome, 'authorized')
  const sender = await h.invite('synthetic-inkwell-sender@example.test', 'member')
  const person = await h.db.prepare('SELECT id FROM oa_operators WHERE email=?').bind('synthetic-inkwell-sender@example.test').first()
  await h.command('member.role', { operatorId: person.id, role: 'sender' })
  assert.equal((await contacts(h, sender)).length, 2, 'existing senders read the shared imported book')
  await h.post('/api/inkwell/contacts', { ...(await contacts(h))[0], name: 'Local edit retained' }, sender)
  changed = true
  let repeat = await start(h, auth, 'synthetic-inkwell-run-2'); assert.equal(repeat.conflicts, 1); assert.equal(repeat.applied, 0)
  repeat = await resume(h, repeat); assert.equal(repeat.records, 2); assert.equal(repeat.applied, 0); assert.equal((await contacts(h)).length, 2)
  state = await progress(h); assert.equal(state.conflicts.length, 1); assert.equal(state.conflicts[0].local.name, 'Local edit retained'); assert.equal(state.conflicts[0].provider.name, 'Provider changed Contact')
  await operation(h, { operation: 'resolve', conflictId: state.conflicts[0].id, choice: 'keep_local' })
  assert.equal((await contacts(h)).find(c => c.email === 'synthetic-inkwell-1@example.test').name, 'Local edit retained')
  repeat = await start(h, auth, 'synthetic-inkwell-run-3'); assert.equal(repeat.conflicts, 0); await resume(h, repeat); assert.equal((await progress(h)).conflicts.length, 0)
  changedAgain = true; repeat = await start(h, auth, 'synthetic-inkwell-run-4'); state = await progress(h); assert.equal(state.conflicts.length, 1)
  await operation(h, { operation: 'resolve', conflictId: state.conflicts[0].id, choice: 'use_provider' }); await resume(h, repeat)
  assert.equal((await contacts(h)).find(c => c.email === 'synthetic-inkwell-1@example.test').name, 'Provider changed again Contact')
  const narrow = await authorize(h, 'once', h.owner, { scope: { kind: 'selected', recordIds: ['synthetic-inkwell-1'] } }); assert.equal(narrow.version, 2)
  const absent = await start(h, narrow, 'synthetic-inkwell-provider-absence'); assert.equal(absent.status, 'completed'); assert.equal(absent.records, 1)
  assert.deepEqual((await contacts(h)).map(contact => contact.email).sort(), ['synthetic-inkwell-1@example.test', 'synthetic-inkwell-2@example.test'], 'a real narrower provider page never removes an absent local contact')
  const audit = await h.send('/api/inkwell/audit?action=hubspot.authorized', undefined, h.owner)
  assert.equal(audit.status, 200); assert.equal(audit.value.entries.length, 2)
  const entry = audit.value.entries.find(item => item.after.version === 1); assert.equal(entry.actorId, auth.authorizer); assert.deepEqual(entry.after.scope, auth.definition); assert.equal(entry.after.authorizationId, auth.id)
  const serialized = (await h.send('/api/inkwell/audit.csv', undefined, h.owner)).value
  for (const value of ['Provider changed', 'Local edit retained', 'Synthetic company', '+1 202 555 0100', 'synthetic-inkwell-1@example.test', 'Bearer synthetic-inkwell-1', 'untrusted-provider-body']) assert.equal(serialized.includes(value), false, 'operational audit excludes contact field values and credentials')
  const logs = JSON.stringify(h.logs())
  assert.match(logs, /inkwell.request/, 'privacy proof captures actual operational requests')
  for (const value of ['Provider changed', 'Local edit retained', 'Synthetic company', '+1 202 555 0100', 'synthetic-inkwell-1@example.test', 'Bearer synthetic-inkwell-1', 'untrusted-provider-body']) assert.equal(logs.includes(value), false, 'captured operational logs exclude ' + value)
  const identities = (await h.db.prepare('SELECT record_id,email FROM iw_hubspot_sources ORDER BY record_id').all()).results
  assert.deepEqual(identities.map(item => item.record_id), ['synthetic-inkwell-1', 'synthetic-inkwell-2'])
 } finally { await h.close() }
})

test('INTEG-015: revocation and temporary loss of an authorizing admin permanently stop further reads and commits; selected scope reads only approved IDs and cadence runs under standing authority', async () => {
 let calls = 0, revokeDuringRead = false, h, adminId, selectedLarge = false
 const largeIds = Array.from({ length: 101 }, (_, index) => `synthetic-inkwell-${index + 10}`)
 h = await harness({ bindings, networkEdge: async request => {
  if (new URL(request.url).hostname !== 'api.hubapi.com') return
  calls++
  if (revokeDuringRead) { revokeDuringRead = false; await h.db.prepare("UPDATE oa_operators SET role='member' WHERE id=?").bind(adminId).run(); await h.db.prepare("UPDATE oa_operators SET role='admin' WHERE id=?").bind(adminId).run() }
  if (request.method === 'POST') { const body = await request.json(); if (selectedLarge) { assert.ok(body.inputs.every(item => largeIds.includes(item.id))); assert.equal(new Set(body.inputs.map(item => item.id)).size, body.inputs.length); return Response.json({ status: 'COMPLETE', results: body.inputs.map(item => record(Number(item.id.split('-').at(-1)))) }) }; assert.deepEqual(body.inputs, [{ id: 'synthetic-inkwell-3' }]); return Response.json({ status: 'COMPLETE', results: [record(3)] }) }
  return Response.json({ results: [record(calls)], paging: { next: { after: `synthetic-inkwell-${calls + 1}` } } })
 } })
 try {
  const admin = await h.invite('synthetic-inkwell-admin@example.test', 'admin'); adminId = (await h.db.prepare('SELECT id FROM oa_operators WHERE email=?').bind('synthetic-inkwell-admin@example.test').first()).id
  let auth = await authorize(h, 'once', admin), run = await start(h, auth, 'synthetic-inkwell-revocation', admin)
  const revokeStart = Date.now()
  await operation(h, { operation: 'revoke', authorizationId: auth.id })
  const revokeEnd = Date.now()
  const stoppedAudit = (await h.send('/api/inkwell/audit?limit=200&action=hubspot.authorization.stopped&target=' + encodeURIComponent('hubspot:' + auth.id), undefined, h.owner)).value.entries
  assert.equal(stoppedAudit.length, 1, 'revoking a running import has one durable stopped outcome')
  assert.equal(stoppedAudit[0].after.outcome, 'Revoked by an owner or admin')
  assert.equal(stoppedAudit[0].after.version, auth.version); assert.deepEqual(stoppedAudit[0].after.scope, auth.definition)
  assert.ok(Date.parse(stoppedAudit[0].at) >= revokeStart && Date.parse(stoppedAudit[0].at) <= revokeEnd, 'stopped audit records the actual revocation time')
  await resume(h, run, h.owner, 403); assert.equal(calls, 1); assert.equal((await contacts(h)).length, 1)
  auth = await authorize(h, 'once', admin); run = await start(h, auth, 'synthetic-inkwell-narrowing', admin)
  await h.db.prepare("UPDATE oa_operators SET role='member' WHERE id=?").bind(adminId).run(); await h.db.prepare("UPDATE oa_operators SET role='admin' WHERE id=?").bind(adminId).run()
  await resume(h, run, h.owner, 403); assert.equal(calls, 2, 'restoring the old role never revives a retired authorization')
  assert.equal((await progress(h)).runs.find(item => item.id === run.id).status, 'stopped')
  const secondAdmin = await h.invite('synthetic-inkwell-admin-2@example.test', 'admin'); adminId = (await h.db.prepare('SELECT id FROM oa_operators WHERE email=?').bind('synthetic-inkwell-admin-2@example.test').first()).id
  auth = await authorize(h, 'once', secondAdmin); revokeDuringRead = true
  await start(h, auth, 'synthetic-inkwell-commit-fence', secondAdmin, 403)
  assert.equal((await contacts(h)).length, 2, 'authority lost while reading commits no returned contact')
  auth = await authorize(h, 'hourly', h.owner, { scope: { kind: 'selected', recordIds: ['synthetic-inkwell-3'] } })
  const before = calls; await h.scheduled(Date.now()); assert.equal(calls, before + 1)
  let state = await progress(h); run = state.runs.find(item => item.authorizationId === auth.id); assert.equal(run.status, 'completed'); assert.equal(run.records, 1)
  await h.scheduled(Date.now()); assert.equal(calls, before + 1, 'cadence prevents an early recurring run')
  await h.scheduled(Date.now() + 3_600_001); assert.equal(calls, before + 2, 'a new due run uses standing authorization without another prompt')
  const scheduledAudit = (await h.send('/api/inkwell/audit?limit=200&target=' + encodeURIComponent('hubspot:' + auth.id), undefined, h.owner)).value.entries.filter(entry => entry.after?.runId)
  assert.deepEqual(scheduledAudit.map(entry => [entry.actorId, entry.action, entry.after.outcome]).sort(), [
   ['system:hubspot', 'hubspot.run.started', 'ready'], ['system:hubspot', 'hubspot.run.page', 'completed'],
   ['system:hubspot', 'hubspot.run.started', 'ready'], ['system:hubspot', 'hubspot.run.page', 'completed'],
  ].sort(), 'both due standing runs record their actor and terminal outcome')
  assert.equal((await contacts(h)).length, 3); assert.equal((await h.send('/api/inkwell/hubspot/config', undefined, h.owner)).value.authorization.version, auth.version)
  selectedLarge = true; auth = await authorize(h, 'once', h.owner, { scope: { kind: 'selected', recordIds: largeIds } })
  run = await start(h, auth, 'synthetic-inkwell-selected-multipage'); assert.equal(run.records, 100); assert.equal(run.remaining, 'more_pages')
  run = await resume(h, run); assert.equal(run.records, 101); assert.equal(run.pages, 2); assert.equal(run.status, 'completed')
  assert.equal((await h.send('/api/inkwell/contacts', undefined, h.owner)).value.total, 104, 'a full provider page and its selected continuation commit every identity once')
 } finally { await h.close() }
})

test('INTEG-015: native configuration refuses unconsented, sender, viewer, bearer and cross-origin requests; malformed provider pages commit no partial contacts and once-only scope cannot be reused', async () => {
 let calls = 0, malformed = true
 const h = await harness({ bindings, networkEdge: async request => {
  if (new URL(request.url).hostname !== 'api.hubapi.com') return
  calls++; return Response.json({ results: malformed ? [record(1), record(2, { email: 'invalid' })] : [record(1)] })
 } })
 try {
  const viewer = await h.invite('synthetic-inkwell-viewer@example.test', 'member'), request = { operation: 'authorize', consent: true, definition: definition('once') }
  assert.equal((await h.send('/api/inkwell/hubspot/config')).status, 401)
  await h.post('/api/inkwell/hubspot/sync', request, '', 401); await h.post('/api/inkwell/hubspot/sync', request, viewer, 403)
  assert.equal((await h.send('/api/inkwell/hubspot/progress', undefined, viewer)).status, 403)
  const viewerId = (await h.db.prepare('SELECT id FROM oa_operators WHERE email=?').bind('synthetic-inkwell-viewer@example.test').first()).id
  await h.command('member.role', { operatorId: viewerId, role: 'sender' }); await h.post('/api/inkwell/hubspot/sync', request, viewer, 403)
  await h.post('/api/inkwell/hubspot/sync', request, h.owner, 403, { authorization: 'Bearer synthetic-inkwell-2' })
  await h.post('/api/inkwell/hubspot/sync', request, h.owner, 403, { origin: 'https://synthetic-inkwell-1.invalid' })
  await h.post('/api/inkwell/hubspot/sync', { ...request, consent: false }, h.owner, 400)
  await h.post('/api/inkwell/hubspot/sync', { ...request, definition: { ...request.definition, accountId: '999' } }, h.owner, 400)
  assert.equal(calls, 0, 'all admission failures precede CRM reads')
  const auth = await authorize(h); await start(h, auth, 'synthetic-inkwell-invalid-page', h.owner, 502)
  assert.equal((await contacts(h)).length, 0, 'one malformed row prevents every write in the page')
  let state = await progress(h); assert.equal(state.runs[0].pages, 0); assert.equal(state.runs[0].failures, 1)
  malformed = false; const run = await resume(h, state.runs[0]); assert.equal(run.status, 'completed'); assert.equal((await contacts(h)).length, 1)
  await start(h, auth, 'synthetic-inkwell-second-run', h.owner, 409); assert.equal(calls, 2, 'once-only authority cannot launch a second run')
  assert.equal((await h.send('/api/inkwell/hubspot/config', undefined, viewer)).status, 403, 'using the shared book grants no connector administration')
  const narrowed = { properties: ['firstname', 'lastname', 'email'], mappings: { name: 'full_name', email: 'email' } }
  const phone = '+1 202 555 0199'; await h.post('/api/inkwell/contacts', { ...(await contacts(h))[0], name: 'Local name change', phone }, viewer)
  const nextAuth = await authorize(h, 'once', h.owner, narrowed), nextRun = await start(h, nextAuth, 'synthetic-inkwell-unmapped')
  assert.equal(nextRun.conflicts, 1)
  const conflict = (await progress(h)).conflicts[0]
  await operation(h, { operation: 'resolve', conflictId: conflict.id, choice: 'use_provider' })
  assert.equal((await contacts(h))[0].phone, phone, 'resolving mapped fields preserves properties outside the authorized mappings')
  await h.db.prepare("DELETE FROM iw_hubspot_credentials WHERE id='hubspot'").run()
  assert.equal((await h.send('/api/inkwell/hubspot/config', undefined, h.owner)).status, 200)
  await resume(h, nextRun, h.owner, 403); assert.equal(calls, 3, 'restoring a deleted credential never revives an old authorization')
 } finally { await h.close() }
})
