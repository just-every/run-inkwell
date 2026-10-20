// AGENT-007: the template maker reviews ten recorded corrections, their diff and citations, then publishes version 2.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const inkwell = await startInkwellWithMail()
const evidence = process.env.INKWELL_SCREENSHOTS || join(tmpdir(), 'inkwell-template-maintenance')
await mkdir(evidence, { recursive: true })
try {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([612, 792]).drawText('Harbour Studio - Services agreement', { x: 60, y: 730, size: 18, font })
  const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
  const signature = { id: 'client-signature', label: 'Client signature', type: 'signature', signer: 0, page: 0, x: .1, y: .7, width: .5, height: .05 }
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const title = `Harbour Studio services ${width}`
    const { id } = await inkwell.command('template.save', { title, filename: 'services.pdf', pdfBase64, roles: [{ role: 'Client', order: 1 }], fields: [signature] })
    for (let i = 0; i < 10; i++) {
      const signers = [{ name: `Harbour client ${i + 1}`, email: `orders.${width}.${i}@clients.example` }]
      const created = await inkwell.command('template.use', { id, recipients: signers })
      await inkwell.command('envelope.update', { id: created.id, title: `${title} — order ${i + 1}`, filename: 'services.pdf', pdfBase64, signers, fields: [signature, { id: `purchase-order-${i}`, label: 'Purchase order', type: 'text', signer: 0, page: 0, x: .1, y: .5, width: .5, height: .05 }] })
      await inkwell.command('envelope.approve', { id: created.id, eligible: true })
    }
    const context = await inkwell.browser.newContext({ viewport: { width, height } })
    await context.addCookies([inkwell.ownerCookie()])
    const page = await context.newPage()
    await page.goto(`${inkwell.origin}/app`)
    await page.getByRole('button', { name: 'Templates', exact: true }).click()
    const row = page.getByRole('list', { name: 'Templates', exact: true }).getByRole('listitem').filter({ has: page.getByRole('button', { name: `Use ${title}`, exact: true }) })
    await row.getByRole('button', { name: 'Review template suggestions' }).click()
    const review = row.getByRole('region', { name: 'Template suggestions', exact: true })
    await review.getByRole('heading', { name: 'Suggested changes to version 1' }).waitFor()
    assert.equal(await review.getByRole('link', { name: /audit evidence/ }).count(), 10, 'AGENT-007: all ten example envelopes are cited')
    assert.equal(await review.getByRole('region', { name: 'Before', exact: true }).getByText('Purchase order', { exact: true }).count(), 0)
    await review.getByRole('region', { name: 'After', exact: true }).getByText('Purchase order', { exact: true }).waitFor()
    const publish = review.getByRole('button', { name: 'Publish suggested version' })
    assert.equal(await publish.isDisabled(), true, 'reviewing a proposal cannot publish it')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no sideways scroll`)
    await axe(page, `AGENT-007 review ${width}`)
    await page.screenshot({ path: join(evidence, `agent-007-review-${width}.png`), fullPage: true })
    // Use the keyboard for the approval boundary, with the same visible-focus check as other product journeys.
    const checkbox = review.getByRole('checkbox', { name: /I reviewed the suggested changes/ })
    await tabTo(page, checkbox)
    await page.keyboard.press('Space')
    await tabTo(page, publish)
    await page.keyboard.press('Enter')
    await review.getByText('Suggested template version published.', { exact: true }).waitFor()
    await row.getByText(/Version 2 · 1\. Client · 2 fields/).waitFor()
    await review.getByText('No repeated changes suggest a new template version.', { exact: true }).waitFor()
    await axe(page, `AGENT-007 published ${width}`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: join(evidence, `agent-007-published-${width}.png`), fullPage: true })
    await row.getByRole('button', { name: `Use ${title}`, exact: true }).click()
    await page.getByLabel('Client name').fill('Morgan River')
    await page.getByLabel('Client email').fill(`morgan.${width}@clients.example`)
    await page.getByRole('button', { name: 'Prepare to send' }).click()
    const detail = page.getByRole('region', { name: title, exact: true })
    await detail.getByLabel(/confirm it is eligible for electronic signature/).check()
    await detail.getByRole('button', { name: 'Approve and invite first recipient' }).click()
    const found = (await inkwell.call('/api/inkwell/envelopes', { cookie: inkwell.owner })).value.envelopes.find(e => e.title === title)
    const sent = (await inkwell.call(`/api/inkwell/envelopes/${found.id}`, { cookie: inkwell.owner })).value.envelope
    assert.equal(sent.template.version, 2)
    assert.ok(sent.fields.some(f => f.label === 'Purchase order'), 'AGENT-007: the next envelope inherits the learned field')
    await context.close()
  }
  console.log('AGENT-007: review, ten citations, explicit publication and version-2 send passed at 1440 and 390')
} catch (error) { await screenshots(inkwell.browser, 'template-maintenance'); throw error }
finally { await inkwell.close() }
