// MANAGE-005 journey: an envelope with three recipients in routing orders 1, 2 and 3, mid-routing (the first has signed,
// the second has verified and viewed, the third waits). At 1440 and 390 pixels the detail page shows each recipient's
// sent, delivered, viewed and signed times, in the account's time zone and UTC, matching the provider's delivery events
// (DELIV-001) and the audit trail, says what each recipient is waiting on, and its Remind action sends exactly one
// reminder, to the current signer only.
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { screenshots } from './worker.mjs'
import { startInkwellWithMail } from './mail-worker.mjs'

const inkwell = await startInkwellWithMail()
// Browsers and Node may space "10:02 AM" with different space characters; compare with plain spaces.
const plain = text => text.replace(/\s+/g, ' ')
const zoned = at => plain(`${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(at))} · ${new Date(at).toISOString().slice(11, 16)} UTC`)
try {
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
  const signers = [['Mara Quinn', 'mara@clients.example'], ['Noor Haddad', 'noor@clients.example'], ['Owen Price', 'owen@clients.example']].map(([name, email], i) => ({ name, email, order: i + 1 }))
  const title = 'Harbour Studio — supplier agreement'
  const { id } = await inkwell.command('envelope.prepare', { title, filename: 'supplier.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers, fields: signers.map((_, signer) => ({ id: `signature-${signer}`, label: 'Signature', type: 'signature', signer, page: 0, x: .1, y: .3 + signer * .15, width: .4, height: .07 })) })
  await inkwell.command('envelope.approve', { id, eligible: true })
  // Order 1: delivered by the provider a minute ago, verified, viewed, signed.
  const delivered = [Date.now() - 120_000, Date.now() - 60_000]
  await inkwell.deliver(inkwell.mail(signers[0].email, 'Please sign:'), 'email.delivered', delivered[0])
  const first = await inkwell.verify(signers[0].email)
  await inkwell.call(first.path + '/document', { cookie: first.cookie })
  await inkwell.call(first.path + '/sign', { body: { values: { 'signature-0': 'Mara Quinn' }, consent: true, commandId: crypto.randomUUID() }, cookie: first.cookie })
  // Order 2: invited after the signature, delivered, verified and viewed, not signed.
  await inkwell.deliver(inkwell.mail(signers[1].email, 'Please sign:'), 'email.delivered', delivered[1])
  const second = await inkwell.verify(signers[1].email)
  await inkwell.call(second.path + '/document', { cookie: second.cookie })
  assert.equal(inkwell.mail(signers[2].email, 'Please sign:'), undefined, 'order 3 is not invited yet')

  // The facts the page must show: the provider's delivery times and the audit trail's sent/viewed/signed times.
  const envelope = (await inkwell.call(`/api/inkwell/envelopes/${id}`, { cookie: inkwell.owner })).value.envelope
  const audit = (action, signer) => envelope.events.find(e => e.action === action && e.detail.signer === signer).at
  const invitation = signer => envelope.messages.find(m => m.kind === 'invitation' && m.signer === signer)
  const expected = [
    [['Sent', invitation(0).sentAt], ['Delivered', new Date(delivered[0]).toISOString()], ['Viewed', audit('signer.viewed', 0)], ['Signed', audit('signer.signed', 0)]],
    [['Sent', invitation(1).sentAt], ['Delivered', new Date(delivered[1]).toISOString()], ['Viewed', audit('signer.viewed', 1)]],
    [],
  ]

  let reminders = 0
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await inkwell.browser.newContext({ viewport: { width, height } })
    await context.addCookies([inkwell.ownerCookie()])
    const page = await context.newPage()
    await page.goto(`${inkwell.origin}/app`)
    await page.getByRole('row', { name: /supplier agreement/ }).click()
    const detail = page.getByRole('region', { name: title })
    await detail.waitFor()
    for (const [signer, steps] of expected.entries()) {
      const list = detail.getByRole('list', { name: `${signers[signer].name} timeline` })
      if (!steps.length) { assert.equal(await list.count(), 0, `${signers[signer].name} has no timeline yet`); continue }
      const items = (await list.getByRole('listitem').allTextContents()).map(plain)
      for (const [step, at] of steps) assert.ok(items.some(item => item.startsWith(`${step} ${zoned(at)}`)), `${width}px: ${signers[signer].name} ${step} ${zoned(at)} in ${JSON.stringify(items)}`)
      assert.ok(!items.some(item => item.startsWith('Signed')) || signer === 0, `${signers[signer].name} has not signed`)
    }
    await detail.getByText('Waiting on: The recipient to sign').waitFor()
    await detail.getByText('Waiting on: Routing order 2 to finish: Noor Haddad').waitFor()
    const before = inkwell.sent().length
    await detail.getByRole('button', { name: 'Remind' }).click()
    await detail.getByRole('status').filter({ hasText: `Reminder sent to ${signers[1].email}` }).waitFor()
    const added = inkwell.sent().slice(before)
    assert.deepEqual(added.map(m => [m.to, m.subject]), [[[signers[1].email], `Reminder to sign: ${title}`]], `${width}px: one reminder, to the current signer only`)
    reminders++
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll at ${width} pixels`)
    await context.close()
  }
  const audited = (await inkwell.call(`/api/inkwell/envelopes/${id}`, { cookie: inkwell.owner })).value.envelope.events.filter(e => e.action === 'signer.reminded')
  assert.deepEqual(audited.map(e => [e.detail.signer, e.detail.manual]), Array(reminders).fill([1, true]), 'each reminder is in the audit trail for the current signer')
  console.log('MANAGE-005 passed at 1440 and 390 pixels: sent, delivered, viewed and signed times match the provider events and audit trail; Remind reached only the current signer')
} catch (error) {
  await screenshots(inkwell.browser, 'manage-005-failure')
  throw error
} finally {
  await inkwell.close()
}
