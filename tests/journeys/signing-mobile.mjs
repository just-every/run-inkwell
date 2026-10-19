// SIGNX-001 journey: guided mobile-first signing in a real browser against the emitted Worker.
// A signer completes a ten-field, five-page envelope at 390 pixels using only Next, leaves halfway, returns from the same
// link and finishes; the return visit records time to first page on the throttled mobile profile below.
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { screenshots, startInkwell } from './worker.mjs'

// The throttled mobile profile (CONTRACT.md SIGNX-001): a 390 x 844 phone screen at 3x pixel density with touch, its CPU
// slowed 4x and its network held to 150 ms round trips, 9 Mbit/s down and 1.5 Mbit/s up through the Chrome DevTools
// Protocol, on a cold HTTP cache. Time to first page runs from the navigation to the signing link to the first page drawn.
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
const CPU_SLOWDOWN = 4, NETWORK = { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 }, FIRST_PAGE_MS = 3000

const { origin, owner, command, browser, close } = await startInkwell()
async function phone(storageState) {
  const context = await browser.newContext({ ...PHONE, ...(storageState ? { storageState } : {}) })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
  await cdp.send('Network.emulateNetworkConditions', NETWORK)
  return { context, page }
}
try {
  // Five pages with two fields each: a signature, text and dates, all required.
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 5; n++) { const page = pdf.addPage([612, 792]); page.drawText(`Harbour services agreement, page ${n} of 5`, { x: 72, y: 720, size: 18, font }); for (let line = 0; line < 24; line++) page.drawText(`Clause ${n}.${line + 1}: the provider performs the services described in schedule ${n}.`, { x: 72, y: 680 - line * 22, size: 11, font }) }
  const kinds = ['signature', 'text', 'date']
  const fields = Array.from({ length: 10 }, (_, i) => ({ id: `f${i + 1}`, label: ['Signature', 'Job title', 'Date'][i % 3], type: kinds[i % 3], signer: 0, page: Math.floor(i / 2), x: .12, y: i % 2 ? .78 : .3, width: .4, height: .05 }))
  const entry = field => field.type === 'signature' ? 'Priya Shah' : field.type === 'date' ? '2026-10-19' : 'Operations lead'
  const { id } = await command('envelope.prepare', { title: 'Harbour services agreement', filename: 'services.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers: [{ name: 'Priya Shah', email: 'priya@harbour.example' }], fields })
  const [invitation] = (await command('envelope.approve', { id, eligible: true })).invitations

  // First visit: verify, agree to the disclosure, then Start and Next through five fields and leave.
  const first = await phone()
  await first.page.goto(invitation.url)
  await first.page.getByLabel('Verification code').fill(invitation.code)
  await first.page.getByRole('button', { name: 'Verify code' }).click()
  await first.page.getByRole('checkbox', { name: /I have read the electronic record/ }).check()
  await first.page.getByRole('button', { name: 'Agree and continue' }).click()
  const guide = page => page.getByRole('group', { name: 'Guided signing' })
  const count = page => guide(page).getByRole('status').first()
  await count(first.page).filter({ hasText: '0 of 10 required fields complete · 10 left' }).waitFor()
  await guide(first.page).getByRole('button', { name: 'Start' }).click()
  const fillWithNext = async (page, from, to) => {
    for (let i = from; i < to; i++) {
      const field = fields[i]
      // Next has moved focus to this field's entry and scrolled the document to it.
      await page.waitForFunction(label => document.activeElement?.closest('.iw-guide label')?.querySelector('small')?.textContent === label, `Field ${i + 1} of 10 · Page ${field.page + 1} · ${field.type}`)
      await page.locator(`.iw-field-active[data-field-id="${field.id}"]`).waitFor()
      assert.ok(await page.locator(`[data-field-id="${field.id}"]`).evaluate(box => { const r = box.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight }), `${field.id} is on screen`)
      await page.locator(':focus').fill(entry(field))
      const saved = page.waitForResponse(response => response.url().endsWith('/progress'))
      await guide(page).getByRole('button', { name: 'Next' }).click()
      assert.ok((await saved).ok(), 'Next saves the entries')
      await count(page).filter({ hasText: i < 9 ? `${i + 1} of 10 required fields complete · ${9 - i} left` : 'All 10 required fields complete' }).waitFor()
    }
  }
  await fillWithNext(first.page, 0, 5)
  const signer = await first.context.storageState()
  await first.context.close()

  // Return to the same link on a cold cache: the first page is drawn within the budget and the entries are back.
  const back = await phone(signer)
  await back.page.goto(invitation.url)
  await back.page.locator('.iw-pdf-page[data-rendered]').first().waitFor()
  const firstPage = await back.page.evaluate(() => performance.getEntriesByName('iw-first-page')[0]?.startTime)
  console.log(`SIGNX-001 time to first page on return: ${Math.round(firstPage)} ms (390 x 844 at 3x, CPU ${CPU_SLOWDOWN}x slower, 150 ms RTT, 9 Mbit/s down, cold cache)`)
  assert.ok(firstPage < FIRST_PAGE_MS, `time to first page ${firstPage} ms is under ${FIRST_PAGE_MS} ms`)
  // Pages load progressively: only those near the screen are drawn, the rest when the signer reaches them.
  assert.equal(await back.page.locator('.iw-pdf-page').nth(4).getAttribute('data-rendered'), null, 'page 5 is not drawn before the signer reaches it')
  // Sharp on a phone: the first page's canvas carries the screen's 3x pixel density.
  assert.ok(await back.page.locator('.iw-pdf-page canvas').first().evaluate(canvas => canvas.width >= canvas.clientWidth * 3 - 1), 'the page is drawn at 3x density')
  await count(back.page).filter({ hasText: '5 of 10 required fields complete · 5 left' }).waitFor()
  await guide(back.page).getByRole('button', { name: 'Start' }).click()
  await fillWithNext(back.page, 5, 10)
  await count(back.page).filter({ hasText: 'All 10 required fields complete' }).waitFor()
  await back.page.locator('.iw-pdf-page').nth(4).and(back.page.locator('[data-rendered]')).waitFor()
  // After the last field, Next went to the consent; confirm it and sign.
  assert.equal(await back.page.evaluate(() => document.activeElement?.id), 'iw-consent')
  await back.page.getByRole('checkbox', { name: /consent to electronic signatures/ }).check()
  // 390 and 360 pixels: nothing is wider than the screen, so the signer never zooms or scrolls sideways.
  for (const width of [390, 360]) {
    await back.page.setViewportSize({ width, height: 800 })
    assert.ok(await back.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll at ${width} pixels`)
  }
  await back.page.getByRole('button', { name: 'Sign document' }).click()
  await back.page.getByRole('heading', { name: 'All signatures are complete.' }).waitFor()
  // The executed PDF then opens in the same viewer (the preloaded pdf.js worker serves a second document).
  await back.page.locator('.iw-pdf-page[data-rendered]').first().waitFor()
  assert.equal(await back.page.getByText('Could not load this PDF').count(), 0)
  await back.context.close()
  const view = await (await fetch(`${origin}/api/inkwell/envelopes/${id}`, { headers: { cookie: owner } })).json()
  assert.equal(view.envelope.status, 'completed')
  console.log('SIGNX-001 passed: ten fields over five pages at 390 pixels using only Next, left halfway, resumed from the same link and signed')
} catch (error) {
  await screenshots(browser, 'signx-001-failure')
  throw error
} finally {
  await close()
}
