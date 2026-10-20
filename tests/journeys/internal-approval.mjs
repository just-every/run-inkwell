// ROUTE-004: an owner sets the account approval rule and a template rule; an envelope above the threshold waits for the
// named approver, who rejects it with a reason the sender sees, then approves it so it sends, at 1440 and 390 pixels.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe } from './a11y.mjs'

const app = await startInkwellWithMail(), images = '/tmp/sx-inkwell-r17-approval-screens'
await mkdir(images, { recursive: true })
try {
 const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
 pdf.addPage([612, 792]).drawText('Harbour Studio - Supply agreement', { x: 60, y: 740, size: 18, font })
 const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
 const fields = [{ id: 'sig', label: 'Client signature', signer: 0, type: 'signature', page: 0, x: .1, y: .2, width: .4, height: .05 }, { id: 'value', label: 'Contract value', signer: 0, type: 'number', page: 0, x: .1, y: .3, width: .3, height: .04, readOnly: true, prefill: { value: '25000.00', source: 'Sender input' } }]
 for (const width of [1440, 390]) {
  const email = `approver${width}@harbour.example`
  await app.call('/auth/invite', { body: { email, displayName: `Dana Finance ${width}`, role: 'admin' }, cookie: app.owner, status: 202 })
  const token = new URL(app.mail(email, '').text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token'), approver = (await app.call('/auth/confirm', { body: { token }, status: 303 })).cookie
  const viewport = { width, height: width === 390 ? 844 : 1000 }
  const owner = await app.browser.newContext({ viewport, hasTouch: width === 390 }); await owner.addCookies([app.ownerCookie()])
  const page = await owner.newPage(); page.setDefaultTimeout(20000)
  const capture = async (name, p) => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} no sideways scroll ${width}`); await p.screenshot({ path: `${images}/${width}-${name}.png` }) }
  // The owner names the approver for envelopes whose Contract value is above 10,000 USD.
  await page.goto(app.origin + '/app'); await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Internal approval', exact: true }) })
  await panel.getByLabel('Require an internal approval before it is sent').check(); await panel.getByLabel('Approver email').fill(email)
  await panel.getByLabel('Only when a USD amount is above a threshold').check(); await panel.getByLabel('Number field label').fill('Contract value'); await panel.getByLabel('Above (USD)').fill('10000')
  await panel.scrollIntoViewIfNeeded(); await axe(page, `ROUTE-004 account rule ${width}`); await capture('account-rule', page)
  await panel.getByRole('button', { name: 'Save', exact: true }).click(); await panel.getByText(/approves envelopes whose Contract value is above 10000.00 USD/).waitFor()
  // The owner's eligibility approval leaves the draft waiting for the approver; nobody is invited.
  const title = `Supply ${width}`, { id } = await app.command('envelope.prepare', { title, filename: 'supply.pdf', pdfBase64, signers: [{ name: 'Mara Quinn', email: `mara${width}@clients.example` }], fields })
  await page.getByRole('button', { name: 'Envelopes', exact: true }).click(); await page.getByRole('row', { name: new RegExp(title) }).first().click()
  let detail = page.getByRole('region', { name: title, exact: true })
  await detail.getByLabel(/confirm it is eligible for electronic signature/).check(); await detail.getByRole('button', { name: 'Approve and invite first recipient', exact: true }).click()
  await detail.getByText(`Waiting for internal approval from Dana Finance ${width}.`).waitFor(); assert.equal(app.mail(`mara${width}@clients.example`, 'Please sign:'), undefined)
  await axe(page, `ROUTE-004 waiting ${width}`); await capture('sender-waiting', page)
  // The approver finds it waiting for them and rejects it with a reason.
  const second = await app.browser.newContext({ viewport, hasTouch: width === 390 }); await second.addCookies([{ name: approver.split('=')[0], value: approver.slice(approver.indexOf('=') + 1), url: app.origin }])
  const review = await second.newPage(); review.setDefaultTimeout(20000); await review.goto(app.origin + '/app'); await review.getByRole('row', { name: new RegExp(title) }).first().click()
  let decision = review.getByRole('region', { name: title, exact: true }); await decision.getByText('Waiting for your approval.').waitFor()
  await decision.getByRole('button', { name: 'Reject…', exact: true }).click(); await decision.getByLabel('Reason for rejecting').fill('Volume discount missing from clause 4')
  await axe(review, `ROUTE-004 reject ${width}`); await capture('approver-reject', review); await decision.getByRole('button', { name: 'Confirm rejection', exact: true }).click()
  // The sender sees the reason on the returned draft, approves again, and the approver's approval sends it.
  await page.reload(); await page.getByRole('row', { name: new RegExp(title) }).first().click(); detail = page.getByRole('region', { name: title, exact: true })
  await detail.getByText('Volume discount missing from clause 4', { exact: true }).first().waitFor(); await axe(page, `ROUTE-004 rejected ${width}`); await capture('sender-rejected', page)
  await detail.getByLabel(/confirm it is eligible for electronic signature/).check(); await detail.getByRole('button', { name: 'Approve and invite first recipient', exact: true }).click(); await detail.getByText(`Waiting for internal approval from Dana Finance ${width}.`).waitFor()
  await review.reload(); await review.getByRole('row', { name: new RegExp(title) }).first().click(); decision = review.getByRole('region', { name: title, exact: true })
  await decision.getByRole('button', { name: 'Approve and send', exact: true }).click(); await decision.getByText('Waiting for your approval.').waitFor({ state: 'detached' })
  const sent = (await app.call('/api/inkwell/envelopes/' + id, { cookie: app.owner })).value.envelope
  assert.equal(sent.status, 'awaiting_signature'); assert.ok(app.mail(`mara${width}@clients.example`, 'Please sign:'), 'the approval sends the invitation')
  await capture('approver-sent', review); await second.close()
  // A template carries its own rule, edited on the template screen.
  await app.command('account.internal_approval', { rule: null })
  const template = `Supply template ${width}`; await app.command('template.save', { title: template, filename: 'supply.pdf', pdfBase64, roles: [{ role: 'Client', order: 1 }], fields })
  await page.getByRole('button', { name: 'Templates', exact: true }).click(); await page.getByRole('button', { name: `Edit ${template}`, exact: true }).click()
  const rule = page.getByRole('group', { name: 'Internal approval' }); await rule.getByLabel('Require an internal approval before it is sent').check(); await rule.getByLabel('Approver email').fill(email)
  await rule.scrollIntoViewIfNeeded(); await axe(page, `ROUTE-004 template rule ${width}`); await capture('template-rule', page)
  await page.getByRole('button', { name: 'Save new version', exact: true }).click(); await page.getByRole('button', { name: `Use ${template}`, exact: true }).waitFor()
  const saved = (await app.call('/api/inkwell/templates', { cookie: app.owner })).value.templates.find(t => t.title === template)
  assert.equal(saved.approval.email, email)
  await owner.close()
 }
 console.log('ROUTE-004 passed at 1440/390: account and template rules, waiting draft, reject with reason, approve and send, accessibility')
} catch (error) { await screenshots(app.browser, 'route-004'); throw error } finally { await app.close() }
