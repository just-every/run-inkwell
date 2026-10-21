import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

const people = [{ name: 'Mara Quinn', email: 'mara@freeform.example' }, { name: 'Noor Haddad', email: 'noor@freeform.example' }]
const field = (signer, type = 'signature', extra = {}) => ({ id: `${type}-${signer}`, label: type === 'signature' ? 'Signature' : type, type, signer, page: 0, x: .1, y: .2 + signer * .3, width: .4, height: .06, ...extra })
async function prepare(h, signers = people, extra = {}) {
 const pdf = await PDFDocument.create(); pdf.addPage([612, 792]).drawText('Free-form agreement', { x: 60, y: 730 })
 return (await h.command('envelope.prepare', { title: 'Free-form agreement', filename: 'letter.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), freeForm: true, fields: [], signers, ...extra })).result.id
}
const envelope = async (h, id) => (await h.send(`/api/inkwell/envelopes/${id}`, undefined, h.owner)).value.envelope
async function session(h, invitation) { const path = '/api' + new URL(invitation.url).pathname; return { path, cookie: (await h.post(path + '/verify', { code: invitation.code }, '')).cookie } }
const save = (h, s, fields, values = {}, status = 200) => h.post(s.path + '/progress', { fields, values }, s.cookie, status)
const sign = (h, s, fields, values, status = 200) => h.post(s.path + '/sign', { fields, values, consent: true, timeZone: 'America/New_York', commandId: crypto.randomUUID() }, s.cookie, status)
async function pdfText(bytes) {
 const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
 const pdf = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise
 let text = ''; for (let n = 1; n <= pdf.numPages; n++) text += (await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str).join(' ') + ' '
 return text
}
async function publicVerify(h, bytes) { return (await h.mf.dispatchFetch(h.origin + '/api/verify', { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: bytes })).json() }

test('PREP-011: own placements resume behind verification/disclosure, enforce geometry and signature, survive policy disable, and bind PDF/certificate/archive custody', async () => {
 const h = await harness({ mailProvider: null })
 try {
  const policy = (await h.command('account.freeform', { enabled: true, expectedVersion: 0 })).result.policy
  const id = await prepare(h), [invitation] = (await h.command('envelope.approve', { id, eligible: true })).result.invitations
  const first = await session(h, invitation), signature = field(0), date = field(0, 'date_signed', { y: .3 }), privateText = field(0, 'text', { y: .4, masked: true })
  await save(h, { ...first, cookie: '' }, [signature], {}, 401)
  await save(h, first, [signature], {}, 403)
  await h.agree(first.path, first.cookie)
  await save(h, first, [field(1)], {}, 400)
  await save(h, first, [field(0, 'email')], {}, 400)
  await save(h, first, [field(0, 'signature', { x: .9 })], {}, 400)
  await save(h, first, Array.from({ length: 101 }, (_, i) => field(0, 'text', { id: `many-${i}` })), {}, 400)
  await save(h, first, Array.from({ length: 100 }, (_, i) => field(0, 'text', { id: `limit-${i}` })))
  assert.equal((await h.send(first.path, undefined, first.cookie)).value.fields.length, 100)
  await sign(h, first, [], {}, 400)
  await sign(h, first, [date], { [date.id]: '1900-01-01' }, 400)
  const placed = [signature, date, privateText], values = { [signature.id]: people[0].name, [date.id]: '1900-01-01', [privateText.id]: 'confidential entry' }
  await save(h, first, placed, values)
  const resume = (await h.send(first.path, undefined, first.cookie)).value
  assert.equal(resume.freeForm, true)
  assert.deepEqual(resume.fields, [{ ...signature, required: true }, date, privateText])
  assert.deepEqual(resume.progress, values)
  assert.deepEqual((await h.send(first.path)).value.fields, [], 'unverified requests cannot recover placements')
  await h.command('account.freeform', { enabled: false, expectedVersion: policy.version })
  await sign(h, first, placed, values)
  assert.equal((await h.db.prepare('SELECT progress FROM iw_signers WHERE envelope_id=? AND signer=0').bind(id).first()).progress, null)
  const partial = await envelope(h, id), signedDate = partial.signers[0].values[date.id]
  assert.notEqual(signedDate, values[date.id], 'date signed is generated at signing')
  assert.equal(signedDate, new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(partial.signers[0].signedAt)))
  const [next] = (await h.command('envelope.invite', { id })).result.invitations, second = await session(h, next)
  await h.agree(second.path, second.cookie)
  assert.equal((await h.send(second.path, undefined, second.cookie)).value.signedFields.length, 3)
  await save(h, second, [signature], {}, 400)
  await save(h, second, [field(1, 'signature', { y: signature.y })], {}, 400)
  await save(h, second, [field(1, 'signature', { id: signature.id })], {}, 400)
  await sign(h, second, [field(1)], { 'signature-1': people[1].name })
  const completed = await envelope(h, id)
  assert.equal(completed.status, 'completed')
  assert.deepEqual(completed.fields.slice(0, 3), partial.fields, 'later signing preserves every earlier placement')
  assert.equal(completed.freeFormSetting.version, policy.version)
  const signed = (await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`, undefined, h.owner)).bytes
  const documentText = await pdfText(signed)
  for (const text of [people[0].name, people[1].name, signedDate]) assert.ok(documentText.includes(text))
  const certificate = await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`, undefined, h.owner)).bytes)
  for (const text of [`setting version ${policy.version}`, policy.actor, 'position 0.1000, 0.2000', 'size 0.4000 x 0.0600', 'adoption typed', 'UTC', completed.signers[0].signedAt]) assert.ok(certificate.includes(text), text)
  assert.ok(!certificate.includes('confidential entry'), 'certificate masks marked text')
  assert.equal((await publicVerify(h, signed)).match, true)
  const archive = (await h.send('/api/inkwell/archive', undefined, h.owner)).value
  const restored = await harness({ mailProvider: null })
  try { await restored.post('/api/inkwell/archive/restore', { archive }); assert.deepEqual((await envelope(restored, id)).fields, completed.fields) } finally { await restored.close() }
  // Fault injection changes real custody data while preserving the stored audit chain and PDF bytes.
  completed.fields[0].x += .01
  await h.db.prepare('UPDATE iw_envelopes SET data=? WHERE id=?').bind(JSON.stringify(completed), id).run()
  assert.equal((await publicVerify(h, signed)).match, false)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`, undefined, h.owner)).value.ok, false)
  const damaged = (await h.send('/api/inkwell/archive', undefined, h.owner)).value, destination = await harness({ mailProvider: null })
  try { const refusal = await destination.send('/api/inkwell/archive/restore', { archive: damaged }, destination.owner); assert.ok([400, 409].includes(refusal.status)); assert.equal((await destination.send(`/api/inkwell/envelopes/${id}`, undefined, destination.owner)).status, 404) } finally { await destination.close() }
 } finally { await h.close() }
})

test('PREP-011: reassignment clears unsigned placements and the replacement signs only their own new placements', async () => {
 const h = await harness()
 try {
  await h.command('account.freeform', { enabled: true, expectedVersion: 0 })
  const id = await prepare(h, people.slice(0, 1), { allowReassignment: true })
  await h.command('envelope.approve', { id, eligible: true })
  const verify = async email => {
   const mail = await h.mail(email, 'Please sign'), path = '/api' + new URL(mail.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
   await h.post(path + '/code', {}, '')
   const cookie = (await h.post(path + '/verify', { code: (await h.mail(email, 'verification code')).text.match(/\b\d{6}\b/)[0] }, '')).cookie
   await h.agree(path, cookie); return { path, cookie }
  }
  const original = await verify(people[0].email)
  await save(h, original, [field(0)], { 'signature-0': people[0].name })
  await h.post(original.path + '/reassign', { name: people[1].name, email: people[1].email, reason: 'My colleague signs this agreement', commandId: crypto.randomUUID() }, original.cookie)
  assert.equal((await h.send(original.path, undefined, original.cookie)).status, 404)
  const next = await verify(people[1].email), view = (await h.send(next.path, undefined, next.cookie)).value
  assert.deepEqual(view.fields, []); assert.deepEqual(view.progress, {})
  await sign(h, next, [field(0, 'signature', { x: .2 })], { 'signature-0': people[1].name })
  assert.equal((await envelope(h, id)).signers[0].values['signature-0'], people[1].name)
 } finally { await h.close() }
})

test('PREP-011: one signer completes signature/date/initials/name/text, while decline, void and accepted paper signing discard unsigned placements', async () => {
 const h = await harness({ mailProvider: null })
 try {
  await h.command('account.freeform', { enabled: true, expectedVersion: 0 })
  const open = async () => {
   const id = await prepare(h, people.slice(0, 1), { allowPaperSigning: true })
   const [invitation] = (await h.command('envelope.approve', { id, eligible: true })).result.invitations
   const s = await session(h, invitation); await h.agree(s.path, s.cookie)
   return { id, ...s }
  }
  const one = await open(), placements = ['signature', 'date_signed', 'initials', 'full_name', 'text'].map((type, i) => field(0, type, { y: .2 + i * .1 }))
  await sign(h, one, placements, { 'signature-0': people[0].name, 'initials-0': 'MQ', 'full_name-0': people[0].name, 'text-0': 'Workshop delivery approved' })
  const completed = await envelope(h, one.id), signed = (await h.send(`/api/inkwell/envelopes/${one.id}/artifacts/signed`, undefined, h.owner)).bytes
  assert.equal(completed.status, 'completed'); assert.equal(completed.signers.length, 1)
  const text = await pdfText(signed)
  for (const value of Object.values(completed.signers[0].values)) assert.ok(text.includes(value))
  const source = await h.send(`/api/inkwell/envelopes/${one.id}/artifacts/original`, undefined, h.owner)
  assert.equal(await h.send(`/api/inkwell/envelopes/${one.id}/verify`, undefined, h.owner).then(r => r.value.ok), true)
  for (const action of ['decline', 'void', 'paper']) {
   const s = await open(); await save(h, s, [field(0)], { 'signature-0': 'Unsigned entry' })
   if (action === 'decline') await h.post(s.path + '/decline', { reason: 'The workshop date changed', commandId: crypto.randomUUID() }, s.cookie)
   if (action === 'void') await h.command('envelope.void', { id: s.id, reason: 'The workshop date changed' })
   if (action === 'paper') {
    const response = await h.mf.dispatchFetch(h.origin + s.path + '/paper', { method: 'POST', headers: { origin: h.origin, cookie: s.cookie, 'content-type': 'application/pdf' }, body: source.bytes })
    assert.equal(response.status, 200)
    await h.command('envelope.paper_review', { id: s.id, signer: 0, accept: true })
   }
   assert.equal((await h.db.prepare('SELECT progress FROM iw_signers WHERE envelope_id=? AND signer=0').bind(s.id).first()).progress, null, `${action} discards unsigned fields and values`)
   assert.deepEqual((await h.send(s.path, undefined, s.cookie)).value.fields, [])
   assert.deepEqual((await envelope(h, s.id)).fields, [])
  }
 } finally { await h.close() }
})
