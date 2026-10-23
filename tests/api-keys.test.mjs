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
    await mint(h, owner.id, ['webhooks:manage'], {}, admin, 400)
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
    await h.command('account.healthcare', { enabled: true })
    const requestedAt = Date.now()
    const body = { ...(await draft()), commandId: crypto.randomUUID() }, prepared = await client(h, key.token, preparePath, body)
    assert.equal(prepared.status, 200)
    const id = prepared.value.result.id
    const record = await client(h, key.token, operation('readEnvelope').replace('{id}', id))
    assert.equal(record.status, 200); assert.equal(record.value.envelope.status, 'prepared'); assert.equal(record.value.envelope.createdBy, sam.id)
    const review = async () => (await h.send('/api/inkwell/compliance/access-review', undefined, h.owner)).value.members.find(m => m.id === sam.id).lastAccessAt
    assert.ok(Date.parse(await review()) >= requestedAt, 'successful key requests appear in the bound member’s access review')
    const accessedAt = await review()
    assert.equal((await client(h, key.token, `/api/v1/envelopes/${id}/artifacts/original`)).status, 403)
    assert.equal(await review(), accessedAt, 'a refused key request does not advance member access')
    // An expired-envelope fixture represents the same stored record after its expiry instant.
    const expired = { ...record.value.envelope, expiresAt: new Date(Date.now() - 1000).toISOString() }
    await h.db.prepare('UPDATE iw_envelopes SET data=? WHERE id=?').bind(JSON.stringify(expired), id).run()
    assert.equal((await client(h, key.token, operation('readEnvelope').replace('{id}', id))).value.envelope.status, 'expired', 'single-record polling agrees with the dashboard’s live expiry')
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
    const logs = h.logs().join('\n')
    assert.ok(!logs.includes(body.title) && !logs.includes(key.token), 'healthcare request logs contain neither document content nor the bearer credential')
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


test('API-001 and SEND-001: OpenAPI clients send only with explicit key scope and autonomous policy, with atomic creation, live deferred fences and fresh human recovery',async()=>{
 const h=await harness()
 try {
  const owner=await actor(h),sam=await sender(h,'send.api@harbour.example'),key=await mint(h,sam.id,['envelopes:read','artifacts:read','envelopes:prepare','envelopes:send','envelopes:manage'])
  const spec=(await h.send('/api/v1/openapi.json')).value,paths=Object.entries(spec.paths),operation=id=>paths.find(([,verbs])=>Object.values(verbs).some(v=>v.operationId===id))[0]
  const create=operation('prepareEnvelope'),send=id=>operation('sendEnvelope').replace('{id}',id),voidPath=id=>operation('voidEnvelope').replace('{id}',id)
  const current=async()=> (await h.send('/api/inkwell/send-policies',undefined,h.owner)).value.policies.find(p=>p.source==='api')
  const policy=async change=>h.command('account.send_policy',{source:'api',expectedVersion:(await current()).version,...change})
  const body={...await draft('API autonomous agreement'),status:'sent',commandId:crypto.randomUUID()}
  const total=async()=> (await client(h,key.token)).value.total
  const before=await total()
  const refused=await client(h,key.token,create,body);assert.equal(refused.status,403);assert.equal(refused.value.code,'send_policy_off');assert.equal(await total(),before)
  const draftOnly=await mint(h,sam.id,['envelopes:prepare'])
  assert.equal((await client(h,draftOnly.token,create,body)).status,403)
  await policy({mode:'person'})
  assert.equal((await client(h,key.token,create,body)).value.code,'send_policy_person');assert.equal(await total(),before)
  await policy({mode:'autonomous'})
  const issued=await client(h,key.token,create,body);assert.equal(issued.status,200,JSON.stringify(issued.value));const id=issued.value.result.id
  const record=(await client(h,key.token,operation('readEnvelope').replace('{id}',id))).value.envelope
  assert.equal(record.status,'awaiting_signature');assert.equal(record.createdBy,sam.id)
  const authorization=record.events.findLast(e=>e.action==='envelope.approved')
  assert.equal(authorization.detail.eligible,false);assert.equal(authorization.detail.consent,false)
  assert.equal(authorization.detail.sendPolicy.source,'api');assert.equal(authorization.detail.sendPolicy.mode,'autonomous')
  assert.equal(authorization.detail.sendPolicy.principal,sam.id);assert.equal(authorization.detail.sendPolicy.credential.id,key.key.id)
  assert.deepEqual(authorization.detail.sendPolicy.policies,[{scope:'account',version:2}]);assert.ok(authorization.detail.sendPolicy.fingerprint)
  assert.ok(await h.mail('mara@supplier.example','Please sign:'))
  const mailCount=h.sent();assert.equal((await client(h,key.token,create,body)).value.result.id,id);assert.equal(h.sent(),mailCount);assert.equal(await total(),before+1)
  assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true)
  const artifact=await client(h,key.token,operation('downloadArtifact').replace('{id}',id).replace('{kind}','original'));assert.equal(artifact.status,200)
  const prepared=(await client(h,key.token,create,{...await draft('Prepared for key send'),commandId:crypto.randomUUID()})).value.result.id
  assert.equal((await client(h,draftOnly.token,send(prepared),{commandId:crypto.randomUUID()})).status,403)
  const agent=(await h.command('agent.issue')).result.token
  for(const path of [create,send(prepared),voidPath(prepared)])assert.equal((await client(h,agent,path,{...body,commandId:crypto.randomUUID(),reason:'Cancelled by client'})).status,403)
  const later={at:new Date(Date.now()+2*86400000).toISOString().slice(0,16),timeZone:'Pacific/Honolulu'}
  const scheduled=await client(h,key.token,send(prepared),{commandId:crypto.randomUUID(),sendAt:later});assert.equal(scheduled.status,200,JSON.stringify(scheduled.value))
  await policy({mode:'off'});await h.scheduled(Date.parse(scheduled.value.result.scheduled.at)+1000)
  let held=(await client(h,key.token,'/api/v1/envelopes/'+prepared)).value.envelope;assert.equal(held.status,'prepared');assert.ok(held.sendHold)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_signers WHERE envelope_id=?').bind(prepared).first()).n,0)
  await policy({mode:'autonomous'});await h.scheduled(Date.parse(scheduled.value.result.scheduled.at)+3600000)
  assert.ok((await client(h,key.token,'/api/v1/envelopes/'+prepared)).value.envelope.sendHold)
  await h.command('envelope.approve',{id:prepared,eligible:true},sam.cookie)
  const recovered=(await client(h,key.token,'/api/v1/envelopes/'+prepared)).value.envelope
  assert.equal(recovered.status,'awaiting_signature');assert.equal(recovered.sendOrigin,undefined,'the editor explicitly assumes personal sending authority')
  assert.equal(recovered.events.findLast(e=>e.action==='envelope.approved').detail.sendPolicy.source,'ad_hoc')
  // The last real internal approval rechecks the still-bound send credential.
  await h.command('account.internal_approval',{rule:{approverEmail:owner.email}})
  const waiting=await client(h,key.token,create,{...await draft('Key waiting for owner'),status:'sent',commandId:crypto.randomUUID()});assert.equal(waiting.status,200,JSON.stringify(waiting.value))
  const waitingId=waiting.value.result.id;assert.ok(waiting.value.result.waitingForApproval.length)
  await change(h,key.key,'revoke',{})
  assert.equal((await client(h,key.token)).status,401)
  assert.equal((await h.command('envelope.internal_decide',{id:waitingId,decision:'approve'})).result.held,true)
  assert.equal((await h.send('/api/inkwell/envelopes/'+waitingId,undefined,h.owner)).value.envelope.status,'prepared')
  await h.command('account.internal_approval',{rule:null})
  const successor=await mint(h,sam.id,['envelopes:read','envelopes:send','envelopes:manage'])
  const revokeLater=(await client(h,successor.token,create,{...await draft('Revoke before dispatch'),status:'sent',sendAt:later,commandId:crypto.randomUUID()})).value.result
  await change(h,successor.key,'revoke',{});await h.scheduled(Date.parse(revokeLater.scheduled.at)+1000)
  held=(await h.send('/api/inkwell/envelopes/'+revokeLater.id,undefined,h.owner)).value.envelope;assert.ok(held.sendHold);assert.equal(held.status,'prepared')
  const manager=await mint(h,sam.id,['envelopes:manage'])
  const voided=await client(h,manager.token,voidPath(id),{commandId:crypto.randomUUID(),reason:'Supplier cancelled this agreement'});assert.equal(voided.status,200,JSON.stringify(voided.value));assert.equal(voided.value.result.status,'voided')
  assert.equal((await client(h,draftOnly.token,voidPath(id),{commandId:crypto.randomUUID(),reason:'Wrong scope'})).status,403)
 }finally{await h.close()}
})

test('API-001: rolling request/send limits return Retry-After and API command receipts expire only after 24 hours',async()=>{
 const start=Date.now(),h=await harness({now:start})
 try {
  const person=await actor(h),reads=await mint(h,person.id,['envelopes:read'])
  for(let n=0;n<600;n++)assert.equal((await client(h,reads.token)).status,200)
  const refused=await client(h,reads.token);assert.equal(refused.status,429);assert.equal(refused.value.code,'rate_limited');assert.equal(Number(refused.headers.get('retry-after')),60)
  h.advanceTo(start+60_000);assert.equal((await client(h,reads.token)).status,200)
  const key=await mint(h,person.id,['envelopes:read','envelopes:send'])
  const api=(await h.send('/api/inkwell/send-policies',undefined,h.owner)).value.policies.find(p=>p.source==='api')
  await h.command('account.send_policy',{source:'api',expectedVersion:api.version,mode:'autonomous'})
  const definition=await draft('Rate limited policy sends')
  for(let n=0;n<59;n++)assert.equal((await client(h,key.token,'/api/v1/envelopes',{...definition,status:'sent',commandId:crypto.randomUUID()})).status,200)
  const concurrent=await Promise.all([0,1].map(()=>client(h,key.token,'/api/v1/envelopes',{...definition,status:'sent',commandId:crypto.randomUUID()})))
  assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,429],'only one concurrent release can consume the last send slot')
  const total=(await client(h,key.token)).value.total
  const over=await client(h,key.token,'/api/v1/envelopes',{...definition,status:'sent',commandId:crypto.randomUUID()});assert.equal(over.status,429);assert.ok(Number(over.headers.get('retry-after'))>0);assert.equal((await client(h,key.token)).value.total,total)
  h.advanceTo(start+120_001)
  const body={...definition,status:'sent',commandId:crypto.randomUUID()},first=await client(h,key.token,'/api/v1/envelopes',body)
  assert.equal(first.status,200);assert.equal((await client(h,key.token,'/api/v1/envelopes',body)).value.result.id,first.value.result.id)
  h.advanceTo(start+120_001+24*3600000-1);assert.equal((await client(h,key.token,'/api/v1/envelopes',body)).value.result.id,first.value.result.id)
  h.advanceTo(start+120_001+24*3600000)
  const expired=await client(h,key.token,'/api/v1/envelopes',body);assert.equal(expired.status,200,JSON.stringify(expired.value));assert.notEqual(expired.value.result.id,first.value.result.id)
 }finally{await h.close()}
})


test('API-001: hourly 30/7-day warnings name only key metadata and retain single-claim delivery outcomes',async()=>{
 const h=await harness()
 try {
  const owner=await actor(h),key=await mint(h,owner.id,['envelopes:read']),revoked=await mint(h,owner.id,['envelopes:read'])
  await change(h,revoked.key,'revoke',{})
  const expires=Date.parse(key.key.expiresAt),warnings=async()=> (await h.send('/api/inkwell/api-keys',undefined,h.owner)).value.keys.find(k=>k.id===key.key.id).expiryWarnings
  await h.scheduled(expires-30*86400000-1);assert.deepEqual(await warnings(),[])
  await h.scheduled(expires-30*86400000)
  const first=await h.mail(owner.email,'30-day warning');assert.ok(first);assert.ok(first.text.includes(key.key.prefix)&&first.text.includes(key.key.lastFour));assert.ok(!first.text.includes(key.token)&&!first.text.includes(revoked.key.prefix))
  const count=h.attempted().filter(mail=>mail.subject.includes('API key expiry')).length
  await h.scheduled(expires-29*86400000);assert.equal(h.attempted().filter(mail=>mail.subject.includes('API key expiry')).length,count)
  await h.scheduled(expires-7*86400000)
  assert.ok(await h.mail(owner.email,'7-day warning'));assert.deepEqual((await warnings()).map(w=>[w.days,w.state]),[[30,'sent'],[7,'sent']])
  await h.scheduled(expires);assert.equal(h.attempted().filter(mail=>mail.subject.includes('API key expiry')).length,count+1)
  const failed=await mint(h,owner.id,['envelopes:read'],{expiresInDays:1});h.failSends(1)
  await h.scheduled(Date.now());const metadata=(await h.send('/api/inkwell/api-keys',undefined,h.owner)).value.keys.find(k=>k.id===failed.key.id)
  assert.equal(metadata.expiryWarnings.length,1);assert.notEqual(metadata.expiryWarnings[0].state,'sent')
  const after=h.attempted().length;await h.scheduled(Date.now()+3600000);assert.equal(h.attempted().length,after,'an ambiguous/rejected claimed warning is not silently replayed')
 }finally{await h.close()}
})


test('API-001: template clients preserve pinned fields/prefill, enforce live use access and hold stale template revisions',async()=>{
 const h=await harness()
 try {
  const sam=await sender(h,'template.api@harbour.example'),other=await sender(h,'other.template.api@harbour.example'),definition=await draft('Pinned API template')
  const template={title:definition.title,filename:definition.filename,pdfBase64:definition.pdfBase64,roles:[{role:'Client',order:1}],fields:[...definition.fields,{id:'department',label:'Department',signer:0,type:'text',page:0,x:.1,y:.6,width:.4,height:.05}]}
  const t=(await h.command('template.save',template)).result.id
  await h.command('template.share',{id:t,email:sam.email,access:'use'})
  const key=await mint(h,sam.id,['envelopes:read','envelopes:prepare','envelopes:send']),hidden=await mint(h,other.id,['envelopes:send'])
  const current=async()=> (await h.send('/api/inkwell/send-policies',undefined,h.owner)).value.policies.find(p=>p.source==='api')
  await h.command('account.send_policy',{source:'api',mode:'autonomous',templates:[t],expectedVersion:(await current()).version})
  const body={templateId:t,recipients:[{name:'Mara Quinn',email:'mara.template.api@clients.example'}],prefill:{department:{value:'Procurement',source:'Supplied by API caller'}},status:'sent',commandId:crypto.randomUUID()}
  assert.equal((await client(h,hidden.token,'/api/v1/envelopes',body)).status,404)
  const issued=await client(h,key.token,'/api/v1/envelopes',body);assert.equal(issued.status,200,JSON.stringify(issued.value))
  const read=async id=>(await client(h,key.token,'/api/v1/envelopes/'+id)).value.envelope
  const first=await read(issued.value.result.id);assert.equal(first.template.id,t);assert.equal(first.template.version,1);assert.equal(first.fields.find(f=>f.id==='department').prefill.value,'Procurement')
  assert.equal(first.events.findLast(e=>e.action==='envelope.approved').detail.sendPolicy.source,'api')
  assert.equal((await h.send('/api/inkwell/envelopes/'+first.id+'/verify',undefined,h.owner)).value.ok,true)
  const later={at:new Date(Date.now()+2*86400000).toISOString().slice(0,16),timeZone:'Pacific/Honolulu'}
  const scheduled=await client(h,key.token,'/api/v1/envelopes',{...body,sendAt:later,commandId:crypto.randomUUID()});assert.equal(scheduled.status,200,JSON.stringify(scheduled.value))
  await h.command('template.update',{...template,id:t,message:'A new revision must not replace frozen bytes.'})
  await h.scheduled(Date.parse(scheduled.value.result.scheduled.at)+1000)
  const held=await read(scheduled.value.result.id);assert.ok(held.sendHold);assert.equal(held.template.version,1);assert.equal(held.originalSha256,first.originalSha256)
  await h.command('envelope.approve',{id:held.id,eligible:true},sam.cookie)
  const recovered=await read(held.id);assert.equal(recovered.status,'awaiting_signature');assert.equal(recovered.template.version,1);assert.equal(recovered.originalSha256,first.originalSha256)
  assert.equal(recovered.events.findLast(e=>e.action==='envelope.approved').detail.sendPolicy.source,'template')
  await h.command('template.unshare',{id:t,operatorId:sam.id})
  assert.equal((await client(h,key.token,'/api/v1/envelopes', {...body,commandId:crypto.randomUUID()})).status,401,'template authority loss permanently suspends its bound key')
 }finally{await h.close()}
})

test('API-001: management clients correct unsigned recipients, rotate their identity links and preserve signed fields with per-key retries',async()=>{
 const h=await harness()
 try {
  const sam=await sender(h,'correct.client@harbour.example'),other=await sender(h,'other.correct@harbour.example')
  const key=await mint(h,sam.id,['envelopes:read','envelopes:send','envelopes:manage']),readOnly=await mint(h,sam.id,['envelopes:read'])
  await h.command('account.send_policy',{source:'api',expectedVersion:0,mode:'autonomous'})
  const spec=(await h.send('/api/v1/openapi.json')).value,operation=name=>Object.entries(spec.paths).find(([,verbs])=>Object.values(verbs).some(v=>v.operationId===name))[0]
  const definition=await draft('API correction preserves signed evidence')
  definition.signers=[{name:'Mara Quinn',email:'mara.correct@clients.example',order:1,linkOnly:true},{name:'Eli Brooks',email:'eli.correct@clients.example',order:1,linkOnly:true}]
  definition.fields=[{...definition.fields[0],id:'first'},{...definition.fields[0],id:'second',signer:1,y:.7}]
  const created=await client(h,key.token,operation('prepareEnvelope'),{...definition,status:'sent',commandId:crypto.randomUUID()});assert.equal(created.status,200,JSON.stringify(created.value));const id=created.value.result.id,path=operation('correctEnvelope').replace('{id}',id)
  const tokenPath=async email=>'/api'+new URL((await h.mail(email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
  const first=await tokenPath(definition.signers[0].email),oldSecond=await tokenPath(definition.signers[1].email),session=(await h.post(first+'/open',{},'')).cookie
  await h.agree(first,session);await h.post(first+'/sign',{values:{first:'Mara Quinn'},consent:true,commandId:crypto.randomUUID()},session)
  const before=(await client(h,key.token,'/api/v1/envelopes/'+id)).value.envelope,signers=[...definition.signers];signers[1]={...signers[1],email:'eli.new@clients.example'}
  const body={commandId:crypto.randomUUID(),signers,message:'Corrected delivery address'}
  assert.equal((await client(h,readOnly.token,path,body)).status,403)
  const corrected=await client(h,key.token,path,body);assert.equal(corrected.status,200,JSON.stringify(corrected.value))
  const sent=h.sent();assert.deepEqual((await client(h,key.token,path,body)).value,corrected.value);assert.equal(h.sent(),sent,'a correction retry creates no new invitation')
  assert.equal((await client(h,key.token,path,{...body,message:'Changed input'})).status,409)
  assert.equal((await h.send(oldSecond+'/open',{},'')).status,404)
  const after=(await client(h,key.token,'/api/v1/envelopes/'+id)).value.envelope
  assert.equal(after.signers[0].signedAt,before.signers[0].signedAt);assert.deepEqual(after.signers[0].values,before.signers[0].values)
  assert.equal(after.signers[1].email,signers[1].email);assert.ok(after.events.some(e=>e.action==='signer.corrected'&&e.actor===sam.id))
  assert.equal((await client(h,key.token,path,{commandId:crypto.randomUUID(),fields:after.fields.map(f=>f.id==='first'?{...f,x:.2}:f)})).status,409)
  const foreign=(await h.command('envelope.prepare',await draft('Another sender'),other.cookie)).result.id
  assert.equal((await client(h,key.token,operation('correctEnvelope').replace('{id}',foreign),{...body,commandId:crypto.randomUUID()})).status,403)
  assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true)
 }finally{await h.close()}
})

test('API-001: scoped invitation resends preserve or revoke links explicitly and retries never send duplicate mail',async()=>{
 const h=await harness()
 try {
  const sam=await sender(h,'resend.client@harbour.example'),key=await mint(h,sam.id,['envelopes:send','envelopes:manage']),sendOnly=await mint(h,sam.id,['envelopes:send'])
  await h.command('account.send_policy',{source:'api',expectedVersion:0,mode:'autonomous'})
  const spec=(await h.send('/api/v1/openapi.json')).value,operation=name=>Object.entries(spec.paths).find(([,verbs])=>Object.values(verbs).some(v=>v.operationId===name))[0]
  const definition=await draft('API resend invitation'),created=await client(h,key.token,operation('prepareEnvelope'),{...definition,status:'sent',commandId:crypto.randomUUID()});assert.equal(created.status,200,JSON.stringify(created.value))
  const id=created.value.result.id,path=operation('resendInvitation').replace('{id}',id),body={commandId:crypto.randomUUID(),signer:0}
  const link=async()=>new URL((await h.mail(definition.signers[0].email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
  const original=await link(),initial=h.sent()
  assert.equal((await client(h,sendOnly.token,path,body)).status,403)
  const resent=await client(h,key.token,path,body);assert.equal(resent.status,200,JSON.stringify(resent.value));assert.equal(resent.value.result.newLink,false);assert.equal(await link(),original);assert.equal(h.sent(),initial+1)
  assert.deepEqual((await client(h,key.token,path,body)).value,resent.value);assert.equal(h.sent(),initial+1)
  assert.equal((await client(h,key.token,path,{...body,newLink:true})).status,409)
  const rotated=await client(h,key.token,path,{...body,commandId:crypto.randomUUID(),newLink:true});assert.equal(rotated.status,200,JSON.stringify(rotated.value));assert.equal(rotated.value.result.newLink,true);assert.notEqual(await link(),original)
  assert.equal((await h.send('/api'+original+'/code',{},'')).status,404)
  const agent=(await h.command('agent.issue')).result.token
  for(const name of ['correctEnvelope','resendInvitation'])assert.equal((await client(h,agent,operation(name).replace('{id}',id),body)).status,403)
  assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true)
 }finally{await h.close()}
})
