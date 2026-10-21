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
    assert.equal((await set(h, 'template', { mode: 'off' })).result.unchanged, true, 'saving the same settings makes no version')
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
    await set(h, 'ad_hoc', { mode: 'person' })
    await h.scheduled(at + 3_600_000)
    assert.equal((await read(h, a)).status, 'prepared', 'turning the policy back on does not release a held draft'); assert.equal(await h.mail('mara.held@clients.example', 'Please sign:'), undefined)
    await h.command('envelope.approve', { id: a, eligible: true })
    assert.equal((await read(h, a)).status, 'awaiting_signature')
    assert.ok(await h.mail('mara.held@clients.example', 'Please sign:'), 'a current editor’s fresh confirmation releases it')
    // A change that still allows the send releases it and records the current version.
    const b = await scheduledEnvelope('Template letter', 'mara.tmpl@clients.example', await fromTemplate(h, t, 'mara.tmpl@clients.example'))
    await set(h, 'template', { mode: 'autonomous' })
    await pass(b)
    const sentB = await read(h, b)
    assert.equal(sentB.status, 'awaiting_signature'); assert.ok(await h.mail('mara.tmpl@clients.example', 'Please sign:'))
    const releaseRecord = sentB.events.findLast(e => e.action === 'envelope.sent_scheduled').detail.sendPolicy
    assert.deepEqual([releaseRecord.mode, releaseRecord.policies], ['autonomous', [{ scope: 'account', version: 1 }]])
    assert.deepEqual(sentB.events.findLast(e => e.action === 'envelope.approved').detail.sendPolicy.policies, [{ scope: 'account', version: 0 }], 'the confirmation keeps the version it was made under')
    // A requirement that did not exist at confirmation (internal approval) holds the send; so does a template list that dropped it.
    const c = await scheduledEnvelope('Approval letter', 'mara.req@clients.example')
    await set(h, 'ad_hoc', { requireInternalApproval: true })
    await pass(c)
    assert.equal(heldBy(await read(h, c)).detail.code, 'send_policy_approval')
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
  } finally { await h.close() }
})
