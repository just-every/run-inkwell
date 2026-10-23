import { readFile } from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

const pdfBase64 = async () => { const pdf = await PDFDocument.create(); pdf.addPage([612, 792]); return Buffer.from(await pdf.save()).toString('base64') }
const field = { id: 'sig', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .2, width: .4, height: .05 }
const draft = async (title, email) => ({ title, filename: 'letter.pdf', pdfBase64: await pdfBase64(), signers: [{ name: 'Mara Quinn', email }], fields: [field] })
const read = async (h, id) => (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
const policies = async (h, cookie = h.owner) => (await h.send('/api/inkwell/send-policies', undefined, cookie)).value
const current = async (h, source) => (await policies(h)).policies.find(p => p.source === source)
const set = async (h, source, change, cookie = h.owner, status = 200) => h.command('account.send_policy', { source, expectedVersion: (await current(h, source)).version, ...change }, cookie, status)
const schedule = () => ({ at: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 16), timeZone: 'Pacific/Honolulu' })
async function template(h) { return (await h.command('template.save', { title: 'Harbour services', filename: 'services.pdf', pdfBase64: await pdfBase64(), roles: [{ role: 'Client', order: 1 }], fields: [field], expiryDays: 30 })).result.id }
const fromTemplate = async (h, id, email) => (await h.command('template.use', { id, recipients: [{ name: 'Mara Quinn', email }] })).result.id
const heldBy = envelope => envelope.events.findLast(e => e.action === 'envelope.send_held')

test('ADMIN-004: send policies are per-source immutable versions only an owner or admin sets, with opt-in defaults and a fresh sign-in for autonomy', async () => {
  const h = await harness()
  try {
    const admin = await h.invite('ada.policy@harbour.example', 'admin'), sender = await h.invite('sam.policy@harbour.example', 'member'), viewer = await h.invite('vic.policy@harbour.example', 'member')
    await h.command('member.role', { operatorId: (await h.send('/api/inkwell', undefined, sender)).value.actor.id, role: 'sender' })
    assert.deepEqual((await policies(h)).policies.map(p => [p.source, p.mode, p.version]), [['ad_hoc', 'person', 0], ['template', 'person', 0], ['bulk', 'person', 0], ['web_form', 'off', 0], ['api', 'off', 0]], 'person sources start with the person; every other source starts off')
    for (const cookie of [sender, viewer]) { assert.equal((await h.send('/api/inkwell/send-policies', undefined, cookie)).status, 403); await h.command('account.send_policy', { source: 'api', mode: 'off', expectedVersion: 0 }, cookie, 403) }
    await h.command('account.send_policy', { source: 'ad_hoc', mode: 'autonomous', expectedVersion: 0 }, h.owner, 400)
    await h.command('account.send_policy', { source: 'template', scope: 'group', mode: 'off', expectedVersion: 0 }, h.owner, 409)
    await h.command('account.send_policy', { source: 'web_form', mode: 'person', expectedVersion: 0 }, h.owner, 400)
    await h.command('account.send_policy', { source: 'template', templates: ['no-such-template'], expectedVersion: 0 }, h.owner, 400)
    const first = (await set(h, 'template', { mode: 'off', reason: 'Pause template sends' })).result.policy
    assert.equal(first.version, 1)
    await h.command('account.send_policy', { source: 'template', mode: 'person', expectedVersion: 0 }, h.owner, 409)
    const [x, y] = await Promise.all([h.send('/api/inkwell/commands', { command: 'account.send_policy', input: { source: 'template', mode: 'person', expectedVersion: 1 }, commandId: crypto.randomUUID() }, h.owner), h.send('/api/inkwell/commands', { command: 'account.send_policy', input: { source: 'template', mode: 'person', deferredRelease: false, expectedVersion: 1 }, commandId: crypto.randomUUID() }, admin)])
    assert.deepEqual([x.status, y.status].sort(), [200, 409], 'exactly one concurrent save of a version wins')
    const history = (await policies(h)).history.filter(v => v.source === 'template')
    assert.equal(history.length, 2)
    assert.deepEqual([history[0].before.mode, history[0].mode, history[0].reason, history[1].before.mode, history[1].mode], ['person', 'off', 'Pause template sends', 'off', 'person'], 'each version keeps what it replaced')
    assert.ok(history.every(v => v.actor && Number.isFinite(Date.parse(v.at))))
    await assert.rejects(h.db.prepare("UPDATE iw_send_policy_versions SET mode='person' WHERE source='template'").run(), /append-only/)
    // Making a source autonomous needs a sign-in from the last 15 minutes; an older session is refused, a fresh one is not.
    const ownerId = (await h.send('/api/inkwell', undefined, h.owner)).value.actor.id
    await h.db.prepare('UPDATE oa_sessions SET created_at=? WHERE operator_id=?').bind(Date.now() - 20 * 60_000, ownerId).run()
    await set(h, 'api', { mode: 'autonomous' }, h.owner, 403)
    assert.equal((await current(h, 'api')).version, 0)
    assert.equal((await set(h, 'api', { mode: 'autonomous' }, admin)).result.policy.mode, 'autonomous')
    const t = await template(h)
    await set(h, 'bulk', { templates: [t] })
    await set(h, 'bulk', { templates: null }, h.owner, 403)
    assert.equal((await set(h, 'bulk', { templates: null }, admin)).result.policy.templates, null, 'widening the templates is allowed after a fresh sign-in')
    // Every explicit save is kept, including unchanged settings and a reason. A retry is not another save.
    const savedBefore = await current(h, 'bulk'), commandId = crypto.randomUUID()
    const same = { source: 'bulk', expectedVersion: savedBefore.version, reason: 'Reviewed and retained the current policy' }
    const saved = (await h.command('account.send_policy', same, admin, 200, commandId)).result.policy
    assert.equal(saved.version, savedBefore.version + 1)
    assert.equal(saved.reason, same.reason)
    const unchangedSettings = ({ mode, templates, requireInternalApproval, deferredRelease }) => ({ mode, templates, requireInternalApproval, deferredRelease })
    assert.deepEqual(unchangedSettings(saved), unchangedSettings(savedBefore))
    const entry = (await policies(h)).history.find(p => p.source === 'bulk' && p.version === saved.version)
    assert.deepEqual(entry.before, { ...unchangedSettings(savedBefore), version: savedBefore.version })
    assert.equal(entry.actor, (await h.send('/api/inkwell', undefined, admin)).value.actor.id)
    assert.ok(Number.isFinite(Date.parse(entry.at)))
    const later = (await set(h, 'bulk', { mode: 'off' }, admin)).result.policy
    assert.deepEqual((await h.command('account.send_policy', same, admin, 200, commandId)).result.policy, saved, 'retry returns its original version even after an intervening save')
    assert.deepEqual(await current(h, 'bulk'), later, 'retry never reapplies the old settings')
    assert.equal((await policies(h)).history.filter(p => p.source === 'bulk' && p.version >= saved.version).length, 2, 'the retry creates no additional history')
    await h.command('account.send_policy', { ...same, mode: 'person' }, admin, 409, commandId)
    const retained = (await h.command('account.send_policy', { source: 'bulk', expectedVersion: later.version }, admin)).result.policy
    assert.equal(retained.version, later.version + 1, 'even an unchanged save without a reason is a new explicit version')
    assert.equal(retained.reason, null)
    assert.equal(retained.mode, 'off')
  } finally { await h.close() }
})

test('SEND-001 and ADMIN-004: ad hoc and template sends obey their source policy, name it and its version on the record, and an internal approval can be required', async () => {
  const h = await harness()
  try {
    const approver = await h.invite('amir.policy@harbour.example', 'admin'), t = await template(h)
    const id = (await h.command('envelope.prepare', await draft('Policy letter', 'mara.adhoc@clients.example'))).result.id
    await set(h, 'ad_hoc', { mode: 'off' })
    const refused = await h.command('envelope.approve', { id, eligible: true }, h.owner, 403)
    assert.equal(refused.code, 'send_policy_off')
    assert.equal((await read(h, id)).status, 'prepared'); assert.equal(await h.mail('mara.adhoc@clients.example', 'Please sign:'), undefined)
    await h.command('envelope.prepare', await draft('Still preparable', 'mara.draft@clients.example'))
    await set(h, 'ad_hoc', { mode: 'person' })
    await h.command('envelope.approve', { id, eligible: true })
    const sent = await read(h, id), record = sent.events.findLast(e => e.action === 'envelope.approved').detail.sendPolicy
    assert.deepEqual([record.source, record.mode, record.credential, record.policies], ['ad_hoc', 'person', null, [{ scope: 'account', version: 2 }]])
    assert.equal(record.principal, sent.createdBy); assert.match(record.fingerprint, /^[0-9a-f]{64}$/)
    // A template send: the policy's template list and its off mode refuse it; a listed template sends.
    const other = await template(h), tid = await fromTemplate(h, t, 'mara.template@clients.example')
    await set(h, 'template', { templates: [other] })
    assert.equal((await h.command('envelope.approve', { id: tid, eligible: true }, h.owner, 403)).code, 'send_policy_template')
    await set(h, 'template', { templates: [t] })
    await set(h, 'template', { mode: 'off' })
    assert.equal((await h.command('envelope.approve', { id: tid, eligible: true }, h.owner, 403)).code, 'send_policy_off')
    await set(h, 'template', { mode: 'person' })
    await h.command('envelope.approve', { id: tid, eligible: true })
    const fromT = (await read(h, tid)).events.findLast(e => e.action === 'envelope.approved').detail.sendPolicy
    assert.deepEqual([fromT.source, fromT.templates, fromT.policies], ['template', [t], [{ scope: 'account', version: 4 }]])
    // Scheduling is refused where the policy refuses deferred release; an immediate send is unaffected.
    await set(h, 'ad_hoc', { deferredRelease: false })
    const later = (await h.command('envelope.prepare', await draft('Later letter', 'mara.later@clients.example'))).result.id
    assert.equal((await h.command('envelope.approve', { id: later, eligible: true, sendAt: schedule() }, h.owner, 403)).code, 'send_policy_deferred')
    await set(h, 'ad_hoc', { deferredRelease: true })
    // A policy that requires an internal approval waits for the account rule's approver, whatever its threshold, and records it.
    const gated = (await h.command('envelope.prepare', await draft('Gated letter', 'mara.gated@clients.example'))).result.id
    await set(h, 'ad_hoc', { requireInternalApproval: true })
    await h.command('envelope.approve', { id: gated, eligible: true }, h.owner, 409)
    await h.command('account.internal_approval', { rule: { approverEmail: 'amir.policy@harbour.example' } })
    assert.deepEqual((await h.command('envelope.approve', { id: gated, eligible: true })).result.waitingForApproval, ['amir.policy'])
    assert.equal(await h.mail('mara.gated@clients.example', 'Please sign:'), undefined)
    await h.command('envelope.internal_decide', { id: gated, decision: 'approve' }, approver)
    const released = await read(h, gated)
    assert.equal(released.status, 'awaiting_signature')
    assert.equal(released.events.findLast(e => e.action === 'envelope.internal_approval_requested').detail.sendPolicy.requireInternalApproval, true)
    assert.deepEqual(released.events.findLast(e => e.action === 'envelope.approved').detail.sendPolicy.policies, [{ scope: 'account', version: 5 }])
  } finally { await h.close() }
})

test('SEND-001 and ADMIN-004: a scheduled send is held when its policy turns off, stays held when it is turned back on, and an allowed change releases under the current version', async () => {
  const h = await harness()
  try {
    const approver = await h.invite('ari.release@harbour.example', 'admin'), t = await template(h)
    const scheduledEnvelope = async (title, email, id) => { const envelope = id ?? (await h.command('envelope.prepare', await draft(title, email))).result.id; await h.command('envelope.approve', { id: envelope, eligible: true, sendAt: schedule() }); return envelope }
    const pass = async id => h.scheduled(Date.parse((await read(h, id)).scheduled.at) + 60_000)
    // Off before release: held with the policy named, nothing invited, and back-on alone never releases it.
    const a = await scheduledEnvelope('Held letter', 'mara.held@clients.example')
    assert.equal(await h.mail('mara.held@clients.example', 'Please sign:'), undefined)
    const confirmed = await read(h, a), at = Date.parse(confirmed.scheduled.at) + 60_000
    await set(h, 'ad_hoc', { mode: 'off' })
    await h.scheduled(at)
    const held = await read(h, a), event = heldBy(held)
    assert.equal(held.status, 'prepared'); assert.ok(held.sendHold?.at); assert.equal(held.scheduled, undefined)
    assert.deepEqual([event.detail.code, event.detail.sendPolicy.policies], ['send_policy_off', [{ scope: 'account', version: 1 }]])
    assert.equal(await h.mail('mara.held@clients.example', 'Please sign:'), undefined)
    for (const [cookie, email] of [[h.owner, 'owner@harbour.example'], [approver, 'ari.release@harbour.example']]) {
      const notices = (await h.send('/api/inkwell/notices', undefined, cookie)).value.notices.filter(n => n.envelopeId === a && n.event === 'send_held')
      assert.equal(notices.length, 1, 'principal/owner overlap is notified once, as is every admin')
      assert.ok(await h.mail(email, 'Sending held: Held letter'))
    }
    await set(h, 'ad_hoc', { mode: 'person' })
    await h.scheduled(at + 3_600_000)
    assert.equal((await read(h, a)).status, 'prepared', 'turning the policy back on does not release a held draft'); assert.equal(await h.mail('mara.held@clients.example', 'Please sign:'), undefined)
    await h.command('envelope.approve', { id: a, eligible: true })
    assert.equal((await read(h, a)).status, 'awaiting_signature')
    assert.ok(await h.mail('mara.held@clients.example', 'Please sign:'), 'a current editor’s fresh confirmation releases it')
    // A change that still allows the send releases it and records the current version.
    const b = await scheduledEnvelope('Ad hoc unchanged permission', 'mara.tmpl@clients.example')
    await set(h, 'ad_hoc', { reason: 'Reviewed and retained allowed sends' })
    await pass(b)
    const sentB = await read(h, b)
    assert.equal(sentB.status, 'awaiting_signature'); assert.ok(await h.mail('mara.tmpl@clients.example', 'Please sign:'))
    const releaseRecord = sentB.events.findLast(e => e.action === 'envelope.sent_scheduled').detail.sendPolicy
    assert.deepEqual([releaseRecord.mode, releaseRecord.policies], ['person', [{ scope: 'account', version: 3 }]])
    assert.deepEqual(sentB.events.findLast(e => e.action === 'envelope.approved').detail.sendPolicy.policies, [{ scope: 'account', version: 2 }], 'the confirmation keeps the version it was made under')
    // A requirement added after confirmation enters ROUTE-004, without inviting anyone or inventing a new eligibility confirmation.
    const c = await scheduledEnvelope('Approval letter', 'mara.req@clients.example')
    await h.command('account.internal_approval', { rule: { approverEmail: 'ari.release@harbour.example', threshold: { field: 'Absent amount', above: '10000' } } })
    await set(h, 'ad_hoc', { requireInternalApproval: true })
    await pass(c)
    const waitingC = await read(h, c)
    assert.equal(waitingC.status, 'prepared'); assert.equal(waitingC.scheduled, undefined); assert.equal(waitingC.sendHold, undefined)
    assert.equal(waitingC.internalApproval.state, 'pending')
    assert.deepEqual(waitingC.internalApproval.steps.map(s => [s.name, s.decision]), [['ari.release', undefined]], 'the policy requires approval even outside the account threshold')
    assert.equal(waitingC.internalApproval.requestedBy.id, waitingC.createdBy)
    assert.equal(waitingC.events.findLast(e => e.action === 'envelope.internal_approval_requested').detail.policyAddedApproval, true)
    assert.equal(await h.mail('mara.req@clients.example', 'Please sign:'), undefined)
    assert.ok(await h.mail('ari.release@harbour.example', 'Approval needed:'))
    await h.scheduled(Date.now() + 4 * 86400000)
    assert.equal((await read(h, c)).internalApproval.state, 'pending', 'another hourly pass cannot bypass the new approval')
    await h.command('envelope.internal_decide', { id: c, decision: 'approve' }, approver)
    assert.equal((await read(h, c)).status, 'awaiting_signature')
    assert.equal((await read(h, c)).scheduled, undefined, 'the elapsed schedule sends on final approval')
    assert.ok(await h.mail('mara.req@clients.example', 'Please sign:'))
    assert.deepEqual((await read(h, c)).events.findLast(e => e.action === 'envelope.approved').detail.sendPolicy.policies, [{ scope: 'account', version: 4 }])
    // A policy-required approval with no valid account approver holds honestly rather than failing the cron.
    await set(h, 'ad_hoc', { requireInternalApproval: false })
    await h.command('account.internal_approval', { rule: null })
    const noApprover = await scheduledEnvelope('No approver letter', 'mara.noapprover@clients.example')
    await set(h, 'ad_hoc', { requireInternalApproval: true })
    await pass(noApprover)
    assert.equal(heldBy(await read(h, noApprover)).detail.code, 'send_policy_approval')
    assert.equal((await read(h, noApprover)).internalApproval, undefined)
    assert.equal(await h.mail('mara.noapprover@clients.example', 'Please sign:'), undefined)
    // A template list that no longer includes this template holds the send.

    const d = await scheduledEnvelope('Listed letter', 'mara.list@clients.example', await fromTemplate(h, t, 'mara.list@clients.example'))
    const other = await template(h)
    await set(h, 'template', { templates: [other] }, h.owner)
    await pass(d)
    assert.equal(heldBy(await read(h, d)).detail.code, 'send_policy_template')
    // Off while waiting for the last internal approval: the approver's decision does not send; the draft is held.
    await h.command('account.internal_approval', { rule: { approverEmail: 'ari.release@harbour.example' } })
    const e = (await h.command('envelope.prepare', await draft('Waiting letter', 'mara.wait@clients.example'))).result.id
    await set(h, 'ad_hoc', { mode: 'off' })
    await set(h, 'ad_hoc', { mode: 'person' })
    assert.deepEqual((await h.command('envelope.approve', { id: e, eligible: true })).result.waitingForApproval, ['ari.release'])
    await set(h, 'ad_hoc', { mode: 'off' })
    assert.equal((await h.command('envelope.internal_decide', { id: e, decision: 'approve' }, approver)).result.held, true)
    const waiting = await read(h, e)
    assert.equal(waiting.status, 'prepared'); assert.equal(heldBy(waiting).detail.code, 'send_policy_off'); assert.equal(await h.mail('mara.wait@clients.example', 'Please sign:'), undefined)
    assert.ok(await h.mail('ari.release@harbour.example', 'Sending held: Waiting letter'), 'the deciding admin also receives a hold notification')
    // The principal can be a sender, separate from all account administrators; viewers receive no hold information.
    const sender = await h.invite('sender.policy@harbour.example', 'member'), viewer = await h.invite('viewer.policy@harbour.example', 'member')
    const senderId = (await h.send('/api/inkwell', undefined, sender)).value.actor.id
    await h.command('member.role', { operatorId: senderId, role: 'sender' })
    await h.command('account.internal_approval', { rule: null })
    await set(h, 'ad_hoc', { mode: 'person', requireInternalApproval: false })
    const own = (await h.command('envelope.prepare', await draft('Sender hold letter', 'mara.sender@clients.example'), sender)).result.id
    await h.command('envelope.approve', { id: own, eligible: true, sendAt: schedule() }, sender)
    await set(h, 'ad_hoc', { mode: 'off' }); await pass(own)
    for (const [cookie, email] of [[sender, 'sender.policy@harbour.example'], [h.owner, 'owner@harbour.example'], [approver, 'ari.release@harbour.example']]) {
      assert.equal((await h.send('/api/inkwell/notices', undefined, cookie)).value.notices.filter(n => n.envelopeId === own && n.event === 'send_held').length, 1)
      assert.ok(await h.mail(email, 'Sending held: Sender hold letter'))
    }
    assert.equal((await h.send('/api/inkwell/notices', undefined, viewer)).value.notices.some(n => n.envelopeId === own), false)
    const count = h.attempted().filter(m => m.subject === 'Sending held: Sender hold letter').length
    await h.scheduled(Date.now() + 4 * 86400000)
    assert.equal(h.attempted().filter(m => m.subject === 'Sending held: Sender hold letter').length, count, 'hourly passes do not duplicate a held notification')
  } finally { await h.close() }
})


test('ADMIN-004: reminder, expiry, authentication, adoption, disclosure and reassignment defaults are administered, inherited by new drafts and templates, overridden explicitly and never change saved records', async () => {
  const h = await harness()
  try {
    const admin = await h.invite('defaults.admin@harbour.example', 'admin'), sender = await h.invite('defaults.sender@harbour.example', 'member'), viewer = await h.invite('defaults.viewer@harbour.example', 'member')
    await h.command('member.role', { operatorId: (await h.send('/api/inkwell', undefined, sender)).value.actor.id, role: 'sender' })
    const settings = async cookie => (await h.send('/api/inkwell/envelope-defaults', undefined, cookie ?? h.owner)).value.defaults
    const save = async (input, cookie = h.owner, status = 200) => h.command('account.envelope_defaults', { expectedVersion: (await settings()).version, ...input }, cookie, status)
    const prepare = async (title, options = {}) => (await h.command('envelope.prepare', { ...await draft(title, title.toLowerCase().replaceAll(' ', '.') + '@clients.example'), ...options }, sender)).result.id
    const days = e => Math.round((Date.parse(e.expiresAt) - Date.parse(e.createdAt)) / 86400000)
    assert.deepEqual([ (await settings()).expiryDays, (await settings()).reminders ], [120, null])
    assert.equal((await h.send('/api/inkwell/envelope-defaults')).status, 401)
    assert.equal((await h.send('/api/inkwell/envelope-defaults', undefined, viewer)).status, 403)
    const old = await prepare('Before defaults'), oldTemplate = await template(h)
    for (const cookie of [sender, viewer]) await save({ expiryDays: 21, reminders: null }, cookie, 403)
    for (const expiryDays of [0, 366, 1.5]) await save({ expiryDays, reminders: null }, admin, 400)
    await save({ expiryDays: 21, reminders: { afterDays: 0, everyDays: 2 } }, admin, 400)
    await save({ expiryDays: 21, reminders: { afterDays: 1, everyDays: 31 } }, admin, 400)
    await save({ expiryDays: 21 }, admin, 400)
    await save({ expiryDays: 21, reminders: null, allowReassignment: 'yes' }, admin, 400)
    await save({ expiryDays: 21, reminders: null, authentication: 'unknown' }, admin, 400)
    await save({expiryDays:21,reminders:null,disclosureText:'a'.repeat(4001)},admin,400)
    for (const adoptionMethods of [[], ['unknown'], 'typed']) await save({expiryDays:21,reminders:null,adoptionMethods},admin,400)
    assert.equal((await settings()).version, 0, 'refusals leave defaults untouched')
    const defaults = (await save({ expiryDays: 21, reminders: { afterDays: 2, everyDays: 3 }, allowReassignment: true, authentication: 'link', adoptionMethods: ['uploaded'], disclosureText: 'Paper copies are available from Harbour Operations.' })).result.defaults
    assert.equal(defaults.actor, (await h.send('/api/inkwell', undefined, h.owner)).value.actor.id)
    assert.ok(Number.isFinite(Date.parse(defaults.at)))
    await h.command('account.envelope_defaults', { expectedVersion: 0, expiryDays: 10, reminders: null }, admin, 409)
    const inherited = await prepare('Inherited reminders', {adoptionMethods:['typed']}), inheritedEnvelope = await read(h, inherited)
    assert.equal(inheritedEnvelope.consumerDisclosure.text,defaults.disclosureText); assert.equal(inheritedEnvelope.consumerDisclosure.version,defaults.version); assert.equal((await read(h,old)).consumerDisclosure,undefined)
    assert.deepEqual(inheritedEnvelope.adoptionMethods, ['uploaded']); assert.deepEqual((await read(h, old)).adoptionMethods, ['typed','drawn','uploaded'])
    assert.equal(inheritedEnvelope.signers[0].linkOnly, true); assert.equal((await read(h, old)).signers[0].linkOnly, undefined)
    assert.equal(inheritedEnvelope.allowReassign, true); assert.equal((await read(h, old)).allowReassign, undefined)
    assert.equal(days(inheritedEnvelope), 21); assert.deepEqual(inheritedEnvelope.reminders, defaults.reminders)
    assert.equal(days(await read(h, old)), 120); assert.equal((await read(h, old)).reminders, undefined)
    const explicitAt = new Date(Date.now() + 9 * 86400000).toISOString()
    const explicit = await prepare('Explicit override', { expiresAt: explicitAt, reminders: { afterDays: 1, everyDays: 1 } })
    assert.equal((await read(h, explicit)).expiresAt, explicitAt); assert.deepEqual((await read(h, explicit)).reminders, { afterDays: 1, everyDays: 1 })
    const off = await prepare('Reminders off', { reminders: null, allowReassignment: false, signers: [{name:'Mara Quinn',email:'reminders.off@clients.example',linkOnly:false}] })
    assert.equal((await read(h, off)).signers[0].linkOnly, undefined, 'explicit email overrides link-only default')
    assert.equal((await read(h, off)).allowReassign, undefined, 'explicit false overrides account reassignment')
    assert.equal((await read(h, off)).reminders, undefined, 'null explicitly overrides account reminders')
    const t = (await h.command('template.save', { title: 'Inherited defaults template', filename: 'letter.pdf', pdfBase64: await pdfBase64(), roles: [{ role: 'Client', order: 1 }], fields: [field] })).result.id
    const templated = await fromTemplate(h, t, 'template.defaults@clients.example'), oldTemplated = await fromTemplate(h, oldTemplate, 'old.template@clients.example')
    assert.equal(days(await read(h, templated)), 21); assert.deepEqual((await read(h, templated)).reminders, defaults.reminders)
    assert.equal(days(await read(h, oldTemplated)), 30); assert.equal((await read(h, oldTemplated)).reminders, undefined, 'an existing template with reminders off overrides the account')
    assert.equal((await read(h, templated)).signers[0].linkOnly, true)
    assert.equal((await read(h, oldTemplated)).signers[0].linkOnly, undefined, 'an older email-code template does not inherit link only')
    assert.equal((await read(h, templated)).allowReassign, true)
    assert.equal((await read(h, oldTemplated)).allowReassign, undefined, 'an older template with reassignment off stays off')
    const preservedTemplate = (await h.command('template.from_envelope', { id: off })).result.id
    assert.equal((await read(h, await fromTemplate(h, preservedTemplate, 'off.saved@clients.example'))).allowReassign, undefined, 'saving an envelope as a template preserves false under an enabled account default')
    await h.command('envelope.approve', { id: off, eligible: true }, sender)
    const copiedOff = (await h.command('envelope.copy', { id: off })).result.id
    assert.equal((await read(h, copiedOff)).allowReassign, undefined)
    await h.command('envelope.update', { id: old, ...await draft('Reminders off edited', 'off.edited@clients.example'), reminders: null })
    assert.equal((await read(h, old)).allowReassign, undefined, 'editing a draft without a new choice preserves false')
    await h.command('template.update', { id: oldTemplate, title: 'Old template edited', filename: 'old.pdf', pdfBase64: await pdfBase64(), roles: [{role:'Client',order:1}], fields:[field], expiryDays:30, reminders:null })
    assert.equal((await read(h, await fromTemplate(h, oldTemplate, 'edited.template@clients.example'))).allowReassign, undefined, 'editing an old template without a new choice preserves false')
    const changed = (await save({ expiryDays: 12, reminders: null, allowReassignment: false, authentication: 'email', adoptionMethods: ['typed','drawn','uploaded'], disclosureText:'Contact Harbour Legal for a paper copy.' }, admin)).result.defaults
    assert.equal(changed.actor, (await h.send('/api/inkwell', undefined, admin)).value.actor.id)
    assert.equal(days(await read(h, inherited)), 21); assert.deepEqual((await read(h, inherited)).reminders, defaults.reminders)
    const stillTemplate = await fromTemplate(h, t, 'still.template@clients.example')
    assert.equal((await read(h, stillTemplate)).consumerDisclosure.text, defaults.disclosureText)
    assert.equal((await read(h, oldTemplated)).consumerDisclosure, undefined)
    assert.deepEqual((await read(h, stillTemplate)).adoptionMethods, ['uploaded'])
    assert.deepEqual((await read(h, oldTemplated)).adoptionMethods, ['typed','drawn','uploaded'])
    assert.equal((await read(h, stillTemplate)).signers[0].linkOnly, true)
    assert.equal((await read(h, stillTemplate)).allowReassign, true, 'a template keeps its saved reassignment choice')
    assert.equal((await read(h, inherited)).allowReassign, true)
    assert.equal(days(await read(h, stillTemplate)), 21); assert.deepEqual((await read(h, stillTemplate)).reminders, defaults.reminders, 'saved templates keep their snapshot')
    const fresh = await prepare('New defaults')
    assert.equal((await read(h, fresh)).consumerDisclosure.text,changed.disclosureText)
    const history=(await h.send('/api/inkwell/envelope-defaults/history',undefined,h.owner)).value.history
    assert.equal(history.length,2); assert.deepEqual(history[0].after,defaults); assert.deepEqual(history[1].before,defaults); assert.deepEqual(history[1].after,changed)
    for(const cookie of [sender,viewer]) assert.equal((await h.send('/api/inkwell/envelope-defaults/history',undefined,cookie)).status,403)
    assert.deepEqual((await read(h, fresh)).adoptionMethods, ['drawn','typed','uploaded'])
    assert.equal((await read(h, fresh)).signers[0].linkOnly, undefined)
    assert.equal((await read(h, fresh)).allowReassign, undefined)
    assert.equal(days(await read(h, fresh)), 12); assert.equal((await read(h, fresh)).reminders, undefined)
    // An inherited reminder actually reaches the current recipient through the normal scheduler and paid mail edge.
    await h.command('envelope.approve', { id: inherited, eligible: true }, sender)
    let at = new Date(Date.now() + 7 * 86400000); at.setUTCHours(16, 0, 0, 0)
    while ([0, 6].includes(at.getUTCDay())) at = new Date(at.getTime() + 86400000)
    await h.scheduled(at.getTime())
    assert.ok(await h.mail('inherited.reminders@clients.example', 'Reminder to sign:'))
    assert.equal(await h.mail('reminders.off@clients.example', 'Reminder to sign:'), undefined)
    const copy = (await h.command('envelope.copy', { id: inherited }, sender)).result.id
    assert.deepEqual((await read(h, copy)).consumerDisclosure,inheritedEnvelope.consumerDisclosure)
    assert.deepEqual((await read(h, copy)).adoptionMethods, ['uploaded'])
    assert.equal((await read(h, copy)).allowReassign, true, 'a copy keeps the source reassignment choice')
    assert.equal(days(await read(h, copy)), 12, 'a copied envelope starts with the current account expiry')
    assert.deepEqual((await read(h, copy)).reminders, defaults.reminders, 'a copy keeps the source envelope reminder choice')
    const invitation = await h.mail('inherited.reminders@clients.example', 'Please sign:')
    const path = '/api/sign/' + new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
    const cookie = (await h.post(path + '/open', {})).cookie
    const disclosure=(await h.send(path,undefined,cookie)).value.disclosure
    assert.equal(disclosure.sections.at(-1).body,defaults.disclosureText)
    for(const heading of ['Getting a paper copy','Withdrawing your consent','Keeping your contact details current','Hardware and software you need'])assert.ok(disclosure.sections.some(s=>s.heading===heading))
    assert.equal((await h.send(path+'/document',undefined,cookie)).status,403)
    await h.post(path+'/disclosure',{version:'inkwell-esign-2026-10-19',agree:true},cookie,409)
    await h.agree(path, cookie)
    assert.equal((await h.send(path+'/document',undefined,cookie)).status,200)
    assert.deepEqual((await h.send(path, undefined, cookie)).value.adoptionMethods, ['uploaded'], 'signing keeps the prepared methods after the default widens')
    const sign = (adoption, status) => h.post(path + '/sign', { values: {sig:'Mara Quinn'}, consent:true, adoption, commandId:crypto.randomUUID() }, cookie, status)
    await sign({method:'typed',style:'sans'}, 403)
    await sign({method:'drawn',imageBase64:'synthetic-inkwell-1'}, 403)
    await sign({method:'uploaded',mediaType:'image/jpeg',imageBase64:(await readFile('tests/fixtures/signature.jpg')).toString('base64')}, 200)
    assert.equal((await read(h, inherited)).signers[0].adoption.method, 'uploaded')
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs')
    const certificate=await h.send('/api/inkwell/envelopes/'+inherited+'/artifacts/certificate',undefined,h.owner)
    const pdf=await getDocument({data:certificate.bytes,standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
    let text='';for(let n=1;n<=pdf.numPages;n++)text+=(await(await pdf.getPage(n)).getTextContent()).items.map(item=>item.str).join(' ')+' '
    assert.ok(text.includes(defaults.disclosureText));assert.ok(!text.includes(changed.disclosureText));assert.ok(text.includes(disclosure.version))
    assert.equal((await h.send('/api/inkwell/envelopes/' + inherited + '/verify',undefined,h.owner)).value.ok, true)

  } finally { await h.close() }
})

test('SEND-001: template edits, deletion and policy revisions hold deferred sends; fresh confirmation keeps frozen bytes and rules', async () => {
  const h = await harness()
  try {
    const approver = await h.invite('template.approver@harbour.example', 'admin')
    const original = { title: 'Harbour retained agreement', filename: 'retained.pdf', pdfBase64: await pdfBase64(), roles: [{ role: 'Client', order: 1 }], fields: [field], approval: { approverEmail: 'template.approver@harbour.example' } }
    const t = (await h.command('template.save', original)).result.id
    const id = await fromTemplate(h, t, 'retained@clients.example')
    const frozenTemplate = (await read(h, id)).template
    const bytes = (await h.send(`/api/inkwell/envelopes/${id}/artifacts/original`, undefined, h.owner)).bytes
    await h.command('envelope.approve', { id, eligible: true })
    await h.command('template.update', { ...original, id: t, pdfBase64: await pdfBase64(), message: 'New content must not leak into prepared envelopes', approval: null })
    assert.equal((await h.command('envelope.internal_decide', { id, decision: 'approve' }, approver)).result.held, true)
    assert.equal(await h.mail('retained@clients.example', 'Please sign:'), undefined)
    await h.command('envelope.open_signing', { id }, h.owner, 409)
    // Restoring the definition is another revision, never an automatic release.
    await h.command('template.update', { ...original, id: t })
    await h.scheduled(Date.now() + 4 * 86400000)
    assert.ok((await read(h, id)).sendHold)
    const fresh = await h.invite('fresh.editor@harbour.example', 'admin')
    assert.ok((await h.command('envelope.approve', { id, eligible: true }, fresh)).result.waitingForApproval.length, 'the frozen approval rule still applies')
    await h.command('envelope.internal_decide', { id, decision: 'approve' }, approver)
    assert.ok(await h.mail('retained@clients.example', 'Please sign:'))
    const released = await read(h, id)
    assert.deepEqual((await h.send(`/api/inkwell/envelopes/${id}/artifacts/original`, undefined, h.owner)).bytes, bytes)
    assert.equal(released.message, undefined)
    assert.deepEqual(released.template, frozenTemplate)
    const requested = released.events.findLast(e => e.action === 'envelope.internal_approval_requested')
    assert.equal(requested.actor, (await h.send('/api/inkwell', undefined, fresh)).value.actor.id)
    assert.equal(requested.detail.templateConfirmation.pinnedVersion, 1)
    // A deleted template also holds, but a fresh confirmation can still send its frozen bytes and approval rule.
    const removed = await fromTemplate(h, t, 'deleted@clients.example')
    await h.command('envelope.approve', { id: removed, eligible: true })
    await h.command('template.remove', { id: t })
    assert.equal((await h.command('envelope.internal_decide', { id: removed, decision: 'approve' }, approver)).result.held, true)
    assert.ok((await h.command('envelope.approve', { id: removed, eligible: true })).result.waitingForApproval.length)
    await h.command('envelope.internal_decide', { id: removed, decision: 'approve' }, approver)
    assert.ok(await h.mail('deleted@clients.example', 'Please sign:'))
    assert.deepEqual((await h.send(`/api/inkwell/envelopes/${id}/artifacts/original`, undefined, h.owner)).bytes, bytes, 'template deletion never changes a sent envelope')
    // Scheduled rows already have unused credentials; none may survive the hold.
    const scheduledTemplate = await template(h)
    const later = await fromTemplate(h, scheduledTemplate, 'scheduled.template@clients.example')
    await h.command('envelope.approve', { id: later, eligible: true, sendAt: schedule() })
    const confirmed = await read(h, later), at = Date.parse(confirmed.scheduled.at) + 60000
    await set(h, 'template', { reason: 'Reviewed without changing allowed templates' })
    await h.scheduled(at)
    assert.ok((await read(h, later)).sendHold, 'even an otherwise allowed template policy revision requires fresh confirmation')
    assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_signers WHERE envelope_id=?').bind(later).first()).n, 0, 'all unused signer credentials are revoked')
    await h.scheduled(at + 3600000)
    assert.equal(await h.mail('scheduled.template@clients.example', 'Please sign:'), undefined)
    await h.command('envelope.approve', { id: later, eligible: true })
    assert.ok(await h.mail('scheduled.template@clients.example', 'Please sign:'))
  } finally { await h.close() }
})

test('Combined templates: every source approval, allowlist entry and live revision fences the frozen sending definition', async () => {
 const h=await harness()
 try {
  const ada=await h.invite('ada.composition@harbour.example','admin'), ben=await h.invite('ben.composition@harbour.example','admin')
  const actor=async cookie=>(await h.send('/api/inkwell',undefined,cookie)).value.actor.id
  const definition=async(title,approver)=>({title,filename:'agreement.pdf',pdfBase64:await pdfBase64(),roles:[{role:'Client',order:1}],fields:[field],expiryDays:30,approval:{approver}})
  const first=await definition('Harbour NDA',await actor(ada)),second=await definition('Harbour W-9',await actor(ben))
  const a=(await h.command('template.save',first)).result.id,b=(await h.command('template.save',second)).result.id
  const defaults=(await h.send('/api/inkwell/envelope-defaults',undefined,h.owner)).value.defaults
  await h.command('account.envelope_defaults',{expectedVersion:defaults.version,expiryDays:120,reminders:null,authentication:'link',allowReassignment:true})
  const combine=async()=> (await h.command('template.combine',{ids:[a,b],recipients:[{name:'Mara Quinn',email:'mara.composition@harbour.example'}]})).result.id
  const id=await combine(),frozen=await read(h,id)
  assert.equal(frozen.allowReassign,undefined,'composition preserves its selected template rather than inheriting a later default')
  assert.ok(frozen.signers.every(s=>!s.linkOnly),'composition preserves email-code source roles under a link-only account default')
  await set(h,'template',{templates:[a]})
  await h.command('envelope.approve',{id,eligible:true},h.owner,403)
  await set(h,'template',{templates:[a,b]})
  await h.command('envelope.approve',{id,eligible:true})
  const pending=await read(h,id);assert.equal(pending.internalApproval.steps.length,2);assert.equal(h.attempted().filter(m=>m.to.includes('mara.composition@harbour.example')).length,0)
  await h.command('envelope.internal_decide',{id,decision:'approve'},ada)
  await h.command('template.update',{id:b,...second,title:'Harbour W-9 revised'})
  await h.command('envelope.internal_decide',{id,decision:'approve'},ben)
  const held=await read(h,id);assert.ok(heldBy(held));assert.equal(held.status,'prepared');assert.equal(held.originalSha256,frozen.originalSha256);assert.deepEqual(held.templates,frozen.templates);assert.deepEqual(held.approvalRules,frozen.approvalRules)
  await h.command('envelope.approve',{id,eligible:true})
  await h.command('envelope.internal_decide',{id,decision:'approve'},ada)
  await h.command('envelope.internal_decide',{id,decision:'approve'},ben)
  assert.equal((await read(h,id)).status,'awaiting_signature');assert.equal((await read(h,id)).originalSha256,frozen.originalSha256)
  const scheduled=await combine();await h.command('envelope.approve',{id:scheduled,eligible:true,sendAt:schedule()});await h.command('envelope.internal_decide',{id:scheduled,decision:'approve'},ada);await h.command('envelope.internal_decide',{id:scheduled,decision:'approve'},ben)
  const before=await read(h,scheduled);await h.command('template.remove',{id:b});await h.scheduled(new Date(Date.parse(before.scheduled.at)+1000))
  const stopped=await read(h,scheduled);assert.ok(heldBy(stopped));assert.equal(stopped.status,'prepared');assert.deepEqual(stopped.templates,before.templates);assert.equal(stopped.originalSha256,before.originalSha256)
 }finally{await h.close()}
})


test('ADMIN-004: every group and profile narrows the account policy, with live membership and version fences on deferred release', async () => {
 const h=await harness()
 try {
  const fieldSender=await h.invite('field.policy@harbour.example','member'),officeSender=await h.invite('office.policy@harbour.example','member'),admin=await h.invite('review.policy@harbour.example','admin')
  const memberId=async cookie=>(await h.send('/api/inkwell',undefined,cookie)).value.actor.id
  const fieldId=await memberId(fieldSender),officeId=await memberId(officeSender)
  for(const operatorId of [fieldId,officeId])await h.command('member.role',{operatorId,role:'sender'})
  const create=async(kind,name,members)=>(await h.post('/api/inkwell/send-policy-scopes',{kind,name,members,expectedVersion:0,commandId:crypto.randomUUID()},h.owner)).value.scope
  const group=await create('group','Field',[fieldId]),office=await create('group','Office',[officeId]),profile=await create('profile','Restricted field profile',[fieldId])
  const scopeState=async scope=>(await h.send('/api/inkwell/send-policy-scopes',undefined,h.owner)).value.scopes.find(s=>s.id===scope.id)
  const scoped=async(scope,source,change)=>h.command('account.send_policy',{scope:scope.kind,scopeId:scope.id,source,expectedVersion:(await scopeState(scope)).policies.find(p=>p.source===source).version,...change})
  assert.equal((await h.send('/api/inkwell/send-policy-scopes',undefined,fieldSender)).status,403)
  await h.post('/api/inkwell/send-policy-scopes',{kind:'group',name:'Unprivileged',members:[fieldId],expectedVersion:0,commandId:crypto.randomUUID()},fieldSender,403)
  const make=async(cookie,title)=>(await h.command('envelope.prepare',await draft(title,`${title.toLowerCase().replaceAll(' ','.')}@clients.example`),cookie)).result.id
  const field=await make(fieldSender,'Field upload'),other=await make(officeSender,'Office upload')
  await scoped(group,'ad_hoc',{mode:'off'})
  assert.equal((await h.command('envelope.approve',{id:field,eligible:true},fieldSender,403)).code,'send_policy_off')
  await h.command('envelope.approve',{id:other,eligible:true},officeSender)
  assert.equal((await read(h,other)).status,'awaiting_signature')
  await scoped(group,'ad_hoc',{mode:'person'})
  await set(h,'ad_hoc',{mode:'off'})
  await h.command('envelope.approve',{id:field,eligible:true},fieldSender,403)
  await set(h,'ad_hoc',{mode:'person'})
  const a=await template(h),b=await template(h)
  await h.command('template.share',{kind:'template',id:a,email:'field.policy@harbour.example',access:'use'})
  await h.command('template.share',{kind:'template',id:b,email:'field.policy@harbour.example',access:'use'})
  await set(h,'template',{templates:[a]})
  await scoped(group,'template',{mode:'autonomous',templates:[b]})
  const from=async id=>(await h.command('template.use',{id,recipients:[{name:'Mara Quinn',email:'field.template@clients.example'}]},fieldSender)).result.id
  const fromA=await from(a),fromB=await from(b)
  await h.command('envelope.approve',{id:fromA,eligible:true},fieldSender,403)
  await h.command('envelope.approve',{id:fromB,eligible:true},fieldSender,403)
  await scoped(group,'template',{templates:null})
  await scoped(profile,'template',{templates:[a]})
  await h.command('envelope.approve',{id:fromA,eligible:true},fieldSender)
  const policy=(await read(h,fromA)).events.findLast(e=>e.action==='envelope.approved').detail.sendPolicy
  assert.equal(policy.mode,'person','an autonomous group cannot widen account person mode')
  assert.deepEqual(policy.templates,[a])
  assert.deepEqual(policy.policies.map(p=>[p.scope,p.scopeId??'',p.version]).sort(),[['account','',1],['group',group.id,2],['profile',profile.id,1]].sort())
  // A new group requirement is checked at actual release and a held draft never auto-releases.
  const later=await make(fieldSender,'Field deferred')
  await h.command('envelope.approve',{id:later,eligible:true,sendAt:schedule()},fieldSender)
  const due=Date.parse((await read(h,later)).scheduled.at)+1000
  await scoped(group,'ad_hoc',{mode:'off'})
  await h.scheduled(due);assert.ok((await read(h,later)).sendHold)
  await scoped(group,'ad_hoc',{mode:'person'})
  await h.scheduled(due+3600000);assert.ok((await read(h,later)).sendHold)
  await h.command('envelope.approve',{id:later,eligible:true},fieldSender);assert.equal((await read(h,later)).status,'awaiting_signature')
  await h.command('account.internal_approval',{rule:{approverEmail:'review.policy@harbour.example'}})
  await scoped(profile,'ad_hoc',{requireInternalApproval:true,deferredRelease:false})
  const approval=await make(fieldSender,'Profile approval')
  await h.command('envelope.approve',{id:approval,eligible:true,sendAt:schedule()},fieldSender,403)
  assert.ok((await h.command('envelope.approve',{id:approval,eligible:true},fieldSender)).result.waitingForApproval.length)
  await h.command('envelope.internal_decide',{id:approval,decision:'approve'},admin);assert.equal((await read(h,approval)).status,'awaiting_signature')
  // A member newly assigned to an off group is constrained on the very next send.
  await scoped(group,'ad_hoc',{mode:'off'})
  await h.post('/api/inkwell/send-policy-scopes',{id:group.id,kind:'group',name:'Field',members:[fieldId,officeId],expectedVersion:group.version,commandId:crypto.randomUUID()},h.owner)
  const newlyAssigned=await make(officeSender,'New group assignment')
  await h.command('envelope.approve',{id:newlyAssigned,eligible:true},officeSender,403)
  await h.post('/api/inkwell/send-policy-scopes',{id:group.id,kind:'group',name:'Field',members:[],expectedVersion:group.version,commandId:crypto.randomUUID()},h.owner,409)
  assert.equal((await scopeState(office)).members.length,1)
 } finally {await h.close()}
})
