// RECORD-005: use the import, legal-hold, retention-warning and permanent-erasure screens at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'

const app = await startInkwellWithMail(), images = '/tmp/sx-inkwell-r13-retention-screens'
await mkdir(images, { recursive: true })
try {
 for (const width of [1440, 390]) {
  const fixture = JSON.parse(await readFile('tests/fixtures/docuseal/archive.json', 'utf8'))
  fixture.account = `harbour-suppliers-${width}`
  fixture.submissions[0].name = `Harbour Studio supplier agreement ${width}`
  const context = await app.browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390 })
  await context.addCookies([app.ownerCookie()])
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  const capture = async phase => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${phase}: no sideways scrolling at ${width}`); await page.screenshot({ path: `${images}/${width}-${phase}.png`, fullPage: true }) }
  await page.goto(app.origin + '/app')
  await page.getByRole('button', { name: 'Move in', exact: true }).click()
  await page.getByLabel('DocuSeal archive JSON').setInputFiles({ name: 'harbour-supplier.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) })
  await page.getByRole('button', { name: 'Run dry-run preview' }).click()
  await page.getByRole('checkbox', { name: /I reviewed these counts/ }).check()
  await page.getByRole('button', { name: 'Approve fingerprint and apply' }).click()
  await page.getByRole('heading', { name: 'Imported library (1)' }).waitFor()
  await capture('imported')
  await page.getByRole('button', { name: 'Place legal hold…', exact: true }).click()
  await page.getByLabel('Reason for legal hold', { exact: true }).fill('Preserve for the supplier dispute')
  await capture('hold-form')
  await page.getByRole('button', { name: 'Confirm legal hold', exact: true }).click()
  await page.getByText('Legal hold: Preserve for the supplier dispute', { exact: true }).waitFor()
  await capture('held')
  await app.command('account.retention', { years: 7 })
  const due = Date.parse('2033-10-14T11:00:00.000Z')
  await app.scheduled(due)
  await page.getByRole('button', { name: 'Refresh journal', exact: true }).click()
  await page.getByText('Legal hold: Preserve for the supplier dispute', { exact: true }).waitFor()
  assert.equal(await page.getByText(/Retention warning: this archive/).count(), 0)
  await page.getByRole('button', { name: 'Lift legal hold', exact: true }).click()
  await page.getByRole('button', { name: 'Place legal hold…', exact: true }).waitFor()
  await app.scheduled(due)
  await page.getByRole('button', { name: 'Refresh journal', exact: true }).click()
  await page.getByText(/Retention warning: this archive/).waitFor()
  await page.getByText('Legal hold history', { exact: true }).click()
  await page.getByText('Retention warning emails', { exact: true }).click()
  await page.getByText(/owner@harbour.example · Sent, delivery events are not set up|owner@harbour.example · Sent, no delivery event yet/).waitFor()
  await capture('warning')
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  await page.getByRole('region', { name: 'Activity feed' }).getByRole('button', { name: fixture.submissions[0].name, exact: true }).waitFor()
  await capture('activity')
  await page.getByRole('region', { name: 'Activity feed' }).getByRole('button', { name: fixture.submissions[0].name, exact: true }).click()
  await page.getByRole('heading', { name: 'Move in from DocuSeal', exact: true }).waitFor()
  await capture('warning-opened')
  await page.getByRole('button', { name: 'Erase imported record…', exact: true }).click()
  await page.getByLabel('Type ERASE to confirm', { exact: true }).fill('ERASE')
  await capture('erase')
  await page.getByRole('button', { name: 'Permanently erase', exact: true }).click()
  await page.getByRole('heading', { name: 'Imported library (0)' }).waitFor()
  await capture('erased')
  assert.ok(!(await app.call('/api/inkwell/notices', { cookie: app.owner })).value.notices.some(n => n.title.includes(fixture.submissions[0].name)), 'erasure clears the archive warning from Activity')
  await app.scheduled(due + 86400000)
  assert.ok(!(await app.call('/api/inkwell/notices', { cookie: app.owner })).value.notices.some(n => n.envelopeId.startsWith('import:')), 'erased imports never generate another retention warning')
  await context.close()
 }
 console.log('RECORD-005 passed at 1440 and 390: import, hold/lift history, scheduled retention warning, Activity opens Move in, explicit erase and empty library')
} catch(error) { await screenshots(app.browser, 'record-005-failure'); throw error } finally { await app.close() }
