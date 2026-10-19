import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

// DELIV-001: per-message status from the provider's signed delivery webhooks, through Base's verified intake.
const pdf = async () => { const doc = await PDFDocument.create(); doc.addPage([612, 792]); return Buffer.from(await doc.save()).toString('base64') }
async function sendOne(h, email, status = 200) {
 const signers = [{ name: email.split('@')[0], email }]
 const id = (await h.command('envelope.prepare', { title: `Delivery for ${email}`, filename: 'delivery.pdf', pdfBase64: await pdf(), signers, fields: [{ id: 'signature-0', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .6, width: .4, height: .07 }] })).result.id
 await h.command('envelope.approve', { id, eligible: true }, h.owner, status)
 return id
}
const messages = async (h, id) => { const r = await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner); assert.equal(r.status, 200, JSON.stringify(r.value)); return r.value.envelope.messages }
const invitation = async (h, id) => (await messages(h, id)).find(m => m.kind === 'invitation')

test('DELIV-001: through the Resend fake, a sent invitation moves to delivered and opened from signed webhooks; replays, forgeries and unknown messages change nothing; an uncertain send shows uncertain and is never sent again', async () => {
 const secret = randomBytes(24), key = 'whsec_' + secret.toString('base64')
 const h = await harness({ bindings: { MAIL_WEBHOOK_KEY: key } })
 try {
  const resend = (type, emailId, to, at, { svixId = 'msg_' + randomBytes(8).toString('hex'), tamper = false } = {}) => {
   const body = JSON.stringify({ type, created_at: new Date(at).toISOString(), data: { email_id: emailId, to: [to], subject: 'Please sign' } }), timestamp = String(Math.floor(Date.now() / 1000))
   const signature = createHmac('sha256', secret).update(`${svixId}.${timestamp}.${body}`).digest('base64')
   return { body: JSON.parse(body), headers: { 'svix-id': svixId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${tamper ? signature.replace(/^./, c => c === 'A' ? 'B' : 'A') : signature}` } }
  }
  const post = (event, cookie = '') => h.send('/api/inkwell/mail/events', event.body, cookie, event.headers)
  const email = 'dana@harbour.example', id = await sendOne(h, email)
  const sent = await h.mail(email, 'Please sign:')
  assert.ok(sent?.id, 'the invitation reached the provider fake, which returned its message id')
  let message = await invitation(h, id)
  assert.equal(message.status, 'sent'); assert.equal(message.label, 'Sent, no delivery event yet'); assert.ok(message.sentAt)
  assert.equal(message.recipient, email)

  const deliveredAt = Date.now() - 60_000, delivered = resend('email.delivered', sent.id, email, deliveredAt)
  const stored = await post(delivered)
  assert.equal(stored.status, 200, JSON.stringify(stored.value)); assert.equal(stored.value.stored, 1)
  message = await invitation(h, id)
  assert.equal(message.status, 'delivered'); assert.equal(message.label, 'Delivered'); assert.equal(message.deliveredAt, new Date(deliveredAt).toISOString())

  const replay = await post(delivered)
  assert.equal(replay.status, 200, 'a replayed event is acknowledged'); assert.equal(replay.value.stored, 0, 'and stores nothing')
  assert.equal((await post(resend('email.bounced', sent.id, email, Date.now(), { tamper: true }))).status, 401, 'a tampered signature is refused')
  assert.equal((await post(resend('email.bounced', 'not-our-message', email, Date.now()))).status, 403, 'an event for a message Inkwell did not send is refused')
  assert.equal((await post(resend('email.bounced', sent.id, 'someone@else.example', Date.now()))).status, 403, 'an event naming another recipient is refused')
  assert.equal((await invitation(h, id)).status, 'delivered', 'refused events change nothing')

  const openedAt = Date.now() - 30_000
  assert.equal((await post(resend('email.opened', sent.id, email, openedAt))).status, 200)
  message = await invitation(h, id)
  assert.equal(message.status, 'opened'); assert.equal(message.label, 'Opened'); assert.equal(message.openedAt, new Date(openedAt).toISOString()); assert.equal(message.deliveredAt, new Date(deliveredAt).toISOString())

  // An uncertain provider answer: the invitation is shown as uncertain and is never sent again, even when this
  // envelope's mail is dispatched later (the signer's verification code below).
  const other = 'eli@harbour.example'
  h.failSends(1)
  const uncertainId = await sendOne(h, other, 503)
  message = await invitation(h, uncertainId)
  assert.equal(message.status, 'uncertain'); assert.match(message.label, /^Uncertain/); assert.equal(message.sentAt, undefined)
  const attempt = h.attempted().find(m => m.to.includes(other) && m.subject.startsWith('Please sign:'))
  const path = '/api/sign/' + new URL(attempt.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  assert.equal((await h.send(path + '/code', {}, '')).status, 200, 'the recipient (who did receive it) asks for a code')
  const toOther = h.attempted().filter(m => m.to.includes(other))
  assert.deepEqual(toOther.map(m => m.subject.startsWith('Please sign:') ? 'invitation' : 'code'), ['invitation', 'code'], 'the uncertain invitation went to the provider exactly once')
  assert.equal((await invitation(h, uncertainId)).status, 'uncertain')
  assert.equal((await messages(h, uncertainId)).find(m => m.kind === 'code').status, 'sent')
 } finally { await h.close() }
})

test('DELIV-001: SendGrid events find their message by the signed delivery id; a forged delivery id is refused', async () => {
 const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
 const h = await harness({ mailProvider: 'sendgrid', bindings: { MAIL_WEBHOOK_KEY: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') } })
 try {
  const signed = events => { const body = JSON.stringify(events), timestamp = String(Math.floor(Date.now() / 1000)); return { body: events, headers: { 'x-twilio-email-event-webhook-timestamp': timestamp, 'x-twilio-email-event-webhook-signature': sign('sha256', Buffer.from(timestamp + body), privateKey).toString('base64') } } }
  const post = event => h.send('/api/inkwell/mail/events', event.body, '', event.headers)
  const email = 'fay@harbour.example', id = await sendOne(h, email), sent = await h.mail(email, 'Please sign:')
  const at = Math.floor(Date.now() / 1000) - 120, base = { email, sg_message_id: `${sent.id}.filterdrecv-1`, rer_delivery_id: sent.customArgs.rer_delivery_id }
  assert.equal((await post(signed([{ ...base, rer_delivery_id: crypto.randomUUID(), event: 'delivered', timestamp: at, sg_event_id: 'forged-1' }]))).status, 403)
  const r = await post(signed([{ ...base, event: 'processed', timestamp: at - 5, sg_event_id: 'sg-1' }, { ...base, event: 'delivered', timestamp: at, sg_event_id: 'sg-2' }]))
  assert.equal(r.status, 200, JSON.stringify(r.value)); assert.equal(r.value.stored, 2)
  const message = await invitation(h, id)
  assert.equal(message.status, 'delivered'); assert.equal(message.deliveredAt, new Date(at * 1000).toISOString())
 } finally { await h.close() }
})

test('DELIV-001: a message sent through Cloudflare Email is labelled sent with no delivery confirmation, never delivered or bounced', async () => {
 const h = await harness({ mailProvider: 'cloudflare' })
 try {
  const email = 'gus@harbour.example', id = await sendOne(h, email)
  assert.ok(await h.mail(email, 'Please sign:'), 'the invitation went out through Cloudflare Email')
  const message = await invitation(h, id)
  assert.equal(message.status, 'sent'); assert.equal(message.label, 'Sent, no delivery confirmation from this provider')
  assert.equal(message.deliveredAt, undefined); assert.equal(message.bouncedAt, undefined)
  assert.equal((await h.send('/api/inkwell/mail/events', [{ event: 'delivered' }])).status, 404, 'no delivery-event door exists for this provider')
 } finally { await h.close() }
})

test('DELIV-002: a bounce event flags the recipient and pauses their reminders, the sender is alerted once, corrects the email in one step, the old link refuses and the corrected recipient signs', async () => {
 const secret = randomBytes(24), h = await harness({ bindings: { MAIL_WEBHOOK_KEY: 'whsec_' + secret.toString('base64') } })
 try {
  const bounce = (message, at) => { const body = JSON.stringify({ type: 'email.bounced', created_at: new Date(at).toISOString(), data: { email_id: message.id, to: message.to, subject: message.subject } }), id = 'msg_' + randomBytes(8).toString('hex'), timestamp = String(Math.floor(Date.now() / 1000)); return [body, { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64') }] }
  const typo = 'hal@harbour-typo.invalid', fixed = 'hal@harbour.example', title = 'Bounce check'
  const id = (await h.command('envelope.prepare', { title, filename: 'bounce.pdf', pdfBase64: await pdf(), signers: [{ name: 'Hal Brooks', email: typo }], fields: [{ id: 'signature-0', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .6, width: .4, height: .07 }], reminders: { afterDays: 1, everyDays: 1 } })).result.id
  await h.command('envelope.approve', { id, eligible: true })
  const invitation = await h.mail(typo, 'Please sign:'), oldPath = '/api/sign/' + new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  const [body, headers] = bounce(invitation, Date.now() - 30_000)
  assert.equal((await h.send('/api/inkwell/mail/events', JSON.parse(body), '', headers)).status, 200)
  assert.equal((await h.send('/api/inkwell/mail/events', JSON.parse(body), '', headers)).status, 200, 'a replayed bounce is acknowledged')
  const view = async () => (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
  let envelope = await view()
  assert.equal(envelope.recipients[0].bounced, true, 'the recipient is flagged'); assert.match(envelope.recipients[0].waitingOn, /bounced/)
  assert.ok(envelope.recipients[0].steps.some(step => step.step === 'bounced'))
  // The hourly pass on a weekday afternoon days later: the alert is not repeated and the bounced recipient is not reminded.
  const weekday = [3, 4, 5, 6, 7].map(n => Date.now() + n * 86_400_000).find(at => ![0, 6].includes(new Date(at).getUTCDay()))
  await h.scheduled(new Date(new Date(weekday).toISOString().slice(0, 10) + 'T19:00:00Z').getTime())
  const alerts = h.attempted().filter(m => m.to.includes('owner@harbour.example') && m.subject === `Bounced: ${title}`)
  assert.equal(alerts.length, 1, 'the sender is alerted once'); assert.match(alerts[0].text, new RegExp(typo.replace('.', '\\.')))
  assert.equal(h.attempted().filter(m => m.subject.startsWith('Reminder to sign:')).length, 0, 'reminders to the bounced recipient are paused')
  await h.command('envelope.remind', { id }, h.owner, 409)
  envelope = await view()
  assert.equal(envelope.events.filter(e => e.action === 'signer.bounced').length, 1)

  await h.command('envelope.correct_bounced', { id, signer: 0, email: typo }, h.owner, 400)
  await h.command('envelope.correct_bounced', { id, signer: 0, email: fixed })
  assert.equal((await h.send(oldPath)).status, 404, 'the old link refuses')
  const corrected = await h.mail(fixed, 'Please sign:')
  assert.ok(corrected, 'the corrected recipient is invited in the same step')
  envelope = await view()
  assert.equal(envelope.signers[0].email, fixed); assert.equal(envelope.recipients[0].bounced, undefined, 'the flag clears with the new invitation')
  assert.deepEqual(envelope.events.find(e => e.action === 'signer.corrected').detail, { signer: 0, reason: 'bounced', before: { name: 'Hal Brooks', email: typo }, after: { name: 'Hal Brooks', email: fixed } })
  const path = '/api/sign/' + new URL(corrected.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  await h.post(path + '/code', {}, '')
  const cookie = (await h.post(path + '/verify', { code: (await h.mail(fixed, 'verification code')).text.match(/\b\d{6}\b/)[0] }, '')).cookie
  await h.agree(path, cookie)
  await h.post(path + '/sign', { values: { 'signature-0': 'Hal Brooks' }, consent: true, commandId: crypto.randomUUID() }, cookie)
  assert.equal((await view()).status, 'completed', 'the corrected recipient signs and the envelope completes')
 } finally { await h.close() }
})
