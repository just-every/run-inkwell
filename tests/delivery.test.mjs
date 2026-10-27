import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
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

  // AGENT-006: an owner reviews projection drift against authenticated receipts before repair.
  const reconcilePath=`/api/inkwell/envelopes/${id}/delivery-reconciliation`
  const review=async()=>{const r=await h.send(reconcilePath,undefined,h.owner);assert.equal(r.status,200,JSON.stringify(r.value));return r.value}
  assert.deepEqual((await review()).changes,[])
  await h.db.prepare("UPDATE rer_mail_event_states SET status='accepted',terminal=0 WHERE provider_message_id=?").bind(sent.id).run()
  const proposal=await review()
  assert.deepEqual(proposal.changes,[{messageId:message.id,provider:'resend',before:'accepted',after:'delivered'}])
  assert.equal(proposal.verifiedReceipts,1);assert.equal(proposal.unresolvedMessages,0)
  assert.equal((await h.db.prepare('SELECT status FROM rer_mail_event_states WHERE provider_message_id=?').bind(sent.id).first()).status,'accepted','inspection has no repair side effect')
  const admin=await h.invite('synthetic-inkwell-51@example.test','admin'),viewer=await h.invite('synthetic-inkwell-52@example.test','member')
  const approval={commandId:crypto.randomUUID(),approve:true,proposal:proposal.proposal}
  for(const [cookie,status] of [['',401],[admin,403],[viewer,403]]){
   assert.equal((await h.send(reconcilePath,undefined,cookie)).status,status)
   await h.post(reconcilePath,approval,cookie,status)
  }
  const token=(await h.command('agent.issue')).result.token
  await h.post(reconcilePath,approval,h.owner,403,{authorization:'Bearer '+token})
  await h.post(reconcilePath,approval,h.owner,403,{origin:'https://elsewhere.example'})
  await h.post(reconcilePath,{...approval,approve:false},h.owner,400)
  await h.post(reconcilePath,{...approval,proposal:'synthetic-inkwell-53'},h.owner,409)
  const sentBeforeRepair=h.sent(),receiptBefore=(await h.db.prepare('SELECT COUNT(*) AS n FROM rer_mail_event_receipts').first()).n
  const repaired=(await h.post(reconcilePath,approval)).value
  assert.equal(repaired.repaired,1);assert.equal((await invitation(h,id)).status,'delivered')
  assert.deepEqual((await h.post(reconcilePath,approval)).value,repaired,'approval replay has the original result')
  assert.deepEqual((await review()).changes,[])
  assert.equal(h.sent(),sentBeforeRepair,'repair sends no mail')
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM rer_mail_event_receipts').first()).n,receiptBefore,'repair duplicates no authenticated receipt')
  assert.equal((await h.send('/api/inkwell/audit',undefined,h.owner)).value.entries.filter(e=>e.action==='delivery.reconciliation.approved'&&e.target===id).length,1)
  // A missing projection also recovers; a later verified event makes an earlier proposal stale.
  await h.db.prepare('DELETE FROM rer_mail_event_states WHERE provider_message_id=?').bind(sent.id).run()
  const missing=await review();assert.equal(missing.changes[0].before,null)
  assert.equal((await post(resend('email.delivery_delayed',sent.id,email,Date.now()-45_000))).status,200)
  await h.post(reconcilePath,{commandId:crypto.randomUUID(),approve:true,proposal:missing.proposal},h.owner,409)
  const fresh=await review();assert.equal(fresh.changes[0].after,'delivered','a later nonterminal event cannot outrank delivery')
  const parallel=await Promise.all([h.send(reconcilePath,{commandId:crypto.randomUUID(),approve:true,proposal:fresh.proposal},h.owner),h.send(reconcilePath,{commandId:crypto.randomUUID(),approve:true,proposal:fresh.proposal},h.owner)])
  assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409],'only one concurrent approval writes')
  assert.equal((await invitation(h,id)).status,'delivered')

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
  const unresolved=(await h.send(`/api/inkwell/envelopes/${uncertainId}/delivery-reconciliation`,undefined,h.owner)).value
  assert.equal(unresolved.unresolvedMessages,2);assert.deepEqual(unresolved.changes,[],'uncertain sends and missing receipts never become delivery proof')
  const codeMessage=h.attempted().find(m=>m.to.includes(other)&&m.subject.startsWith('Your Inkwell verification code'))
  await h.db.prepare("INSERT INTO rer_mail_event_states(provider,tenant_id,event_namespace,provider_message_id,recipient,status,occurred_at,event_id,terminal) VALUES('resend','inkwell','resend-webhook',?,?,'delivered',?,'synthetic-inkwell-54',1)").bind(codeMessage.id,other,Date.now()).run()
  assert.equal((await h.send(`/api/inkwell/envelopes/${uncertainId}/delivery-reconciliation`,undefined,h.owner)).status,409,'unsupported delivery states remain unresolved rather than being blessed or removed')
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
  const repairPath=`/api/inkwell/envelopes/${id}/delivery-reconciliation`
  await h.db.prepare('DELETE FROM rer_mail_event_states WHERE provider=?').bind('sendgrid').run()
  const repair=(await h.send(repairPath,undefined,h.owner)).value
  assert.deepEqual(repair.changes,[{messageId:message.id,provider:'sendgrid',before:null,after:'delivered'}])
  assert.equal((await h.post(repairPath,{commandId:crypto.randomUUID(),approve:true,proposal:repair.proposal})).value.repaired,1)
  assert.equal((await invitation(h,id)).status,'delivered')

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

test('DELIV-008: subscribed to declines and completions in Slack, Teams, Nook and email, the sender gets each there and nothing else; after turning off completions in Teams the next completion skips only Teams; every notice is in the activity feed', async () => {
 const refusals=new Map(),edgeCalls=[]
 let pauseHook
 const h = await harness({networkEdge:async request=>{
  const host=new URL(request.url).hostname
  await pauseHook?.(host)
  const mode=refusals.get(host)
  if(!mode)return
  edgeCalls.push({host,path:new URL(request.url).pathname})
  return new Response('synthetic-inkwell-90',{status:mode})
 }})
 try {
  const settings = (body, status) => h.post('/api/inkwell/notices/settings', body, h.owner, status)
  const hooks = { slack: 'https://hooks.slack.com/services/synthetic-inkwell-1/synthetic-inkwell-2/synthetic-inkwell-3', teams: 'https://harbour.webhook.office.com/webhookb2/synthetic-inkwell-4/IncomingWebhook/synthetic-inkwell-5/synthetic-inkwell-6', nook: 'https://nook.harbour.example/hooks/slack/synthetic-inkwell-7' }
  await settings({ connect: { channel: 'slack', url: 'https://hooks.slack.example/services/T0001/B0001/x' } }, 400)
  await settings({ connect: { channel: 'teams', url: 'http://harbour.webhook.office.com/webhookb2/x' } }, 400)
  await settings({ connect: { channel: 'nook', url: 'https://nook.harbour.example/api/chat.postMessage' } }, 400)
  for (const [channel, url] of Object.entries(hooks)) await settings({ connect: { channel, url } })
  const events = ['viewed', 'signed', 'declined', 'completed', 'bounced', 'expiring'], channels = ['email', 'slack', 'teams', 'nook']
  const saved = (await settings({ choices: Object.fromEntries(events.map(e => [e, Object.fromEntries(channels.map(c => [c, e === 'declined' || e === 'completed']))])) })).value.result
  assert.deepEqual(saved.connected,Object.fromEntries(Object.entries(hooks).map(([channel,url])=>[channel,new URL(url).origin+'/…'+new URL(url).pathname.slice(-4)])), 'every connected webhook URL is masked independently of its fixture text')
  const stored=(await h.db.prepare('SELECT channel,sealed,masked FROM iw_notice_channels').all()).results
  assert.equal(stored.length,3)
  for(const row of stored){
   assert.match(row.sealed,/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/,'each capability is sealed')
   assert.notEqual(row.sealed,hooks[row.channel],'plaintext capabilities fail custody proof')
   for(const url of Object.values(hooks))assert.equal(JSON.stringify(stored).includes(url),false,'no full webhook capability is stored in plaintext')
  }
  assert.equal(saved.choices.viewed.email, false); assert.equal(saved.choices.completed.teams, true)

  const run = async (title, decline) => {
   const id = (await h.command('envelope.prepare', { title, filename: 'notice.pdf', pdfBase64: await pdf(), signers: [{ name: 'Ann Lee', email: 'ann@harbour.example' }], fields: [{ id: 'signature-0', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .6, width: .4, height: .07 }] })).result.id
   await h.command('envelope.approve', { id, eligible: true })
   const path = '/api/sign/' + new URL((await h.mail('ann@harbour.example', `Please sign: ${title}`)).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
   await h.post(path + '/code', {}, '')
   const cookie = (await h.post(path + '/verify', { code: (await h.mail('ann@harbour.example', 'verification code')).text.match(/\b\d{6}\b/)[0] }, '')).cookie
   await h.agree(path, cookie)
   assert.equal((await h.send(path + '/document', undefined, cookie)).status, 200)
   if (decline) await h.post(path + '/decline', { reason: 'Wrong entity named', commandId: crypto.randomUUID() }, cookie)
   else await h.post(path + '/sign', { values: { 'signature-0': 'Ann Lee' }, consent: true, commandId: crypto.randomUUID() }, cookie)
   return id
  }
  const owner = () => h.attempted().filter(m => m.to.includes('owner@harbour.example')).map(m => m.subject)
  const texts = channel => h.posts().filter(p => p.channel === channel).map(p => p.body.text)
  await run('Supplier NDA', true)
  await run('Dock lease', false)
  for (const channel of ['slack', 'teams', 'nook']) assert.deepEqual(texts(channel), ['Ann Lee declined to sign Supplier NDA.', 'Everyone has signed Dock lease.'], `${channel} receives the decline and the completion, and nothing else`)
  assert.deepEqual([...new Set(h.posts().map(p => p.path))].sort(), ['/hooks/slack/synthetic-inkwell-7', '/services/synthetic-inkwell-1/synthetic-inkwell-2/synthetic-inkwell-3', '/webhookb2/synthetic-inkwell-4/IncomingWebhook/synthetic-inkwell-5/synthetic-inkwell-6'], 'each post goes to the URL that person connected')
  assert.deepEqual(owner(), ['Declined: Supplier NDA', 'Completed: Dock lease'], 'email receives the decline and the completion, and nothing else')
  assert.match(h.attempted().find(m => m.subject === 'Declined: Supplier NDA').text, /Reason: Wrong entity named/)

  await settings({ choices: { completed: { teams: false } } })
  await run('Berth rental', false)
  assert.deepEqual(texts('teams'), ['Ann Lee declined to sign Supplier NDA.', 'Everyone has signed Dock lease.'], 'Teams no longer receives completions')
  for (const channel of ['slack', 'nook']) assert.equal(texts(channel).at(-1), 'Everyone has signed Berth rental.', `${channel} still does`)
  assert.equal(owner().at(-1), 'Completed: Berth rental', 'and so does email')

  const feed = (await h.send('/api/inkwell/notices', undefined, h.owner)).value.notices
  assert.deepEqual(feed.map(n => `${n.event} ${n.title}`).reverse(), ['viewed Supplier NDA', 'declined Supplier NDA', 'viewed Dock lease', 'signed Dock lease', 'completed Dock lease', 'viewed Berth rental', 'signed Berth rental', 'completed Berth rental'], 'every notice is in the activity feed, in order')
  assert.deepEqual(feed[0].posts.map(p => `${p.channel} ${p.result}`).sort(), ['nook delivered', 'slack delivered'], 'the feed shows where each notice went')
  assert.equal(feed.find(n => n.event === 'viewed').recipient, 'Ann Lee')
  const signer = await h.invite('sam@harbour.example', 'admin')
  assert.deepEqual((await h.send('/api/inkwell/notices', undefined, signer)).value.notices, [], 'another member sees none of them')

  // AGENT-006: confirmed connection refusals need an owner-approved replacement; unknown effects never replay.
  const path='/api/inkwell/notices/reconciliation'
  const review=async()=>{const response=await h.send(path,undefined,h.owner);assert.equal(response.status,200,JSON.stringify(response.value));return response.value.jobs}
  const hosts=['hooks.slack.com','harbour.webhook.office.com','nook.harbour.example']
  await settings({choices:{completed:{slack:true,teams:true,nook:true}}})
  for(const host of hosts)refusals.set(host,403)
  await run('Connection expired',false)
  let jobs=await review()
  assert.deepEqual(jobs.map(j=>j.channel).sort(),['nook','slack','teams'])
  assert.ok(jobs.every(j=>j.state==='held'&&!j.canReplay&&j.attempts===1))
  const calls=edgeCalls.length
  await h.scheduled('2026-10-01T12:00:00.000Z')
  assert.equal(edgeCalls.length,calls,'a confirmed refusal never retries automatically')
  for(const cookie of ['',signer]){
   assert.equal((await h.send(path,undefined,cookie)).status,cookie?403:401)
   await h.post(path,{id:jobs[0].id,proposal:jobs[0].proposal,approve:true},cookie,cookie?403:401)
  }
  const agent=(await h.command('agent.issue')).result.token
  await h.post(path,{id:jobs[0].id,proposal:jobs[0].proposal,approve:true},h.owner,403,{authorization:'Bearer '+agent})
  for(const [channel,url] of Object.entries(hooks))await settings({connect:{channel,url:url+'-replacement'}})
  const first=(await review())[0]
  await h.post(path,{id:first.id,proposal:first.proposal,approve:false},h.owner,400)
  await h.post(path,{id:first.id,proposal:first.proposal,approve:true},h.owner,403,{origin:'https://elsewhere.example'})
  await settings({connect:{channel:first.channel,url:hooks[first.channel]+'-fresh'}})
  await h.post(path,{id:first.id,proposal:first.proposal,approve:true},h.owner,409)
  jobs=await review();assert.ok(jobs.every(j=>j.canReplay))
  // Older proposals stay actionable even when unrelated unresolved posts fill the first page.
  const oldProposal=jobs[0]
  const source=await h.db.prepare('SELECT * FROM iw_notice_posts WHERE id=?').bind(oldProposal.id).first()
  await h.db.batch(Array.from({length:102},(_,i)=>h.db.prepare("INSERT INTO iw_notice_posts(id,notice_id,operator_id,channel,body,state,result,attempts,connection,repairable) VALUES(?,?,?,?,?,'uncertain','Unconfirmed provider effect',1,?,0)").bind('synthetic-inkwell-page-'+i,source.notice_id,source.operator_id,source.channel,source.body,source.connection)))
  const firstPage=(await h.send(path,undefined,h.owner)).value
  assert.equal(firstPage.jobs.length,100);assert.ok(firstPage.nextCursor)
  assert.equal(firstPage.jobs.some(job=>job.id===oldProposal.id),false)
  const secondPage=(await h.send(path+'?before='+firstPage.nextCursor,undefined,h.owner)).value
  assert.equal(secondPage.nextCursor,null)
  assert.deepEqual(secondPage.jobs.map(job=>job.id).sort(),['synthetic-inkwell-page-0','synthetic-inkwell-page-1',...jobs.map(job=>job.id)].sort(),'pagination reaches the exact older proposal set')
  await h.send(path+'?before=invalid',undefined,h.owner).then(r=>assert.equal(r.status,400))
  refusals.clear()
  await h.post(path,{id:oldProposal.id,proposal:oldProposal.proposal,approve:true})
  assert.equal((await h.db.prepare('SELECT state FROM iw_notice_posts WHERE id=?').bind(oldProposal.id).first()).state,'sent','approval finds the post by identity outside the newest page')
  await h.db.prepare("DELETE FROM iw_notice_posts WHERE id LIKE 'synthetic-inkwell-page-%'").run()
  jobs=jobs.filter(job=>job.id!==oldProposal.id)
  const acceptedBefore=h.posts().length
  for(const job of jobs){
   const approval={id:job.id,proposal:job.proposal,approve:true}
   const results=await Promise.all([h.send(path,approval,h.owner),h.send(path,approval,h.owner)])
   assert.deepEqual(results.map(r=>r.status).sort(),[200,409],'only one concurrent approval can claim a replay')
   await h.post(path,approval,h.owner,409)
  }
  assert.equal(h.posts().length,acceptedBefore+2,'each remaining confirmed refusal produces exactly one accepted replay')
  assert.deepEqual(await review(),[])
  const audit=(await h.send('/api/inkwell/audit',undefined,h.owner)).value.entries.filter(e=>e.action==='notice.reconciliation.approved')
  assert.equal(audit.length,3)
  assert.ok(!JSON.stringify(audit).includes('replacement'),'audit has no connection capability')
  for(const host of hosts)refusals.set(host,503)
  await run('Unknown provider effect',false)
  jobs=await review();assert.deepEqual(jobs.map(j=>j.state),['uncertain','uncertain','uncertain'])
  const unknownCalls=edgeCalls.length
  for(const [channel,url] of Object.entries(hooks))await settings({connect:{channel,url:url+'-another'}})
  for(const job of jobs)await h.post(path,{id:job.id,proposal:job.proposal,approve:true},h.owner,409)
  await h.scheduled('2026-10-01T13:00:00.000Z')
  assert.equal(edgeCalls.length,unknownCalls,'replacement and scheduled dispatch cannot repeat uncertain remote effects')
  assert.ok((await review()).every(j=>!j.canReplay))
  // Replacing the connection cannot widen the existing three-attempt delivery budget.
  const existingIds=new Set((await review()).map(job=>job.id))
  for(const host of hosts)refusals.set(host,403)
  await run('Exhausted connection',false)
  for(let attempt=1;attempt<3;attempt++){
   for(const [channel,url] of Object.entries(hooks))await settings({connect:{channel,url:url+'-renewal-'+attempt}})
   const exhausted=(await review()).filter(job=>!existingIds.has(job.id))
   assert.equal(exhausted.length,3)
   for(const job of exhausted)await h.post(path,{id:job.id,proposal:job.proposal,approve:true})
  }
  for(const [channel,url] of Object.entries(hooks))await settings({connect:{channel,url:url+'-beyond-budget'}})
  const exhausted=(await review()).filter(job=>!existingIds.has(job.id)),budgetCalls=edgeCalls.length
  assert.ok(exhausted.every(job=>job.attempts===3&&!job.canReplay))
  for(const job of exhausted)await h.post(path,{id:job.id,proposal:job.proposal,approve:true},h.owner,409)
  await h.scheduled('2026-10-01T14:00:00.000Z')
  assert.equal(edgeCalls.length,budgetCalls,'owner approval cannot create a fourth provider attempt')
  // A connection change while another post is in flight fences every later queued post.
  refusals.clear()
  const priorJobs=new Set((await review()).map(job=>job.id)),beforeQueued=h.posts().length
  let enter,release,pausedHost
  const entered=new Promise(resolve=>{enter=resolve}),paused=new Promise(resolve=>{release=resolve})
  pauseHook=async host=>{if(hosts.includes(host)){pauseHook=undefined;pausedHost=host;enter();await paused}}
  const inFlight=run('Changed queued connection',false)
  await entered
  for(const [channel,url] of Object.entries(hooks))await settings({connect:{channel,url:url+'-queued-replacement'}})
  release();await inFlight
  await h.scheduled('2026-10-01T15:00:00.000Z')
  const queued=(await review()).filter(job=>!priorJobs.has(job.id))
  assert.equal(queued.length,2)
  assert.deepEqual(queued.map(job=>job.channel).sort(),Object.keys(hooks).filter(channel=>new URL(hooks[channel]).hostname!==pausedHost).sort())
  assert.ok(queued.every(job=>job.state==='held'&&job.attempts===0&&job.canReplay))
  assert.equal(h.posts().length,beforeQueued+1,'changed pending connections are held without provider requests')
  for(const job of queued)await h.post(path,{id:job.id,proposal:job.proposal,approve:true})
  assert.equal(h.posts().length,beforeQueued+3,'only owner approval releases each changed connection once')
  // A stale dispatcher must not undo a repair while its approved replay waits behind another post.
  const connections=(await h.db.prepare('SELECT operator_id,channel,sealed FROM iw_notice_channels').all()).results
  const base=await h.db.prepare('SELECT notice_id,body FROM iw_notice_posts LIMIT 1').first()
  for(const [suffix,channel,state] of [['a','slack','pending'],['c','nook','uncertain'],['b','teams','pending']]){
   const connection=connections.find(row=>row.channel===channel)
   await h.db.prepare("INSERT INTO iw_notice_posts(id,notice_id,operator_id,channel,body,state,connection) VALUES(?,?,?,?,?,?,?)").bind('synthetic-inkwell-race-'+suffix,base.notice_id,connection.operator_id,channel,base.body,state,suffix==='b'?'synthetic-inkwell-old':createHash('sha256').update(connection.sealed).digest('hex')).run()
  }
  let enterOld,releaseOld,enterApproved,releaseApproved
  const oldEntered=new Promise(resolve=>{enterOld=resolve}),oldWait=new Promise(resolve=>{releaseOld=resolve})
  const approvedEntered=new Promise(resolve=>{enterApproved=resolve}),approvedWait=new Promise(resolve=>{releaseApproved=resolve})
  pauseHook=async host=>{
   if(host==='hooks.slack.com'){enterOld();await oldWait}
   if(host==='nook.harbour.example'){enterApproved();await approvedWait}
  }
  const staleDispatch=h.scheduled('2026-10-01T16:00:00.000Z')
  await oldEntered
  await h.scheduled('2026-10-01T16:01:00.000Z')
  const raceJob=(await review()).find(job=>job.id==='synthetic-inkwell-race-b')
  assert.ok(raceJob.canReplay)
  await h.db.prepare("UPDATE iw_notice_posts SET state='pending' WHERE id='synthetic-inkwell-race-c'").run()
  const approvedReplay=h.send(path,{id:raceJob.id,proposal:raceJob.proposal,approve:true},h.owner)
  await approvedEntered
  try{
   assert.equal((await h.db.prepare('SELECT state FROM iw_notice_posts WHERE id=?').bind(raceJob.id).first()).state,'pending')
   releaseOld();await staleDispatch
   assert.equal((await h.db.prepare('SELECT state FROM iw_notice_posts WHERE id=?').bind(raceJob.id).first()).state,'pending','a stale snapshot cannot put an owner-approved replay back on hold')
  }finally{releaseOld();releaseApproved();pauseHook=undefined;await staleDispatch;await approvedReplay}
  assert.equal((await approvedReplay).status,200)
  assert.equal((await h.db.prepare('SELECT state FROM iw_notice_posts WHERE id=?').bind(raceJob.id).first()).state,'sent','the approved replay completes once')
  const storedChannels=(await h.db.prepare('SELECT sealed FROM iw_notice_channels').all()).results
  const storedPosts=(await h.db.prepare('SELECT connection FROM iw_notice_posts').all()).results
  assert.ok(storedPosts.every(post=>!storedChannels.some(channel=>channel.sealed===post.connection)),'posts retain connection fingerprints, never a second sealed capability')

  const receipts=JSON.stringify(await review())+JSON.stringify(h.logs())
  assert.ok(!receipts.includes('synthetic-inkwell-90'),'untrusted provider response content is never persisted or exposed')
  const archive=JSON.stringify((await h.send('/api/inkwell/archive',undefined,h.owner)).value)
  assert.ok(!archive.includes('replacement')&&!archive.includes('hooks.slack.com'),'connector capabilities and posts remain installation state')
  const restored=await harness()
  try{
   await restored.post('/api/inkwell/archive/restore',{archive:JSON.parse(archive)},restored.owner)
   assert.deepEqual((await restored.send(path,undefined,restored.owner)).value.jobs,[])
   for(const table of ['iw_notice_posts','iw_notice_channels'])assert.equal((await restored.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0,'restore cannot revive connector custody or replay authority')
  }finally{await restored.close()}


 } finally { await h.close() }
})

test('Follow-up: stalled signers, authenticated reply custody and contact limits', async () => {
 const inboundSecret = Buffer.from('synthetic-inkwell-1').toString('base64'), outboundSecret = Buffer.from('synthetic-inkwell-2').toString('base64')
 const h = await harness({bindings:{MAIL_INBOUND_DOMAIN:'replies.harbour.example',MAIL_INBOUND_SECRET:'whsec_'+inboundSecret,MAIL_INBOUND_API_KEY:'synthetic-inkwell-3',MAIL_WEBHOOK_KEY:'whsec_'+outboundSecret}})
 try {
  const emails=['bounce@clients.example','away@clients.example','object@clients.example'],names=['Alex Client','Blair Away','Casey Client']
  const id=(await h.command('envelope.prepare',{title:'Harbour supply agreement',filename:'agreement.pdf',pdfBase64:await pdf(),signers:emails.map((email,i)=>({name:names[i],email,order:1})),fields:emails.map((_,i)=>({id:'sig'+i,label:'Signature',type:'signature',signer:i,page:0,x:.1,y:.2+i*.15,width:.4,height:.05})),reminders:{afterDays:1,everyDays:1}})).result.id
  await h.command('envelope.approve',{id,eligible:true})
  const view=async(cookie=h.owner,headers={})=>h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,cookie,headers)
  const initial=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope,ownerId=initial.createdBy
  const viewer=await h.invite('viewer@harbour.example','member'),escalator=await h.invite('escalator@harbour.example','admin')
  const people=(await h.send('/api/inkwell',undefined,h.owner)).value.people,escalationOwner=people.find(p=>p.email==='escalator@harbour.example').id
  const grant={id,enabled:true,maxContacts:2,days:[1,2,3,4,5],startHour:9,endHour:17,escalationOwner}
  await h.command('envelope.followup',grant,viewer,403)
  const token=(await h.command('agent.issue')).result.token
  assert.equal((await view('',{authorization:'Bearer '+token})).status,403)
  await h.post('/api/inkwell/commands',{command:'envelope.followup',input:grant,commandId:crypto.randomUUID()},h.owner,403,{authorization:'Bearer '+token})
  await h.command('envelope.followup',grant)
  assert.equal((await view()).value.grant.state,'active')
  const signedEvent=async(path,secret,event,eventId=crypto.randomUUID(),status=200,timestampOverride)=>{
   const raw=JSON.stringify(event),timestamp=timestampOverride??String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',Buffer.from(secret,'base64')).update(`${eventId}.${timestamp}.${raw}`).digest('base64')
   return h.post(path,event,'',status,{'svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature})
  }
  await h.post('/api/inkwell/contacts',{name:'Alex Client',email:'alex.correct@clients.example'},h.owner)
  const bounced=await h.mail(emails[0],'Please sign:')
  await signedEvent('/api/inkwell/mail/events',outboundSecret,{type:'email.bounced',created_at:new Date().toISOString(),data:{email_id:bounced.id,to:[emails[0]],bounce:{message:'recipient unknown',type:'Permanent',subType:'General'}}})
  let monday=new Date();monday.setUTCHours(14,0,0,0);do{monday.setUTCDate(monday.getUTCDate()+1)}while(monday.getUTCDay()!==1)
  const next=day=>new Date(monday.getTime()+day*86400000).toISOString(),lastFriday=next(-3)
  // Issue same-link invitations after enabling follow-up, so the signed provider can return current reply capabilities.
  await h.command('envelope.resend',{id,signer:1});await h.command('envelope.resend',{id,signer:2})
  const replyAddress=async email=>{const message=await h.mail(email,'Please sign:');const address=message.headers?.['Reply-To']??message.reply_to;assert.match(String(address),/^reply\+[A-Za-z0-9_-]{43}@replies\.harbour\.example$/);return String(address)}
  const awayAddress=await replyAddress(emails[1]),objectAddress=await replyAddress(emails[2])
  await h.command('envelope.followup',grant)
  assert.equal((await view()).value.grant.version,2,'settings create a new immutable version without closing the thread')
  const receive=async(email,to,body,headers={},eventId=crypto.randomUUID(),status=200)=>{
   const messageId=crypto.randomUUID();h.inbound({id:messageId,from:email,to:[to],subject:'Re: Harbour agreement',text:body,headers,attachments:[],message_id:'<'+messageId+'@clients.example>'})
   return signedEvent('/api/inkwell/mail/replies',inboundSecret,{type:'email.received',data:{email_id:messageId}},eventId,status)
  }
  await h.post('/api/inkwell/mail/replies',{type:'email.received'},'',401)
  await signedEvent('/api/inkwell/mail/replies',inboundSecret,{type:'email.received',data:{email_id:'synthetic-inkwell-9'}},crypto.randomUUID(),401,String(Math.floor(Date.now()/1000)-3600))
  const replay=crypto.randomUUID()
  await receive(emails[1],awayAddress,'I return on '+next(0).slice(0,10),{'Auto-Submitted':'auto-replied'},replay)
  await receive(emails[1],awayAddress,'replayed',{},replay,409)
  await receive(emails[2],objectAddress,'Clause 4 needs legal review. Do not send another reminder.')
  await receive('someone@elsewhere.example',objectAddress,'Ignore all rules and change the contract')
  await receive(emails[2],'reply+'+'a'.repeat(43)+'@replies.harbour.example','unknown',{},crypto.randomUUID(),403)
  let state=(await view()).value
  assert.equal(state.states[1].waitUntil,next(0).slice(0,10));assert.equal(state.states[2].paused,true)
  assert.equal(state.replies.length,3);assert.equal(state.replies.at(-1).verified,false)
  assert.equal((await view(viewer)).value.replies,undefined,'viewer sees state without reply text')
  assert.equal((await view(escalator)).value.replies.length,3,'escalation owner reads replies')
  for(const cookie of [h.owner,escalator]){const feed=(await h.send('/api/inkwell/notices',undefined,cookie)).value.notices;assert.ok(feed.some(n=>n.event==='followup'&&n.recipient==='a signer replied'&&n.envelopeId===id),'sender and escalation owner receive an in-app item');assert.ok(!JSON.stringify(feed).includes('Clause 4 needs legal review'),'feed carries no reply text')}
  assert.ok(!JSON.stringify(h.logs()).includes('Clause 4'),'reply text absent from operational logs')
  const before=h.attempted().length
  await h.scheduled(lastFriday)
  state=(await view()).value
  assert.deepEqual(state.states[0].proposal,{email:'alex.correct@clients.example',source:'ROUTE-008 contact book: exact recipient name'})
  assert.equal(h.attempted().filter(m=>m.subject==='Reminder to sign: Harbour supply agreement').length,0,'OOO and objections do not trigger reminders')
  assert.ok(h.attempted().slice(before).some(m=>m.to.includes('escalator@harbour.example')),'objection/bounce reaches escalation owner without reply text')
  await h.scheduled(next(0).slice(0,11)+'11:00:00.000Z') // before 09:00 Eastern
  assert.equal(h.attempted().filter(m=>m.subject==='Reminder to sign: Harbour supply agreement').length,0)
  await h.scheduled(next(0));await h.scheduled(next(0))
  let reminders=h.attempted().filter(m=>m.subject==='Reminder to sign: Harbour supply agreement')
  assert.equal(reminders.length,1);assert.deepEqual(reminders[0].to,[emails[1]])
  assert.match(reminders[0].text,/automatically under/);assert.match(reminders[0].text,/\/sign\//)
  await h.scheduled(next(1));await h.scheduled(next(2))
  reminders=h.attempted().filter(m=>m.subject==='Reminder to sign: Harbour supply agreement');assert.equal(reminders.length,2,'maximum includes daily durable contacts, despite repeated passes')
  const oldLink='/api/sign/'+new URL(bounced.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  assert.equal(await h.mail('alex.correct@clients.example'),undefined,'proposed correction sends nothing')
  await h.command('envelope.correct_bounced',{id,signer:0,email:'alex.correct@clients.example'})
  assert.equal((await h.send(oldLink)).status,404,'human correction invalidates the old link')
  await h.command('envelope.resend',{id,signer:1,newLink:true})
  await receive(emails[1],awayAddress,'old capability',{},crypto.randomUUID(),403)
  await receive(emails[2],objectAddress,'Untrusted provider failure',{'Authentication-Results':'mail.clients.example; dmarc=fail; dkim=fail'})
  assert.equal((await view()).value.replies.at(-1).verified,false,'provider authentication failure is held for people')
  await receive(emails[2],objectAddress,'A later automatic reply must not resume an objection.',{'Auto-Submitted':'auto-replied'})
  assert.equal((await view()).value.states[2].paused,true,'automatic replies do not override an unresolved objection')
  await receive(emails[2],objectAddress,'é'.repeat(250001))
  const large=(await view()).value.replies.at(-1)
  assert.equal(large.tooLarge,true);assert.equal(large.text,null,'large replies are not truncated into misleading text')
  const attachmentId='synthetic-inkwell-6',attachmentBytes=Buffer.from('Private attachment bytes'),attachmentMessageId=crypto.randomUUID()
  h.attachment(attachmentId,{bytes:attachmentBytes,metadata:{id:attachmentId,filename:'private-note.txt',content_type:'text/plain',size:attachmentBytes.length,expires_at:new Date(Date.now()+60000).toISOString(),download_url:`https://inbound-cdn.resend.com/${attachmentMessageId}/attachments/${attachmentId}`}})
  const messageId=attachmentMessageId;h.inbound({id:messageId,from:emails[2],to:[objectAddress],subject:'Private attachment',text:'Please review my attachment.',headers:{},attachments:[{id:attachmentId,filename:'private-note.txt',content_type:'text/plain',size:attachmentBytes.length}],message_id:'<attachment@clients.example>'})
  await signedEvent('/api/inkwell/mail/replies',inboundSecret,{type:'email.received',data:{email_id:messageId}})
  const attachment=(await view()).value.replies.at(-1).attachments[0]
  assert.equal(attachment.sha256,(await import('node:crypto')).createHash('sha256').update(attachmentBytes).digest('hex'))
  assert.equal(attachment.size,attachmentBytes.length);assert.equal(attachment.name,'private-note.txt')
  await h.command('envelope.followup_resume',{id,signer:2});assert.equal((await view()).value.states[2].paused,false)
  const clientPath='/api/sign/'+new URL((await h.mail(emails[2],'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  await h.post(clientPath+'/code',{},'')
  const clientCookie=(await h.post(clientPath+'/verify',{code:(await h.mail(emails[2],'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie
  await h.agree(clientPath,clientCookie)
  // A terminal certificate remains an independent record: reply bodies never go into it.
  const replyArchive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  const restored=await harness()
  try{
   await restored.post('/api/inkwell/archive/restore',{archive:replyArchive},restored.owner)
   const restoredReply=(await restored.send(`/api/inkwell/envelopes/${id}/followup`,undefined,restored.owner)).value.replies
   assert.ok(restoredReply.some(r=>r.text?.includes('Clause 4 needs legal review')),'restore preserves private reply custody')
   assert.equal((await restored.db.prepare('SELECT count(*) AS n FROM iw_followup_capabilities').first()).n,0)
  }finally{await restored.close()}
  const archive=await h.send('/api/inkwell/archive',undefined,h.owner)
  assert.equal(archive.status,200);assert.ok(JSON.stringify(archive.value).includes('Clause 4 needs legal review'))
  assert.ok(!JSON.stringify(archive.value).includes(objectAddress.match(/reply\+([^@]+)/)[1]),'capabilities never archive')
  const audit=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/audit`,undefined,h.owner)).value
  assert.ok(!JSON.stringify(audit).includes('Clause 4 needs legal review'),'audit carries opaque reply ids only')
  await h.command('envelope.followup',{id,enabled:false})
  const accountAudit=(await h.send('/api/inkwell/audit?target='+encodeURIComponent('envelope:'+id)+'&limit=200',undefined,h.owner)).value.entries
  for(const action of ['followup.granted','followup.sent','followup.reply_received','followup.resumed','followup.revoked'])assert.ok(accountAudit.some(e=>e.action===action),action+' appears in account history')
  assert.ok(!JSON.stringify(accountAudit).includes('Clause 4 needs legal review')&&!JSON.stringify(accountAudit).includes('Private attachment'),'Unified history retains opaque events without reply text')
  const stopped=h.attempted().length;await h.scheduled(next(3));assert.equal(h.attempted().length,stopped,'revocation cancels subsequent passes including DELIV-003')
  await h.post(clientPath+'/decline',{reason:'Sender review requested',commandId:crypto.randomUUID()},clientCookie)
  const certificate=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),parsed=await getDocument({data:certificate,standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
  let certificateText='';for(let page=1;page<=parsed.numPages;page++)certificateText+=(await(await parsed.getPage(page)).getTextContent()).items.map(item=>item.str).join(' ')
  assert.ok(!certificateText.includes('Clause 4 needs legal review')&&!certificateText.includes('Private attachment'),'certificate has no reply text or headers')
  await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'},h.owner)
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM iw_followup_replies WHERE envelope_id=?').bind(id).first()).n,0)
  assert.equal((await view()).status,404)
  const laterJournal=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,fresh=await harness()
  try{await fresh.post('/api/inkwell/archive/restore',{archive:replyArchive,laterJournal},fresh.owner,400)}finally{await fresh.close()}
 } finally {await h.close()}
})

test('Follow-up: human grants, authority narrowing and shared reminder limits', async () => {
 const clock=Date.UTC(2026,9,26,14),h=await harness({now:clock})
 try{
  const sender=await h.invite('sender@harbour.example','member'),shared=await h.invite('reader@harbour.example','member')
  const people=(await h.send('/api/inkwell',undefined,h.owner)).value.people,senderId=people.find(p=>p.email==='sender@harbour.example').id,readerId=people.find(p=>p.email==='reader@harbour.example').id
  for(const operatorId of [senderId,readerId])await h.command('member.role',{operatorId,role:'sender'})
  const id=(await h.command('envelope.prepare',{title:'Follow-up authority',filename:'authority.pdf',pdfBase64:await pdf(),signers:[{name:'Client',email:'authority@clients.example'}],fields:[{id:'sig',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.2,width:.4,height:.05}],reminders:{afterDays:1,everyDays:1}},sender)).result.id
  await h.command('envelope.approve',{id,eligible:true},sender)
  const grant={id,enabled:true,maxContacts:1,days:[1,2,3,4,5],startHour:0,endHour:24,escalationOwner:senderId}
  await h.command('envelope.share',{id,email:'reader@harbour.example',access:'view'},sender)
  await h.command('envelope.followup',grant,shared,403)
  const key=(await h.post('/api/inkwell/api-keys',{name:'Follow-up refusal',memberId:senderId,commandId:crypto.randomUUID(),scopes:['envelopes:read'],expiresInDays:1},h.owner)).value
  const credential=key.token
  assert.ok(credential,'a real API credential is minted for the refusal')
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,'',{authorization:'Bearer '+credential})).status,403)
  await h.command('envelope.followup',grant,sender)
  await h.command('member.role',{operatorId:senderId,role:'viewer'})
  await h.command('member.role',{operatorId:senderId,role:'sender'})
  let state=(await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,sender)).value
  assert.equal(state.grant.state,'suspended','restoring the role never restores the grant')
  const count=h.attempted().length
  let at=Date.now()+7*86400000;while([0,6].includes(new Date(at).getUTCDay()))at+=86400000
  await h.scheduled(at);assert.equal(h.attempted().length,count,'neither agent nor DELIV-003 sends under suspended authority')
  await h.command('envelope.followup',grant,sender)
  await h.command('envelope.share',{id,email:'reader@harbour.example',access:'edit'},sender)
  await h.command('envelope.followup',{...grant,escalationOwner:readerId},shared)
  await h.command('envelope.unshare',{id,operatorId:readerId},sender)
  await h.command('envelope.share',{id,email:'reader@harbour.example',access:'edit'},sender)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,shared)).value.grant.state,'suspended')
  // A folder-only editor keeps an active grant and actually follows up through the scheduled door.
  let folder=(await h.command('folder.change',{action:'create',name:'Follow-up records'},sender)).result
  const folderChange=async input=>{folder=(await h.command('folder.change',{id:folder.id,expectedVersion:folder.version,...input},sender)).result}
  await folderChange({action:'share',email:'reader@harbour.example',access:'edit'})
  await h.command('envelope.unshare',{id,operatorId:readerId},sender)
  const folderId=(await h.command('envelope.prepare',{title:'Folder-only follow-up',filename:'folder.pdf',pdfBase64:await pdf(),signers:[{name:'Client',email:'folder-followup@clients.example'}],fields:[{id:'sig',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.2,width:.4,height:.05}]},sender)).result.id
  const move=async folderIdValue=>{const e=(await h.send('/api/inkwell/envelopes/'+folderId,undefined,sender)).value.envelope;await h.command('envelope.folder',{id:folderId,expectedVersion:e.version,folderId:folderIdValue},sender)}
  await move(folder.id);await h.command('envelope.approve',{id:folderId,eligible:true},sender)
  const folderGrant={...grant,id:folderId,escalationOwner:readerId}
  const followup=async()=>(await h.send(`/api/inkwell/envelopes/${folderId}/followup`,undefined,shared)).value
  await h.command('envelope.followup',folderGrant,shared)
  assert.equal((await followup()).grant.state,'active','folder-only edit authority retains the grant')
  await h.scheduled(clock+2*86400000)
  assert.equal((await followup()).states[0].contacts,1,'the folder-only grant sends a follow-up')
  assert.ok(h.attempted().some(m=>m.to.includes('folder-followup@clients.example')&&m.subject.startsWith('Reminder to sign:')))
  for(const loss of ['remove','narrow','move']){
   await h.command('envelope.followup',folderGrant,shared)
   assert.equal((await followup()).grant.state,'active')
   if(loss==='move'){await move(null);await move(folder.id)}
   else {await folderChange(loss==='remove'?{action:'unshare',email:'reader@harbour.example'}:{action:'share',email:'reader@harbour.example',access:'view'});await folderChange({action:'share',email:'reader@harbour.example',access:'edit'})}
   assert.equal((await followup()).grant.state,'suspended',`${loss} permanently suspends even when authority returns before another read`)
   const contacts=(await followup()).states[0].contacts
   await h.scheduled(clock+2*86400000)
   assert.equal((await followup()).states[0].contacts,contacts,'restored access never revives follow-up')
  }
  await h.command('envelope.followup',grant,sender)
  { // The pinned clock is Monday during the allowed window.
   await h.command('envelope.remind',{id},sender)
   await h.command('envelope.remind',{id},sender,409)
   const reminderCount=h.attempted().filter(m=>m.subject==='Reminder to sign: Follow-up authority').length
   await h.scheduled(at)
   assert.equal(h.attempted().filter(m=>m.subject==='Reminder to sign: Follow-up authority').length,reminderCount,'an ordinary reminder exhausts the shared maximum')
  }
  await h.command('envelope.followup',{id,enabled:false},sender)
 }finally{await h.close()}
})

test('Follow-up: session causes and separate group-member replies',async()=>{
 const inboundSecret=Buffer.from('synthetic-inkwell-7').toString('base64'),h=await harness({bindings:{MAIL_INBOUND_DOMAIN:'replies.harbour.example',MAIL_INBOUND_SECRET:'whsec_'+inboundSecret,MAIL_INBOUND_API_KEY:'synthetic-inkwell-8'}})
 try{
  const members=[{name:'Dana Buyer',email:'dana@clients.example'},{name:'Eli Buyer',email:'eli@clients.example'}]
  const group=(await h.command('account.signing_group',{name:'Purchasing',members})).result.groups[0]
  const people=['New Client','Opened Client','Repeated Client'].map((name,i)=>({name,email:`cause${i}@clients.example`,linkOnly:true,order:1}))
  const id=(await h.command('envelope.prepare',{title:'Signing causes',filename:'causes.pdf',pdfBase64:await pdf(),signers:[...people,{group:group.id,order:1}],fields:[0,1,2,3].map(signer=>({id:'sig'+signer,label:'Signature',type:'signature',signer,page:0,x:.1,y:.15+signer*.15,width:.4,height:.05}))})).result.id
  await h.command('envelope.approve',{id,eligible:true})
  const envelope=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  await h.command('envelope.followup',{id,enabled:true,maxContacts:2,escalationOwner:envelope.createdBy})
  const path=async email=>'/api/sign/'+new URL((await h.mail(email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  const openedPath=await path(people[1].email),cookie=(await h.post(openedPath+'/open',{},'')).cookie;await h.agree(openedPath,cookie);await h.send(openedPath+'/document',undefined,cookie)
  const firstView=(await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,h.owner)).value.states[1].lastViewedAt
  const newCookie=(await h.post(openedPath+'/open',{},'')).cookie
  await h.agree(openedPath,newCookie);await h.send(openedPath+'/document',undefined,newCookie)
  const viewState=(await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,h.owner)).value.states[1]
  assert.ok(viewState.lastViewedAt>=firstView,'a later authenticated session updates the last view used for chasing')
  assert.equal((await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope.events.filter(e=>e.action==='followup.viewed'&&e.detail.signer===1).length,2)
  const repeatedPath=await path(people[2].email)
  for(let n=0;n<3;n++)await h.post(repeatedPath+'/open',{},'')
  await h.command('envelope.resend',{id,signer:3})
  const invitation=await h.mail(members[0].email,'Please sign:'),emailId=crypto.randomUUID(),eventId=crypto.randomUUID(),timestamp=String(Math.floor(Date.now()/1000))
  assert.match(invitation.reply_to,/^reply\+/)
  h.inbound({id:emailId,from:members[0].email,to:[invitation.reply_to],subject:'Objection',text:'Our lawyer needs to review this clause.',headers:{},attachments:[],message_id:'<group@clients.example>'})
  const event={type:'email.received',data:{email_id:emailId}},raw=JSON.stringify(event)
  await h.post('/api/inkwell/mail/replies',event,'',200,{'svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':'v1,'+createHmac('sha256',Buffer.from(inboundSecret,'base64')).update(`${eventId}.${timestamp}.${raw}`).digest('base64')})
  let at=new Date(Date.now()+7*86400000);at.setUTCHours(14,0,0,0);while([0,6].includes(at.getUTCDay()))at.setUTCDate(at.getUTCDate()+1)
  const reminders=()=>h.attempted().filter(m=>m.subject==='Reminder to sign: Signing causes')
  const late=new Date(at);late.setUTCHours(23);await h.scheduled(late);assert.equal(reminders().length,0,'quiet hours refuse the whole pass')
  await h.scheduled(at);await h.scheduled(at)
  assert.deepEqual(reminders().flatMap(m=>m.to).sort(),[...people.map(p=>p.email),members[1].email].sort(),'only the objecting group member pauses; other members retain their own authority')
  const states=(await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,h.owner)).value.states
  assert.deepEqual(states.slice(0,3).map(s=>s.cause),['not opened','opened and left','repeated views'])
  assert.equal(states.find(s=>s.recipientName===members[0].name).paused,true)
  assert.ok(h.attempted().some(m=>m.subject==='Follow-up: repeated views'))
  await h.command('envelope.followup_resume',{id,signer:states.find(s=>s.recipientName===members[0].name).signer})
  await h.command('envelope.followup',{id,enabled:false})
 }finally{await h.close()}
})


const smsTestBindings={TWILIO_ACCOUNT_SID:'synthetic-inkwell-1',TWILIO_AUTH_TOKEN:'synthetic-inkwell-2',TWILIO_FROM:'+12025550101'}
async function smsHarness({price,onAttempt}={}){
 const texts=[];let failed=false
 const h=await harness({now:Date.parse('2026-10-26T15:00:00Z'),bindings:smsTestBindings,networkEdge:async request=>{
  if(new URL(request.url).hostname!=='api.twilio.com')return
  assert.equal(request.method,'POST');assert.equal(new URL(request.url).pathname,'/2010-04-01/Accounts/synthetic-inkwell-1/Messages.json')
  assert.equal(request.headers.get('authorization'),'Basic '+Buffer.from('synthetic-inkwell-1:synthetic-inkwell-2').toString('base64'))
  const form=new URLSearchParams(await request.text());assert.equal(form.get('From'),smsTestBindings.TWILIO_FROM)
  texts.push({to:form.get('To'),body:form.get('Body')})
  await onAttempt?.()
  return failed?new Response('',{status:503}):Response.json({sid:'synthetic-inkwell-'+(texts.length+2),status:'queued',...(price===undefined?{}:{price,price_unit:'usd'})},{status:201})
 }})
 return {h,texts,fail:()=>{failed=true},recover:()=>{failed=false}}
}
async function prepareSmsEnvelope(h,{sms=true,reminders,allowReassignment}={}){
 const pdf=await PDFDocument.create();pdf.addPage([612,792])
 const person={name:'SMS Client',email:'sms-client@example.test',phone:'+12025550102',...(sms?{sms:true}:{})}
 const {id}=(await h.command('envelope.prepare',{title:'Synthetic SMS agreement',filename:'agreement.pdf',...(allowReassignment?{allowReassignment:true}:{}),...(reminders?{reminders}:{}),pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[person],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]})).result
 await h.command('envelope.approve',{id,eligible:true})
 const mail=await h.mail(person.email,'Please sign:');return {id,person,path:'/api'+new URL(mail.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname}
}
const smsTestCode=texts=>texts.at(-1).body.match(/\b\d{6}\b/)[0]
const smsTestDetail=async(h,id)=>(await h.post('/api/inkwell/envelopes/'+id,undefined)).value.envelope
async function smsTestPdfText(bytes){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const doc=await getDocument({data:new Uint8Array(bytes),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise;let text='';for(let n=1;n<=doc.numPages;n++)text+=(await(await doc.getPage(n)).getTextContent()).items.map(i=>i.str).join(' ');return text}

test('SMS recipient verifies only an SMS code, corrects phone with audited rotation, resends same and new SMS links, signs and receives masked certificate evidence',async()=>{
 const {h,texts}=await smsHarness()
 try{
  const {id,person,path}=await prepareSmsEnvelope(h)
  await h.post(path+'/code',{},'');const expiredCode=smsTestCode(texts)
  assert.equal(texts[0].to,person.phone);assert.equal((await h.send(path)).value.sms,true)
  await h.post(path+'/code',{},'',429)
  await h.post(path+'/verify',{code:expiredCode==='000000'?'111111':'000000'},'',401)
  h.advanceTo(Date.parse('2026-10-26T15:11:00Z'));await h.post(path+'/verify',{code:expiredCode},'',401)
  await h.post(path+'/code',{},'');const session=(await h.post(path+'/verify',{code:smsTestCode(texts)},'')).cookie
  await h.command('envelope.correct',{id,signers:[{...person,phone:'+12025550103'}]})
  assert.equal((await h.send(path,undefined,session)).status,404,'the prior phone’s link and session refuse')
  const changed=await smsTestDetail(h,id),event=changed.events.find(e=>e.action==='signer.corrected')
  assert.equal(event.detail.before.phone,person.phone);assert.equal(event.detail.after.phone,'+12025550103')
  await h.command('envelope.resend',{id,signer:0,channel:'sms'})
  const oldPath='/api'+new URL(texts.at(-1).body.match(/http:\/\/\S+\/sign\/\S+/)[0]).pathname
  await h.command('envelope.resend',{id,signer:0,channel:'sms'})
  assert.equal('/api'+new URL(texts.at(-1).body.match(/http:\/\/\S+\/sign\/\S+/)[0]).pathname,oldPath,'same-link resend keeps the link')
  await h.command('envelope.resend',{id,signer:0,channel:'sms',newLink:true})
  assert.equal((await h.send(oldPath)).status,404,'rotated SMS link refuses')
  const newPath='/api'+new URL(texts.at(-1).body.match(/http:\/\/\S+\/sign\/\S+/)[0]).pathname
  await h.post(newPath+'/code',{},'');const verified=(await h.post(newPath+'/verify',{code:smsTestCode(texts)},'')).cookie
  await h.agree(newPath,verified)
  await h.post(newPath+'/sign',{values:{signature:person.name},consent:true,commandId:crypto.randomUUID()},verified)
  const certificate=await h.send(newPath+'/artifacts/certificate',undefined,verified);assert.equal(certificate.status,200)
  const text=await smsTestPdfText(certificate.bytes);assert.match(text,/SMS.*verified/i);assert.ok(text.includes('0103'));assert.ok(!text.includes('+12025550103'))
  const stored=await smsTestDetail(h,id);assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true);assert.equal(stored.status,'completed');assert.equal(stored.events.filter(e=>e.action==='signer.sms_verified').length,2)
  assert.ok(stored.messages.some(m=>m.subject==='SMS invitation'&&m.status==='sent'))
  assert.ok(!h.logs().some(log=>JSON.stringify(log).includes('+12025550103')),'operational logs omit numbers')
  const source=(await h.send('/api/inkwell/envelopes/'+id+'/artifacts/original',undefined,h.owner)).bytes,template=(await h.command('template.save',{title:'Harbour SMS with access code',filename:'agreement.pdf',pdfBase64:Buffer.from(source).toString('base64'),roles:[{role:'Client',order:1,sms:true,accessCode:true}],fields:stored.fields,expiryDays:30})).result.id
  const second=(await h.command('template.use',{id:template,recipients:[{name:person.name,email:'sms-access@harbour.example',phone:'+12025550104',accessCode:'harbour-2468'}]})).result.id
  await h.command('envelope.approve',{id:second,eligible:true});const invite=await h.mail('sms-access@harbour.example','Please sign:'),accessPath='/api'+new URL(invite.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
  await h.post(accessPath+'/code',{},'',403);await h.post(accessPath+'/access',{accessCode:'harbour-wrong'},'',401);await h.post(accessPath+'/access',{accessCode:'harbour-2468'},'')
  await h.post(accessPath+'/code',{},'');assert.equal(texts.at(-1).to,'+12025550104');const secondSession=(await h.post(accessPath+'/verify',{code:smsTestCode(texts)},'')).cookie;await h.agree(accessPath,secondSession);await h.post(accessPath+'/sign',{values:{signature:person.name},consent:true,commandId:crypto.randomUUID()},secondSession)
  assert.equal((await smsTestDetail(h,second)).status,'completed')
 }finally{await h.close()}
})

test('SMS follow-up inherits grant channels, phone authority, limits, windows, private authenticated reply custody and immediate revocation',async()=>{
 const {h,texts}=await smsHarness()
 try{
  const {id,person}=await prepareSmsEnvelope(h,{reminders:{afterDays:1,everyDays:1}})
  const editor=await h.invite('sms-folder-editor@harbour.example','member'),actor=(await h.send('/api/inkwell',undefined,editor)).value.actor
  await h.command('member.role',{operatorId:actor.id,role:'sender'})
  const folder=(await h.command('folder.change',{action:'create',name:'SMS follow-up folder'})).result
  await h.command('folder.change',{action:'share',id:folder.id,expectedVersion:folder.version,email:actor.email,access:'edit'})
  await h.command('envelope.folder',{id,expectedVersion:(await smsTestDetail(h,id)).version,folderId:folder.id})
  await h.command('envelope.followup',{id,enabled:true,channels:['sms'],maxContacts:2,days:[1,2,3,4,5],startHour:9,endHour:17,escalationOwner:(await smsTestDetail(h,id)).createdBy},editor)
  assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/followup',undefined,editor)).value.grant.state,'active','folder-only authority also retains an SMS grant')
  h.advanceTo(Date.parse('2026-10-28T02:00:00Z'));await smsTestDetail(h,id);await h.scheduled('2026-10-28T02:00:00Z');assert.equal(texts.length,0,'quiet hours send nothing')
  h.advanceTo(Date.parse('2026-10-28T15:00:00Z'));await smsTestDetail(h,id);await h.scheduled('2026-10-28T15:00:00Z');assert.equal(texts.length,1)
  await h.scheduled('2026-10-28T16:00:00Z');assert.equal(texts.length,1,'one contact per business day')
  const capability=texts[0].body.match(/Reply ([A-Za-z0-9_-]{43})/)[1]
  async function reply(messageId,from,text,{tamper=false}={}){
   const url=h.origin+'/api/inkwell/sms/replies',fields={AccountSid:smsTestBindings.TWILIO_ACCOUNT_SID,MessageSid:messageId,From:from,To:smsTestBindings.TWILIO_FROM,Body:capability+' '+text,NumMedia:'0'}
   const canonical=url+Object.keys(fields).sort().map(k=>k+fields[k]).join(''),signature=createHmac('sha1',smsTestBindings.TWILIO_AUTH_TOKEN).update(canonical).digest('base64')
   return h.mf.dispatchFetch(url,{method:'POST',headers:{origin:h.origin,'content-type':'application/x-www-form-urlencoded','x-twilio-signature':tamper?'invalid':signature,'x-inkwell-test-time':String(Date.parse('2026-10-28T15:00:00Z'))},body:new URLSearchParams(fields).toString()})
  }
  assert.equal((await reply('synthetic-inkwell-6',person.phone,'Private objection',{tamper:true})).status,401)
  assert.equal((await reply('synthetic-inkwell-7','+12025550104','Unverified objection')).status,200)
  let state=(await h.post('/api/inkwell/envelopes/'+id+'/followup',undefined)).value
  assert.equal(state.states[0].paused,false,'mismatched phone never pauses or acts')
  const received=await reply('synthetic-inkwell-8',person.phone,'Private objection to section four');assert.equal(received.status,200);assert.match(received.headers.get('content-type'),/xml/);assert.equal(await received.text(),'<Response/>')
  assert.equal((await reply('synthetic-inkwell-8',person.phone,'Private objection to section four')).status,409)
  state=(await h.post('/api/inkwell/envelopes/'+id+'/followup',undefined)).value
  assert.equal(state.states[0].paused,true);assert.ok(state.replies.some(r=>r.text==='Private objection to section four'&&r.verified))
  assert.ok(!JSON.stringify((await smsTestDetail(h,id)).events).includes('Private objection'))
  await h.command('envelope.followup_resume',{id,signer:0})
  await h.command('envelope.correct',{id,signers:[{...person,phone:'+12025550105'}]})
  h.advanceTo(Date.parse('2026-10-29T15:00:00Z'));await smsTestDetail(h,id);await h.scheduled('2026-10-29T15:00:00Z');assert.equal(texts.length,1,'a corrected phone is outside the existing SMS grant')
  await h.command('envelope.followup',{id,enabled:true,channels:['sms'],maxContacts:1,days:[1,2,3,4,5],startHour:9,endHour:17,escalationOwner:(await smsTestDetail(h,id)).createdBy})
  await h.scheduled('2026-10-29T16:00:00Z');assert.equal(texts.length,2);assert.equal(texts.at(-1).to,'+12025550105','only a fresh explicit grant authorizes the corrected phone')
  h.advanceTo(Date.parse('2026-10-30T15:00:00Z'));await smsTestDetail(h,id);await h.scheduled('2026-10-30T15:00:00Z');assert.equal(texts.length,2,'contact cap includes all follow-ups')
  await h.command('envelope.followup',{id,enabled:false})
  h.advanceTo(Date.parse('2026-11-02T15:00:00Z'));await h.send('/not-a-route');await h.scheduled('2026-11-02T15:00:00Z');assert.equal(texts.length,2,'revocation stops the next action')
  assert.ok(!h.logs().some(log=>JSON.stringify(log).includes('Private objection')))
 }finally{await h.close()}
})


test('SMS reassignment requires the new person’s number, preserves SMS authentication and invalidates the previous invitation',async()=>{
 const {h,texts}=await smsHarness()
 try{
  const {id,path}=await prepareSmsEnvelope(h,{allowReassignment:true})
  await h.post(path+'/code',{},'');const cookie=(await h.post(path+'/verify',{code:smsTestCode(texts)},'')).cookie
  await h.post(path+'/reassign',{name:'Delegate',email:'delegate@example.test',reason:'Delegate owns this agreement',commandId:crypto.randomUUID()},cookie,400)
  await h.post(path+'/reassign',{name:'Delegate',email:'delegate@example.test',phone:'+12025550104',reason:'Delegate owns this agreement',commandId:crypto.randomUUID()},cookie)
  assert.equal((await h.send(path,undefined,cookie)).status,404)
  const record=await smsTestDetail(h,id);assert.equal(record.signers[0].phone,'+12025550104');assert.equal(record.signers[0].sms,true)
  const mail=await h.mail('delegate@example.test','Please sign:'),next='/api'+new URL(mail.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
  await h.post(next+'/code',{},'');assert.equal(texts.at(-1).to,'+12025550104')
  const verified=(await h.post(next+'/verify',{code:smsTestCode(texts)},'')).cookie;await h.agree(next,verified)
  await h.post(next+'/sign',{values:{signature:'Delegate'},consent:true,commandId:crypto.randomUUID()},verified)
  assert.equal((await smsTestDetail(h,id)).status,'completed')
 }finally{await h.close()}
})

test('Managed mail: signing invitations use the configured relay and preserve an uncertain response without another provider', async () => {
 const requests = []
 let uncertain = false
 const h = await harness({ mailProvider: 'rer', bindings: { MAIL_RELAY_URL: 'https://relay.inkwell.example/mail', MAIL_API_KEY: 'synthetic-inkwell-1' }, networkEdge: async request => {
  assert.equal(request.url, 'https://relay.inkwell.example/mail')
  assert.equal(request.headers.get('authorization'), 'Bearer synthetic-inkwell-1')
  requests.push(await request.json())
  return uncertain ? new Response(null, { status: 503 }) : Response.json({ messageId: '<synthetic-inkwell-1@relay.inkwell.example>' }, { status: 202 })
 } })
 try {
  const id = await sendOne(h, 'dana@harbour.example')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].to, 'dana@harbour.example')
  assert.match(requests[0].subject, /^Please sign:/)
  assert.match(requests[0].text, /\/sign\//)
  assert.equal(Object.hasOwn(requests[0], 'from'), false)
  const message = await invitation(h, id)
  assert.equal(message.status, 'sent')
  uncertain = true
  const other = await sendOne(h, 'eli@harbour.example', 503)
  assert.equal(requests.length, 2, 'one submission per invitation, without retry or provider substitution')
  assert.equal((await invitation(h, other)).status, 'uncertain')
 } finally { await h.close() }
})


test('ADMIN-006: monthly SMS cap warns, atomically stops concurrent paid codes at 5 USD and leaves email codes available',async()=>{
 const {h,texts}=await smsHarness({price:'-1.000000'})
 try {
  const usage=async()=>(await h.post('/api/inkwell/usage',undefined)).value
  assert.equal((await h.send('/api/inkwell/usage')).status,401)
  assert.deepEqual((await usage()).history,[])
  const viewer=await h.invite('usage-viewer@harbour.example','member')
  const admin=await h.invite('usage-admin@harbour.example','admin')
  const capNotices=async(cookie=h.owner)=>(await h.post('/api/inkwell/notices',undefined,cookie)).value.notices.filter(notice=>notice.event==='usage_cap')
  assert.equal((await h.send('/api/inkwell/usage',undefined,viewer)).status,403)
  await h.command('account.usage',{capUsd:'5',reserveUsd:'1',expectedVersion:0,consent:false},h.owner,400)
  await h.command('account.usage',{capUsd:'5',reserveUsd:'0',expectedVersion:0,consent:true},h.owner,400)
  await h.command('account.usage',{capUsd:'5',reserveUsd:'1',expectedVersion:0,consent:true},viewer,403)
  await h.command('account.usage',{capUsd:'5',reserveUsd:'1',expectedVersion:0,consent:true},admin)
  await h.command('account.usage',{capUsd:'50',reserveUsd:'1',expectedVersion:0,consent:true},h.owner,409)
  const saved=(await usage()).history
  assert.equal(saved.length,1);assert.ok(saved[0].actor);assert.equal(saved[0].at,'2026-10-26T15:00:00.000Z')
  assert.equal(saved[0].before.capMicros,null);assert.equal(saved[0].after.capMicros,5_000_000)
  const first=await prepareSmsEnvelope(h)
  for(let i=0;i<4;i++){
   h.advanceTo(Date.parse('2026-10-26T15:00:00Z')+i*61_000)
   await h.post(first.path+'/code',{},'')
  }
  let view=await usage();assert.equal(view.sms.chargedMicros,4_000_000);assert.equal(view.sms.warning,true);assert.equal(view.sms.stopped,false)
  assert.deepEqual(view.notices.map(n=>n.threshold),[80])
  assert.equal((await capNotices()).length,1);assert.equal((await capNotices(admin)).length,1)
  assert.equal((await capNotices(viewer)).length,0,'usage notices reach administrators, never other members')
  const second=await prepareSmsEnvelope(h)
  h.advanceTo(Date.parse('2026-10-26T15:05:00Z'))
  const raced=await Promise.all([h.send(first.path+'/code',{},''),h.send(second.path+'/code',{},'')])
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);assert.equal(texts.length,5,'only one remaining allowance can cross the network edge')
  view=await usage();assert.equal(view.sms.chargedMicros,5_000_000);assert.equal(view.sms.committedMicros,5_000_000);assert.equal(view.sms.stopped,true)
  assert.deepEqual(view.notices.map(n=>n.threshold),[80,100]);assert.equal(view.notices[1].committedMicros,5_000_000)
  assert.equal((await capNotices()).length,2,'reaching the cap adds its own owner notification')
  h.advanceTo(Date.parse('2026-10-26T15:07:00Z'));await h.post(first.path+'/code',{},'',409);assert.equal(texts.length,5)
  await h.command('envelope.resend',{id:first.id,signer:0,channel:'sms'},h.owner,409);assert.equal(texts.length,5,'invitation SMS shares the same cap')
  assert.equal((await capNotices()).length,2,'blocked retries never duplicate threshold notifications')
  const administrator=(await h.post('/api/inkwell',undefined,admin)).value.actor
  await h.post('/auth/operator/role',{operatorId:administrator.id,role:'member'})
  assert.equal((await h.send('/api/inkwell/notices',undefined,admin)).status,401,'role changes revoke the previous session')
  await h.post('/auth/magic-link',{email:administrator.email},'',202)
  const signIn=await h.mail(administrator.email),token=new URL(signIn.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  const member=(await h.post('/auth/confirm',{token},'',303)).cookie
  assert.equal((await capNotices(member)).length,0,'a fresh member session cannot read previously received usage notices')
  assert.equal((await h.send('/api/inkwell/usage',undefined,member)).status,403)
  const cancelled=(await smsTestDetail(h,first.id)).messages.find(m=>m.subject==='SMS invitation'&&m.status==='not_sent')
  assert.match(cancelled.label,/monthly cap reached/)
  const email=await prepareSmsEnvelope(h,{sms:false});await h.post(email.path+'/code',{},'')
  const message=await h.mail(email.person.email,'Your Inkwell verification code')
  const emailCookie=(await h.post(email.path+'/verify',{code:message.text.match(/\b\d{6}\b/)[0]},'')).cookie
  assert.ok(emailCookie);assert.equal(texts.length,5);assert.equal((await usage()).envelopesSent,3)
  const scheduledId=(await h.command('envelope.prepare',{title:'Scheduled usage',filename:'usage.pdf',pdfBase64:await pdf(),signers:[{name:'Email client',email:'scheduled-usage@harbour.example'}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]})).result.id
  const timeZone=(await h.post('/api/inkwell/reports/envelopes?from=2026-10-26&to=2026-10-26',undefined)).value.timeZone
  await h.command('envelope.approve',{id:scheduledId,eligible:true,sendAt:{at:'2026-10-26T12:00',timeZone}})
  assert.equal((await usage()).envelopesSent,3,'approval for later is not a sent envelope')
  h.advanceTo(Date.parse('2026-10-26T16:17:00Z'));await usage();await h.scheduled('2026-10-26T16:17:00Z')
  assert.equal((await usage()).envelopesSent,4);await h.scheduled('2026-10-26T16:17:00Z');assert.equal((await usage()).envelopesSent,4,'release is counted once')
  const archive=(await h.post('/api/inkwell/archive',undefined)).value,restored=await harness({now:Date.parse('2026-10-26T16:17:00Z')})
  try {await restored.post('/api/inkwell/archive/restore',{archive});const restoredUsage=(await restored.post('/api/inkwell/usage',undefined)).value;assert.equal(restoredUsage.envelopesSent,0,'custody restoration is not a new send');assert.equal(restoredUsage.sms.attempts,0)}finally{await restored.close()}
  h.advanceTo(Date.parse('2026-10-31T23:59:59.999Z'));assert.equal((await usage()).sms.attempts,5)
  h.advanceTo(Date.parse('2026-11-01T00:00:00Z'));assert.equal((await usage()).sms.attempts,0)
  await h.post(first.path+'/code',{},'');assert.equal(texts.length,6)
  const october=(await h.post('/api/inkwell/usage?month=2026-10',undefined)).value
  assert.equal(october.sms.attempts,5);assert.equal(october.sms.chargedMicros,5_000_000)
 } finally { await h.close() }
})

test('ADMIN-006: unpriced and uncertain SMS attempts retain their allowance and policy changes never erase monthly usage',async()=>{
 let arrived,release
 const reached=new Promise(resolve=>{arrived=resolve}),held=new Promise(resolve=>{release=resolve})
 const {h,texts,fail,recover}=await smsHarness({onAttempt:async()=>{arrived();await held}})
 try {
  await h.command('account.usage',{capUsd:'5',reserveUsd:'3',expectedVersion:0,consent:true})
  const {id,path}=await prepareSmsEnvelope(h);fail()
  const inFlight=h.post(path+'/code',{},'',503)
  await reached
  try {
   const reserved=(await h.post('/api/inkwell/usage',undefined)).value
   assert.equal(reserved.sms.committedMicros,3_000_000);assert.equal(reserved.sms.stopped,true)
   const other=await prepareSmsEnvelope(h)
   await h.post(other.path+'/code',{},'',409);assert.equal(texts.length,1,'an in-flight reservation stops another signer before the network')
   await h.post(other.path+'/verify',{code:'000000'},'',401)
   assert.equal((await h.send(other.path,undefined,'')).value.sms,true,'cap refusal never downgrades authentication')
  } finally {release();await inFlight}
  let view=(await h.post('/api/inkwell/usage',undefined)).value
  assert.equal(view.sms.chargedMicros,0);assert.equal(view.sms.unpriced,1);assert.equal(view.sms.committedMicros,3_000_000);assert.equal(view.sms.stopped,true)
  h.advanceTo(Date.parse('2026-10-26T15:02:00Z'));await h.post(path+'/code',{},'',409);assert.equal(texts.length,1)
  await h.command('envelope.resend',{id,signer:0,channel:'sms'},h.owner,409)
  const cancelled=(await smsTestDetail(h,id)).messages.find(m=>m.subject==='SMS invitation'&&m.status==='not_sent')
  assert.match(cancelled.label,/monthly cap reached/)
  await h.command('account.usage',{capUsd:'10',reserveUsd:'3',expectedVersion:1,consent:true})
  view=(await h.post('/api/inkwell/usage',undefined)).value;assert.equal(view.sms.committedMicros,3_000_000);assert.equal(view.sms.stopped,false)
  assert.equal(view.history.length,2);assert.equal(view.history[1].after.capMicros,5_000_000);assert.equal(view.history[0].before.capMicros,5_000_000);assert.equal(view.history[0].after.capMicros,10_000_000)
  assert.equal((await smsTestDetail(h,id)).messages.find(m=>m.subject==='SMS code').status,'uncertain')
  await h.post(path+'/code',{},'',503)
  assert.equal(texts.length,2,'raising the cap permits only a fresh request, not the cancelled invitation')
  assert.equal((await smsTestDetail(h,id)).messages.find(m=>m.id===cancelled.id).status,'not_sent')
  recover();h.advanceTo(Date.parse('2026-10-26T15:04:00Z'))
  await h.post(path+'/code',{},'')
  assert.equal((await h.post('/api/inkwell/usage',undefined)).value.sms.stopped,true)
  const verified=(await h.post(path+'/verify',{code:smsTestCode(texts)},'')).cookie
  await h.agree(path,verified)
  await h.post(path+'/sign',{values:{signature:'Mara Quinn'},consent:true,commandId:crypto.randomUUID()},verified)
  const completed=await smsTestDetail(h,id)
  assert.equal(completed.status,'completed','a dispatched verification can complete after further paid attempts stop')
  assert.equal(completed.signers[0].sms,true,'completion retains the selected SMS authentication')
  assert.ok(completed.events.some(event=>event.action==='signer.sms_verified'))
  const removal={command:'account.usage',input:{capUsd:null,reserveUsd:'3',expectedVersion:2,consent:true},commandId:crypto.randomUUID()}
  await h.post('/api/inkwell/commands',removal)
  await h.post('/api/inkwell/commands',removal)
  view=(await h.post('/api/inkwell/usage',undefined)).value
  assert.equal(view.history.length,3,'removing the cap is audited once even when the same command is replayed')
  assert.equal(view.history[0].before.capMicros,10_000_000);assert.equal(view.history[0].after.capMicros,null)
  assert.equal(view.sms.committedMicros,9_000_000,'removing a cap retains uncertain and completed attempt allowances')
 } finally { await h.close() }
})

test('Identity provider gates signing, retries failed and mismatched checks, preserves method custody and records only normalized proof',async()=>{
 const {providerEdges,providerBindings}=await import('./provider-edge.mjs'),edge=providerEdges(),clock=Date.parse('2026-10-26T16:00:00Z')
 const h=await harness({bindings:providerBindings,networkEdge:edge.networkEdge,now:clock})
 try {
  let email='mara.id@harbour.example';const fields=[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]
  const id=(await h.command('envelope.prepare',{title:'Harbour identity agreement',filename:'identity.pdf',pdfBase64:await pdf(),signers:[{name:'Mara Quinn',email,providerAuth:'identity',accessCode:'separate-secret'}],fields})).result.id
  await h.command('envelope.approve',{id,eligible:true})
  let path='/api'+new URL((await h.mail(email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
  const oldPath=path;email='mara.corrected@harbour.example';await h.command('envelope.correct',{id,signers:[{name:'Mara Quinn',email,providerAuth:'identity'}]});assert.equal((await h.send(oldPath)).status,404);path='/api'+new URL((await h.mail(email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
  await h.post(path+'/provider/start',{consent:true},'',403)
  await h.post(path+'/access',{accessCode:'separate-secret'},'')
  await h.post(path+'/provider/start',{consent:false},'',400);assert.equal(edge.sessions.size,0)
  await h.post(path+'/code',{},'',403);await h.post(path+'/verify',{code:'123456'},'',403)
  await h.post(path+'/provider/start',{consent:true},'');assert.equal((await h.send(path+'/document')).status,401)
  await h.post(path+'/provider/check',{},'');assert.equal((await h.send(path)).value.verified,false)
  edge.result('failed');await h.post(path+'/provider/check',{},'',401)
  h.advanceTo(clock+61_000);await h.post(path+'/provider/start',{consent:true},'')
  edge.result('passed','Different Person');await h.post(path+'/provider/check',{},'',401)
  h.advanceTo(clock+122_000);await h.post(path+'/provider/start',{consent:true},'')
  const reference=edge.result('passed'),verified=(await h.post(path+'/provider/check',{},'')).cookie
  assert.ok(verified);assert.equal((await h.send(path,undefined,verified)).value.verified,true)
  await h.agree(path,verified);assert.equal((await h.send(path+'/document',undefined,verified)).status,200)
  await h.post(path+'/sign',{commandId:crypto.randomUUID(),consent:true,values:{signature:'Mara Quinn'}},verified)
  const record=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const evidence=record.events.filter(e=>['signer.provider_rejected','signer.provider_verified'].includes(e.action))
  assert.deepEqual(evidence.map(e=>[e.detail.outcome,e.detail.nameMatch]),[['failed',true],['failed',false],['passed',true]])
  assert.equal(evidence.at(-1).detail.reference,reference)
  const certificate=await h.send(path+'/artifacts/certificate',undefined,verified),certificateText=await smsTestPdfText(certificate.bytes)
  assert.match(certificateText,/Stripe Identity government ID and selfie, name matched/);assert.ok(certificateText.includes(reference))
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  for(const marker of ['private-id-image','private-selfie-image','private-provider-address','private-provider-dob']) {assert.ok(!JSON.stringify(archive).includes(marker));assert.ok(!JSON.stringify(h.logs()).includes(marker))}
  const template=(await h.command('template.from_envelope',{id,title:'Identity client'})).result
  const reused=await h.command('template.use',{id:template.id,recipients:[{name:'Mara Quinn',email:'new.mara@harbour.example',accessCode:'new-secret'}]})
  assert.equal((await h.send('/api/inkwell/envelopes/'+reused.result.id,undefined,h.owner)).value.envelope.signers[0].providerAuth,'identity')
  const companion=(await h.command('template.save',{title:'Identity schedule',filename:'schedule.pdf',pdfBase64:await pdf(),roles:[{role:'Signer 1',order:1,providerAuth:'identity'}],fields})).result.id
  const combined=(await h.command('template.combine',{ids:[template.id,companion],recipients:[{name:'Mara Quinn',email:'combined.mara@harbour.example',accessCode:'new-secret'}]})).result.id
  assert.equal((await h.send('/api/inkwell/envelopes/'+combined,undefined,h.owner)).value.envelope.signers[0].providerAuth,'identity')
  const voice=(await h.command('template.save',{title:'Voice schedule',filename:'schedule.pdf',pdfBase64:await pdf(),roles:[{role:'Signer 1',order:1,providerAuth:'voice'}],fields})).result.id
  await h.command('template.combine',{ids:[template.id,voice],recipients:[{name:'Mara Quinn',email:'conflict.mara@harbour.example',accessCode:'new-secret'}]},h.owner,400)
  const explicit=(await h.command('template.combine',{ids:[template.id,voice],choices:{identity:{[JSON.stringify(['Signer 1',1])]:'identity'}},recipients:[{name:'Mara Quinn',email:'chosen.mara@harbour.example',accessCode:'new-secret'}]})).result.id
  assert.equal((await h.send('/api/inkwell/envelopes/'+explicit,undefined,h.owner)).value.envelope.signers[0].providerAuth,'identity')
  const own=(await h.command('envelope.prepare',{title:'Owner identity',filename:'owner.pdf',pdfBase64:await pdf(),signers:[{name:'Harbour Owner',email:'owner@harbour.example',providerAuth:'identity'}],fields})).result.id;await h.command('envelope.approve',{id:own,eligible:true});const ownLink=(await h.command('envelope.open_signing',{id:own})).result.signing.url,ownPath='/api'+new URL(ownLink).pathname;assert.equal((await h.send(ownPath,undefined,h.owner)).value.verified,false);assert.equal((await h.send(ownPath+'/document',undefined,h.owner)).status,401)
  const copied=await h.command('envelope.copy',{id});assert.equal((await h.send('/api/inkwell/envelopes/'+copied.result.id,undefined,h.owner)).value.envelope.signers[0].providerAuth,'identity')
 } finally {await h.close()}
})

test('Voice-call provider code admits only its bound recipient and records the reference and outcome on the certificate',async()=>{
 const {providerEdges,providerBindings}=await import('./provider-edge.mjs'),edge=providerEdges()
 const h=await harness({bindings:providerBindings,networkEdge:edge.networkEdge})
 try {
  const email='mara.voice@harbour.example',id=(await h.command('envelope.prepare',{title:'Harbour voice agreement',filename:'voice.pdf',pdfBase64:await pdf(),signers:[{name:'Mara Quinn',email,providerAuth:'voice',phone:'+12025550102'}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]})).result.id
  await h.command('envelope.approve',{id,eligible:true})
  const path='/api'+new URL((await h.mail(email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
  await h.post(path+'/code',{},'',403);await h.post(path+'/provider/start',{consent:true},'');assert.equal(edge.voice[0].To,'+12025550102')
  await h.post(path+'/provider/check',{code:'000000'},'',401);assert.equal((await h.send(path)).value.verified,false)
  const verified=(await h.post(path+'/provider/check',{code:'123456'},'')).cookie;await h.agree(path,verified)
  await h.post(path+'/sign',{commandId:crypto.randomUUID(),consent:true,values:{signature:'Mara Quinn'}},verified)
  const certificateText=await smsTestPdfText((await h.send(path+'/artifacts/certificate',undefined,verified)).bytes)
  assert.match(certificateText,/Twilio voice-call code/);assert.ok(certificateText.includes('synthetic-inkwell-80'))
  const record=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  assert.equal(record.events.find(e=>e.action==='signer.provider_verified').detail.outcome,'passed')
  const archived=JSON.stringify((await h.send('/api/inkwell/archive',undefined,h.owner)).value)
  assert.ok(!archived.includes('123456')&&!archived.includes('000000'))
 } finally {await h.close()}
})

test('Knowledge questions admit a passing recipient and lock two failures with one sender notice, without retaining private provider data',async()=>{
 const {providerEdges,providerBindings}=await import('./provider-edge.mjs'),clock=Date.parse('2026-10-26T16:00:00Z'),edge=providerEdges({now:clock})
 const h=await harness({bindings:providerBindings,networkEdge:edge.networkEdge,now:clock})
 try {
  const emails=['mara.kba@harbour.example','devon.kba@harbour.example'],id=(await h.command('envelope.prepare',{title:'Harbour knowledge agreement',filename:'knowledge.pdf',pdfBase64:await pdf(),signers:[{name:'Mara Quinn',email:emails[0],providerAuth:'knowledge'}],fields:[{id:'signature-0',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]})).result.id
  await h.command('envelope.approve',{id,eligible:true})
  const path=async email=>'/api'+new URL((await h.mail(email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
  const first=await path(emails[0]);await h.post(first+'/provider/start',{consent:false,dateOfBirth:'1985-06-15'},'',400);assert.equal(edge.knowledge.size,0)
  await h.post(first+'/provider/start',{consent:true,dateOfBirth:'1985-06-15'},'')
  const sealed=(await h.db.prepare('SELECT sealed_token FROM iw_provider_auth WHERE envelope_id=?').bind(id).first()).sealed_token;assert.ok(sealed);assert.ok(!JSON.stringify((await h.send('/api/inkwell/archive',undefined,h.owner)).value).includes(sealed),'active hosted capability custody never exports')
  const providerState=[...edge.knowledge.values()].at(-1),originalWorkflow=providerState.medallion.currentSession.workflowId
  providerState.medallion.currentSession.workflowId='unapproved-workflow';await h.post(first+'/provider/check',{},'',503)
  providerState.medallion.currentSession.workflowId=originalWorkflow;await h.post(first+'/provider/check',{},'')
  const token=edge.knowledgeResult('passed'),verified=(await h.post(first+'/provider/check',{},'')).cookie
  await h.agree(first,verified);await h.post(first+'/sign',{commandId:crypto.randomUUID(),consent:true,values:{'signature-0':'Mara Quinn'}},verified)
  const blocked=(await h.command('envelope.prepare',{title:'Harbour blocked knowledge agreement',filename:'knowledge.pdf',pdfBase64:await pdf(),signers:[{name:'Devon Gray',email:emails[1],providerAuth:'knowledge'}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]})).result.id
  await h.command('envelope.approve',{id:blocked,eligible:true})
  const second=await path(emails[1]);await h.post(second+'/provider/start',{consent:true,dateOfBirth:'1985-06-15'},'')
  edge.knowledgeResult('failed');await h.post(second+'/provider/check',{},'',401)
  h.advanceTo(clock+61_000);await h.post(second+'/provider/start',{consent:true,dateOfBirth:'1985-06-15'},'')
  edge.knowledgeResult('failed');await h.post(second+'/provider/check',{},'',423)
  await h.post(second+'/provider/check',{},'',423);await h.post(second+'/provider/start',{consent:true,dateOfBirth:'1985-06-15'},'',423)
  const record=(await h.send('/api/inkwell/envelopes/'+blocked,undefined,h.owner)).value.envelope
  assert.equal(record.events.filter(e=>e.action==='signer.provider_locked').length,1)
  assert.ok(await h.mail('owner@harbour.example','Verification locked:'))
  const notices=(await h.send('/api/inkwell/notices',undefined,h.owner)).value.notices
  assert.equal(notices.filter(n=>n.event==='identity_locked').length,1)
  assert.equal((await h.send(second)).value.verified,false)
  const certificateText=await smsTestPdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes)
  assert.match(certificateText,/Authenticate knowledge questions/)
  const archive=JSON.stringify((await h.send('/api/inkwell/archive',undefined,h.owner)).value)
  for(const marker of [token,'1985-06-15','15-06-1985','private-provider-jwt','private-kba-question','private-kba-answer']) {assert.ok(!archive.includes(marker));assert.ok(!JSON.stringify(h.logs()).includes(marker))}
 }finally{await h.close()}
})

// INTEG-006: both official file edges receive the exact completed artifacts, with durable retries.
async function filingTemplate(h,title='Harbour client agreement') {
 return (await h.command('template.save',{title,filename:'agreement.pdf',pdfBase64:await pdf(),roles:[{role:'Client',order:1}],fields:[{id:'client-signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.6,width:.4,height:.07}]})).result.id
}
async function finishFilingEnvelope(h,templateId,email) {
 const id=(await h.command('template.use',{id:templateId,recipients:[{name:'Mara Quinn',email}]})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const message=await h.mail(email,'Please sign:'),path='/api/sign/'+new URL(message.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
 await h.post(path+'/code',{},'')
 const cookie=(await h.post(path+'/verify',{code:(await h.mail(email,'Your Inkwell verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie
 await h.agree(path,cookie)
 const body={commandId:crypto.randomUUID(),values:{'client-signature':'Mara Quinn'},consent:true,adoption:{method:'typed',style:'sans'}}
 await h.post(path+'/sign',body,cookie)
 return {id,path,cookie,body}
}
const saveFilingRule=(h,templateId,provider,extra={})=>h.post('/api/inkwell/filing',{commandId:crypto.randomUUID(),templateId,provider,folder:provider==='box'?'123456':'/Harbour completed',enabled:true,consent:true,expectedVersion:0,...extra})

test('Box and Dropbox file the completed PDF and certificate exactly once despite interrupted responses, concurrent retries and signing replay',async()=>{
 const {filingEdge}=await import('./filing-edge.mjs'),edge=filingEdge(),h=await harness({bindings:{BOX_ACCESS_TOKEN:'synthetic-inkwell-1',DROPBOX_ACCESS_TOKEN:'synthetic-inkwell-2'},networkEdge:edge.networkEdge})
 try {
  const templateId=await filingTemplate(h)
  for(const provider of ['box','dropbox'])await saveFilingRule(h,templateId,provider)
  const accountAudit=(await h.send('/api/inkwell/audit?limit=200',undefined,h.owner)).value.entries
  for(const provider of ['box','dropbox'])assert.ok(accountAudit.some(e=>e.action==='filing.changed'&&e.after.provider===provider&&e.after.enabled===true&&e.before===null),'Filing consent appears in unified history')
  assert.ok(!JSON.stringify(accountAudit).includes('synthetic-inkwell-1')&&!JSON.stringify(accountAudit).includes('synthetic-inkwell-2'))
  edge.failNext('box','after');edge.failNext('dropbox','before')
  const signed=await finishFilingEnvelope(h,templateId,'mara@harbour.example')
  let view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  assert.equal(view.jobs.filter(job=>job.state==='uncertain').length,2,'both provider interruptions remain visible')
  await Promise.all([h.post('/api/inkwell/filing/retry',{id:signed.id}),h.post('/api/inkwell/filing/retry',{id:signed.id})])
  await h.post(signed.path+'/sign',signed.body,signed.cookie)
  await h.post('/api/inkwell/filing/retry',{id:signed.id})
  view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  assert.equal(view.jobs.length,4);assert.ok(view.jobs.every(job=>job.state==='filed'&&job.remote_id&&job.filed_at))
  assert.equal(edge.files().length,4,'each provider has only one PDF and one certificate')
  for(const provider of ['box','dropbox'])for(const kind of ['signed','certificate']){
   const file=edge.files().find(file=>file.provider===provider&&file.name===`inkwell-${signed.id}-${kind}.pdf`)
   assert.ok(file);const artifact=await h.send(`/api/inkwell/envelopes/${signed.id}/artifacts/${kind}`,undefined,h.owner)
   assert.equal(artifact.status,200);assert.deepEqual(file.bytes,Buffer.from(artifact.bytes),'provider bytes equal the public completed artifact')
  }
  const attempts=edge.attempts().length
  await h.scheduled(Date.now());assert.equal(edge.attempts().length,attempts,'filed jobs are never uploaded again')
  assert.ok(!(JSON.stringify(h.logs())+JSON.stringify(view)).includes(JSON.stringify('synthetic-inkwell-1')),'provider credentials never enter views or logs')
  // AGENT-006: a moved Dropbox folder is resolved only by its pinned identity.
  edge.failNext('dropbox','after')
  const moved=await finishFilingEnvelope(h,templateId,'synthetic-inkwell-61@example.test')
  edge.moveFolder('/Harbour completed','/Reviewed completed')
  const beforeMoveRetry=edge.attempts().length
  await h.post('/api/inkwell/filing/retry',{id:moved.id})
  view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  let held=view.jobs.find(job=>job.envelope_id===moved.id&&job.provider==='dropbox'&&job.state==='uncertain')
  assert.ok(held.folder_repair_json,'the moved folder has an explicit proposal')
  assert.deepEqual(JSON.parse(held.folder_repair_json),{id:held.folder_ref,from:'/Harbour completed',to:'/Reviewed completed'})
  assert.equal(edge.attempts().length,beforeMoveRetry,'detecting a move performs no upload')
  const approve={id:moved.id,folder:held.folder,kind:held.kind,approveFolderRepair:true,proposal:JSON.parse(held.folder_repair_json)}
  const admin=await h.invite('synthetic-inkwell-62@example.test','admin')
  await h.post('/api/inkwell/filing/retry',approve,admin,403)
  await h.post('/api/inkwell/filing/retry',{...approve,proposal:{}},h.owner,409)
  edge.moveFolder('/Reviewed completed','/Reviewed again')
  await h.post('/api/inkwell/filing/retry',approve,h.owner,409)
  await h.post('/api/inkwell/filing/retry',{id:moved.id})
  held=(await h.send('/api/inkwell/filing',undefined,h.owner)).value.jobs.find(job=>job.envelope_id===moved.id&&job.folder_repair_json)
  const movedFile=edge.files().find(f=>f.provider==='dropbox'&&f.name===`inkwell-${moved.id}-${held.kind}.pdf`)
  edge.corrupt(movedFile.id)
  const fresh={...approve,proposal:JSON.parse(held.folder_repair_json)}
  await h.post('/api/inkwell/filing/retry',fresh)
  assert.equal((await h.send('/api/inkwell/filing',undefined,h.owner)).value.jobs.find(job=>job.envelope_id===moved.id&&job.kind===held.kind&&job.provider==='dropbox').state,'uncertain','different remote bytes remain unresolved after folder approval')
  edge.repair(movedFile.id)
  await Promise.all([h.post('/api/inkwell/filing/retry',{id:moved.id}),h.post('/api/inkwell/filing/retry',{id:moved.id})])
  view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  assert.ok(view.jobs.filter(job=>job.envelope_id===moved.id).every(job=>job.state==='filed'))
  assert.equal(edge.files().filter(file=>file.name.includes(moved.id)).length,4,'folder repair and concurrent replay create no duplicate artifacts')
  assert.equal(edge.attempts().length,beforeMoveRetry,'moved uncertain artifacts are reconciled entirely with reads')
  assert.equal((await h.send('/api/inkwell/audit',undefined,h.owner)).value.entries.filter(e=>e.action==='filing.folder_repair.approved'&&e.target===moved.id).length,1)
  // Pre-upgrade jobs have no folder identity; a retry may verify but must never upload into a recreated path.
  const legacyTemplate=await filingTemplate(h,'Legacy completed filing')
  await saveFilingRule(h,legacyTemplate,'dropbox',{folder:'/Legacy completed'})
  edge.failNext('dropbox','after')
  const legacy=await finishFilingEnvelope(h,legacyTemplate,'synthetic-inkwell-legacy@example.test')
  await h.db.prepare("UPDATE iw_filing_rules SET folder_ref=NULL WHERE template_id=?").bind(legacyTemplate).run()
  await h.db.prepare("UPDATE iw_filing_jobs SET folder_ref=NULL WHERE envelope_id=?").bind(legacy.id).run()
  edge.moveFolder('/Legacy completed','/Legacy reviewed')
  const legacyJob=(await h.send('/api/inkwell/filing',undefined,h.owner)).value.jobs.find(job=>job.envelope_id===legacy.id&&job.state==='uncertain')
  assert.ok(legacyJob)
  const legacyAttempts=edge.attempts().length
  await h.post('/api/inkwell/filing/retry',{id:legacy.id})
  assert.equal(edge.attempts().length,legacyAttempts,'no duplicate upload at the old path')
  assert.equal((await h.send('/api/inkwell/filing',undefined,h.owner)).value.jobs.find(job=>job.envelope_id===legacy.id&&job.kind===legacyJob.kind).state,'uncertain')
  const inspect={id:legacy.id,folder:legacyJob.folder,kind:legacyJob.kind,inspectLegacyFolder:true,replacementFolder:'/Legacy reviewed'}
  await h.post('/api/inkwell/filing/retry',inspect,admin,403)
  const legacyFile=edge.files().find(file=>file.name===`inkwell-${legacy.id}-${legacyJob.kind}.pdf`)
  edge.corrupt(legacyFile.id)
  await h.post('/api/inkwell/filing/retry',inspect,h.owner,409)
  edge.repair(legacyFile.id)
  await h.post('/api/inkwell/filing/retry',inspect)
  let proposed=(await h.send('/api/inkwell/filing',undefined,h.owner)).value.jobs.find(job=>job.envelope_id===legacy.id&&job.kind===legacyJob.kind)
  const legacyApproval={id:legacy.id,folder:legacyJob.folder,kind:legacyJob.kind,approveFolderRepair:true,proposal:JSON.parse(proposed.folder_repair_json)}
  assert.deepEqual(legacyApproval.proposal,{id:legacyApproval.proposal.id,from:'/Legacy completed',to:'/Legacy reviewed'})
  assert.equal(proposed.folder_ref,null,'inspection grants no replay authority')
  edge.moveFolder('/Legacy reviewed','/Legacy final')
  await h.post('/api/inkwell/filing/retry',legacyApproval,h.owner,409)
  await h.post('/api/inkwell/filing/retry',{...inspect,replacementFolder:'/Legacy final'})
  proposed=(await h.send('/api/inkwell/filing',undefined,h.owner)).value.jobs.find(job=>job.envelope_id===legacy.id&&job.kind===legacyJob.kind)
  legacyApproval.proposal=JSON.parse(proposed.folder_repair_json)
  edge.corrupt(legacyFile.id)
  await h.post('/api/inkwell/filing/retry',legacyApproval,h.owner,409)
  edge.repair(legacyFile.id)
  const legacyResults=await Promise.all([h.send('/api/inkwell/filing/retry',legacyApproval,h.owner),h.send('/api/inkwell/filing/retry',legacyApproval,h.owner)])
  assert.deepEqual(legacyResults.map(result=>result.status).sort(),[200,409])
  await h.post('/api/inkwell/filing/retry',{id:legacy.id})
  proposed=(await h.send('/api/inkwell/filing',undefined,h.owner)).value.jobs.find(job=>job.envelope_id===legacy.id&&job.kind===legacyJob.kind)
  assert.equal(proposed.state,'filed');assert.equal(proposed.remote_id,legacyFile.id);assert.equal(proposed.resolved_folder,'/Legacy final')
  assert.equal(edge.attempts().length,legacyAttempts,'legacy inspection, approval and replay are read-only')
  assert.equal(edge.files().filter(file=>file.name.includes(legacy.id)).length,2,'legacy recovery makes no duplicate')
  assert.equal((await h.send('/api/inkwell/audit',undefined,h.owner)).value.entries.filter(e=>e.action==='filing.folder_repair.approved'&&e.target===legacy.id).length,1)


 }finally{await h.close()}
})

test('Automatic filing requires administrative consent, stays within its template, refuses conflicting bytes and cancels disabled rules',async()=>{
 const {filingEdge}=await import('./filing-edge.mjs'),edge=filingEdge(),h=await harness({bindings:{BOX_ACCESS_TOKEN:'synthetic-inkwell-1',DROPBOX_ACCESS_TOKEN:'synthetic-inkwell-2'},networkEdge:edge.networkEdge})
 try {
  const templateId=await filingTemplate(h),other=await filingTemplate(h,'Supplier agreement')
  assert.equal((await h.send('/api/inkwell/filing')).status,401)
  const viewer=await h.invite('reader@harbour.example','member')
  assert.equal((await h.send('/api/inkwell/filing',undefined,viewer)).status,403)
  const payload={commandId:crypto.randomUUID(),templateId,provider:'box',folder:'123456',enabled:true,consent:true,expectedVersion:0}
  assert.equal((await h.send('/api/inkwell/filing',payload,viewer)).status,403)
  assert.equal((await h.send('/api/inkwell/filing',{...payload,consent:false},h.owner)).status,400)
  assert.equal((await h.send('/api/inkwell/filing',payload,h.owner,{origin:'https://elsewhere.example'})).status,403)
  assert.equal((await h.send('/api/inkwell/filing',{...payload,provider:'dropbox',folder:'/Harbour\\escape'},h.owner)).status,400)
  await saveFilingRule(h,templateId,'box')
  await finishFilingEnvelope(h,other,'supplier@harbour.example');assert.equal(edge.files().length,0,'a different template never files')
  edge.failNext('box','after')
  const signed=await finishFilingEnvelope(h,templateId,'client@harbour.example'),initial=(await h.send('/api/inkwell/filing',undefined,h.owner)).value,failedKind=initial.jobs.find(job=>job.state==='uncertain').kind,remote=edge.files().find(file=>file.name===`inkwell-${signed.id}-${failedKind}.pdf`)
  edge.corrupt(remote.id)
  await h.post('/api/inkwell/filing/retry',{id:signed.id})
  let view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  assert.equal(view.jobs.find(job=>job.kind===failedKind).state,'uncertain','a conflicting remote file is never accepted or overwritten')
  edge.repair(remote.id)
  await saveFilingRule(h,templateId,'box',{enabled:false,expectedVersion:1})
  const attempts=edge.attempts().length
  await h.post('/api/inkwell/filing/retry',{id:signed.id})
  view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  assert.equal(view.jobs.find(job=>job.kind===failedKind).state,'cancelled');assert.equal(edge.attempts().length,attempts,'disabling consent stops remaining outbound work')
  const history=(await h.db.prepare('SELECT * FROM iw_filing_history ORDER BY rowid').all()).results
  assert.equal(history.length,2);assert.ok(history[0].consent&&history[0].actor&&history[0].at)
 }finally{await h.close()}
})

test('HubSpot native records merge locked fields, sync contacts and suggest an eligible owner without granting follow-up or sending',async()=>{
 const requests=[],token='synthetic-inkwell-1'
 const h=await harness({bindings:{HUBSPOT_ACCESS_TOKEN:token,HUBSPOT_ACCOUNT_ID:'7249'},networkEdge:async request=>{
  const url=new URL(request.url);if(url.hostname!=='api.hubapi.com')return
  assert.equal(request.headers.get('authorization'),'Bearer '+token);assert.equal(request.method,'GET');requests.push(url.pathname)
  if(url.pathname==='/crm/v3/owners/7')return Response.json({id:'7',email:'admin@harbour.example',archived:false})
  if(url.pathname==='/crm/v3/objects/contacts')return Response.json({results:[{id:'42',archived:false,properties:{firstname:'Mara',lastname:'Quinn',email:'mara@crm.example',phone:'+1 617 555 1234',company:'Harbour CRM'}}]})
  return Response.json({id:'91',archived:false,properties:{company:'Harbour CRM',address:'42 Dock Street',amount:'750.00',hubspot_owner_id:'7'}})
 }})
 try {
  await h.invite('admin@harbour.example','admin')
  const fields=[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.6,width:.4,height:.07},...['company','address','amount'].map((id,i)=>({id,label:id,type:id==='amount'?'number':'text',signer:0,page:0,x:.1,y:.1+i*.1,width:.4,height:.05}))]
  const templateId=(await h.command('template.save',{title:'CRM agreement',filename:'crm.pdf',pdfBase64:await pdf(),roles:[{role:'Client',order:1}],fields,customFields:[{name:'Cost center',required:true,value:'CRM-42'}]})).result.id
  const body={commandId:crypto.randomUUID(),consent:true,recordType:'deals',recordId:'91',templateId,recipients:[{name:'Mara Quinn',email:'mara@crm.example'}],mappings:[{field:'company',object:'deals',property:'company',readOnly:false},{field:'address',object:'deals',property:'address',readOnly:false},{field:'amount',object:'deals',property:'amount',readOnly:true}]}
  const before=h.sent(),prepared=(await h.post('/api/inkwell/hubspot/prepare',body)).value,id=prepared.id
  assert.equal(h.sent(),before,'CRM preparation sends no invitation')
  assert.equal((await h.post('/api/inkwell/hubspot/prepare',body)).value.id,id,'replay returns the one draft')
  assert.deepEqual(requests,['/crm/v3/objects/deals/91','/crm/v3/owners/7'],'replay makes no provider request')
  const detail=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  assert.equal(detail.status,'prepared')
  assert.deepEqual(detail.fields.filter(f=>f.id!=='signature').map(f=>[f.id,f.prefill.value,f.prefill.source,Boolean(f.readOnly)]),[['company','Harbour CRM','HubSpot 7249 deals 91.company',false],['address','42 Dock Street','HubSpot 7249 deals 91.address',false],['amount','750.00','HubSpot 7249 deals 91.amount',true]])
  assert.deepEqual(detail.customFields,[{name:'Cost center',required:true,value:'CRM-42'}])
  const admin=(await h.send('/api/inkwell',undefined,h.owner)).value.people.find(p=>p.email==='admin@harbour.example')
  assert.equal(detail.events.find(e=>e.action==='hubspot.record_prepared').detail.escalationOwner,admin.id)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,h.owner)).value.defaultEscalationOwner,admin.id)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,h.owner)).value.grant,null)
  await h.command('envelope.approve',{id,eligible:true})
  const message=await h.mail('mara@crm.example','Please sign:'),path='/api/sign/'+new URL(message.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  await h.post(path+'/code',{},'')
  const cookie=(await h.post(path+'/verify',{code:(await h.mail('mara@crm.example','verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie
  await h.agree(path,cookie)
  assert.equal((await h.send(path+'/progress',{values:{amount:'1.00'}},cookie)).status,400)
  assert.equal((await h.send(path+'/sign',{commandId:crypto.randomUUID(),consent:true,values:{signature:'Mara Quinn',amount:'1.00'}},cookie)).status,400)
  await h.command('envelope.followup',{id,enabled:true})
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,h.owner)).value.grant.escalationOwner,admin.id)
  await h.post(path+'/sign',{commandId:crypto.randomUUID(),consent:true,values:{signature:'Mara Quinn'}},cookie)
  assert.equal((await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope.status,'completed')
  const sync={operation:'authorize',consent:true,definition:{accountId:'7249',scope:{kind:'all'},properties:['firstname','lastname','email','phone','company'],mappings:{name:'full_name',email:'email',phone:'phone',company:'company'},destination:'shared_contacts',updateBehavior:'preserve_local_edits',cadence:'once'}}
  const authorization=(await h.post('/api/inkwell/hubspot/sync',sync)).value
  const start={operation:'start',authorizationId:authorization.id,requestId:crypto.randomUUID()}
  assert.equal((await h.post('/api/inkwell/hubspot/sync',start)).value.applied,1)
  await h.post('/api/inkwell/hubspot/sync',start)
  const book=(await h.send('/api/inkwell/contacts?q=Harbour%20CRM',undefined,h.owner)).value
  assert.deepEqual(book.contacts,[{name:'Mara Quinn',email:'mara@crm.example',phone:'+1 617 555 1234',company:'Harbour CRM'}])
  assert.equal(requests.filter(p=>p==='/crm/v3/objects/contacts').length,1)
  const audit=(await h.send('/api/inkwell/audit?action=hubspot.authorized',undefined,h.owner)).value
  assert.ok(JSON.stringify(audit).includes('hubspot.authorized'))
  assert.ok(!JSON.stringify(audit).includes('42 Dock Street'))
  const contactDraft=(await h.post('/api/inkwell/hubspot/prepare',{...body,commandId:crypto.randomUUID(),recordType:'contacts',mappings:body.mappings.map(m=>({...m,object:'contacts'}))})).value.id
  assert.notEqual(contactDraft,id)
  assert.equal((await h.send('/api/inkwell/envelopes/'+contactDraft,undefined,h.owner)).value.envelope.fields.find(f=>f.id==='amount').prefill.source,'HubSpot 7249 contacts 91.amount')

  const archive=JSON.stringify((await h.send('/api/inkwell/archive',undefined,h.owner)).value)
  assert.ok(!archive.includes(token));assert.ok(!JSON.parse((await h.send('/api/inkwell/archive',undefined,h.owner)).value.ndjson.split('\n')[0]).tables.some(t=>t.name.startsWith('iw_hubspot_')));assert.ok(!JSON.stringify(h.logs()).includes('42 Dock Street'))
 }finally{await h.close()}
})

test('HubSpot refuses unauthorized, unconsented, cross-origin and malformed imports without partial contact writes',async()=>{
 let calls=0,invalid=false
 const h=await harness({bindings:{HUBSPOT_ACCESS_TOKEN:'synthetic-inkwell-2',HUBSPOT_ACCOUNT_ID:'7249'},networkEdge:async request=>{
  if(new URL(request.url).hostname!=='api.hubapi.com')return
  calls++
  return invalid?Response.json({results:[{id:'1',archived:false,properties:{firstname:'Good',lastname:'Person',email:'good@crm.example'}},{id:'2',archived:false,properties:{firstname:'Invalid',email:'bad'}}]}):new Response('private-provider-response',{status:503})
 }})
 try {
  const viewer=await h.invite('viewer@harbour.example','member'),agent=(await h.command('agent.issue')).result.token
  const sync={operation:'authorize',consent:true,definition:{accountId:'7249',scope:{kind:'all'},properties:['firstname','lastname','email','phone','company'],mappings:{name:'full_name',email:'email',phone:'phone',company:'company'},destination:'shared_contacts',updateBehavior:'preserve_local_edits',cadence:'once'}}
  assert.equal((await h.send('/api/inkwell/hubspot/sync',sync)).status,401)
  assert.equal((await h.send('/api/inkwell/hubspot/sync',sync,viewer)).status,403)
  assert.equal((await h.send('/api/inkwell/hubspot/sync',sync,h.owner,{authorization:'Bearer '+agent})).status,403)
  assert.equal((await h.send('/api/inkwell/hubspot/sync',sync,h.owner,{origin:'https://other.example'})).status,403)
  assert.equal((await h.send('/api/inkwell/hubspot/sync',{...sync,consent:false},h.owner)).status,400)
  assert.equal((await h.send('/api/inkwell/hubspot/sync',{...sync,definition:{...sync.definition,scope:{kind:'selected',recordIds:['https://other.example']}}},h.owner)).status,400)
  assert.equal(calls,0)
  const auth=(await h.post('/api/inkwell/hubspot/sync',sync)).value
  const run={operation:'start',authorizationId:auth.id,requestId:crypto.randomUUID()}
  const failed=await h.send('/api/inkwell/hubspot/sync',run,h.owner);assert.equal(failed.status,502);assert.ok(!JSON.stringify(failed.value).includes('private-provider-response'))
  invalid=true
  const progress=(await h.send('/api/inkwell/hubspot/progress',undefined,h.owner)).value
  assert.equal((await h.send('/api/inkwell/hubspot/sync',{operation:'continue',runId:progress.runs[0].id},h.owner)).status,502)
  assert.deepEqual((await h.send('/api/inkwell/contacts?q=Good',undefined,h.owner)).value.contacts,[])
 }finally{await h.close()}
})

// Microsoft acceptance uses real HTTP doors and Graph faked only at the outbound network edge.
test('Microsoft 365: OneDrive and SharePoint sources bind their PDF, enforce opt-in policy and file verified completed artifacts once',async()=>{
 const {microsoftEdge}=await import('./microsoft-edge.mjs'),edge=await microsoftEdge(),h=await harness({bindings:{MICROSOFT_GRAPH_ACCESS_TOKEN:'synthetic-inkwell-1'},networkEdge:edge.networkEdge})
 try{
  const payload={kind:'onedrive',driveId:'personal-drive',itemId:'document'}
  assert.equal((await h.send('/api/inkwell/microsoft/source',payload)).status,401)
  const viewer=await h.invite('microsoft-viewer@harbour.example','member')
  assert.equal((await h.send('/api/inkwell/microsoft/source',payload,viewer)).status,403)
  assert.equal((await h.send('/api/inkwell/microsoft/source',payload,h.owner,{origin:'https://foreign.example'})).status,403)
  const source=(await h.post('/api/inkwell/microsoft/source',payload)).value
  const hash=await import('node:crypto').then(c=>c.createHash('sha256').update(edge.original).digest('hex'))
  assert.equal(source.sha256,hash);assert.deepEqual(Buffer.from(source.pdfBase64,'base64'),Buffer.from(edge.original))
  const template=(await h.command('template.save',{title:'Microsoft agreement',filename:source.filename,pdfBase64:source.pdfBase64,roles:[{role:'Client',order:1}],fields:source.fields})).result.id
  await h.post('/api/inkwell/filing',{commandId:crypto.randomUUID(),templateId:template,provider:'sharepoint',folder:'share-drive:completed',enabled:true,consent:true,expectedVersion:0})
  const loaded=(await h.post('/api/inkwell/microsoft/source',{...payload,templateId:template})).value
  const id=(await h.command('envelope.prepare',{title:'OneDrive agreement',filename:loaded.filename,microsoftUploadId:loaded.uploadId,signers:[{name:'Mara Quinn',email:'mara@clients.example'}],fields:loaded.fields})).result.id
  await h.command('envelope.approve',{id,eligible:true},h.owner,403)
  assert.equal(await h.mail('mara@clients.example','Please sign:'),undefined,'off policy sends no invitation')
  await h.command('account.send_policy',{source:'microsoft',mode:'person',expectedVersion:0})
  await h.command('envelope.approve',{id,eligible:true})
  const envelope=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  assert.equal(envelope.originalSha256,hash);assert.equal(envelope.events.find(e=>e.action==='envelope.approved').detail.sendPolicy.source,'microsoft')
  const path='/api'+new URL((await h.mail('mara@clients.example','Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
  await h.post(path+'/code',{},'');const cookie=(await h.post(path+'/verify',{code:(await h.mail('mara@clients.example','verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie;await h.agree(path,cookie)
  await h.post(path+'/sign',{commandId:crypto.randomUUID(),values:Object.fromEntries(loaded.fields.map(f=>[f.id,'Mara Quinn'])),consent:true},cookie)
  const view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  assert.deepEqual(view.jobs.map(j=>[j.kind,j.state]).sort(),[['certificate','filed'],['signed','filed']])
  for(const kind of ['signed','certificate'])assert.deepEqual(Buffer.from(edge.files.get(`inkwell-${id}-${kind}.pdf`).bytes),Buffer.from((await h.send(`/api/inkwell/envelopes/${id}/artifacts/${kind}`,undefined,h.owner)).bytes))
  await h.post('/api/inkwell/filing/retry',{id});assert.equal(edge.files.size,2)
  const sharepoint=(await h.post('/api/inkwell/microsoft/source',{...payload,kind:'sharepoint'})).value;assert.equal(sharepoint.sha256,hash)
  await h.post('/api/inkwell/microsoft/source',{...payload,itemId:'../escape'},h.owner,400)
 }finally{await h.close()}
})

test('Microsoft 365: Outlook proposes exact attachment participants, sends, self-signs without mail, and Word binds converted PDF bytes',async()=>{
 const {microsoftEdge}=await import('./microsoft-edge.mjs'),edge=await microsoftEdge(),h=await harness({bindings:{MICROSOFT_GRAPH_ACCESS_TOKEN:'synthetic-inkwell-1'},networkEdge:edge.networkEdge})
 try{
  await h.command('account.send_policy',{source:'microsoft',mode:'person',expectedVersion:0})
  const proposal=(await h.post('/api/inkwell/microsoft/source',{kind:'outlook',messageId:'outlook-send'})).value
  assert.deepEqual(proposal.participants,[{name:'Mara Quinn',email:'mara@clients.example'},{name:'Alex Morgan',email:'alex@clients.example'}]);assert.equal(proposal.filename,'outlook-agreement.pdf');assert.deepEqual(Buffer.from(proposal.pdfBase64,'base64'),Buffer.from(edge.outlook));assert.equal(proposal.fields.length,2)
  const id=(await h.command('envelope.prepare',{title:'Outlook request',filename:proposal.filename,microsoftUploadId:proposal.uploadId,signers:proposal.participants,fields:proposal.fields})).result.id
  await h.command('envelope.approve',{id,eligible:true});assert.ok(await h.mail('mara@clients.example','Please sign:'))
  const self=(await h.post('/api/inkwell/microsoft/source',{kind:'outlook',messageId:'outlook-self',self:true})).value
  assert.deepEqual(self.participants,[{name:'Harbour Owner',email:'owner@harbour.example'}]);const before=h.sent()
  const own=(await h.command('envelope.prepare',{title:'My Outlook agreement',filename:self.filename,microsoftUploadId:self.uploadId,signers:self.participants,fields:self.fields})).result.id
  await h.command('envelope.approve',{id:own,eligible:true});const opened=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id:own},commandId:crypto.randomUUID()}),path='/api'+new URL(opened.value.result.signing.url).pathname
  await h.agree(path,opened.cookie);await h.post(path+'/sign',{commandId:crypto.randomUUID(),values:Object.fromEntries(self.fields.map(f=>[f.id,'Harbour Owner'])),consent:true},opened.cookie)
  assert.equal(h.sent(),before,'self signing sends no mail');assert.equal((await h.send('/api/inkwell/envelopes/'+own,undefined,h.owner)).value.envelope.status,'completed')
  const word=(await h.post('/api/inkwell/microsoft/source',{kind:'word',driveId:'personal-drive',itemId:'word'})).value
  assert.equal(word.filename,'open-document.pdf');assert.deepEqual(Buffer.from(word.pdfBase64,'base64'),Buffer.from(edge.converted));assert.notEqual(word.sha256,proposal.sha256)
  const converted=(await h.command('envelope.prepare',{title:'Word request',filename:word.filename,microsoftUploadId:word.uploadId,signers:[{name:'Mara Quinn',email:'word@clients.example'}],fields:word.fields})).result.id
  await h.command('envelope.approve',{id:converted,eligible:true});assert.equal((await h.send('/api/inkwell/envelopes/'+converted,undefined,h.owner)).value.envelope.originalSha256,word.sha256);assert.ok(await h.mail('word@clients.example','Please sign:'))
 }finally{await h.close()}
})

test('Microsoft 365: authenticated fresh Outlook replies inherit grants, replay refusal, private visibility, pause, archive custody and erasure',async()=>{
 const {microsoftEdge}=await import('./microsoft-edge.mjs'),edge=await microsoftEdge(),clock=Date.parse('2026-10-27T14:00:00Z'),h=await harness({now:clock,bindings:{MICROSOFT_GRAPH_ACCESS_TOKEN:'synthetic-inkwell-1',MAIL_INBOUND_DOMAIN:'replies.harbour.example'},networkEdge:edge.networkEdge})
 try{
  const source=(await h.post('/api/inkwell/microsoft/source',{kind:'onedrive',driveId:'personal-drive',itemId:'document'})).value
  const id=(await h.command('envelope.prepare',{title:'Outlook follow-up',filename:source.filename,microsoftUploadId:source.uploadId,signers:[{name:'Mara Quinn',email:'mara@clients.example'}],fields:source.fields})).result.id
  await h.command('account.send_policy',{source:'microsoft',mode:'person',expectedVersion:0});await h.command('envelope.approve',{id,eligible:true})
  const envelope=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  await h.command('envelope.followup',{id,enabled:true,maxContacts:2,days:[1,2,3,4,5],startHour:9,endHour:17,escalationOwner:envelope.createdBy})
  await h.command('envelope.resend',{id,signer:0})
  const invitation=await h.mail('mara@clients.example','Please sign:'),replyAddress=invitation.reply_to??invitation.headers?.['Reply-To'];assert.match(replyAddress,/^reply\+[A-Za-z0-9_-]{43}@/)
  const privateText='Clause four needs legal review. synthetic-inkwell-9'
  const message={id:'reply-one',from:edge.person('Mara Quinn','mara@clients.example'),toRecipients:[edge.person('Inkwell',replyAddress)],subject:'Re: agreement',body:{contentType:'text',content:privateText},receivedDateTime:new Date(clock).toISOString(),internetMessageId:'synthetic-inkwell-8',internetMessageHeaders:[{name:'Authentication-Results',value:'dkim=pass'}],hasAttachments:false}
  edge.messages.set(message.id,message)
  assert.equal((await h.send('/api/inkwell/microsoft/replies',{messageId:message.id})).status,401)
  const viewer=await h.invite('outlook-reader@harbour.example','member');await h.post('/api/inkwell/microsoft/replies',{messageId:message.id},viewer,403)
  edge.messages.set('stale-reply',{...message,id:'stale-reply',receivedDateTime:new Date(clock-301000).toISOString()});await h.post('/api/inkwell/microsoft/replies',{messageId:'stale-reply'},h.owner,403)
  edge.messages.set('wrong-address',{...message,id:'wrong-address',toRecipients:[edge.person('Inkwell','reply+'+'a'.repeat(43)+'@replies.harbour.example')]});await h.post('/api/inkwell/microsoft/replies',{messageId:'wrong-address'},h.owner,403)
  await h.post('/api/inkwell/microsoft/replies',{messageId:message.id});await h.post('/api/inkwell/microsoft/replies',{messageId:message.id},h.owner,409)
  const view=async cookie=>(await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,cookie??h.owner)).value
  let state=await view();assert.equal(state.replies.length,1);assert.equal(state.replies[0].text,privateText);assert.equal(state.replies[0].verified,true);assert.equal(state.states[0].paused,true)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,viewer)).status,403)
  await h.command('envelope.followup_resume',{id,signer:0});assert.equal((await view()).states[0].paused,false)
  edge.messages.set('spoofed-reply',{...message,id:'spoofed-reply',from:edge.person('Other sender','other@clients.example')});await h.post('/api/inkwell/microsoft/replies',{messageId:'spoofed-reply'})
  state=await view();assert.equal(state.replies[1].verified,false);assert.equal(state.states[0].paused,false,'unverified sender never controls follow-up')
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  assert.ok(JSON.stringify(archive).includes(privateText));assert.ok(!JSON.stringify(archive).includes(replyAddress.match(/reply\+([^@]+)/)[1]));assert.ok(!JSON.stringify(archive).includes('synthetic-inkwell-1'))
  const restored=await harness({now:clock});try{await restored.post('/api/inkwell/archive/restore',{archive});assert.equal((await restored.send(`/api/inkwell/envelopes/${id}/followup`,undefined,restored.owner)).value.replies[0].text,privateText);assert.equal((await restored.db.prepare('SELECT count(*) AS n FROM iw_followup_capabilities').first()).n,0)}finally{await restored.close()}
  const audit=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/audit`,undefined,h.owner)).value;assert.ok(!JSON.stringify(audit).includes(privateText));assert.ok(!JSON.stringify(h.logs()).includes(privateText))
  await h.command('envelope.followup',{id,enabled:false});edge.messages.set('revoked-reply',{...message,id:'revoked-reply'});await h.post('/api/inkwell/microsoft/replies',{messageId:'revoked-reply'},h.owner,403)
  await h.command('envelope.void',{id,reason:'Owner erasure requested'});await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'});assert.equal((await h.db.prepare('SELECT count(*) AS n FROM iw_followup_replies WHERE envelope_id=?').bind(id).first()).n,0)
 }finally{await h.close()}
})
