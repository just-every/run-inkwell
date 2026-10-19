// TMPL-001 journey: at 1440 pixels the owner saves a three-role template from the Templates screen (PDF, roles in
// routing order, one signature field per role, 30-day expiry, reminders), then sends it to three people; at 390 pixels
// the same template goes to three different people, asking only each role's name and email. Both envelopes carry the
// template's fields, routing, reminders and expiry with no placement, and each first role is invited by email. On the
// built Worker with the Resend fake (tests/journeys/mail-worker.mjs). TMPL-005: on the prepare screen a fresh copy of a
// template's W-9 is offered that template with its confidence, applying it places every template field and its role, and
// an unrelated agreement is offered nothing.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { screenshots } from './worker.mjs'
import { startInkwellWithMail } from './mail-worker.mjs'
import { agreementPdf, w9Pdf } from '../fixtures/forms.mjs'

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
  // TMPL-003: a sent envelope saves as a new template; editing the first template makes its version 2.
  await page.getByRole('row', { name: /services template/ }).first().click()
  await page.getByRole('region', { name: title }).getByRole('button', { name: 'Save as template' }).click()
  await page.getByRole('status').filter({ hasText: `Saved as the template ${title}` }).waitFor()
  await page.getByRole('button', { name: 'Templates' }).click()
  await page.getByRole('button', { name: `Edit ${title}` }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: `Edit ${title}` }).count(), 2, 'the saved envelope is a second template')
  await page.getByRole('button', { name: `Edit ${title}` }).first().click()
  await page.getByRole('heading', { name: 'Edit template' }).waitFor()
  await page.waitForFunction(() => document.querySelector('[aria-label="Role 3 name"]')?.value === 'Company Signer')
  await page.getByLabel('Expires after (days)').fill('45')
  await page.getByRole('button', { name: 'Save new version' }).click()
  await page.getByText(/Version 2 · 1\. Client/).waitFor()
  await context.close()
  assert.deepEqual(stored.map(e => e.signers[0].email).sort(), sent.map(people => people[0].email).sort(), 'each send went to its own people')
  const templates = (await inkwell.call('/api/inkwell/templates', { cookie: inkwell.owner })).value.templates
  assert.deepEqual(templates.map(t => [t.version, t.expiryDays]).sort(), [[1, 30], [2, 45]], 'the edited template is version 2; the saved envelope is a new version 1 template')
  assert.ok(stored.every(e => e.template.version === 1 && Math.abs((Date.parse(e.expiresAt) - Date.parse(e.createdAt)) / 86_400_000 - 30) < .01), 'envelopes sent from version 1 keep its settings')
  // TMPL-005: upload a fresh copy of the W-9 a template uses; the match is offered, and applying it places every field.
  const w9Fields = [{ id: 'w9-tin', label: 'TIN', type: 'text', signer: 0, page: 0, x: .1, y: .5, width: .3, height: .04 }, { id: 'w9-signature', label: 'Signature', type: 'signature', signer: 0, page: 1, x: .1, y: .3, width: .35, height: .06 }, { id: 'w9-date', label: 'Date', type: 'date', signer: 0, page: 1, x: .55, y: .3, width: .25, height: .05 }]
  await inkwell.command('template.save', { title: 'Vendor W-9', filename: 'w9.pdf', pdfBase64: (await w9Pdf()).toString('base64'), roles: [{ role: 'Vendor', order: 1, message: 'Your W-9, please.' }], fields: w9Fields })
  const matching = await inkwell.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await matching.addCookies([inkwell.ownerCookie()])
  const prep = await matching.newPage()
  await prep.goto(`${inkwell.origin}/app`)
  await prep.getByRole('button', { name: 'New envelope' }).click()
  const upload = async (name, buffer) => { const answered = prep.waitForResponse(r => r.url().endsWith('/api/inkwell/templates/match')); await prep.getByLabel('Fixed PDF document').setInputFiles({ name, mimeType: 'application/pdf', buffer }); assert.equal((await answered).status(), 200) }
  await upload('agreement.pdf', await agreementPdf())
  await prep.getByRole('button', { name: /Place field on page 1/ }).waitFor()
  assert.equal(await prep.getByRole('region', { name: 'Matching templates' }).count(), 0, 'an unrelated agreement is offered nothing')
  await upload('w9-2026.pdf', await w9Pdf('Rev. October 2026'))
  const offer = prep.getByRole('region', { name: 'Matching templates' })
  await offer.getByText(/Vendor W-9 · version 1 · \d+% of its text matches/).waitFor()
  assert.equal(await prep.locator('.iw-placed > div').count(), 0, 'nothing is placed before the sender chooses')
  // SIGNX-003: the offer joins the preparation page's axe scan (WCAG 2.0-2.2 A and AA, no serious or critical violation).
  await prep.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') })
  const { violations } = await prep.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }))
  assert.deepEqual(violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id), [], 'the prepare screen with the offer passes the scan')
  await offer.getByRole('button', { name: 'Apply Vendor W-9' }).click()
  await offer.waitFor({ state: 'detached' })
  assert.equal(await prep.locator('.iw-placed > div').count(), w9Fields.length, 'applying places every template field')
  assert.equal(await prep.getByLabel('Recipient 1 name').getAttribute('placeholder'), 'Vendor: full name', 'the template role is the recipient')
  await prep.getByLabel('Envelope title').fill('Vera Vendor W-9'); await prep.getByLabel('Recipient 1 name').fill('Vera Vendor'); await prep.getByLabel('Recipient 1 email').fill('vera@vendors.example')
  await prep.getByRole('button', { name: 'Save prepared envelope' }).click()
  await prep.getByRole('region', { name: 'Vera Vendor W-9' }).waitFor()
  const matched = (await inkwell.call('/api/inkwell/envelopes', { cookie: inkwell.owner })).value.envelopes.find(e => e.title === 'Vera Vendor W-9')
  const placed = (await inkwell.call(`/api/inkwell/envelopes/${matched.id}`, { cookie: inkwell.owner })).value.envelope
  assert.deepEqual(placed.fields.map(({ id, page, x, y, type }) => ({ id, page, x, y, type })), w9Fields.map(({ id, page, x, y, type }) => ({ id, page, x, y, type })), 'the envelope carries the template fields where the template put them')
  assert.deepEqual(placed.signers.map(s => [s.name, s.order, s.message]), [['Vera Vendor', 1, 'Your W-9, please.']])
  await matching.close()
  console.log('TMPL-005 passed: a fresh W-9 copy was offered its template, applying placed every field; an unrelated agreement was offered nothing')
  console.log('TMPL-001 and TMPL-003 passed at 1440 and 390 pixels: a three-role template saved once and sent twice with its fields, routing, reminders and expiry; a sent envelope saved as a template; an edit made version 2')
} catch (error) {
  await screenshots(inkwell.browser, 'tmpl-001-failure')
  throw error
} finally {
  await inkwell.close()
}
