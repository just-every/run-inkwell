import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

const bearer = token => ({ authorization: `Bearer ${token}` })
const actor = async (h, cookie = h.owner) => (await h.send('/api/inkwell', undefined, cookie)).value.actor
const mint = async (h, memberId, scopes, extra = {}, cookie = h.owner, status = 200) => (await h.post('/api/inkwell/api-keys', { memberId, scopes, name: 'Harbour client', commandId: crypto.randomUUID(), ...extra }, cookie, status)).value
const change = async (h, key, action, extra = {}, cookie = h.owner, status = 200) => (await h.post(`/api/inkwell/api-keys/${key.id}/${action}`, { commandId: crypto.randomUUID(), ...extra }, cookie, status)).value
const client = (h, token, path = '/api/v1/envelopes', body) => h.send(path, body, '', bearer(token))
async function draft(title = 'Supplier agreement') {
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792]).drawText(title)
  return { title, filename: 'agreement.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers: [{ name: 'Mara Quinn', email: 'mara@supplier.example' }], fields: [{ id: 'sig', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .5, width: .4, height: .05 }] }
}
async function sender(h, email) {
  const cookie = await h.invite(email, 'member'), person = await actor(h, cookie)
  await h.command('member.role', { operatorId: person.id, role: 'sender' })
  return { cookie, ...person }
}

test('API-001: fresh owners/admins mint bound expiring keys once; secrets never appear in receipts, listings, archives or restored installations', async () => {
  const h = await harness()
  try {
    const owner = await actor(h), admin = await h.invite('ada.keys@harbour.example', 'admin'), sam = await sender(h, 'sam.keys@harbour.example'), viewer = await h.invite('vic.keys@harbour.example', 'member')
    const commandId = crypto.randomUUID(), body = { commandId, memberId: sam.id, name: 'Harbour integration', scopes: ['envelopes:read', 'envelopes:prepare'] }
    const issued = (await h.post('/api/inkwell/api-keys', body, admin)).value
    assert.ok(/^iwk_live_[a-f0-9-]{36}_[a-f0-9]{64}$/.test(issued.token), 'the revealed credential includes its key ID and 256-bit secret')
    assert.equal(issued.key.memberId, sam.id)
    assert.ok(Math.abs(Date.parse(issued.key.expiresAt) - Date.parse(issued.key.createdAt) - 365 * 86_400_000) < 2000)
    const retry = (await h.post('/api/inkwell/api-keys', body, admin)).value
    assert.equal(retry.key.id, issued.key.id); assert.equal(retry.token, undefined); assert.equal(retry.tokenShown, true)
    await h.post('/api/inkwell/api-keys', { ...body, name: 'Different grant' }, admin, 409)
    const listed = (await h.send('/api/inkwell/api-keys', undefined, h.owner)).value
    assert.equal(listed.keys.length, 1); assert.equal(listed.keys[0].lastFour, issued.token.slice(-4))
    assert.ok(!JSON.stringify(listed).includes(issued.token)); assert.ok(!JSON.stringify(listed).includes('token_hash'))
    // Hash-only custody is a contract acceptance point, inspected behind the HTTP-created credential.
    const row = await h.db.prepare('SELECT token_hash FROM iw_api_keys WHERE id=?').bind(issued.key.id).first()
    assert.ok(row.token_hash === createHash('sha256').update(issued.token).digest('hex'))
    const receipts = JSON.stringify((await h.db.prepare('SELECT result FROM iw_commands').all()).results)
    assert.ok(!receipts.includes(issued.token) && !receipts.includes(row.token_hash), 'idempotency does not retain a credential or its hash')
    for (const cookie of ['', sam.cookie, viewer]) {
      await mint(h, owner.id, ['envelopes:read'], {}, cookie, cookie ? 403 : 401)
      assert.equal((await h.send('/api/inkwell/api-keys', undefined, cookie)).status, cookie ? 403 : 401)
    }
    await mint(h, (await actor(h, viewer)).id, ['envelopes:read'], {}, admin, 403)
    for (const expiresInDays of [0, 731, 1.5]) await mint(h, owner.id, ['envelopes:read'], { expiresInDays }, admin, 400)
    await mint(h, owner.id, ['envelopes:send'], {}, admin, 400)
    await mint(h, owner.id, ['envelopes:read'], { mode: 'test' }, admin, 409)
    await h.post('/api/inkwell/api-keys', { ...body, commandId: crypto.randomUUID() }, h.owner, 403, { origin: 'https://elsewhere.example' })
    const agent = (await h.command('agent.issue')).result
    for (const token of [agent.token, issued.token]) {
      assert.equal((await h.send('/api/inkwell/api-keys', undefined, h.owner, bearer(token))).status, 403)
      assert.equal((await h.send('/api/inkwell/send-policies', undefined, h.owner, bearer(token))).status, 403)
      await h.post('/api/inkwell/api-keys', { ...body, commandId: crypto.randomUUID() }, h.owner, 403, bearer(token))
    }
    await h.db.prepare('UPDATE oa_sessions SET created_at=? WHERE operator_id=?').bind(Date.now() - 16 * 60_000, owner.id).run()
    await mint(h, owner.id, ['envelopes:read'], {}, h.owner, 403)
    await change(h, issued.key, 'scopes', { scopes: ['envelopes:read'] }, h.owner, 403)
    await change(h, issued.key, 'rotate', {}, h.owner, 403)
    const short = await mint(h, owner.id, ['envelopes:read'], { expiresInDays: 1 }, admin)
    assert.ok(Math.abs(Date.parse(short.key.expiresAt) - Date.parse(short.key.createdAt) - 86_400_000) < 2000)
    // An expired credential fixture exercises the next request, rather than waiting a day in real time.
    await h.db.prepare('UPDATE iw_api_keys SET expires_at=? WHERE id=?').bind(new Date(Date.now() - 1).toISOString(), short.key.id).run()
    assert.equal((await client(h, short.token)).status, 401)
    const archive = (await h.send('/api/inkwell/archive', undefined, h.owner)).value
    assert.ok(archive.ndjson && !archive.ndjson.includes(issued.token) && !archive.ndjson.includes(row.token_hash), 'whole-installation export excludes API credentials')
    const fresh = await harness()
    try {
      await fresh.post('/api/inkwell/archive/restore', { archive }, fresh.owner)
      assert.deepEqual((await fresh.send('/api/inkwell/api-keys', undefined, fresh.owner)).value.keys, [])
      assert.equal((await client(fresh, issued.token)).status, 401)
    } finally { await fresh.close() }
  } finally { await h.close() }
})

test('API-001: scopes and live record access constrain HTTP clients; draft preparation is idempotent per key and never sends, even with a browser cookie', async () => {
  const h = await harness()
  try {
    const sam = await sender(h, 'sam.client@harbour.example'), other = await sender(h, 'other.client@harbour.example')
    const key = await mint(h, sam.id, ['envelopes:read', 'envelopes:prepare', 'templates:read'])
    const description = (await h.send('/api/v1/openapi.json')).value
    const operation = id => Object.entries(description.paths).flatMap(([path, methods]) => Object.values(methods).filter(op => op.operationId === id).map(() => path))[0]
    const preparePath = operation('prepareEnvelope'), listPath = operation('listEnvelopes')
    const template = (await h.command('template.save', { ...(await draft('Private template')), roles: [{ role: 'Customer', order: 1 }] }, other.cookie)).result.id
    const hidden = (await h.command('envelope.prepare', await draft('Other sender only'), other.cookie)).result.id
    const body = { ...(await draft()), commandId: crypto.randomUUID() }, prepared = await client(h, key.token, preparePath, body)
    assert.equal(prepared.status, 200)
    const id = prepared.value.result.id
    const record = await client(h, key.token, operation('readEnvelope').replace('{id}', id))
    assert.equal(record.status, 200); assert.equal(record.value.envelope.status, 'prepared'); assert.equal(record.value.envelope.createdBy, sam.id)
    assert.equal(h.sent(), 2, 'only member invitations were mailed; preparing sent no signer invitation')
    assert.equal((await client(h, key.token, '/api/v1/envelopes', body)).value.result.id, id)
    assert.equal((await client(h, key.token, '/api/v1/envelopes', { ...body, title: 'Different document' })).status, 409)
    const siblingKey = await mint(h, sam.id, ['envelopes:prepare'])
    const separate = await client(h, siblingKey.token, '/api/v1/envelopes', body)
    assert.equal(separate.status, 200); assert.notEqual(separate.value.result.id, id, 'different clients have distinct command receipts')
    const found = await client(h, key.token, listPath)
    assert.equal(found.status, 200); assert.ok(found.value.envelopes.some(e => e.id === id)); assert.ok(found.value.envelopes.every(e => e.id !== hidden))
    assert.equal((await client(h, key.token, `/api/v1/envelopes/${hidden}`)).status, 403)
    assert.equal((await client(h, key.token, `/api/v1/envelopes/${id}/artifacts/original`)).status, 403)
    assert.equal((await client(h, key.token, '/api/v1/templates')).value.templates.some(t => t.id === template), false)
    assert.equal((await h.send('/api/v1/envelopes?access_token=' + key.token, undefined, h.owner)).status, 401)
    assert.equal((await h.send('/api/v1/envelopes', undefined, h.owner)).status, 401, 'a member session is not an API credential')
    assert.equal((await client(h, siblingKey.token)).status, 403)
    const artifacts = await mint(h, sam.id, ['artifacts:read'])
    const pdf = await client(h, artifacts.token, operation('downloadArtifact').replace('{id}', id).replace('{kind}', 'original'))
    assert.equal(pdf.status, 200); assert.ok(new TextDecoder().decode(pdf.bytes).startsWith('%PDF-'))
    assert.equal((await client(h, artifacts.token, `/api/v1/envelopes/${hidden}/artifacts/original`)).status, 403)
    assert.equal((await client(h, artifacts.token)).status, 403)
    await h.command('envelope.share', { id: hidden, email: sam.email, access: 'view' }, other.cookie)
    assert.equal((await client(h, key.token, `/api/v1/envelopes/${hidden}`)).status, 200, 'the existing share grants live read access')
    const before = (await client(h, key.token)).value.total
    assert.equal((await client(h, key.token, '/api/v1/envelopes', { ...body, commandId: crypto.randomUUID(), status: 'sent' })).status, 403)
    assert.equal((await client(h, key.token)).value.total, before, 'a refused send creates no envelope')
    const agent = (await h.command('agent.issue')).result
    assert.equal((await client(h, agent.token)).status, 403)
    assert.equal((await client(h, agent.token, '/api/v1/envelopes', body)).status, 403)
    for (const token of [key.token, agent.token]) for (const command of ['envelope.approve', 'account.send_policy', 'agent.issue']) {
      const attempt = await h.send('/api/inkwell/commands', { command, commandId: crypto.randomUUID(), input: { id, eligible: true } }, h.owner, bearer(token))
      assert.equal(attempt.status, 403, 'a bearer credential cannot borrow a browser session to approve or change policy')
    }
    assert.equal((await client(h, key.token, '/api/inkwell/agent/prepare', body)).status, 401, 'API keys are not preparation-agent tokens')
    await h.command('envelope.unshare', { id: hidden, operatorId: sam.id }, other.cookie)
    assert.equal((await client(h, key.token)).status, 401, 'removing record authority permanently suspends the bound key')
    await h.command('envelope.share', { id: hidden, email: sam.email, access: 'view' }, other.cookie)
    assert.equal((await client(h, key.token)).status, 401, 'restoring a share never revives the old credential')
  } finally { await h.close() }
})

test('API-001: scope changes and revokes apply to the next call; rotation has bounded overlap and member restoration never revives suspended keys', async () => {
  const h = await harness()
  try {
    const sam = await sender(h, 'sam.lifecycle@harbour.example'), key = await mint(h, sam.id, ['envelopes:read', 'envelopes:prepare'])
    await change(h, key.key, 'scopes', { scopes: ['templates:read'] })
    assert.equal((await client(h, key.token)).status, 403)
    assert.equal((await client(h, key.token, '/api/v1/templates')).status, 200)
    await change(h, key.key, 'rotate', { overlapDays: 8 }, h.owner, 400)
    const commandId = crypto.randomUUID(), rotated = await change(h, key.key, 'rotate', { commandId })
    assert.deepEqual(rotated.key.scopes, ['templates:read']); assert.equal(rotated.key.memberId, sam.id); assert.equal(rotated.key.expiresAt, key.key.expiresAt)
    assert.ok(Date.parse(rotated.retiresAt) <= Date.now() + 7 * 86_400_000)
    assert.equal((await change(h, key.key, 'rotate', { commandId })).token, undefined, 'a rotation retry does not reveal the successor secret again')
    assert.equal((await client(h, key.token, '/api/v1/templates')).status, 200)
    assert.equal((await client(h, rotated.token, '/api/v1/templates')).status, 200)
    await change(h, key.key, 'rotate', {}, h.owner, 409)
    const immediate = await change(h, rotated.key, 'rotate', { overlapDays: 0 })
    assert.equal((await client(h, rotated.token, '/api/v1/templates')).status, 401)
    assert.equal((await client(h, immediate.token, '/api/v1/templates')).status, 200)
    await change(h, immediate.key, 'revoke')
    assert.equal((await client(h, immediate.token, '/api/v1/templates')).status, 401, 'first request after revocation is refused')
    const demoted = await mint(h, sam.id, ['envelopes:read'])
    await h.command('member.role', { operatorId: sam.id, role: 'viewer' })
    await h.command('member.role', { operatorId: sam.id, role: 'sender' })
    assert.equal((await client(h, demoted.token)).status, 401, 'even without an intervening call, restoring sender does not revive the key')
    await change(h, demoted.key, 'scopes', { scopes: ['templates:read'] }, h.owner, 403)
    await change(h, demoted.key, 'rotate', {}, h.owner, 403)
    const deactivated = await mint(h, sam.id, ['envelopes:read'])
    await h.post('/auth/operator/status', { operatorId: sam.id, status: 'inactive' }, h.owner)
    await h.post('/auth/operator/status', { operatorId: sam.id, status: 'active' }, h.owner)
    assert.equal((await client(h, deactivated.token)).status, 401, 'reactivating a person does not restore the credential')
    const replaced = await mint(h, sam.id, ['envelopes:read']), other = await sender(h, 'other.lifecycle@harbour.example')
    await change(h, replaced.key, 'scopes', { scopes: ['envelopes:read'], memberId: other.id })
    assert.equal((await h.send('/api/inkwell/api-keys', undefined, h.owner)).value.keys.find(k => k.id === replaced.key.id).memberId, sam.id, 'scope edits cannot transfer a key')
    const listings = (await h.send('/api/inkwell/api-keys', undefined, h.owner)).value.keys
    assert.ok(listings.find(k => k.id === demoted.key.id).suspendedAt)
    assert.ok(listings.find(k => k.id === deactivated.key.id).suspendedAt)
  } finally { await h.close() }
})
