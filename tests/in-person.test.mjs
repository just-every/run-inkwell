import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

const pdfText = async bytes => { const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'); const pdf = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise; let text = ''; for (let n = 1; n <= pdf.numPages; n++) text += (await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str).join(' ') + ' '; return text }
const field = signer => ({ id: `sig-${signer}`, label: 'Signature', type: 'signature', signer, page: 0, x: .1, y: .3 + signer * .15, width: .4, height: .07 })

test('ROUTE-007: hosted handoff enforces identity, edit access, one-recipient isolation, consent, routing, complete copies and honest certificate evidence', async () => {
 const h = await harness()
 try {
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
  const input = { title: 'Harbour Studio supplier agreement', filename: 'supplier.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers: [{ name: 'Mara Quinn', email: 'mara@clients.example', inPerson: true, order: 1 }, { name: 'Noor Haddad', email: 'noor@clients.example', inPerson: true, order: 2 }], fields: [field(0), field(1)], reminders: { afterDays: 1, everyDays: 1 } }
  const id = (await h.command('envelope.prepare', input)).result.id
  assert.equal((await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope.signers[0].inPerson, true)
  await h.command('envelope.approve', { id, eligible: true })
  const admin = await h.invite('host@harbour.example', 'admin')
  const open = (signer, cookie = admin, extra = {}, status = 200) => h.post('/api/inkwell/commands', { command: 'envelope.host', input: { id, signer, confirmed: true, method: 'government-photo-id', screen: { width: 768, height: 1024 }, ...extra }, commandId: crypto.randomUUID() }, cookie, status, { 'user-agent': 'Harbour Tablet', 'cf-connecting-ip': '203.0.113.42' })
  await open(0, '', {}, 401)
  const viewer = await h.invite('observer@harbour.example', 'member'); await open(0, viewer, {}, 403)
  const sender = await h.invite('other@harbour.example', 'member'), actor = (await h.send('/api/inkwell', undefined, sender)).value.actor
  await h.command('member.role', { operatorId: actor.id, role: 'sender' }); await open(0, sender, {}, 403)
  await open(1, admin, {}, 409)
  await open(0, admin, { confirmed: false }, 400)
  await h.command('envelope.resend', { id, signer: 0 }, h.owner, 409)
  await h.command('envelope.invite', { id, signer: 0 }, h.owner, 409)
  await h.command('envelope.remind', { id }, h.owner, 409)
  await h.scheduled(Date.now() + 2 * 86400000)
  assert.equal(await h.mail(input.signers[0].email), undefined); assert.equal(await h.mail(input.signers[1].email), undefined)
  const opened = await open(0), url = new URL(opened.value.result.signing.url), path = '/api' + url.pathname, cookie = opened.cookie
  assert.ok(cookie, 'handoff sets the hosted session')
  assert.equal((await h.send('/api/inkwell', undefined, admin)).status, 401, 'host session really revoked, even without hosted marker')
  for (const other of ['/api/inkwell', '/api/inkwell/envelopes/' + id, '/api/inkwell/archive', '/api/inkwell/import/jobs']) assert.equal((await h.send(other, undefined, cookie + '; ' + admin)).status, 401, other)
  const app = await h.send('/app', undefined, cookie + '; ' + admin); assert.equal(app.status, 303); assert.equal(app.headers.get('location'), url.pathname)
  const view = (await h.send(path, undefined, cookie)).value; assert.equal(view.verified, true); assert.equal(view.inPerson, true); assert.equal(view.savedSignature, undefined)
  assert.ok(view.disclosure.sections.filter(s => /paper copy|contact details|Withdrawing/i.test(s.heading)).every(s => s.body.includes('Harbour Owner <owner@harbour.example>')), 'hosted disclosure gives the sender’s direct name and contact email')
  assert.equal((await h.send(path + '/document', undefined, cookie)).status, 403)
  await h.post(path + '/sign', { values: { 'sig-0': 'Mara Quinn' }, consent: true, commandId: crypto.randomUUID() }, cookie, 403)
  await h.post(path + '/code', {}, cookie, 403)
  await h.agree(path, cookie)
  assert.equal((await h.send(path + '/document', undefined, cookie)).status, 200)
  await h.post(path + '/sign', { values: { 'sig-0': 'Mara Quinn' }, consent: false, commandId: crypto.randomUUID() }, cookie, 400)
  const signed = await h.post(path + '/sign', { values: { 'sig-0': 'Mara Quinn' }, consent: true, commandId: crypto.randomUUID() }, cookie)
  assert.equal(signed.value.returnTo, '/signin'); assert.match(signed.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await h.send(path + '/document', undefined, cookie)).status, 401)
  assert.equal((await h.send('/app', undefined, cookie)).headers.get('location'), '/signin')
  assert.equal(await h.mail(input.signers[1].email), undefined, 'next in-person signer gets no invitation')
  await h.command('envelope.share', { id, email: actor.email, access: 'edit' })
  const second = await open(1, sender, { method: 'personally-known' }), path2 = '/api' + new URL(second.value.result.signing.url).pathname
  await h.agree(path2, second.cookie)
  await h.post(path2 + '/sign', { values: { 'sig-1': 'Noor Haddad' }, consent: true, commandId: crypto.randomUUID() }, second.cookie)
  const envelope = (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
  assert.equal(envelope.status, 'completed')
  const event = envelope.events.find(e => e.action === 'signer.in_person_hosted')
  assert.equal(event.detail.host.email, 'host@harbour.example'); assert.equal(event.detail.signIn, 'emailed invitation link'); assert.equal(event.detail.ip, '203.0.113.42'); assert.equal(event.detail.userAgent, 'Harbour Tablet'); assert.deepEqual(event.detail.screen, { width: 768, height: 1024 })
  const cert = await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`, undefined, h.owner)).bytes)
  for (const evidence of ['Signed in person, hosted by', 'host@harbour.example', 'identity attested by the host, not verified by Inkwell', 'government photo ID', 'personally known to me', event.at, 'Harbour Tablet', 'as reported by the browser', '768 x 1024']) assert.ok(cert.includes(evidence), evidence)
  for (const person of input.signers) { const copy = await h.mail(person.email, 'Completed:'); assert.ok(copy, 'completed copy for ' + person.email) }
 } finally { await h.close() }
})

test('ROUTE-007: host cannot be the signer; declining ends the hosted session and returns the device to sign-in', async () => {
 const h = await harness()
 try {
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
  const prep = email => ({ title: 'Harbour Studio service agreement', filename: 'service.pdf', pdfBase64: Buffer.from(pdfBytes).toString('base64'), signers: [{ name: 'Client', email, inPerson: true }], fields: [field(0)] })
  const pdfBytes = await pdf.save()
  const self = (await h.command('envelope.prepare', prep('OWNER@harbour.example'))).result.id
  await h.command('envelope.approve', { id: self, eligible: true })
  const input = id => ({ id, signer: 0, method: 'personally-known', confirmed: true, screen: { width: 390, height: 844 } })
  await h.command('envelope.host', input(self), h.owner, 403)
  await h.command('envelope.open_signing', { id: self }, h.owner, 409)
  const id = (await h.command('envelope.prepare', prep('client@clients.example'))).result.id
  await h.command('envelope.approve', { id, eligible: true })
  const host = await h.invite('declinehost@harbour.example', 'admin')
  const opened = await h.post('/api/inkwell/commands', { command: 'envelope.host', input: input(id), commandId: crypto.randomUUID() }, host), path = '/api' + new URL(opened.value.result.signing.url).pathname
  const declined = await h.post(path + '/decline', { reason: 'I need the corrected terms', commandId: crypto.randomUUID() }, opened.cookie)
  assert.equal(declined.value.returnTo, '/signin'); assert.equal(declined.value.result.status, 'declined')
  assert.equal((await h.send(path + '/document', undefined, opened.cookie)).status, 401)
  assert.equal((await h.send('/app', undefined, opened.cookie)).headers.get('location'), '/signin')
  assert.equal((await h.send('/api/inkwell', undefined, host)).status, 401)
 } finally { await h.close() }
})

test('ROUTE-007: corrections revoke a hosted attendee, mode changes require approval, expired sessions cannot open data, and withdrawal signs the device out', async () => {
 const h = await harness()
 try {
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
  const id = (await h.command('envelope.prepare', { title: 'Harbour Studio workshop', filename: 'workshop.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers: [{ name: 'Mara Quinn', email: 'first@clients.example', inPerson: true }], fields: [field(0)], allowReassignment: true })).result.id
  await h.command('envelope.approve', { id, eligible: true })
  const host = async n => { const cookie = await h.invite(`attest${n}@harbour.example`, 'admin'); return h.post('/api/inkwell/commands', { command: 'envelope.host', commandId: crypto.randomUUID(), input: { id, signer: 0, confirmed: true, method: 'personally-known', screen: { width: 768, height: 1024 } } }, cookie) }
  const first = await host(1), path = '/api' + new URL(first.value.result.signing.url).pathname
  const snapshot = (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
  const correction = { id, signers: [{ name: 'Noor Haddad', email: 'new@clients.example', inPerson: true }], fields: snapshot.fields }
  await h.command('envelope.correct', { ...correction, signers: [{ ...correction.signers[0], inPerson: false }] }, h.owner, 409)
  await h.post(path + '/reassign', { name: 'Someone Else', email: 'other@clients.example', reason: 'Please ask them', commandId: crypto.randomUUID() }, first.cookie, 409)
  await h.command('envelope.correct', correction)
  assert.equal((await h.send(path + '/document', undefined, first.cookie)).status, 401, 'correction retires the old hosted session')
  assert.equal(await h.mail('new@clients.example'), undefined)
  const second = await host(2), path2 = '/api' + new URL(second.value.result.signing.url).pathname
  assert.equal((await h.send(path2, undefined, second.cookie)).value.signer.name, 'Noor Haddad')
  // Simulate the stored session reaching its expiry; all reads still go through public transport.
  await h.db.prepare('UPDATE iw_signers SET session_expires=? WHERE envelope_id=?').bind(Date.now() - 1, id).run()
  assert.equal((await h.send(path2 + '/document', undefined, second.cookie)).status, 401)
  assert.equal((await h.send('/app', undefined, second.cookie)).headers.get('location'), '/signin')
  const third = await host(3), path3 = '/api' + new URL(third.value.result.signing.url).pathname
  await h.agree(path3, third.cookie)
  const withdrawn = await h.post(path3 + '/withdraw', { commandId: crypto.randomUUID() }, third.cookie)
  assert.equal(withdrawn.value.returnTo, '/signin')
  assert.equal((await h.send(path3 + '/document', undefined, third.cookie)).status, 401)
  const after = (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
  assert.equal(after.signers[0].consentWithdrawn, true)
  assert.equal(after.events.filter(e => e.action === 'signer.in_person_hosted').length, 3, 'each new attendee/session has a fresh attestation')
 } finally { await h.close() }
})
