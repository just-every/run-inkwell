// PREP-011 joins PREP-005/SIGNX-001/003 through the built Worker, actual signing pages and captured mail edge.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const app = await startInkwellWithMail(), proof = process.env.INKWELL_FREEFORM_PROOF_DIR ?? '/tmp/inkwell-freeform'
await mkdir(proof, { recursive: true })
const pdf = await PDFDocument.create()
const letter = pdf.addPage([612, 792])
letter.drawText('Harbour Studio - Production approval', { x: 54, y: 730, size: 19 })
letter.drawText('We approve the workshop schedule and delivery arrangements.', { x: 54, y: 680, size: 12 })
letter.drawText('Client approval and studio countersignature follow below.', { x: 54, y: 650, size: 12 })
const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
const tab = async (page, control) => {
  await control.waitFor()
  if (await control.evaluate(el => el === document.activeElement)) return
  const backwards = await control.evaluate(el => Boolean(document.activeElement?.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING))
  await tabTo(page, control, { backwards })
}
const activate = async (page, control) => { await tab(page, control); await page.keyboard.press('Enter') }
const enter = async (page, control, value) => { await tab(page, control); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(String(value)) }
const choose = async (page, control, index) => { await tab(page, control); await page.keyboard.press('Home'); for (let n = 0; n < index; n++) await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter') }
const capture = async (page, width, state) => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${state}: no sideways scrolling`)
  await page.screenshot({ path: `${proof}/${width}-${state}.png` })
  await writeFile(`${proof}/${width}-${state}.aria.txt`, await page.locator('main').ariaSnapshot())
}
const invitation = email => app.mail(email, 'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]
async function openSigner(context, email) {
  const page = await context.newPage(); await page.goto(invitation(email))
  await activate(page, page.getByRole('button', { name: 'Email me a code', exact: true }))
  await enter(page, page.getByLabel('Email verification code', { exact: true }), app.mail(email, 'Your Inkwell verification code').text.match(/\b\d{6}\b/)[0])
  await activate(page, page.getByRole('button', { name: 'Verify code', exact: true }))
  await tab(page, page.getByRole('checkbox', { name: /I have read the electronic record/ })); await page.keyboard.press('Space')
  await activate(page, page.getByRole('button', { name: 'Agree and continue', exact: true }))
  await page.locator('.iw-pdf-page[data-rendered]').first().waitFor()
  return page
}
const path = page => page.url().replace('/sign/', '/api/sign/')
const view = async page => (await page.request.get(path(page))).json()
const post = (page, suffix, data) => page.request.post(path(page) + suffix, { headers: { origin: app.origin }, data })
async function add(page, type, label, top) {
  // Catalog ordering follows the existing field catalog after the free-form restriction.
  await choose(page, page.getByLabel('Field type', { exact: true }), ['signature', 'text', 'initials', 'date_signed', 'full_name'].indexOf(type))
  await enter(page, page.getByLabel('Field label', { exact: true }), label)
  await enter(page, page.getByLabel('New field left (%)', { exact: true }), 12)
  await enter(page, page.getByLabel('New field top (%)', { exact: true }), top)
  await activate(page, page.getByRole('button', { name: 'Add field', exact: true }))
}
async function consent(page) { await tab(page, page.getByRole('checkbox', { name: /consent to electronic signatures/ })); await page.keyboard.press('Space') }
try {
  const policy = (await app.call('/api/inkwell/freeform-policy', { cookie: app.owner })).value.policy
  await app.command('account.freeform', { enabled: true, expectedVersion: policy.version })
  for (const width of [1440, 390]) {
    const title = `Workshop production approval ${width}`, firstEmail = `mara-${width}@supplier.example`, secondEmail = `theo-${width}@harbour.example`
    const id = (await app.command('envelope.prepare', { title, filename: 'approval.pdf', pdfBase64, freeForm: true, allowReassign: true, fields: [], signers: [{ name: 'Mara Quinn', email: firstEmail, order: 1 }, { name: 'Theo Park', email: secondEmail, order: 2 }] })).id
    await app.command('envelope.approve', { id, eligible: true })
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } })
    const first = await openSigner(context, firstEmail)
    await consent(first)
    assert.ok(await first.getByRole('button', { name: 'Sign document', exact: true }).isDisabled(), 'a signature must be placed before finishing')
    const empty = await post(first, '/sign', { fields: [], values: {}, consent: true, commandId: crypto.randomUUID() })
    assert.equal(empty.status(), 400, 'the API also refuses finishing without a signature')
    // Add through the PREP-005 keyboard page, then move and resize through its unchanged inspector.
    await activate(first, first.getByRole('button', { name: /^Place field on page 1;/ }))
    await enter(first, first.getByLabel('Label of the selected field', { exact: true }), 'Client signature')
    await choose(first, first.getByLabel('Page of the selected field', { exact: true }), 0)
    await enter(first, first.getByLabel('Left (%) of the selected field', { exact: true }), 12)
    await enter(first, first.getByLabel('Top (%) of the selected field', { exact: true }), 33)
    await enter(first, first.getByLabel('Width (%) of the selected field', { exact: true }), 40)
    await enter(first, first.getByLabel('Height (%) of the selected field', { exact: true }), 6)
    const selection = first.getByRole('checkbox', { name: /^Select field 1:/ })
    await tab(first, selection); await first.keyboard.press('ArrowRight'); await first.keyboard.press('Shift+ArrowDown')
    await activate(first, first.getByRole('button', { name: 'Finish later', exact: true }))
    await first.getByRole('status').filter({ hasText: 'Saved. Open this same link to finish.' }).waitFor()
    const saved = await view(first)
    assert.equal(saved.fields.length, 1); assert.equal(saved.fields[0].x, .13); assert.equal(saved.fields[0].height, .07)
    await first.reload(); await first.getByRole('checkbox', { name: /^Select field 1: Client signature/ }).waitFor()
    assert.deepEqual((await view(first)).fields, saved.fields, 'blank placed fields resume from Finish later')
    // A temporary field is removed with Delete; only the signature and server-generated date are signed.
    await add(first, 'text', 'Temporary entry', 55)
    await tab(first, first.getByRole('checkbox', { name: /^Select field 2:/ })); await first.keyboard.press('Delete')
    assert.equal(await first.getByRole('checkbox', { name: /^Select field / }).count(), 1)
    await add(first, 'date_signed', 'Client date signed', 44)
    await first.getByRole('status').filter({ hasText: '1 of 2 required fields complete' }).waitFor()
    await activate(first, first.getByRole('button', { name: 'Start', exact: true }))
    const guided = first.getByRole('group', { name: 'Guided signing', exact: true })
    await enter(first, guided.getByRole('textbox', { name: /^Client signature/ }), 'Mara Quinn')
    const savedNext = first.waitForResponse(response => response.url().endsWith('/progress') && response.request().method() === 'POST')
    await activate(first, first.getByRole('button', { name: 'Next', exact: true })); assert.equal((await savedNext).status(), 200)
    const progress = await view(first); assert.equal(progress.fields.length, 2); assert.equal(progress.progress[progress.fields.find(field => field.type === 'signature').id], 'Mara Quinn')
    assert.ok((await first.locator('main').ariaSnapshot()).includes('Client date signed'), 'screen reader receives placed labels and automatic date')
    for (const colorScheme of ['light', 'dark']) { await first.emulateMedia({ colorScheme }); await axe(first, `PREP-011 signer 1 ${width} ${colorScheme}`) }
    await first.emulateMedia({ colorScheme: 'light' }); await capture(first, width, 'client-ready')
    await consent(first) // Reload reset consent; adopt and sign through the existing signing form.
    await activate(first, first.getByRole('button', { name: 'Sign document', exact: true }))
    await first.getByRole('heading', { name: 'Your signature has been recorded.', exact: true }).waitFor()
    let second = await openSigner(context, secondEmail)
    const before = await view(second); assert.equal(before.fields.length, 0); assert.equal(before.signedFields.length, 2)
    const prior = before.signedFields.find(field => field.type === 'signature')
    const locked = second.getByRole('region', { name: 'Earlier signed fields', exact: true })
    assert.ok((await locked.ariaSnapshot()).includes('Client signature'))
    assert.equal(await locked.getByRole('button').count(), 0, 'earlier signed placements have no edit controls')
    assert.equal(await second.getByLabel(/Move selected fields to/).count(), 0, 'there is no placement on behalf of another signer')
    await add(second, 'signature', 'Studio signature', 33)
    await second.getByRole('alert').filter({ hasText: /cannot overlap/ }).waitFor()
    assert.equal(await second.getByRole('checkbox', { name: /^Select field / }).count(), 0, 'the UI refuses overlap with signed fields')
    const overlapping = { ...prior, id: 'overlap', signer: 1 }
    assert.equal((await post(second, '/progress', { fields: [overlapping], values: {} })).status(), 400, 'the API refuses signed-field overlap')
    assert.equal((await post(second, '/progress', { fields: [{ ...overlapping, y: .65, signer: 0 }], values: {} })).status(), 400, 'the API refuses placement for signer 1')
    assert.equal((await post(second, '/progress', { fields: [{ ...prior, y: .65 }], values: {} })).status(), 400, 'the API refuses changing signer 1’s signed field')
    assert.deepEqual((await view(second)).signedFields, before.signedFields)
    await add(second, 'signature', 'Studio signature', 65)
    await add(second, 'date_signed', 'Studio date signed', 76)
    await enter(second, second.locator('.iw-sign-fields').getByRole('textbox', { name: /^Studio signature/ }), 'Theo Park')
    for (const colorScheme of ['light', 'dark']) { await second.emulateMedia({ colorScheme }); await axe(second, `PREP-011 signer 2 ${width} ${colorScheme}`) }
    await second.emulateMedia({ colorScheme: 'light' }); await capture(second, width, 'countersigner-ready')
    // Reassignment replaces this unsigned placement session; the delegate starts with no inherited entries.
    await activate(second, second.getByRole('button', { name: 'Finish later', exact: true }))
    await second.getByRole('status').filter({ hasText: 'Saved. Open this same link to finish.' }).waitFor()
    assert.equal((await view(second)).fields.length, 2)
    await activate(second, second.getByRole('button', { name: 'Reassign to someone else…', exact: true }))
    const delegateEmail = `nina-${width}@harbour.example`
    await enter(second, second.getByLabel('New signer’s name', { exact: true }), 'Nina Cole')
    await enter(second, second.getByLabel('New signer’s email', { exact: true }), delegateEmail)
    await enter(second, second.getByLabel('Reason for reassigning', { exact: true }), 'Nina is the production lead approving this schedule.')
    const oldPath = path(second)
    await activate(second, second.getByRole('button', { name: 'Reassign', exact: true }))
    await second.getByRole('status').filter({ hasText: `Reassigned to ${delegateEmail}` }).waitFor()
    assert.equal((await context.request.get(oldPath)).status(), 404, 'the reassigned signing link stops working')
    second = await openSigner(context, delegateEmail)
    const delegated = await view(second)
    assert.equal(delegated.fields.length, 0, 'reassignment clears unsigned placed fields')
    assert.deepEqual(delegated.progress, {}, 'reassignment clears unsigned values')
    assert.deepEqual(delegated.signedFields, before.signedFields, 'reassignment preserves earlier signed placements')
    await add(second, 'signature', 'Studio signature', 65)
    await add(second, 'date_signed', 'Studio date signed', 76)
    await enter(second, second.locator('.iw-sign-fields').getByRole('textbox', { name: /^Studio signature/ }), 'Nina Cole')
    await capture(second, width, 'reassigned-ready')
    await consent(second); await activate(second, second.getByRole('button', { name: 'Sign document', exact: true }))
    await second.getByRole('heading', { name: 'All signatures are complete.', exact: true }).waitFor()
    await second.locator('.iw-pdf-page[data-rendered]').first().waitFor(); await capture(second, width, 'completed')
    const executed = await second.request.get(path(second) + '/artifacts/signed'); assert.equal(executed.status(), 200)
    const bytes = await executed.body(); await writeFile(`${proof}/${width}-executed.pdf`, bytes)
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const document = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise
    const items = (await (await document.getPage(1)).getTextContent()).items
    const record = (await app.call(`/api/inkwell/envelopes/${id}`, { cookie: app.owner })).value.envelope
    assert.equal(record.status, 'completed'); assert.equal(record.fields.length, 4)
    for (const field of record.fields) {
      const value = record.signers[field.signer].values[field.id]
      const item = items.find(item => item.str === value && Math.abs(item.transform[4] - field.x * 612) < 1 && item.transform[5] >= (1 - field.y - field.height) * 792 && item.transform[5] <= (1 - field.y) * 792)
      assert.ok(item, `${field.label}: final PDF contains the signed value within the chosen field`)
    }
    await document.destroy(); await context.close()
  }
  console.log('PREP-011 passed: two-signers, keyboard placement/inspector/remove, Next/count and blank Finish later resume, reassignment reset, signature-required, immutable signed fields and UI/API overlap refusal, final signature/date positions; light/dark axe and ARIA snapshots at 1440/390')
} catch (error) { await screenshots(app.browser, 'freeform-failure'); throw error } finally { await app.close() }
