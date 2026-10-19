// TMPL-001 journey: at 1440 pixels the owner saves a three-role template from the Templates screen (PDF, roles in
// routing order, one signature field per role, 30-day expiry, reminders), then sends it to three people; at 390 pixels
// the same template goes to three different people, asking only each role's name and email. Both envelopes carry the
// template's fields, routing, reminders and expiry with no placement, and each first role is invited by email. On the
// built Worker with the Resend fake (tests/journeys/mail-worker.mjs). TMPL-005: on the prepare screen a fresh copy of a
// template's W-9 is offered that template with its confidence, applying it places every template field and its role, and
// an unrelated agreement is offered nothing; IDV-001: that recipient is set to link only and opens the document with
// Continue, with no code asked or sent. TMPL-002: the owner shares a template in a folder with one sender to use
// and the folder with another to edit; the first finds it by tag and sends from it with no Edit offered, the second
// saves its next version, and a third sender cannot find it.
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
  // IDV-001: the sender chooses link-only signing for this recipient and is told what that means.
  await prep.getByLabel('Recipient 1 authentication').selectOption('link')
  await prep.getByRole('note').filter({ hasText: 'Anyone with this link can sign as' }).waitFor()
  await prep.getByLabel('Envelope title').fill('Vera Vendor W-9'); await prep.getByLabel('Recipient 1 name').fill('Vera Vendor'); await prep.getByLabel('Recipient 1 email').fill('vera@vendors.example')
  await prep.getByRole('button', { name: 'Save prepared envelope' }).click()
  await prep.getByRole('region', { name: 'Vera Vendor W-9' }).waitFor()
  const matched = (await inkwell.call('/api/inkwell/envelopes', { cookie: inkwell.owner })).value.envelopes.find(e => e.title === 'Vera Vendor W-9')
  const placed = (await inkwell.call(`/api/inkwell/envelopes/${matched.id}`, { cookie: inkwell.owner })).value.envelope
  assert.deepEqual(placed.fields.map(({ id, page, x, y, type }) => ({ id, page, x, y, type })), w9Fields.map(({ id, page, x, y, type }) => ({ id, page, x, y, type })), 'the envelope carries the template fields where the template put them')
  assert.deepEqual(placed.signers.map(s => [s.name, s.order, s.message, s.linkOnly]), [['Vera Vendor', 1, 'Your W-9, please.', true]])
  const approval = prep.getByRole('region', { name: 'Vera Vendor W-9' })
  await approval.getByLabel(/confirm it is eligible for electronic signature/).check()
  await approval.getByRole('button', { name: 'Approve and invite first recipient' }).click()
  for (let tries = 0; !inkwell.mail('vera@vendors.example', 'Please sign:') && tries < 100; tries++) await prep.waitForTimeout(100)
  const signing = await matching.newPage()
  await signing.goto(inkwell.mail('vera@vendors.example', 'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0])
  await signing.getByRole('heading', { name: 'Open your document' }).waitFor()
  assert.equal(await signing.getByRole('button', { name: 'Email me a code' }).count(), 0, 'a link-only recipient is not asked for a code')
  await signing.getByRole('button', { name: 'Continue' }).click()
  await signing.getByRole('button', { name: 'Agree and continue' }).waitFor()
  assert.equal(inkwell.mail('vera@vendors.example', 'Your Inkwell verification code'), undefined, 'and no code is sent')
  await matching.close()
  console.log('TMPL-005 passed: a fresh W-9 copy was offered its template, applying placed every field; an unrelated agreement was offered nothing')
  // TMPL-002: shares to use and, through the folder, to edit; search by tag; no access, no result.
  const member = async email => {
    await inkwell.call('/auth/invite', { body: { email, displayName: email.split('@')[0], role: 'member' }, cookie: inkwell.owner, status: 202 })
    const token = new URL(inkwell.mail(email, '').text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token'), cookie = (await inkwell.call('/auth/confirm', { body: { token }, status: 303 })).cookie
    await inkwell.command('member.role', { operatorId: (await inkwell.call('/api/inkwell', { cookie })).value.actor.id, role: 'sender' })
    return cookie
  }
  const [uma, eli, nia] = [await member('uma@harbour.example'), await member('eli@harbour.example'), await member('nia@harbour.example')]
  const folderId = await inkwell.command('template.folder_create', { name: 'Vendor onboarding' }).then(r => r.id)
  await inkwell.command('template.save', { title: 'Vendor NDA', filename: 'nda.pdf', pdfBase64, roles: [{ role: 'Vendor', order: 1 }], fields: [{ id: 'nda-sign', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .3, width: .4, height: .07 }], tags: ['vendors', 'NDA'], folderId })
  const as = async (cookie, width = 1440) => { const context = await inkwell.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } }); await context.addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: inkwell.origin }]); const page = await context.newPage(); await page.goto(`${inkwell.origin}/app`); await page.getByRole('button', { name: 'Templates' }).click(); return { context, page } }
  const ownerView = await as(inkwell.owner)
  await ownerView.page.getByRole('button', { name: 'Share Vendor NDA' }).click()
  const panel = ownerView.page.getByRole('region', { name: 'Sharing Vendor NDA' })
  await panel.getByLabel('Share with (member email)').fill('uma@harbour.example'); await panel.getByRole('button', { name: 'Share' }).click()
  await panel.getByText('uma@harbour.example · can use').waitFor()
  await ownerView.page.getByLabel('Folder', { exact: true }).selectOption({ label: 'Vendor onboarding' })
  const folderPanel = ownerView.page.getByRole('region', { name: 'Sharing the folder Vendor onboarding' })
  await folderPanel.getByLabel('Share with (member email)').fill('eli@harbour.example'); await folderPanel.getByLabel('Access').selectOption('edit'); await folderPanel.getByRole('button', { name: 'Share' }).click()
  await folderPanel.getByText('eli@harbour.example · can edit').waitFor()
  await ownerView.context.close()
  for (const width of [1440, 390]) {
    const user = await as(uma, width)
    await user.page.getByLabel('Search templates').fill('nda')
    await user.page.getByText(/shared with you to use/).waitFor()
    assert.equal(await user.page.getByRole('button', { name: 'Edit Vendor NDA' }).count(), 0, `${width}px: a member with use access is not offered Edit`)
    assert.equal(await user.page.getByRole('button', { name: 'Share Vendor NDA' }).count(), 0, `${width}px: nor Share`)
    assert.ok(await user.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: no sideways scroll on the Templates screen`)
    if (width === 1440) {
      await user.page.getByRole('button', { name: 'Use Vendor NDA' }).click()
      await user.page.getByLabel('Vendor name').fill('Val Vendor'); await user.page.getByLabel('Vendor email').fill('val@vendors.example')
      await user.page.getByRole('button', { name: 'Prepare to send' }).click()
      await user.page.getByRole('region', { name: 'Vendor NDA' }).waitFor()
    }
    await user.context.close()
  }
  const editor = await as(eli)
  await editor.page.getByRole('button', { name: 'Edit Vendor NDA' }).click()
  await editor.page.waitForFunction(() => document.querySelector('[aria-label="Role 1 name"]')?.value === 'Vendor')
  await editor.page.getByLabel('Expires after (days)').fill('14')
  await editor.page.getByRole('button', { name: 'Save new version' }).click()
  await editor.page.getByText(/Version 2 · 1\. Vendor/).waitFor()
  await editor.context.close()
  const outsider = await as(nia)
  await outsider.page.getByLabel('Search templates').fill('nda')
  await outsider.page.getByText('No templates match.').waitFor()
  assert.equal(await outsider.page.getByLabel('Folder', { exact: true }).locator('option', { hasText: 'Vendor onboarding' }).count(), 0, 'nor its folder')
  await outsider.context.close()
  const nda = (await inkwell.call('/api/inkwell/templates?q=nda', { cookie: inkwell.owner })).value.templates
  assert.deepEqual(nda.map(t => [t.title, t.version, t.expiryDays, t.folder.name]), [['Vendor NDA', 2, 14, 'Vendor onboarding']], 'the editor saved version 2 in its folder')
  console.log('TMPL-002 passed: shared to use (found by tag, sent, no Edit), edited through a folder share, and not found without access')
  console.log('TMPL-001 and TMPL-003 passed at 1440 and 390 pixels: a three-role template saved once and sent twice with its fields, routing, reminders and expiry; a sent envelope saved as a template; an edit made version 2')
} catch (error) {
  await screenshots(inkwell.browser, 'tmpl-001-failure')
  throw error
} finally {
  await inkwell.close()
}
