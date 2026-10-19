// SIGNX-003 journey: accessible preparation and signing in a real browser against the emitted Worker.
// 1. axe-core's WCAG 2.0, 2.1 and 2.2 A and AA rules find no serious or critical violation on the preparation page and
//    each signing step (code, disclosure, fields), in the light and dark themes at 1440 and 390 pixels.
// 2. Keyboard only: the owner prepares and approves an envelope and the signer signs it with Tab, Enter, Space, arrows
//    and typing; every control reached shows a visible focus indicator.
// 3. Screen reader: a second signer completes an envelope by roles and accessible names alone, and the browser's
//    accessibility tree gives every field its label, page, required state and value, and the consent its checked state.
// 4. 200% zoom: a 1440 by 900 screen at 200% (720 by 450 CSS pixels at 2x) shows preparation and signing without
//    sideways scrolling.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { screenshots, startInkwell } from './worker.mjs'

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
const { origin, ownerCookie, command, browser, close } = await startInkwell()
const pdfBytes = async () => { const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica); for (let n = 1; n <= 2; n++) pdf.addPage([612, 792]).drawText(`Harbour access agreement, page ${n} of 2`, { x: 72, y: 720, size: 18, font }); return Buffer.from(await pdf.save()) }
const fields = [{ id: 'sig', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .4, width: .4, height: .06 }, { id: 'role', label: 'Job title', type: 'text', signer: 0, page: 1, x: .1, y: .3, width: .4, height: .05 }]
const prepare = async (title, signer) => { const { id } = await command('envelope.prepare', { title, filename: 'access.pdf', pdfBase64: (await pdfBytes()).toString('base64'), signers: [signer], fields }); return { id, invitation: (await command('envelope.approve', { id, eligible: true })).invitations[0] } }
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

async function axe(page, label) {
  await page.addScriptTag({ path: axePath })
  const { violations } = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }))
  const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  assert.deepEqual(serious.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), [], `${label}: no serious or critical WCAG violation`)
  return violations.length
}
/** Press Tab until `target` has focus (at most 80 presses), checking that each control reached shows its focus. */
async function tabTo(page, target) {
  for (let presses = 0; presses < 80; presses++) {
    await page.keyboard.press('Tab')
    // Focus styles fade in (a 0.15 s transition): read them at their end state. A date field's own calendar button is
    // the one control whose focus ring the browser draws inside the field (its host then does not match :focus).
    const focus = await page.evaluate(() => { const el = document.activeElement; el?.getAnimations().forEach(animation => animation.finish()); const style = el && getComputedStyle(el); return el && el !== document.body ? { tag: el.tagName, text: el.outerHTML.slice(0, 160), visible: (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none' || (el.type === 'date' && !el.matches(':focus')) } : null })
    if (focus) assert.ok(focus.visible, `visible focus on ${focus.tag} "${focus.text}"`)
    if (await target.evaluate(el => el === document.activeElement).catch(() => false)) return
  }
  throw new Error(`Tab never reached ${target}`)
}

try {
  // 1. Automated scan of every signing step and the preparation page, in both themes at both widths.
  let minor = 0
  // TMPL-001's screens are preparation too: a template's own prepare screen and the form that sends from it.
  await command('template.save', { title: 'Scan template', filename: 'access.pdf', pdfBase64: (await pdfBytes()).toString('base64'), roles: [{ role: 'Client' }], fields: [fields[0]] })
  for (const colorScheme of ['light', 'dark']) for (const [width, height] of [[1440, 900], [390, 844]]) {
    const label = `${colorScheme} ${width}`, { invitation } = await prepare(`Scan ${label}`, { name: 'Priya Shah', email: 'priya@harbour.example' })
    const signer = await browser.newContext({ viewport: { width, height }, colorScheme }), page = await signer.newPage()
    await page.goto(invitation.url)
    await page.getByLabel('Verification code').waitFor(); minor += await axe(page, `${label} verification`)
    await page.getByLabel('Verification code').fill(invitation.code); await page.getByRole('button', { name: 'Verify code' }).click()
    await page.getByRole('button', { name: 'Agree and continue' }).waitFor(); minor += await axe(page, `${label} disclosure`)
    await page.getByRole('checkbox', { name: /I have read the electronic record/ }).check(); await page.getByRole('button', { name: 'Agree and continue' }).click()
    await page.locator('.iw-pdf-page[data-rendered]').first().waitFor(); minor += await axe(page, `${label} signing`)
    const operator = await browser.newContext({ viewport: { width, height }, colorScheme }); await operator.addCookies([ownerCookie()])
    const app = await operator.newPage(); await app.goto(`${origin}/app`); await app.getByRole('button', { name: 'New envelope' }).click()
    await app.getByLabel('Fixed PDF document').setInputFiles({ name: 'access.pdf', mimeType: 'application/pdf', buffer: await pdfBytes() })
    await app.getByRole('button', { name: /Place field on page 1/ }).waitFor(); minor += await axe(app, `${label} preparation`)
    await app.getByRole('button', { name: 'Templates' }).click(); await app.getByRole('button', { name: 'New template' }).click()
    await app.getByLabel('Fixed PDF document').setInputFiles({ name: 'access.pdf', mimeType: 'application/pdf', buffer: await pdfBytes() })
    await app.getByRole('button', { name: /Place field on page 1/ }).waitFor(); minor += await axe(app, `${label} template preparation`)
    await app.getByRole('button', { name: 'Cancel' }).click(); await app.getByRole('button', { name: 'Use Scan template' }).click()
    await app.getByRole('heading', { name: 'Send Scan template' }).waitFor(); minor += await axe(app, `${label} template send`)
    await signer.close(); await operator.close()
  }
  console.log(`SIGNX-003 scan: no serious or critical WCAG 2.2 A/AA violation on preparation and signing (light and dark, 1440 and 390; ${minor} minor or moderate)`)

  // 2. Keyboard only, from an empty preparation form to a completed envelope.
  const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await owner.addCookies([ownerCookie()])
  const app = await owner.newPage(); await app.goto(`${origin}/app`)
  await tabTo(app, app.getByRole('button', { name: 'New envelope' })); await app.keyboard.press('Enter')
  await tabTo(app, app.getByLabel('Envelope title')); await app.keyboard.type('Keyboard access agreement')
  await tabTo(app, app.getByLabel('Fixed PDF document'))
  const [chooser] = await Promise.all([app.waitForEvent('filechooser'), app.keyboard.press('Space')])
  await chooser.setFiles({ name: 'access.pdf', mimeType: 'application/pdf', buffer: await pdfBytes() })
  await tabTo(app, app.getByLabel('Recipient 1 name')); await app.keyboard.type('Kai Morgan')
  await tabTo(app, app.getByLabel('Recipient 1 email')); await app.keyboard.type('kai@harbour.example')
  await tabTo(app, app.getByRole('button', { name: 'Remove recipient 2' })); await app.keyboard.press('Enter')
  await tabTo(app, app.getByRole('button', { name: /Place field on page 1/ })); await app.keyboard.press('Enter')
  await tabTo(app, app.getByLabel('Field type')); await app.keyboard.press('t')
  assert.equal(await app.getByLabel('Field type').inputValue(), 'text')
  await tabTo(app, app.getByRole('button', { name: /Place field on page 2/ })); await app.keyboard.press('Enter')
  await tabTo(app, app.getByRole('button', { name: 'Save prepared envelope' })); await app.keyboard.press('Enter')
  const eligible = app.getByRole('checkbox', { name: /I reviewed this envelope/ }); await eligible.waitFor()
  await tabTo(app, eligible); await app.keyboard.press('Space')
  await tabTo(app, app.getByRole('button', { name: 'Approve and invite first recipient' })); await app.keyboard.press('Enter')
  const link = app.locator('.iw-invitation-link a'); await link.waitFor()
  const url = await link.getAttribute('href'), code = (await app.getByText(/Verification code: \d{6}/).textContent()).match(/\d{6}/)[0]
  await owner.close()
  const kai = await browser.newContext({ viewport: { width: 1440, height: 900 } }), sign = await kai.newPage(); await sign.goto(url)
  await sign.getByLabel('Verification code').waitFor()
  await tabTo(sign, sign.getByLabel('Verification code')); await sign.keyboard.type(code); await sign.keyboard.press('Enter')
  const agree = sign.getByRole('checkbox', { name: /I have read the electronic record/ }); await agree.waitFor()
  await tabTo(sign, agree); await sign.keyboard.press('Space'); await sign.keyboard.press('Tab'); await sign.keyboard.press('Enter')
  const start = sign.getByRole('group', { name: 'Guided signing' }).getByRole('button', { name: 'Start' }); await start.waitFor()
  await tabTo(sign, start); await sign.keyboard.press('Enter')
  await sign.keyboard.type('Kai Morgan'); await sign.keyboard.press('Enter')
  await sign.keyboard.type('Harbour master'); await sign.keyboard.press('Enter')
  // After the last field, Next puts focus on the consent.
  await sign.waitForFunction(() => document.activeElement?.id === 'iw-consent'); await sign.keyboard.press('Space')
  await tabTo(sign, sign.getByRole('button', { name: 'Sign document' })); await sign.keyboard.press('Enter')
  await sign.getByRole('heading', { name: 'All signatures are complete.' }).waitFor()
  await kai.close()
  console.log('SIGNX-003 keyboard: prepared, approved and signed with the keyboard alone, with a visible focus on every control reached')

  // 3. Screen reader: the accessibility tree a screen reader reads, and only roles and names to act.
  const { invitation } = await prepare('Screen reader access agreement', { name: 'Lena Ortiz', email: 'lena@harbour.example' })
  const lena = await browser.newContext({ viewport: { width: 1440, height: 900 } }), reader = await lena.newPage(), cdp = await lena.newCDPSession(reader)
  const tree = async () => (await cdp.send('Accessibility.getFullAXTree')).nodes.filter(n => !n.ignored)
  const prop = (node, name) => node.properties?.find(p => p.name === name)?.value.value
  await reader.goto(invitation.url)
  await reader.getByRole('textbox', { name: 'Verification code' }).fill(invitation.code); await reader.getByRole('button', { name: 'Verify code' }).click()
  await reader.getByRole('checkbox', { name: /I have read the electronic record/ }).check(); await reader.getByRole('button', { name: 'Agree and continue' }).click()
  const form = reader.getByRole('heading', { name: 'Your fields' }); await form.waitFor()
  // Every field: its label, page and type in its name, and required; the progress count is a live status.
  const entries = (await tree()).filter(n => n.role?.value === 'textbox' && fields.some(f => n.name?.value.startsWith(f.label)))
  for (const field of fields) {
    const node = entries.find(n => n.name.value === `${field.label} Page ${field.page + 1} · ${field.type}`)
    assert.ok(node, `the accessibility tree names ${field.label} with its page and type`)
    assert.equal(prop(node, 'required'), true, `${field.label} is announced as required`)
  }
  assert.equal(await reader.getByRole('group', { name: 'Guided signing' }).getByRole('status').filter({ hasText: '0 of 2 required fields complete · 2 left' }).count(), 1, 'the count is a live status')
  await reader.getByRole('textbox', { name: 'Signature Page 1 · signature' }).fill('Lena Ortiz')
  await reader.getByRole('textbox', { name: 'Job title Page 2 · text' }).fill('Dock supervisor')
  await reader.getByRole('group', { name: 'Guided signing' }).getByRole('status').filter({ hasText: 'All 2 required fields complete' }).waitFor()
  const filled = (await tree()).filter(n => n.role?.value === 'textbox' && n.name?.value === 'Signature Page 1 · signature')
  assert.ok(filled.length && filled.every(n => n.value?.value === 'Lena Ortiz'), 'the entered value is announced with the field')
  assert.ok((await tree()).some(n => n.role?.value === 'radio' && n.name?.value.startsWith('Lena Ortiz') && prop(n, 'checked') === 'true'), 'the adopted signature style is announced as selected')
  const consent = reader.getByRole('checkbox', { name: /consent to electronic signatures/ }); await consent.check()
  assert.ok((await tree()).some(n => n.role?.value === 'checkbox' && /consent to electronic signatures/.test(n.name?.value) && prop(n, 'checked') === 'true'), 'the consent is announced as checked')
  await reader.getByRole('button', { name: 'Sign document' }).click()
  await reader.getByRole('heading', { name: 'All signatures are complete.' }).waitFor()
  assert.ok(await reader.getByRole('link', { name: 'Download executed PDF' }).isVisible())
  await lena.close()
  console.log('SIGNX-003 screen reader: signed by roles and names alone; every field has its label, page, required state and value in the accessibility tree')

  // 4. 200% zoom on a 1440 by 900 screen.
  const zoom = { viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 }
  const { invitation: zoomed } = await prepare('Zoomed access agreement', { name: 'Ade Bello', email: 'ade@harbour.example' })
  const zoomSigner = await browser.newContext(zoom), page = await zoomSigner.newPage(); await page.goto(zoomed.url)
  await page.getByLabel('Verification code').fill(zoomed.code); await page.getByRole('button', { name: 'Verify code' }).click()
  await page.getByRole('checkbox', { name: /I have read the electronic record/ }).check(); assert.ok(await noSideways(page), 'the disclosure fits at 200%')
  await page.getByRole('button', { name: 'Agree and continue' }).click(); await page.locator('.iw-pdf-page').first().waitFor()
  await page.evaluate(() => scrollTo(0, 0)); await page.locator('.iw-pdf-page[data-rendered]').first().waitFor()
  assert.ok(await noSideways(page), 'signing fits at 200%')
  await page.getByRole('button', { name: 'Sign document' }).scrollIntoViewIfNeeded(); assert.ok(await page.getByRole('button', { name: 'Sign document' }).isVisible())
  const zoomOwner = await browser.newContext(zoom); await zoomOwner.addCookies([ownerCookie()])
  const prep = await zoomOwner.newPage(); await prep.goto(`${origin}/app`); await prep.getByRole('button', { name: 'New envelope' }).click()
  await prep.getByLabel('Fixed PDF document').setInputFiles({ name: 'access.pdf', mimeType: 'application/pdf', buffer: await pdfBytes() })
  await prep.getByRole('button', { name: /Place field on page 1/ }).waitFor(); assert.ok(await noSideways(prep), 'preparation fits at 200%')
  await zoomSigner.close(); await zoomOwner.close()
  console.log('SIGNX-003 passed: scan, keyboard-only, screen-reader and 200% zoom journeys')
} catch (error) {
  await screenshots(browser, 'signx-003-failure')
  throw error
} finally {
  await close()
}
