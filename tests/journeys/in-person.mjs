// ROUTE-007: use preparation, host attestation and signer doors at desktop, phone and tablet widths.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'

const app = await startInkwellWithMail()
const images = '/tmp/sx-inkwell-r13-screens'
await mkdir(images, { recursive: true })
try {
 const pdf = await PDFDocument.create(), p = pdf.addPage([612, 792]), font = await pdf.embedFont(StandardFonts.Helvetica)
 p.drawText('Harbour Studio - Supplier Agreement', { x: 60, y: 720, size: 19, font }); p.drawText('Supply the agreed materials by 30 November. Fee: USD 2,400.', { x: 60, y: 680, size: 11, font })
 for (const width of [1440, 390, 768]) {
  const email = `host${width}@harbour.example`
  await app.call('/auth/invite', { body: { email, displayName: 'Alex Rivera', role: 'admin' }, cookie: app.owner, status: 202 })
  const message = app.mail(email, ''); const token = new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  const host = (await app.call('/auth/confirm', { body: { token }, status: 303 })).cookie
  const title = `Harbour Studio supplier agreement ${width}`
  const { id } = await app.command('envelope.prepare', { title, filename: 'supplier.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers: [{ name: 'Mara Quinn', email: `mara${width}@clients.example` }], fields: [{ id: 'signature', label: 'Client signature', type: 'signature', signer: 0, page: 0, x: .1, y: .5, width: .4, height: .07 }] })
  const context = await app.browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width !== 1440 })
  await context.addCookies([{ name: host.split('=')[0], value: host.slice(host.indexOf('=') + 1), url: app.origin }])
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  const capture = async phase => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${phase}: no sideways scroll at ${width}`); await page.screenshot({ path: `${images}/${width}-${phase}.png`, fullPage: true }) }
  await page.goto(app.origin + '/app')
  await page.getByRole('row', { name: new RegExp(title) }).click()
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click()
  await page.locator('.iw-pdf-page').first().scrollIntoViewIfNeeded()
  await page.locator('.iw-pdf-page[data-rendered]').first().waitFor()
  await page.getByRole('combobox', { name: 'Recipient 1 authentication' }).selectOption('person')
  assert.equal(await page.getByRole('combobox', { name: 'Recipient 1 authentication' }).inputValue(), 'person')
  await capture('prepare')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  const detail = page.getByRole('region', { name: title }); await detail.waitFor()
  assert.equal((await app.call('/api/inkwell/envelopes/' + id, { cookie: app.owner })).value.envelope.signers[0].inPerson, true)
  await detail.getByRole('checkbox', { name: /I reviewed this envelope/ }).check()
  await detail.getByRole('button', { name: 'Approve and invite first recipient' }).click()
  await detail.getByRole('heading', { name: 'Host Mara Quinn in person' }).waitFor()
  await detail.getByRole('combobox', { name: 'How I confirmed their identity' }).selectOption('personally-known')
  await detail.getByRole('checkbox', { name: /I confirmed Mara Quinn/ }).check()
  await capture('host')
  await detail.getByRole('button', { name: 'Open in-person signing' }).click()
  await page.waitForURL('**/sign/*')
  const signingUrl = page.url()
  await page.getByText('Signing in person. The host attested', { exact: false }).waitFor()
  await capture('disclosure')
  await page.goto(app.origin + '/app')
  await page.waitForURL(signingUrl)
  assert.equal((await context.request.get(app.origin + '/api/inkwell')).status(), 401)
  await page.getByRole('checkbox', { name: /I have read the electronic record/ }).check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await page.locator('.iw-pdf-page').first().scrollIntoViewIfNeeded()
  await page.locator('.iw-pdf-page[data-rendered]').first().waitFor()
  await page.locator('.iw-sign-fields').getByRole('textbox', { name: /Client signature/ }).fill('Mara Quinn')
  await page.getByRole('checkbox', { name: /consent to electronic signatures/ }).check()
  await capture('signing')
  await page.getByRole('button', { name: 'Sign document', exact: true }).click()
  await page.waitForURL('**/signin')
  await page.getByRole('heading', { name: /Sign in/ }).waitFor()
  await capture('ended')
  await page.goto(app.origin + '/app'); await page.waitForURL('**/signin')
  const envelope = (await app.call('/api/inkwell/envelopes/' + id, { cookie: app.owner })).value.envelope
  assert.equal(envelope.status, 'completed'); assert.equal(envelope.signers[0].inPerson, true)
  await context.close()
 }
 console.log('ROUTE-007 passed at 1440, 390 and 768: prepare in person, approve, attest, handoff with no app access, consent, sign and return to host sign-in')
} catch (error) { await screenshots(app.browser, 'route-007-failure'); throw error } finally { await app.close() }
