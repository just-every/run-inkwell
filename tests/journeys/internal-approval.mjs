// ROUTE-004: an owner sets the account approval rule and a template rule; an envelope above the threshold waits for the
// named approver, who rejects it with a reason the sender sees, then approves it so it sends, at 1440 and 390 pixels.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe } from './a11y.mjs'

const app = await startInkwellWithMail(), images = process.env.INKWELL_APPROVAL_IMAGES ?? '/tmp/inkwell-approval-screens'
await mkdir(images, { recursive: true })
try {
 const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
 pdf.addPage([612, 792]).drawText('Harbour Studio - Supply agreement', { x: 60, y: 740, size: 18, font })
 const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
 const defaultedPdf = await PDFDocument.create(), defaultedPage = defaultedPdf.addPage([612, 792])
 defaultedPage.drawText('{{signature:1}}', { x: 72, y: 600, size: 14 }); defaultedPage.drawText('{{signature:2}}', { x: 72, y: 500, size: 14 })
 const defaultedBytes = Buffer.from(await defaultedPdf.save())
 const fields = [{ id: 'sig', label: 'Client signature', signer: 0, type: 'signature', page: 0, x: .1, y: .2, width: .4, height: .05 }, { id: 'value', label: 'Contract value', signer: 0, type: 'number', page: 0, x: .1, y: .3, width: .3, height: .04, readOnly: true, prefill: { value: '25000.00', source: 'Sender input' } }]
 for (const width of [1440, 390]) {
  const email = `approver${width}@harbour.example`
  await app.call('/auth/invite', { body: { email, displayName: `Dana Finance ${width}`, role: 'admin' }, cookie: app.owner, status: 202 })
  const token = new URL(app.mail(email, '').text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token'), approver = (await app.call('/auth/confirm', { body: { token }, status: 303 })).cookie
  const viewport = { width, height: width === 390 ? 844 : 1000 }
  const owner = await app.browser.newContext({ viewport, hasTouch: width === 390 }); await owner.addCookies([app.ownerCookie()])
  const page = await owner.newPage(); page.setDefaultTimeout(20000)
  const capture = async (name, p) => { if (name.includes('held')) await p.getByText('Sending held.', { exact: true }).scrollIntoViewIfNeeded(); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} no sideways scroll ${width}`); await p.screenshot({ path: `${images}/${width}-${name}.png` }) }
  // The owner names the approver for envelopes whose Contract value is above 10,000 USD.
  await page.goto(app.origin + '/app'); await page.getByRole('button', { name: 'Settings', exact: true }).click()
  // ADMIN-004: keyboard-save account defaults and inspect the inherited controls on a new envelope.
  const defaults = page.getByRole('region', { name: 'Envelope defaults', exact: true })
  await defaults.getByLabel('Default expiry (days)', { exact: true }).fill('21')
  await defaults.getByLabel('Enable automatic reminders by default').check()
  await defaults.getByLabel('Default first reminder (business days)', { exact: true }).fill('2')
  await defaults.getByLabel('Default repeat reminder (business days)', { exact: true }).fill('3')
  const saveDefaults = defaults.getByRole('button', { name: 'Save envelope defaults', exact: true })
  await saveDefaults.focus(); await Promise.all([page.waitForResponse(response => response.url().endsWith('/api/inkwell') && response.request().method() === 'GET'), page.keyboard.press('Enter')])
  assert.equal((await app.call('/api/inkwell/envelope-defaults', { cookie: app.owner })).value.defaults.expiryDays, 21)
  await defaults.scrollIntoViewIfNeeded(); await axe(page, `ADMIN-004 defaults settings ${width}`); await capture('envelope-defaults', page)
  await page.emulateMedia({ colorScheme: 'dark' }); await axe(page, `ADMIN-004 defaults dark ${width}`); await capture('envelope-defaults-dark', page)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByRole('button', { name: 'Envelopes', exact: true }).click()
  await page.getByRole('button', { name: /Prepare.*envelope|New envelope/i }).first().click()
  await page.waitForFunction(() => [...document.querySelectorAll('input[type=number]')].some(input => input.value === '21'))
  assert.equal(await page.getByLabel(/^Expires after \(days\)/).inputValue(), '21')
  assert.equal(await page.getByLabel('Remind the recipients whose turn it is by email').isChecked(), true)
  assert.equal(await page.getByLabel('First reminder after (business days)', { exact: true }).inputValue(), '2')
  assert.equal(await page.getByLabel('Then every (business days)', { exact: true }).inputValue(), '3')
  await page.getByLabel(/^Expires after \(days\)/).scrollIntoViewIfNeeded()
  await axe(page, `ADMIN-004 inherited preparation ${width}`); await capture('inherited-preparation', page)
  await page.getByLabel(/^Expires after \(days\)/).fill('9')
  await page.getByLabel('Remind the recipients whose turn it is by email').uncheck()
  assert.equal(await page.getByLabel(/^Expires after \(days\)/).inputValue(), '9')
  await capture('overridden-preparation', page)
  const defaultedTitle = `Account defaults override ${width}`
  await page.getByLabel('Envelope title', { exact: true }).fill(defaultedTitle)
  await page.getByLabel('Fixed PDF document', { exact: true }).setInputFiles({ name: 'defaulted.pdf', mimeType: 'application/pdf', buffer: defaultedBytes })
  await page.getByText(/Placed 2 fields from the document/).waitFor()
  for (const n of [1, 2]) {
    await page.getByLabel(`Recipient ${n} name`, { exact: true }).fill(`Client ${n}`)
    await page.getByLabel(`Recipient ${n} email`, { exact: true }).fill(`defaults${width}.${n}@clients.example`)
  }
  const preparedResponse = page.waitForResponse(response => response.url().endsWith('/api/inkwell/commands') && response.request().postDataJSON()?.command === 'envelope.prepare')
  await page.getByRole('button', { name: 'Save prepared envelope', exact: true }).click()
  const defaultedId = (await (await preparedResponse).json()).result.id
  const defaultedEnvelope = (await app.call('/api/inkwell/envelopes/' + defaultedId, { cookie: app.owner })).value.envelope
  assert.equal(defaultedEnvelope.reminders, undefined, 'the unchecked browser choice explicitly overrides account reminders')
  assert.equal(Math.round((Date.parse(defaultedEnvelope.expiresAt) - Date.parse(defaultedEnvelope.createdAt)) / 86400000), 9)
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click()
  await page.getByRole('heading', { name: 'Edit draft', exact: true }).waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('input[type=number]')].some(input => input.value === '9'))
  assert.equal(await page.getByLabel('Remind the recipients whose turn it is by email').isChecked(), false)
  await page.getByLabel(/^Expires after \(days\)/).scrollIntoViewIfNeeded()
  await axe(page, `ADMIN-004 saved override ${width}`); await capture('saved-override', page)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  // Reset to the installation defaults so the rest of this journey keeps its own explicit settings.
  await defaults.getByLabel('Default expiry (days)', { exact: true }).fill('120')
  await defaults.getByLabel('Enable automatic reminders by default').uncheck()
  await Promise.all([page.waitForResponse(response => response.url().endsWith('/api/inkwell') && response.request().method() === 'GET'), defaults.getByRole('button', { name: 'Save envelope defaults', exact: true }).click()])
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
  // SEND-001: a shared editor confirms, then loses the share before the last approval. Nobody is invited.
  const editorEmail = `editor${width}@harbour.example`
  await app.call('/auth/invite', { body: { email: editorEmail, displayName: 'Robin Operations', role: 'member' }, cookie: app.owner, status: 202 })
  const editorToken = new URL(app.mail(editorEmail, '').text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  const editor = (await app.call('/auth/confirm', { body: { token: editorToken }, status: 303 })).cookie
  const editorId = (await app.call('/api/inkwell', { cookie: editor })).value.actor.id
  await app.command('member.role', { operatorId: editorId, role: 'sender' })
  const editorCommand = async (command, input) => (await app.call('/api/inkwell/commands', { cookie: editor, body: { command, input, commandId: crypto.randomUUID() } })).value.result
  const heldTitle = `Harbour services awaiting release ${width}`, heldEmail = `held${width}@clients.example`
  const heldId = (await app.command('envelope.prepare', { title: heldTitle, filename: 'services.pdf', pdfBase64, signers: [{ name: 'Mara Quinn', email: heldEmail }], fields })).id
  await app.command('envelope.share', { id: heldId, email: editorEmail, access: 'edit' })
  await editorCommand('envelope.approve', { id: heldId, eligible: true })
  await app.command('envelope.unshare', { id: heldId, operatorId: editorId })
  // Reopen the approver context to exercise the real decision control.
  const heldContext = await app.browser.newContext({ viewport })
  await heldContext.addCookies([{ name: approver.split('=')[0], value: approver.slice(approver.indexOf('=') + 1), url: app.origin }])
  const heldReview = await heldContext.newPage(); await heldReview.goto(app.origin + '/app')
  await heldReview.getByRole('row', { name: new RegExp(heldTitle) }).first().click()
  const release = heldReview.getByRole('button', { name: 'Approve and send', exact: true })
  await release.focus(); await heldReview.keyboard.press('Enter')
  await heldReview.getByText('Sending held.', { exact: true }).waitFor()
  assert.equal(app.mail(heldEmail, 'Please sign:'), undefined)
  await axe(heldReview, `SEND-001 approver held ${width}`); await capture('approver-held', heldReview)
  await page.reload(); await page.getByRole('row', { name: new RegExp(heldTitle) }).first().click()
  detail = page.getByRole('region', { name: heldTitle, exact: true })
  await detail.getByText('Sending held.', { exact: true }).waitFor()
  assert.match(await detail.ariaSnapshot(), /A current editor must review and confirm again/)
  await axe(page, `SEND-001 current editor held ${width}`); await capture('sender-held', page)
  await page.emulateMedia({ colorScheme: 'dark' }); await axe(page, `SEND-001 held dark ${width}`); await capture('sender-held-dark', page)
  await page.emulateMedia({ colorScheme: 'light' })
  const confirm = detail.getByLabel(/confirm it is eligible for electronic signature/)
  await confirm.focus(); await page.keyboard.press('Space')
  const confirmSend = detail.getByRole('button', { name: 'Approve and invite first recipient', exact: true })
  await confirmSend.focus(); await page.keyboard.press('Enter')
  await detail.getByText('Sending held.', { exact: true }).waitFor({ state: 'detached' })
  // The new request has its own confirmation, and this final approval releases it.
  await heldReview.reload(); await heldReview.getByRole('row', { name: new RegExp(heldTitle) }).first().click()
  await heldReview.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await heldReview.getByText('Waiting for your approval.').waitFor({ state: 'detached' })
  assert.ok(app.mail(heldEmail, 'Please sign:'))
  await capture('fresh-confirmation-sent', heldReview); await heldContext.close()
  // A scheduled confirmation is held by the hourly pass after the same share revocation.
  await app.command('account.internal_approval', { rule: null })
  const laterTitle = `Harbour services scheduled release ${width}`, laterEmail = `later${width}@clients.example`
  const laterId = (await app.command('envelope.prepare', { title: laterTitle, filename: 'services.pdf', pdfBase64, signers: [{ name: 'Mara Quinn', email: laterEmail }], fields })).id
  await app.command('envelope.share', { id: laterId, email: editorEmail, access: 'edit' })
  const scheduled = await editorCommand('envelope.approve', { id: laterId, eligible: true, sendAt: { at: new Date(Date.now()+2*86400000).toISOString().slice(0,16), timeZone: 'Pacific/Honolulu' } })
  await app.command('envelope.unshare', { id: laterId, operatorId: editorId })
  await app.scheduled(Date.parse(scheduled.scheduled.at)+60000)
  await page.reload(); await page.getByRole('row', { name: new RegExp(laterTitle) }).first().click()
  detail = page.getByRole('region', { name: laterTitle, exact: true })
  await detail.getByText('Sending held.', { exact: true }).waitFor(); assert.equal(app.mail(laterEmail, 'Please sign:'), undefined)
  await axe(page, `SEND-001 scheduled held ${width}`); await capture('scheduled-held', page)
  await detail.getByLabel(/confirm it is eligible for electronic signature/).check()
  await detail.getByRole('button', { name: 'Approve and invite first recipient', exact: true }).click()
  await detail.getByText('Sending held.', { exact: true }).waitFor({ state: 'detached' }); assert.ok(app.mail(laterEmail, 'Please sign:'))
  await capture('scheduled-confirmed-sent', page)
  // ADMIN-004 A8: Activity explains the held send, then an added policy approval enters the real approver screen.
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  const feed = page.getByRole('region', { name: 'Activity feed', exact: true })
  const heldNotice = feed.getByRole('listitem').filter({ has: page.getByRole('button', { name: laterTitle, exact: true }) }).filter({ hasText: 'Sending held' })
  await heldNotice.waitFor(); assert.match(await heldNotice.innerText(), /current editor must review and confirm again/)
  await heldNotice.scrollIntoViewIfNeeded(); await axe(page, `ADMIN-004 held notice ${width}`); await capture('activity-notice', page)
  await heldNotice.getByRole('button', { name: laterTitle, exact: true }).click()
  await page.getByRole('region', { name: laterTitle, exact: true }).waitFor()
  const policyTitle = `Harbour policy approval ${width}`, policyEmail = `policy${width}@clients.example`
  const policyId = (await app.command('envelope.prepare', { title: policyTitle, filename: 'services.pdf', pdfBase64, signers: [{ name: 'Mara Quinn', email: policyEmail }], fields })).id
  const policySchedule = await app.command('envelope.approve', { id: policyId, eligible: true, sendAt: { at: new Date(Date.now()+2*86400000).toISOString().slice(0,16), timeZone: 'Pacific/Honolulu' } })
  await app.command('account.internal_approval', { rule: { approverEmail: email } })
  const sendPolicies = (await app.call('/api/inkwell/send-policies', { cookie: app.owner })).value.policies
  await app.command('account.send_policy', { source: 'ad_hoc', expectedVersion: sendPolicies.find(p => p.source === 'ad_hoc').version, requireInternalApproval: true })
  await app.scheduled(Date.parse(policySchedule.scheduled.at)+60000)
  assert.equal(app.mail(policyEmail, 'Please sign:'), undefined)
  await page.reload(); await page.getByRole('row', { name: new RegExp(policyTitle) }).first().click()
  await page.getByText(`Waiting for internal approval from Dana Finance ${width}.`).waitFor()
  await axe(page, `ADMIN-004 newly required approval ${width}`); await capture('policy-approval-wait', page)
  const policyContext = await app.browser.newContext({ viewport })
  await policyContext.addCookies([{ name: approver.split('=')[0], value: approver.slice(approver.indexOf('=') + 1), url: app.origin }])
  const policyReview = await policyContext.newPage(); await policyReview.goto(app.origin + '/app')
  await policyReview.getByRole('row', { name: new RegExp(policyTitle) }).first().click()
  await policyReview.getByText('Waiting for your approval.').waitFor()
  await axe(policyReview, `ADMIN-004 policy approver ${width}`); await capture('policy-approver', policyReview)
  const policyApprove = policyReview.getByRole('button', { name: 'Approve and send', exact: true })
  await policyApprove.focus(); await policyReview.keyboard.press('Enter')
  await policyReview.getByText('Waiting for your approval.').waitFor({ state: 'detached' })
  assert.ok(app.mail(policyEmail, 'Please sign:'))
  const policySent = (await app.call('/api/inkwell/envelopes/' + policyId, { cookie: app.owner })).value.envelope
  assert.equal(policySent.scheduled, undefined); assert.equal(policySent.status, 'awaiting_signature')
  await capture('policy-approved-sent', policyReview); await policyContext.close()
  const currentPolicy = (await app.call('/api/inkwell/send-policies', { cookie: app.owner })).value.policies.find(p => p.source === 'ad_hoc')
  await app.command('account.send_policy', { source: 'ad_hoc', expectedVersion: currentPolicy.version, requireInternalApproval: false })
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
 console.log('SEND-001 held/reconfirmed scheduled and internal-approval sends; ROUTE-004 passed at 1440/390: account and template rules, waiting draft, reject with reason, approve and send, accessibility')
} catch (error) { await screenshots(app.browser, 'route-004'); throw error } finally { await app.close() }
