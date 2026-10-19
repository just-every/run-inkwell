// MOBILE-001 journey: on a 390 by 844 touch screen the owner sends from a template (TMPL-001), tracks the envelope's
// status in the list and on its detail page, reminds the current signer, and voids a second envelope; then the app's
// web manifest is read by the browser itself (Chrome DevTools Protocol) and installs with no installability error.
// Correcting at 390 pixels is tests/journeys/correct-envelope.mjs. On the built Worker with the Resend fake.
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { screenshots } from './worker.mjs'
import { startInkwellWithMail } from './mail-worker.mjs'

const inkwell = await startInkwellWithMail()
try {
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
  const title = 'Harbour Studio — phone template'
  await inkwell.command('template.save', { title, filename: 'phone.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), roles: [{ role: 'Client' }], fields: [{ id: 'signature-0', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .4, width: .4, height: .07 }] })
  const context = await inkwell.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await context.addCookies([inkwell.ownerCookie()])
  const page = await context.newPage()
  const noSideways = async where => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll: ${where}`)
  await page.goto(`${inkwell.origin}/app`)
  const sendFromTemplate = async (name, email) => {
    await page.getByRole('button', { name: 'Templates' }).tap()
    await page.getByRole('button', { name: `Use ${title}` }).tap()
    await page.getByLabel('Client name').fill(name); await page.getByLabel('Client email').fill(email)
    await noSideways('send form')
    await page.getByRole('button', { name: 'Prepare to send' }).tap()
    const detail = page.getByRole('region', { name: title })
    await detail.getByLabel(/confirm it is eligible for electronic signature/).check()
    await detail.getByRole('button', { name: 'Approve and invite first recipient' }).tap()
    for (let tries = 0; !inkwell.mail(email, 'Please sign:') && tries < 100; tries++) await page.waitForTimeout(100)
    assert.ok(inkwell.mail(email, 'Please sign:'), `${email} is invited`)
    return detail
  }
  // Send, track and remind.
  let detail = await sendFromTemplate('Ana Reyes', 'ana@clients.example')
  await detail.getByText('Invited, awaiting signature').waitFor(); await detail.getByText('Waiting on: The recipient to open the invitation and verify their email').waitFor()
  await noSideways('envelope detail')
  const before = inkwell.sent().length
  await detail.getByRole('button', { name: 'Remind' }).tap()
  await detail.getByRole('status').filter({ hasText: 'Reminder sent to ana@clients.example' }).waitFor()
  assert.deepEqual(inkwell.sent().slice(before).map(m => [m.to, m.subject]), [[['ana@clients.example'], `Reminder to sign: ${title}`]], 'one reminder, to the signer')
  await detail.getByRole('button', { name: 'Close' }).first().tap()
  await page.getByRole('button', { name: 'Envelopes' }).tap()
  await page.getByRole('row', { name: new RegExp(title) }).first().waitFor()
  await noSideways('envelope list')
  // Void a second envelope from its detail page.
  detail = await sendFromTemplate('Ben Ode', 'ben@clients.example')
  await detail.getByRole('button', { name: 'Void envelope…' }).tap()
  await detail.getByLabel('Reason for voiding').fill('Sent to the wrong client.')
  await detail.getByRole('button', { name: 'Confirm void' }).tap()
  await detail.getByText(/Voided/).first().waitFor()
  const { envelopes } = (await inkwell.call('/api/inkwell/envelopes', { cookie: inkwell.owner })).value
  assert.deepEqual(envelopes.map(e => [e.signers[0].email, e.status, e.template?.title]).sort(), [['ana@clients.example', 'awaiting_signature', title], ['ben@clients.example', 'voided', title]])
  // Installable: the browser parses the manifest with no error, and reports nothing that stops installation. Playwright's
  // browser contexts are incognito-like, which a phone's own browser is not, so that one reason is set aside.
  const cdp = await context.newCDPSession(page)
  const manifest = await cdp.send('Page.getAppManifest')
  assert.equal(new URL(manifest.url).pathname, '/manifest.webmanifest')
  assert.deepEqual(manifest.errors, [], 'the manifest parses cleanly')
  const parsed = JSON.parse(manifest.data)
  assert.equal(parsed.display, 'standalone'); assert.equal(parsed.start_url, '/app')
  for (const icon of parsed.icons) { const response = await page.request.get(inkwell.origin + icon.src); assert.equal(response.status(), 200, icon.src); assert.equal(response.headers()['content-type'], 'image/png') }
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  assert.deepEqual(installabilityErrors.filter(e => e.errorId !== 'in-incognito'), [], 'nothing stops installation')
  await context.close()
  console.log('MOBILE-001 passed at 390 pixels: sent from a template, tracked, reminded and voided on a touch screen; the app installs as a PWA')
} catch (error) {
  await screenshots(inkwell.browser, 'mobile-001-failure')
  throw error
} finally {
  await inkwell.close()
}
