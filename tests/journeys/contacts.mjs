// ROUTE-008 journey: at 1440 and 390 pixels the owner imports 200 contacts from CSV in Settings, then, preparing an
// envelope, finds a recipient by company and adds them as a signer.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { screenshots, startInkwell } from './worker.mjs'

const inkwell = await startInkwell(), proof = process.env.INKWELL_CONTACT_PROOF_DIR ?? join(tmpdir(), 'inkwell-contact-proof')
await mkdir(proof, { recursive: true })
try {
  const companies = ['Northwind Marine', 'Bayside Freight', 'Kestrel Labs', 'Harbour Counsel']
  const csv = ['name,email,phone,company', ...Array.from({ length: 200 }, (_, i) => `Contact ${String(i).padStart(3, '0')},contact${i}@clients.example,+1 617 555 ${1000 + i},${companies[i % 4]}`)].join('\n')
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await inkwell.browser.newContext({ viewport: { width, height } })
    await context.addCookies([inkwell.ownerCookie()])
    const page = await context.newPage()
    await page.goto(`${inkwell.origin}/app`)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByLabel('Import contacts from CSV').setInputFiles({ name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    // The second width imports the same file again: every row updates the contact with that email.
    await page.getByRole('status').filter({ hasText: width === 1440 ? 'Imported: 200 added, 0 updated.' : 'Imported: 0 added, 200 updated.' }).waitFor()
    await page.getByText('200 contacts, showing the first 50').waitFor()
    await page.getByRole('button', { name: 'New envelope' }).click()
    // Refine a completed search: suggestions from the previous query must disappear immediately.
    await page.getByLabel('Find a contact').fill('northwind')
    await page.getByRole('button', { name: 'Add Contact 000 as a recipient', exact: true }).waitFor()
    await page.getByLabel('Find a contact').fill('kestrel')
    const matches = page.getByRole('list', { name: 'Matching contacts' }).getByRole('listitem')
    await matches.first().waitFor()
    assert.ok((await matches.allTextContents()).every(text => text.includes('Kestrel Labs')), 'every suggestion is at Kestrel Labs')
    await page.getByRole('list', { name: 'Matching contacts' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(proof, `${width}-contact-matches.png`) })
    await page.getByRole('button', { name: 'Add Contact 002 as a recipient' }).click()
    assert.equal(await page.getByLabel('Recipient 1 name').inputValue(), 'Contact 002')
    assert.equal(await page.getByLabel('Recipient 1 email').inputValue(), 'contact2@clients.example')
    await page.getByLabel('Recipient 1 name').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(proof, `${width}-contact-picked.png`) })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll at ${width} pixels`)
    await context.close()
  }
  console.log('ROUTE-008 passed at 1440 and 390 pixels: 200 contacts imported from CSV, a recipient found by company and added')
} catch (error) {
  await screenshots(inkwell.browser, 'route-008-failure')
  throw error
} finally {
  await inkwell.close()
}
