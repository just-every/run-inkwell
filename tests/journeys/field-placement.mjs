// PREP-005 journey: direct field placement and editing on the prepare screen, on the built Worker.
// 1. At 1440 and 390 pixels the owner places twelve fields across a three-page PDF, four on each page: by clicking the
//    full page, clicking a page thumbnail and dragging the field chip onto a page and onto a thumbnail (pointer), and by
//    focusing a page or a thumbnail and pressing Enter (keyboard). One field is moved by drag and by arrow keys, resized
//    by its corner and by Shift+arrows, and dragged onto another page's thumbnail; one is duplicated to every page; two
//    are aligned and reassigned to the second recipient, taking that recipient's color; the saved envelope holds every
//    field exactly where the editor showed it.
// 2. SIGNX-003: with fields selected (the inspector with align open), axe finds no serious or critical WCAG 2.2 A/AA
//    violation in light and dark at both widths, and with the keyboard alone (Tab, Shift+Tab, Enter, Space, arrows,
//    typing) the owner places, moves, resizes, selects, duplicates to every page, aligns, reassigns and saves, with a
//    visible focus on every control reached.
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { screenshots, startInkwell } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const { origin, ownerCookie, browser, close } = await startInkwell()
const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
for (let n = 1; n <= 3; n++) pdf.addPage([612, 792]).drawText(`Harbour supply agreement, page ${n} of 3`, { x: 72, y: 720, size: 18, font })
const pdfBuffer = Buffer.from(await pdf.save())
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} vs ${b}`)

/** Every field as the editor shows it, in the order placed (the field list): id, page, recipient and box in page
 * fractions, and its color. */
const shown = async page => {
  const order = await page.locator('.iw-placed > div').evaluateAll(rows => rows.map(row => row.dataset.fieldId))
  const boxes = await page.locator('.iw-pdf-page .iw-field-edit').evaluateAll(els => els.map(el => ({ id: el.dataset.fieldId, page: Number(el.dataset.page), signer: Number(el.dataset.signer), x: parseFloat(el.style.left) / 100, y: parseFloat(el.style.top) / 100, width: parseFloat(el.style.width) / 100, height: parseFloat(el.style.height) / 100, color: getComputedStyle(el).borderTopColor })))
  return order.map(id => boxes.find(box => box.id === id))
}
const center = locator => locator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
const field = (page, id) => page.locator(`.iw-pdf-page [data-field-id="${id}"]`)
async function open(context, title) {
  const page = await context.newPage(); await page.goto(`${origin}/app`)
  await page.getByRole('button', { name: 'New envelope' }).click()
  await page.getByLabel('Envelope title').fill(title)
  await page.getByLabel('Fixed PDF document').setInputFiles({ name: 'supply.pdf', mimeType: 'application/pdf', buffer: pdfBuffer })
  for (const [index, name] of ['Mara Quinn', 'Theo Park'].entries()) { await page.getByLabel(`Recipient ${index + 1} name`).fill(name); await page.getByLabel(`Recipient ${index + 1} email`).fill(`${name.split(' ')[0].toLowerCase()}@harbour.example`) }
  await page.getByRole('button', { name: /^Place field on page 3/ }).waitFor()
  return page
}
/** Saves, then reads the stored envelope back through the API and checks it holds exactly the fields the editor showed. */
async function saveAndCompare(page, title, before) {
  await page.getByRole('button', { name: 'Save prepared envelope' }).click()
  await page.getByRole('checkbox', { name: /I reviewed this envelope/ }).waitFor()
  const found = await (await page.request.get(`${origin}/api/inkwell/envelopes?q=${encodeURIComponent(title)}`)).json()
  const envelope = found.envelopes.find(item => item.title === title)
  assert.ok(envelope, `${title} is saved`)
  const saved = (await (await page.request.get(`${origin}/api/inkwell/envelopes/${envelope.id}`)).json()).envelope ?? envelope
  assert.deepEqual(saved.fields.map(f => f.id).sort(), before.map(f => f.id).sort(), `${title}: every field is saved, none lost`)
  for (const f of before) { const s = saved.fields.find(item => item.id === f.id); assert.equal(s.page, f.page); assert.equal(s.signer, f.signer); for (const key of ['x', 'y', 'width', 'height']) near(s[key], f[key], `${title} ${f.id} ${key}`) }
  return saved
}
async function dragTo(page, from, to, { dx = 0, dy = 0, at } = {}) {
  const a = await from.boundingBox(), b = await to.boundingBox()
  const start = at ?? { x: a.x + a.width / 2, y: a.y + a.height / 2 }
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(b ? b.x + b.width / 2 + dx : start.x + dx, b ? b.y + b.height / 2 + dy : start.y + dy, { steps: 8 }); await page.mouse.up()
}

try {
  let minor = 0
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const label = `${width}px`, title = `Supply agreement ${width}`
    const context = await browser.newContext({ viewport: { width, height } }); await context.addCookies([ownerCookie()])
    const page = await open(context, title)
    const sheet = n => page.getByRole('button', { name: `Place field on page ${n}; press Enter to place at center` })
    const thumb = n => page.getByRole('button', { name: new RegExp(`^Page ${n} thumbnail`) })
    const chip = page.locator('.iw-drag-chip')
    // 1. Twelve fields, four on each page, by pointer and by keyboard.
    for (const n of [1, 2, 3]) { await center(sheet(n)); const box = await sheet(n).boundingBox(); await sheet(n).click({ position: { x: box.width * .1, y: box.height * .1 } }) }
    for (const n of [1, 2, 3]) { const box = await thumb(n).boundingBox(); await thumb(n).click({ position: { x: box.width * .5, y: box.height * .7 } }) }
    // The chip rides at the top of the screen with the thumbnails, so it and any page are on screen together.
    await center(sheet(2)); await dragTo(page, chip, sheet(2), { dy: (await sheet(2).boundingBox()).height * .15 })
    await dragTo(page, chip, thumb(3), { dy: (await thumb(3).boundingBox()).height * .35 })
    for (const n of [1, 2, 3]) { await sheet(n).focus(); await page.keyboard.press('Enter') }
    await thumb(1).focus(); await page.keyboard.press('Enter')
    let fields = await shown(page)
    assert.equal(fields.length, 12, `${label}: twelve fields placed`)
    assert.deepEqual([0, 1, 2].map(p => fields.filter(f => f.page === p).length), [4, 4, 4], `${label}: four on each of the three pages`)
    assert.ok(fields.every(f => f.signer === 0), `${label}: placed for the chosen recipient`)
    // The keyboard-placed thumbnail field lands on page 1's center, on top of the page's own: arrows move it clear.
    const last = fields[11]; assert.deepEqual([last.page, last.x, last.y], [0, .38, .45], `${label}: Enter on a thumbnail places at its center`)
    await field(page, last.id).focus()
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown')
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight')
    const moved = (await shown(page)).find(f => f.id === last.id)
    near(moved.y, last.y + .2, `${label}: arrow keys move`); near(moved.width, last.width + .05, `${label}: Shift+arrows resize`)
    // Drag a field to move it, drag its corner to resize it, then drag it onto page 3's thumbnail.
    const first = fields[0]; await center(field(page, first.id))
    const page1 = await sheet(1).boundingBox()
    await dragTo(page, field(page, first.id), field(page, first.id), { dx: page1.width * .2, dy: page1.height * .1 })
    let dragged = (await shown(page)).find(f => f.id === first.id)
    assert.ok(Math.abs(dragged.x - (first.x + .2)) < .01 && Math.abs(dragged.y - (first.y + .1)) < .01, `${label}: dragging moves the field (${JSON.stringify(dragged)})`)
    const handle = field(page, first.id).locator('.iw-field-handle'), corner = await handle.boundingBox()
    await dragTo(page, handle, handle, { dx: page1.width * .1, dy: page1.height * .02, at: { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 } })
    const resized = (await shown(page)).find(f => f.id === first.id)
    assert.ok(Math.abs(resized.width - (first.width + .1)) < .01 && Math.abs(resized.height - (first.height + .02)) < .01, `${label}: dragging the corner resizes`)
    const second = fields[3]; await center(field(page, second.id))
    await dragTo(page, field(page, second.id), thumb(2), { dy: (await thumb(2).boundingBox()).height * .3 })
    assert.equal((await shown(page)).find(f => f.id === second.id).page, 1, `${label}: a field dragged onto a thumbnail moves to that page`)
    // Duplicate the dragged field to every page.
    await field(page, first.id).click()
    await page.getByRole('button', { name: 'Duplicate to every page' }).click()
    fields = await shown(page)
    assert.equal(fields.length, 14, `${label}: duplicated to the two other pages`)
    for (const p of [1, 2]) assert.ok(fields.some(f => f.id !== first.id && f.page === p && f.x === resized.x && f.y === resized.y && f.width === resized.width), `${label}: a copy on page ${p + 1} in the same place`)
    // Select two fields (pointer at 1440, the field list at 390), align them and reassign them to the second recipient.
    const pair = [fields[1], fields[4]]
    if (width === 1440) { await field(page, pair[0].id).click(); await field(page, pair[1].id).click({ modifiers: ['Shift'] }) }
    else { await page.getByRole('button', { name: 'Clear selection' }).click(); for (const f of pair) await page.getByRole('checkbox', { name: new RegExp(`^Select field ${fields.findIndex(item => item.id === f.id) + 1}:`) }).check() }
    await page.getByRole('status').filter({ hasText: '2 fields selected' }).waitFor()
    minor += await axe(page, `${label} light, editing`)
    await page.emulateMedia({ colorScheme: 'dark' }); minor += await axe(page, `${label} dark, editing`); await page.emulateMedia({ colorScheme: 'light' })
    await page.getByRole('button', { name: 'Align left edges' }).click()
    await page.getByLabel('Move selected fields to recipient').selectOption('1')
    fields = await shown(page)
    const [a, b] = pair.map(p => fields.find(f => f.id === p.id))
    assert.equal(a.x, b.x, `${label}: aligned left edges`); assert.equal(a.x, Math.min(pair[0].x, pair[1].x))
    assert.deepEqual([a.signer, b.signer], [1, 1], `${label}: both reassigned to the second recipient`)
    assert.notEqual(a.color, fields.find(f => f.signer === 0).color, `${label}: reassigned fields take the second recipient's color`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no sideways scrolling`)
    await saveAndCompare(page, title, fields)
    await context.close()
  }
  console.log(`PREP-005: twelve fields placed by pointer and keyboard on three pages, moved, resized, duplicated to every page, aligned, reassigned and saved without loss at 1440 and 390; SIGNX-003 scan clean in light and dark (${minor} minor or moderate)`)

  // 2. SIGNX-003 keyboard-only: every editing action with a keyboard way.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await context.addCookies([ownerCookie()])
  const app = await context.newPage(); await app.goto(`${origin}/app`)
  await tabTo(app, app.getByRole('button', { name: 'New envelope' })); await app.keyboard.press('Enter')
  await tabTo(app, app.getByLabel('Envelope title')); await app.keyboard.type('Keyboard supply agreement')
  await tabTo(app, app.getByLabel('Fixed PDF document'))
  const [chooser] = await Promise.all([app.waitForEvent('filechooser'), app.keyboard.press('Space')])
  await chooser.setFiles({ name: 'supply.pdf', mimeType: 'application/pdf', buffer: pdfBuffer })
  for (const [index, name] of ['Mara Quinn', 'Theo Park'].entries()) { await tabTo(app, app.getByLabel(`Recipient ${index + 1} name`)); await app.keyboard.type(name); await tabTo(app, app.getByLabel(`Recipient ${index + 1} email`)); await app.keyboard.type(`${name.split(' ')[0].toLowerCase()}@harbour.example`) }
  await tabTo(app, app.getByRole('button', { name: /^Place field on page 1/ })); await app.keyboard.press('Enter')
  await tabTo(app, app.getByRole('button', { name: /^Place field on page 2/ })); await app.keyboard.press('Enter')
  const [one, two] = await shown(app)
  await tabTo(app, field(app, one.id), { backwards: true })
  for (let i = 0; i < 3; i++) await app.keyboard.press('ArrowRight')
  for (let i = 0; i < 2; i++) await app.keyboard.press('Shift+ArrowDown')
  await app.keyboard.press('Enter')
  await tabTo(app, app.getByRole('button', { name: 'Duplicate to every page' }), { backwards: true }); await app.keyboard.press('Enter')
  await tabTo(app, app.getByRole('checkbox', { name: /^Select field 2:/ })); await app.keyboard.press('Space')
  const before = await shown(app), b1 = before.find(f => f.id === one.id)
  near(b1.x, one.x + .03, 'keyboard: arrows moved'); near(b1.height, one.height + .02, 'keyboard: Shift+arrows resized')
  assert.equal(before.length, 4, 'keyboard: duplicated to pages 2 and 3')
  await tabTo(app, app.getByRole('button', { name: 'Align left edges' }), { backwards: true }); await app.keyboard.press('Enter')
  await tabTo(app, app.getByLabel('Move selected fields to recipient'), { backwards: true }); await app.keyboard.press('2')
  const keyed = await shown(app), k1 = keyed.find(f => f.id === one.id), k2 = keyed.find(f => f.id === two.id)
  assert.deepEqual([k1.x, k2.x], [two.x, two.x], 'keyboard: aligned left edges'); assert.deepEqual([k1.signer, k2.signer], [1, 1], 'keyboard: reassigned')
  assert.ok(keyed.some(f => f.signer === 0), 'the first recipient keeps the copies')
  await tabTo(app, app.getByRole('button', { name: 'Save prepared envelope' }))
  await app.keyboard.press('Enter')
  await app.getByRole('checkbox', { name: /I reviewed this envelope/ }).waitFor()
  const saved = await (await app.request.get(`${origin}/api/inkwell/envelopes?q=${encodeURIComponent('Keyboard supply agreement')}`)).json()
  assert.equal(saved.envelopes.find(item => item.title === 'Keyboard supply agreement').fields.length, 4, 'keyboard: saved with every field')
  await context.close()
  console.log('PREP-005 and SIGNX-003 keyboard: placed, moved, resized, selected, duplicated to every page, aligned, reassigned and saved with the keyboard alone, with a visible focus on every control reached')
} catch (error) {
  await screenshots(browser, 'prep-005-failure')
  throw error
} finally {
  await close()
}
