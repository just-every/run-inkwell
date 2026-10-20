import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac, randomBytes } from 'node:crypto'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { harness } from './harness.mjs'

test('COMPLY-002: healthcare signing keeps content out of operational/provider logs, preserves signed evidence and reviews every member across public doors', async () => {
  const webhookSecret = randomBytes(24)
  const h = await harness({ bindings: { MAIL_WEBHOOK_KEY: 'whsec_' + webhookSecret.toString('base64') } })
  try {
    assert.equal((await h.send('/api/inkwell', undefined, h.owner)).value.settings.healthcare, false)
    await h.command('account.healthcare', { enabled: true })
    const admin = await h.invite('operations@harbour.example', 'admin'), viewer = await h.invite('reviewer@harbour.example', 'member')
    await h.post('/auth/invite', { email: 'invited@harbour.example', displayName: 'Awaiting colleague', role: 'member' }, h.owner, 202)
    const who = async cookie => (await h.send('/api/inkwell', undefined, cookie)).value.actor
    const viewerId = (await who(viewer)).id
    await h.command('account.healthcare', { enabled: false }, viewer, 403)
    assert.equal((await h.send('/api/inkwell/compliance/access-review', undefined, viewer)).status, 403)
    assert.equal((await h.send('/api/inkwell/compliance/access-review')).status, 401)
    const review = async () => (await h.send('/api/inkwell/compliance/access-review', undefined, admin)).value
    const last = async id => (await review()).members.find(member => member.id === id).lastAccessAt
    // Auth management bypasses requireActor: it must still record successful member access.
    const beforeAuth = await last(viewerId), accessAt = Date.now()
    assert.equal((await h.send('/auth/session', undefined, viewer)).status, 200)
    assert.ok(Date.parse(await last(viewerId)) >= accessAt)
    assert.ok(await last(viewerId) > beforeAuth)
    const beforeRefused = await last(viewerId)
    assert.equal((await h.send('/api/inkwell/compliance/access-review', undefined, viewer)).status, 403)
    assert.equal(await last(viewerId), beforeRefused, 'a refused endpoint does not advance successful access')
    assert.equal((await h.send('/api/inkwell', undefined, viewer + '-invalid')).status, 401)
    assert.equal(await last(viewerId), beforeRefused)
    const adminId = (await who(admin)).id, importAt = Date.now()
    assert.equal((await h.send('/api/inkwell/import/jobs', undefined, h.owner)).status, 200)
    const report = await review()
    assert.equal(report.enabled, true)
    assert.equal(report.members.length, 4, 'every member, including the invited person, is listed')
    assert.equal(report.members.find(member => member.email === 'invited@harbour.example').lastAccessAt, null)
    for (const member of report.members.filter(member => member.status === 'active')) assert.ok(Number.isFinite(Date.parse(member.lastAccessAt)), member.email)
    assert.ok(Date.parse(report.members.find(member => member.role === 'owner').lastAccessAt) >= importAt)
    assert.ok(report.members.some(member => member.id === adminId && member.role === 'admin'))

    const documentText = 'Patient-specific treatment provision QX7291', fieldValue = 'Confidential care instruction ZK5832'
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.addPage([612, 792]).drawText(documentText, { x: 60, y: 730, font, size: 12 })
    const fields = [{ id: 'signature', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .7, width: .5, height: .05 }, { id: 'care', label: 'Care instruction', type: 'text', signer: 0, page: 0, x: .1, y: .5, width: .5, height: .05 }]
    const recipient = 'patient@harbour.example'
    const id = (await h.command('envelope.prepare', { title: 'Care agreement', filename: 'care.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers: [{ name: 'Morgan River', email: recipient }], fields })).result.id
    await h.command('envelope.approve', { id, eligible: true })
    const invitation = await h.mail(recipient, 'Please sign:'), token = new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1), path = '/api/sign/' + token
    await h.post(path + '/code', {}, '')
    const verified = await h.post(path + '/verify', { code: (await h.mail(recipient, 'verification code')).text.match(/\b\d{6}\b/)[0] }, '')
    await h.agree(path, verified.cookie)
    assert.equal((await h.send(path + '/document', undefined, verified.cookie)).status, 200)
    await h.post(path + '/sign', { values: { signature: 'Morgan River', care: fieldValue }, consent: true, commandId: crypto.randomUUID() }, verified.cookie)
    const detail = (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
    assert.equal(detail.status, 'completed')
    assert.equal(detail.signers[0].values.care, fieldValue, 'signed business evidence is preserved')
    for (const kind of ['signed', 'certificate', 'audit']) assert.equal((await h.send(`/api/inkwell/envelopes/${id}/artifacts/${kind}`, undefined, h.owner)).status, 200)
    assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`, undefined, h.owner)).value.ok, true)
    // A real signed provider webhook can carry arbitrary content; only normalized delivery facts are retained.
    const event = JSON.stringify({ type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: invitation.id, to: invitation.to, subject: documentText, extra: fieldValue } })
    const eventId = 'msg_' + randomBytes(8).toString('hex'), timestamp = String(Math.floor(Date.now() / 1000)), signature = createHmac('sha256', webhookSecret).update(`${eventId}.${timestamp}.${event}`).digest('base64')
    const response = await h.mf.dispatchFetch(h.origin + '/api/inkwell/mail/events', { method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + signature }, body: event })
    assert.equal(response.status, 200)
    const receipts = (await h.db.prepare('SELECT * FROM rer_mail_event_receipts').all()).results
    assert.ok(receipts.length > 0)
    const logs = h.logs().join('\n')
    assert.match(logs, /inkwell.request/, 'the journey produced actual operational logs')
    assert.match(logs, /signing/, 'signing requests were logged')
    for (const content of [documentText, fieldValue, token]) {
      assert.ok(!logs.includes(content), 'no content or private link in runtime logs')
      assert.ok(!JSON.stringify(receipts).includes(content), 'no raw payload in provider receipt logs')
    }
    const originalAt = await last(viewerId)
    await h.command('account.healthcare', { enabled: false }, admin)
    await Promise.all([h.send('/api/inkwell', undefined, viewer), h.send('/auth/session', undefined, viewer)])
    assert.ok(await last(viewerId) > originalAt, 'access tracking continues with profile off and concurrent requests')
  } finally { await h.close() }
})
