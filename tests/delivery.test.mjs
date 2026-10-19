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

test('DELIV-006: after signer 1 signs, the sender corrects signer 2’s email, adds and removes recipients and edits messages, expiry and fields; signer 1’s signature and field stand, the old link refuses, every correction is audited with before and after values, and the new link completes the envelope', async () => {
 const h = await harness()
 try {
  const ann = 'ann@harbour.example', ben = 'ben@harbour-old.example', newBen = 'ben@harbour.example', title = 'Correction check'
  const fields = [{ id: 'signature-0', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .2, width: .4, height: .07 }, { id: 'signature-1', label: 'Signature', type: 'signature', signer: 1, page: 0, x: .1, y: .4, width: .4, height: .07 }]
  const id = (await h.command('envelope.prepare', { title, filename: 'correct.pdf', pdfBase64: await pdf(), signers: [{ name: 'Ann Lee', email: ann, order: 1 }, { name: 'Ben Ode', email: ben, order: 2 }], fields })).result.id
  await h.command('envelope.approve', { id, eligible: true })
  const linkOf = message => '/api/sign/' + new URL(message.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  const verify = async (email, path) => { await h.post(path + '/code', {}, ''); const cookie = (await h.post(path + '/verify', { code: (await h.mail(email, 'verification code')).text.match(/\b\d{6}\b/)[0] }, '')).cookie; await h.agree(path, cookie); return cookie }
  const annPath = linkOf(await h.mail(ann, 'Please sign:')), annCookie = await verify(ann, annPath)
  await h.post(annPath + '/sign', { values: { 'signature-0': 'Ann Lee' }, consent: true, commandId: crypto.randomUUID() }, annCookie)
  const oldPath = linkOf(await h.mail(ben, 'Please sign:')), oldCookie = await verify(ben, oldPath)
  const view = async () => (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
  const signed = await view()
  const recipients = (changes = {}) => [{ name: 'Ann Lee', email: ann, order: 1 }, { name: 'Ben Ode', email: ben, order: 2 }].map((r, i) => ({ ...r, ...changes[i] }))

  // A viewer may not correct; signer 1's details, field or place cannot change through a correction.
  const viewer = await h.invite('vic@harbour.example', 'member')
  await h.command('envelope.correct', { id, signers: recipients({ 1: { email: newBen } }) }, viewer, 403)
  await h.command('envelope.correct', { id, signers: recipients({ 0: { email: 'ann@elsewhere.example' } }) }, h.owner, 409)
  await h.command('envelope.correct', { id, signers: [{ remove: true }, recipients()[1]] }, h.owner, 409)
  await h.command('envelope.correct', { id, fields: [{ ...fields[0], x: .3 }, fields[1]] }, h.owner, 409)
  await h.command('envelope.correct', { id, fields: [{ ...fields[0], id: 'signature-0b' }, ...fields] }, h.owner, 409)
  await h.command('envelope.correct', { id, signers: recipients({ 1: { order: 0 } }) }, h.owner, 400)
  await h.command('envelope.correct', { id, signers: recipients() }, h.owner, 409)

  // One correction: signer 2's email, a new signer at order 3 with a field, a copy recipient, the message and expiry.
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString(), deeField = { id: 'signature-2', label: 'Signature', type: 'signature', signer: 2, page: 0, x: .1, y: .6, width: .4, height: .07 }
  const result = (await h.command('envelope.correct', { id, signers: [...recipients({ 1: { email: newBen } }), { name: 'Dee Park', email: 'dee@harbour.example', order: 3 }], fields: [...fields, deeField], copies: [{ name: 'Cara Moss', email: 'cara@harbour.example' }], message: 'Corrected: please sign the updated routing.', expiresAt })).result
  assert.deepEqual(result.invited, [newBen], 'only the corrected current recipient is invited')
  assert.equal((await h.send(oldPath)).status, 404, 'the old link for signer 2 refuses')
  assert.equal((await h.send(oldPath + '/document', undefined, oldCookie)).status, 404, 'and so does the old session')
  let envelope = await view()
  assert.deepEqual(envelope.signers[0], signed.signers[0], 'signer 1’s signature, values and evidence stand')
  assert.deepEqual(envelope.fields.find(f => f.id === 'signature-0'), fields[0])
  const event = action => envelope.events.filter(e => e.action === action)
  assert.deepEqual(event('signer.corrected').map(e => e.detail), [{ signer: 1, before: { name: 'Ben Ode', email: ben, order: 2 }, after: { name: 'Ben Ode', email: newBen, order: 2 } }])
  assert.deepEqual(event('signer.added').map(e => e.detail), [{ signer: 2, after: { name: 'Dee Park', email: 'dee@harbour.example', order: 3 }, accessCode: false }])
  const changes = event('envelope.corrected')[0].detail.changes
  assert.deepEqual(Object.keys(changes).sort(), ['copies', 'expiresAt', 'fields', 'message'])
  assert.deepEqual(changes.copies, { before: null, after: [{ name: 'Cara Moss', email: 'cara@harbour.example' }] }); assert.equal(changes.expiresAt.before, signed.expiresAt); assert.equal(changes.expiresAt.after, expiresAt)
  const benTimeline = envelope.recipients.find(r => r.signer === 1)
  assert.ok(benTimeline.steps.some(s => s.step === 'corrected' && s.detail.includes(newBen)), 'the corrected recipient’s timeline continues with the correction')
  assert.ok(!benTimeline.steps.some(s => s.step === 'authenticated'), 'the person replaced does not lend the new one their verification')
  assert.equal(await h.mail('dee@harbour.example', 'Please sign:'), undefined, 'a later recipient waits for their order')

  // A second correction removes the added recipient before they act; their field goes with them.
  await h.command('envelope.correct', { id, signers: [...recipients({ 1: { email: newBen, message: '' } }), { remove: true }], fields })
  envelope = await view()
  assert.ok(envelope.signers[2].removedAt); assert.equal(event('signer.removed').length, 1); assert.ok(!envelope.fields.some(f => f.signer === 2))
  assert.deepEqual(envelope.events.filter(e => e.action === 'signer.removed').map(e => e.detail), [{ signer: 2, before: { name: 'Dee Park', email: 'dee@harbour.example', order: 3 } }])

  // The new link completes the envelope; the copy recipient added by the correction gets the completed copy.
  const invitation = await h.mail(newBen, 'Please sign:')
  assert.match(invitation.text, /Corrected: please sign the updated routing\./, 'the corrected message is in the new invitation')
  const newPath = linkOf(invitation), newCookie = await verify(newBen, newPath)
  await h.post(newPath + '/sign', { values: { 'signature-1': 'Ben Ode' }, consent: true, commandId: crypto.randomUUID() }, newCookie)
  envelope = await view()
  assert.equal(envelope.status, 'completed', 'the corrected recipient’s signature completes the envelope with signer 2 removed')
  assert.ok(await h.mail('cara@harbour.example', 'Completed:'), 'the added copy recipient receives the completed copy')
  assert.equal(await h.mail('dee@harbour.example'), undefined, 'the removed recipient never hears from the envelope')
  await h.command('envelope.correct', { id, message: 'Too late' }, h.owner, 409)
 } finally { await h.close() }
})

test('ROUTE-006: when the sender allows it, a verified signer reassigns to a colleague with a reason; the colleague verifies and signs, the original link refuses, the record shows both people; a disallowed reassignment is refused', async () => {
 const h = await harness()
 try {
  const ann = 'ann@harbour.example', bea = 'bea@harbour.example', cy = 'cy@harbour.example'
  const fields = [0, 1].map(signer => ({ id: `signature-${signer}`, label: 'Signature', type: 'signature', signer, page: 0, x: .1, y: .2 + signer * .2, width: .4, height: .07 }))
  const prepare = async (title, allowReassignment) => (await h.command('envelope.prepare', { title, filename: 'route.pdf', pdfBase64: await pdf(), signers: [{ name: 'Ann Lee', email: ann }, { name: 'Cy Ray', email: cy }], fields, ...(allowReassignment ? { allowReassignment } : {}) })).result.id
  const linkOf = message => '/api/sign/' + new URL(message.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  const verify = async (email, path) => { await h.post(path + '/code', {}, ''); const cookie = (await h.post(path + '/verify', { code: (await h.mail(email, 'verification code')).text.match(/\b\d{6}\b/)[0] }, '')).cookie; await h.agree(path, cookie); return cookie }
  const reassign = (path, cookie, body, status) => h.post(path + '/reassign', { name: 'Bea Fox', email: bea, reason: 'Bea signs for our team this week', commandId: crypto.randomUUID(), ...body }, cookie, status)

  const fixed = await prepare('No reassignment', undefined)
  await h.command('envelope.approve', { id: fixed, eligible: true })
  const fixedPath = linkOf(await h.mail(ann, 'Please sign: No reassignment')), fixedCookie = await verify(ann, fixedPath)
  assert.equal((await h.send(fixedPath, undefined, fixedCookie)).value.allowReassign, false)
  await reassign(fixedPath, fixedCookie, {}, 403)

  const id = await prepare('Delegated lease', true)
  await h.command('envelope.approve', { id, eligible: true })
  const original = linkOf(await h.mail(ann, 'Please sign: Delegated lease'))
  await reassign(original, '', {}, 401)
  const cookie = await verify(ann, original)
  assert.equal((await h.send(original, undefined, cookie)).value.allowReassign, true)
  await reassign(original, cookie, { email: cy }, 409)
  await reassign(original, cookie, { reason: 'x' }, 400)
  assert.equal((await reassign(original, cookie, {})).value.result.reassignedTo, bea)
  assert.equal((await h.send(original)).status, 404, 'the original link refuses')
  assert.equal((await h.send(original + '/document', undefined, cookie)).status, 404, 'and so does the original session')

  const envelope = (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
  assert.deepEqual([envelope.signers[0].name, envelope.signers[0].email, envelope.signers[0].disclosure], ['Bea Fox', bea, undefined], 'the colleague takes the place, agreeing for themselves')
  const event = envelope.events.find(e => e.action === 'signer.reassigned')
  assert.deepEqual([event.actor, event.detail.before, event.detail.after, event.detail.reason], ['signer:1', { name: 'Ann Lee', email: ann }, { name: 'Bea Fox', email: bea }, 'Bea signs for our team this week'], 'the audit trail shows both people and the reason')
  const steps = envelope.recipients[0].steps
  assert.ok(steps.some(s => s.step === 'reassigned' && s.detail.includes(ann) && s.detail.includes(bea)), 'the timeline shows both people')
  assert.ok(!steps.some(s => s.step === 'authenticated'), 'the colleague has not verified yet: Ann’s verification is not theirs')

  const delegated = linkOf(await h.mail(bea, 'Please sign: Delegated lease')), beaCookie = await verify(bea, delegated)
  await h.post(delegated + '/sign', { values: { 'signature-0': 'Bea Fox' }, consent: true, commandId: crypto.randomUUID() }, beaCookie)
  const cyPath = linkOf(await h.mail(cy, 'Please sign: Delegated lease')), cyCookie = await verify(cy, cyPath)
  await h.post(cyPath + '/sign', { values: { 'signature-1': 'Cy Ray' }, consent: true, commandId: crypto.randomUUID() }, cyCookie)
  const done = (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
  assert.equal(done.status, 'completed', 'the colleague signs in Ann’s place and routing continues')
  assert.ok(done.events.some(e => e.action === 'signer.email_verified' && e.detail.email === bea), 'the colleague verified their own email')
 } finally { await h.close() }
})

test('DELIV-005: the sender resends the invitation by email on the same link, then on a new link that stops the old one; a link issued before links were kept rotates and says so; each message keeps its own status, and the signer signs from the resent link', async () => {
 const secret = randomBytes(24), h = await harness({ bindings: { MAIL_WEBHOOK_KEY: 'whsec_' + secret.toString('base64') } })
 try {
  const email = 'ria@harbour.example', title = 'Resend check'
  const id = (await h.command('envelope.prepare', { title, filename: 'resend.pdf', pdfBase64: await pdf(), signers: [{ name: 'Ria Sol', email }], fields: [{ id: 'signature-0', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .6, width: .4, height: .07 }] })).result.id
  await h.command('envelope.approve', { id, eligible: true })
  const linkOf = message => '/api/sign/' + new URL(message.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  const first = await h.mail(email, 'Please sign:'), oldPath = linkOf(first)
  await h.command('envelope.resend', { id, signer: 0 }, await h.invite('val@harbour.example', 'member'), 403)
  await h.command('envelope.resend', { id, signer: 1 }, h.owner, 409)
  assert.deepEqual((await h.command('envelope.resend', { id, signer: 0 })).result, { id, signer: 0, email, newLink: false })
  const second = await h.mail(email, 'Please sign:')
  assert.notEqual(second.id, first.id, 'a second invitation reached the provider fake')
  assert.equal(linkOf(second), oldPath, 'Resend sends the same link again'); assert.equal((await h.send(oldPath)).status, 200, 'and the old link keeps working')
  const sealed = await h.db.prepare('SELECT link_sealed FROM iw_signers WHERE envelope_id=?').bind(id).first()
  assert.match(sealed.link_sealed, /^v1\./); assert.ok(!sealed.link_sealed.includes(oldPath.split('/').at(-1)), 'the link is stored sealed, never in the clear')
  assert.deepEqual((await h.command('envelope.resend', { id, signer: 0, newLink: true })).result, { id, signer: 0, email, newLink: true })
  const third = await h.mail(email, 'Please sign:')
  assert.notEqual(linkOf(third), oldPath); assert.equal((await h.send(oldPath)).status, 404, 'after rotation the old link refuses')
  // A link issued before links were kept (no sealed copy) cannot be sent again: Resend rotates it and says so.
  await h.db.prepare('UPDATE iw_signers SET link_sealed=NULL WHERE envelope_id=?').bind(id).run()
  const forced = (await h.command('envelope.resend', { id, signer: 0 })).result
  assert.equal(forced.newLink, true); assert.match(forced.reason, /new link was sent/)
  const fourth = await h.mail(email, 'Please sign:')
  assert.equal((await h.send(linkOf(third))).status, 404)
  // Each message keeps its own status: a delivery event for the first invitation leaves the resent ones as sent.
  const body = JSON.stringify({ type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: first.id, to: [email], subject: first.subject } }), svix = 'msg_' + randomBytes(8).toString('hex'), timestamp = String(Math.floor(Date.now() / 1000))
  assert.equal((await h.send('/api/inkwell/mail/events', JSON.parse(body), '', { 'svix-id': svix, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + createHmac('sha256', secret).update(`${svix}.${timestamp}.${body}`).digest('base64') })).status, 200)
  const envelope = (await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope
  assert.deepEqual(envelope.messages.filter(m => m.kind === 'invitation').map(m => m.status), ['delivered', 'sent', 'sent', 'sent'], 'each invitation shows its own status')
  assert.deepEqual(envelope.events.filter(e => e.action === 'signer.resent').map(e => [e.actor, e.detail.signer, e.detail.newLink]), [[envelope.createdBy, 0, false], [envelope.createdBy, 0, true], [envelope.createdBy, 0, true]], 'each resend is audited')
  const path = linkOf(fourth)
  await h.post(path + '/code', {}, '')
  const cookie = (await h.post(path + '/verify', { code: (await h.mail(email, 'verification code')).text.match(/\b\d{6}\b/)[0] }, '')).cookie
  await h.agree(path, cookie)
  await h.post(path + '/sign', { values: { 'signature-0': 'Ria Sol' }, consent: true, commandId: crypto.randomUUID() }, cookie)
  assert.equal((await h.send('/api/inkwell/envelopes/' + id, undefined, h.owner)).value.envelope.status, 'completed', 'the signer signs from the resent link')
  assert.equal((await h.db.prepare('SELECT link_sealed FROM iw_signers WHERE envelope_id=?').bind(id).first()).link_sealed, null, 'the sealed link is cleared once they sign')
  await h.command('envelope.resend', { id, signer: 0 }, h.owner, 409)
 } finally { await h.close() }
})
