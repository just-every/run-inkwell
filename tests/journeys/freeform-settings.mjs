// PREP-011 / ADMIN-004: owner/admin default, member refusal, fieldless preparation and policy-off UI send refusal.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe } from './a11y.mjs'

const app = await startInkwellWithMail(), proof = process.env.INKWELL_FREEFORM_PROOF_DIR ?? '/tmp/inkwell-freeform'
await mkdir(proof, { recursive: true })
const cookie = value => ({ name: value.split('=')[0], value: value.slice(value.indexOf('=') + 1), url: app.origin })
async function member(email, role) {
  await app.call('/auth/invite', { cookie: app.owner, body: { email, displayName: email.split('@')[0], role: role === 'admin' ? 'admin' : 'member' }, status: 202 })
  const token = new URL(app.mail(email, '').text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  const session = (await app.call('/auth/confirm', { body: { token }, status: 303 })).cookie
  const id = (await app.call('/api/inkwell', { cookie: session })).value.actor.id
  if (role === 'sender') await app.command('member.role', { operatorId: id, role })
  return { session, id }
}
const policy = async () => (await app.call('/api/inkwell/freeform-policy', { cookie: app.owner })).value.policy
const flip = async enabled => app.command('account.freeform', { enabled, expectedVersion: (await policy()).version })
async function open(context, session) {
  await context.addCookies([cookie(session)])
  const page = await context.newPage(); page.setDefaultTimeout(15000); await page.goto(app.origin + '/app')
  return page
}
async function settings(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  return page.getByRole('region', { name: 'Free-form signing', exact: true })
}
async function change(page, panel, enabled) {
  const box = panel.getByRole('checkbox', { name: 'Allow free-form signing', exact: true })
  assert.equal(await box.isChecked(), !enabled)
  await box.focus(); await page.keyboard.press('Space')
  await panel.getByRole('button', { name: 'Save free-form setting', exact: true }).focus(); await page.keyboard.press('Enter')
  await panel.getByRole('status').filter({ hasText: enabled ? /^Allowed/ : /^Off/ }).waitFor()
  assert.equal((await policy()).enabled, enabled)
}
async function capture(page, width, state) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state} at ${width}: no sideways scroll`)
  await axe(page, `PREP-011 ${state} ${width}`)
  await page.screenshot({ path: `${proof}/${width}-${state}.png` })
}
try {
  const admin = await member('ada-admin@harbour.example', 'admin'), sender = await member('sam-sender@harbour.example', 'sender'), viewer = await member('vic-viewer@harbour.example', 'viewer')
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792]).drawText('Harbour Studio - Workshop consent letter', { x: 50, y: 730, size: 16 })
  const bytes = Buffer.from(await pdf.save())
  for (const width of [1440, 390]) {
    const viewport = { width, height: width === 390 ? 844 : 1000 }
    await flip(false)
    const ownerContext = await app.browser.newContext({ viewport }), owner = await open(ownerContext, app.owner)
    let panel = await settings(owner)
    await panel.getByRole('status').filter({ hasText: /^Off/ }).waitFor()
    await panel.scrollIntoViewIfNeeded(); await capture(owner, width, 'setting-off')
    await change(owner, panel, true)
    panel = owner.getByRole('region', { name: 'Free-form signing', exact: true })
    await panel.getByText(/Setting history/).click()
    await panel.scrollIntoViewIfNeeded(); await capture(owner, width, 'setting-enabled-history')
    // Both member roles have no setting control and the command refuses direct transport writes.
    for (const person of [sender, viewer]) {
      const context = await app.browser.newContext({ viewport }), page = await open(context, person.session)
      await settings(page)
      assert.equal(await page.getByRole('checkbox', { name: 'Allow free-form signing', exact: true }).count(), 0)
      await app.call('/api/inkwell/commands', { cookie: person.session, body: { command: 'account.freeform', commandId: crypto.randomUUID(), input: { enabled: false, expectedVersion: (await policy()).version } }, status: 403 })
      await capture(page, width, person === sender ? 'sender-settings' : 'viewer-settings')
      await context.close()
    }
    const context = await app.browser.newContext({ viewport }), page = await open(context, sender.session)
    await page.getByRole('button', { name: /Prepare.*envelope|New envelope/i }).first().click()
    const preparation = page.locator('section.iw-prepare')
    await preparation.getByLabel('Envelope title', { exact: true }).fill(`Workshop consent ${width}`)
    await preparation.getByLabel('Fixed PDF document', { exact: true }).setInputFiles({ name: 'workshop-consent.pdf', mimeType: 'application/pdf', buffer: bytes })
    await preparation.getByRole('button', { name: 'Remove recipient 2', exact: true }).click()
    await preparation.getByLabel('Recipient 1 name', { exact: true }).fill('Mara Quinn')
    await preparation.getByLabel('Recipient 1 email', { exact: true }).fill(`mara-settings-${width}@supplier.example`)
    await preparation.getByRole('checkbox', { name: 'Let each signer place their own fields (free-form)', exact: true }).check()
    assert.equal(await preparation.getByRole('heading', { name: 'Place fields', exact: true }).count(), 0)
    await capture(page, width, 'prepare-fieldless')
    await preparation.getByRole('button', { name: 'Save prepared envelope', exact: true }).click()
    const detail = page.getByRole('region', { name: `Workshop consent ${width}`, exact: true })
    await detail.getByText('Free-form signing · signers place their own fields', { exact: true }).waitFor()
    const adminContext = await app.browser.newContext({ viewport }), adminPage = await open(adminContext, admin.session)
    let adminPanel = await settings(adminPage); await change(adminPage, adminPanel, false)
    await page.reload(); await page.getByRole('row', { name: new RegExp(`Workshop consent ${width}`) }).first().click()
    await detail.getByLabel(/confirm it is eligible for electronic signature/).check()
    assert.equal(await detail.getByRole('button', { name: 'Approve and invite first recipient', exact: true }).isDisabled(), true)
    await detail.getByText(/Free-form signing is off/).waitFor(); await capture(page, width, 'send-refused-off')
    adminPanel = adminPage.getByRole('region', { name: 'Free-form signing', exact: true }); await change(adminPage, adminPanel, true)
    await adminPanel.getByText(/Setting history/).click(); await adminPanel.scrollIntoViewIfNeeded(); await capture(adminPage, width, 'admin-enabled-history')
    const history = (await app.call('/api/inkwell/freeform-policy/history', { cookie: app.owner })).value.history
    assert.equal(history.at(-1).actor, admin.id); assert.equal(history.at(-2).actor, admin.id)
    assert.ok(history.some(change => change.actor !== admin.id && change.after))
    await page.reload(); await page.getByRole('row', { name: new RegExp(`Workshop consent ${width}`) }).first().click()
    await detail.getByLabel(/confirm it is eligible for electronic signature/).check()
    await detail.getByRole('button', { name: 'Approve and invite first recipient', exact: true }).click()
    await detail.getByText('Invited, awaiting signature', { exact: false }).waitFor()
    assert.ok(app.mail(`mara-settings-${width}@supplier.example`, 'Please sign:'))
    await capture(page, width, 'sent-freeform')
    await context.close(); await adminContext.close(); await ownerContext.close()
  }
  console.log('PREP-011 / ADMIN-004: setting default, owner/admin changes and member UI/API refusal, fieldless preparation and policy-off send refusal passed at 1440/390')
} catch (error) { await screenshots(app.browser, 'freeform-settings-failure'); throw error } finally { await app.close() }
