// SEND-001: a live template edit holds the public approval path; a new confirmation keeps the prepared bytes.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe } from './a11y.mjs'

const app = await startInkwellWithMail(), images = process.env.INKWELL_TEMPLATE_RELEASE_IMAGES ?? '/tmp/inkwell-template-release'
await mkdir(images, { recursive: true })
try {
 const pdf = async text => { const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica); doc.addPage([612, 792]).drawText(text, { x: 60, y: 720, size: 18, font }); return Buffer.from(await doc.save()).toString('base64') }
 const original = await pdf('Harbour Studio - Approved services agreement'), newer = await pdf('Harbour Studio - Revised services agreement')
 const fields = [{ id: 'sig', label: 'Client signature', type: 'signature', signer: 0, page: 0, x: .1, y: .3, width: .4, height: .06 }]
 for (const width of [1440, 390]) {
  const approverEmail = `release.approver${width}@harbour.example`
  await app.call('/auth/invite', { body: { email: approverEmail, displayName: 'Dana Finance', role: 'admin' }, cookie: app.owner, status: 202 })
  const token = new URL(app.mail(approverEmail, '').text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  const approver = (await app.call('/auth/confirm', { body: { token }, status: 303 })).cookie
  const definition = { title: `Harbour services ${width}`, filename: 'services.pdf', pdfBase64: original, roles: [{ role: 'Client', order: 1 }], fields, approval: { approverEmail } }
  const t = await app.command('template.save', definition), email = `release.client${width}@clients.example`
  const { id } = await app.command('template.use', { id: t.id, recipients: [{ name: 'Mara Quinn', email }] })
  const bytes = async () => Buffer.from(await (await fetch(`${app.origin}/api/inkwell/envelopes/${id}/artifacts/original`, { headers: { cookie: app.owner } })).arrayBuffer())
  const frozen = await bytes()
  await app.command('envelope.approve', { id, eligible: true })
  await app.command('template.update', { ...definition, id: t.id, pdfBase64: newer, approval: null })
  const viewport = { width, height: width === 390 ? 844 : 1000 }
  const owner = await app.browser.newContext({ viewport, hasTouch: width === 390 }); await owner.addCookies([app.ownerCookie()])
  const reviewer = await app.browser.newContext({ viewport }); await reviewer.addCookies([{ name: approver.split('=')[0], value: approver.slice(approver.indexOf('=')+1), url: app.origin }])
  const page = await owner.newPage(), review = await reviewer.newPage()
  const capture = async (name, target) => { assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await axe(target, `SEND-001 ${name} ${width}`); await target.screenshot({ path: `${images}/${width}-${name}.png` }) }
  await review.goto(app.origin + '/app'); await review.getByRole('row', { name: new RegExp(definition.title) }).first().click()
  await review.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await review.getByText('Sending held.', { exact: true }).waitFor()
  assert.equal(app.mail(email, 'Please sign:'), undefined)
  await review.getByText('Sending held.', { exact: true }).scrollIntoViewIfNeeded(); await capture('approver-held', review)
  await page.goto(app.origin + '/app'); await page.getByRole('row', { name: new RegExp(definition.title) }).first().click()
  const detail = page.getByRole('region', { name: definition.title, exact: true })
  await detail.getByText('Sending held.', { exact: true }).waitFor()
  await detail.getByText('Sending held.', { exact: true }).scrollIntoViewIfNeeded(); await capture('editor-held', page)
  const confirmation = detail.getByLabel(/confirm it is eligible for electronic signature/)
  await confirmation.focus(); await page.keyboard.press('Space')
  await detail.getByRole('button', { name: 'Approve and invite first recipient', exact: true }).focus(); await page.keyboard.press('Enter')
  await detail.getByText('Waiting for internal approval from Dana Finance.').waitFor()
  await capture('frozen-rule-wait', page)
  await review.reload(); await review.getByRole('row', { name: new RegExp(definition.title) }).first().click()
  await review.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await review.getByText('Waiting for your approval.').waitFor({ state: 'detached' })
  assert.ok(app.mail(email, 'Please sign:')); assert.deepEqual(await bytes(), frozen)
  const sent = (await app.call('/api/inkwell/envelopes/' + id, { cookie: app.owner })).value.envelope
  assert.equal(sent.template.version, 1); assert.equal(sent.approvalRule.email, approverEmail)
  await capture('fresh-confirmation-released', review)
  await owner.close(); await reviewer.close()
 }
 console.log('SEND-001 template change held, frozen rule retained and fresh confirmation released unchanged bytes at 1440/390')
} catch (error) { await screenshots(app.browser, 'template-release'); throw error } finally { await app.close() }
