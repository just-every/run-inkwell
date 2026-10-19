// TMPL-001 journey: at 1440 pixels the owner saves a three-role template from the Templates screen (PDF, roles in
// routing order, one signature field per role, 30-day expiry, reminders), then sends it to three people; at 390 pixels
// the same template goes to three different people, asking only each role's name and email. Both envelopes carry the
// template's fields, routing, reminders and expiry with no placement, and each first role is invited by email. On the
// built Worker with the Resend fake (tests/journeys/mail-worker.mjs).
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { screenshots } from './worker.mjs'
import { startInkwellWithMail } from './mail-worker.mjs'

const inkwell = await startInkwellWithMail()
try {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([612, 792]).drawText('Harbour Studio services agreement', { x: 60, y: 720, size: 18, font })
  const pdfBuffer = Buffer.from(await pdf.save()), title = 'Harbour Studio — services template', roles = ['Client', 'Guarantor', 'Company Signer']
  const sent = []
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await inkwell.browser.newContext({ viewport: { width, height } })
    await context.addCookies([inkwell.ownerCookie()])
    const page = await context.newPage()
    await page.goto(`${inkwell.origin}/app`)
    await page.getByRole('button', { name: 'Templates' }).click()
    if (width === 1440) {
      await page.getByRole('button', { name: 'New template' }).click()
      await page.getByRole('heading', { name: 'New template' }).waitFor()
      await page.getByLabel('Template name').fill(title)
      await page.getByLabel('Fixed PDF document').setInputFiles({ name: 'services.pdf', mimeType: 'application/pdf', buffer: pdfBuffer })
      await page.getByRole('button', { name: 'Add role' }).click()
      for (const [index, role] of roles.entries()) await page.getByLabel(`Role ${index + 1} name`).fill(role)
      await page.getByLabel('Expires after (days)').fill('30')
      await page.getByLabel('Remind the recipients whose turn it is by email').check()
      await page.getByLabel('Then every (business days)').fill('3')
      const sheet = page.getByRole('button', { name: /Place field on page 1/ })
      await sheet.waitFor()
      const box = await sheet.boundingBox()
      for (const index of [0, 1, 2]) {
        await page.locator('.iw-field-tools select').first().selectOption(String(index))
        await sheet.click({ position: { x: box.width * .15, y: box.height * (.3 + index * .2) } })
      }
      await page.getByRole('button', { name: 'Save template' }).click()
    }
    await page.getByRole('button', { name: `Use ${title}` }).click()
    await page.getByRole('heading', { name: `Send ${title}` }).waitFor()
    const people = roles.map((role, index) => ({ role, name: `${role} ${width}`, email: `${role.toLowerCase().replace(' ', '.')}.${width}@clients.example`, index }))
    for (const person of people) { await page.getByLabel(`${person.role} name`).fill(person.name); await page.getByLabel(`${person.role} email`).fill(person.email) }
    assert.equal(await page.getByRole('button', { name: /Place field/ }).count(), 0, `${width}px: sending from a template places nothing`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: no sideways scroll on the send form`)
    await page.getByRole('button', { name: 'Prepare to send' }).click()
    const detail = page.getByRole('region', { name: title })
    await detail.getByLabel(/confirm it is eligible for electronic signature/).check()
    await detail.getByRole('button', { name: 'Approve and invite first recipient' }).click()
    for (let tries = 0; !inkwell.mail(people[0].email, 'Please sign:') && tries < 100; tries++) await page.waitForTimeout(100)
    assert.ok(inkwell.mail(people[0].email, 'Please sign:'), `${width}px: the Client role is invited`)
    assert.equal(inkwell.mail(people[1].email, 'Please sign:'), undefined, `${width}px: the Guarantor waits for order 2`)
    sent.push(people)
    await context.close()
  }
  const { envelopes } = (await inkwell.call('/api/inkwell/envelopes', { cookie: inkwell.owner })).value
  assert.equal(envelopes.length, 2, 'two envelopes from one template')
  const stored = await Promise.all(envelopes.map(async e => (await inkwell.call(`/api/inkwell/envelopes/${e.id}`, { cookie: inkwell.owner })).value.envelope))
  assert.deepEqual(stored[0].fields, stored[1].fields, 'the same fields on both envelopes')
  for (const envelope of stored) {
    assert.equal(envelope.template.title, title)
    assert.deepEqual(envelope.signers.map(s => s.order), [1, 2, 3], 'routing order from the roles')
    assert.deepEqual(envelope.fields.map(f => f.signer).sort(), [0, 1, 2], 'one signature field per role')
    assert.deepEqual(envelope.reminders, { afterDays: 2, everyDays: 3 })
    const days = (Date.parse(envelope.expiresAt) - Date.parse(envelope.createdAt)) / 86_400_000
    assert.ok(Math.abs(days - 30) < .01, `expires 30 days after it was prepared (${days})`)
  }
  // MANAGE-001's template filter: on the Envelopes screen, only the envelopes sent from the template.
  const pdfBase64 = pdfBuffer.toString('base64')
  await inkwell.command('envelope.prepare', { title: 'Harbour Studio — ad hoc lease', filename: 'lease.pdf', pdfBase64, signers: [{ name: 'Ann Lee', email: 'ann@clients.example' }], fields: [{ id: 'signature-0', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .3, width: .4, height: .07 }] })
  const context = await inkwell.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies([inkwell.ownerCookie()])
  const page = await context.newPage()
  await page.goto(`${inkwell.origin}/app`)
  await page.getByRole('row', { name: /ad hoc lease/ }).waitFor()
  await page.getByLabel('Template').selectOption({ label: title })
  await page.getByRole('row', { name: /ad hoc lease/ }).waitFor({ state: 'detached' })
  assert.equal(await page.getByRole('row', { name: /services template/ }).count(), 2, 'the template filter shows both envelopes sent from it')
  await context.close()
  assert.deepEqual(stored.map(e => e.signers[0].email).sort(), sent.map(people => people[0].email).sort(), 'each send went to its own people')
  console.log('TMPL-001 passed at 1440 and 390 pixels: a three-role template saved once and sent twice with its fields, routing, reminders and expiry')
} catch (error) {
  await screenshots(inkwell.browser, 'tmpl-001-failure')
  throw error
} finally {
  await inkwell.close()
}
