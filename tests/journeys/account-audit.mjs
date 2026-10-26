// Real account changes and their history through the built Worker and Settings, at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const app = await startInkwellWithMail()
const images = process.env.INKWELL_AUDIT_PROOF_DIR ?? '/tmp/inkwell-account-audit'
await mkdir(images, { recursive: true })
const cookie = value => ({ name: value.slice(0, value.indexOf('=')), value: value.slice(value.indexOf('=') + 1), url: app.origin })
async function member(email, role) {
  await app.call('/auth/invite', { cookie: app.owner, body: { email, displayName: email.split('@')[0], role }, status: 202 })
  const token = new URL(app.mail(email, '').text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  const session = (await app.call('/auth/confirm', { body: { token }, status: 303 })).cookie
  const id = (await app.call('/api/inkwell', { cookie: session })).value.actor.id
  return { session, id, email }
}
async function open(session, width) {
  const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, hasTouch: width === 390 })
  await context.addCookies([cookie(session)])
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  await page.goto(app.origin + '/app')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  return { context, page, log: page.getByRole('region', { name: 'Account audit log', exact: true }) }
}
async function search(page, log, text) {
  await log.getByLabel('Search account changes', { exact: true }).fill(text)
  const pending = page.waitForResponse(response => response.url().includes('/api/inkwell/audit?') && new URL(response.url()).searchParams.get('q') === text)
  await tabTo(page, log.getByRole('button', { name: 'Search audit log', exact: true }))
  await page.keyboard.press('Enter')
  const response = await pending; assert.equal(response.status(), 200)
  const data = await response.json()
  await expect(log.getByRole('article')).toHaveCount(data.entries.length)
  await expect(log.getByRole('button', { name: 'Search audit log', exact: true })).toBeEnabled()
  return data
}
async function capture(page, log, width, state, subject = log) {
  await subject.scrollIntoViewIfNeeded()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state}: no sideways scroll at ${width}`)
  await page.screenshot({ path: `${images}/${width}-${state}.png` })
}
try {
  const admin = await member('ada-admin@harbour.example', 'admin')
  const person = await member('morgan-river@harbour.example', 'member')
  const ownerId = (await app.call('/api/inkwell', { cookie: app.owner })).value.actor.id
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([612, 792]).drawText('Harbour Studio - Supplier confidentiality agreement', { x: 60, y: 720, size: 18, font })
  const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
  for (const width of [1440, 390]) {
    const title = `Harbour Studio supplier agreement ${width}`
    const definition = { title, filename: 'supplier-agreement.pdf', pdfBase64, roles: [{ role: 'Supplier', order: 1 }], fields: [{ id: 'supplier-signature', label: 'Supplier signature', type: 'signature', signer: 0, page: 0, x: .1, y: .5, width: .5, height: .06 }] }
    const { id } = await app.command('template.save', definition)
    // More changes than one screen page: the export must include changes not yet loaded on screen.
    for (let revision = 1; revision <= 11; revision++) await app.command('template.update', { ...definition, id, title: `${title} — revision ${revision}` })
    await app.command('member.role', { operatorId: person.id, role: 'sender' })
    await app.call('/api/inkwell/notices/settings', { cookie: app.owner, body: { connect: { channel: 'slack', url: null } } })
    const { context, page, log } = await open(app.owner, width)
    await log.getByRole('heading', { name: 'Account audit log', exact: true }).waitFor()
    // Change the member role on the actual Settings screen, then inspect the resulting record.
    const role = page.getByLabel(`Role for ${person.email}`, { exact: true })
    await role.selectOption('viewer'); await expect(role).toBeEnabled(); await expect(role).toHaveValue('viewer')
    await page.getByLabel('Slack incoming webhook URL', { exact: true }).fill('https://hooks.slack.com/services/synthetic-inkwell-1')
    await page.getByRole('button', { name: 'Connect Slack', exact: true }).click()
    await page.getByRole('button', { name: 'Disconnect Slack', exact: true }).waitFor()
    // Replacing a connection is a real public transport write; no webhook secret is allowed in history.
    await app.call('/api/inkwell/notices/settings', { cookie: app.owner, body: { connect: { channel: 'slack', url: 'https://hooks.slack.com/services/synthetic-inkwell-2' } } })
    const first = await search(page, log, title)
    assert.ok(first.nextCursor, 'Matching history is paginated')
    assert.ok(first.entries.every(entry => entry.actorId === ownerId && entry.target === `template:${id}`))
    const [download] = await Promise.all([page.waitForEvent('download'), log.getByRole('link', { name: 'Export audit CSV', exact: true }).click()])
    const csv = await readFile(await download.path(), 'utf8')
    assert.ok(csv.includes('template.created') && csv.includes(`${title} — revision 11`) && csv.includes(`${title} — revision 1`), 'CSV includes the whole filtered history before loading later pages')
    assert.ok(!csv.includes('notice_channel.'), 'CSV retains the search filter')
    const more = log.getByRole('button', { name: 'Show more account changes', exact: true })
    await tabTo(page, more); await page.keyboard.press('Enter')
    await expect(log.getByRole('article')).toHaveCount(12)
    await expect(more).toHaveCount(0)
    const revised = log.getByRole('article', { name: `template.updated · template:${id}`, exact: true }).filter({ hasText: 'Template updated' }).last()
    const summary = revised.getByText('Before and after', { exact: true })
    await log.getByLabel('Search account changes', { exact: true }).focus()
    await tabTo(page, summary); await page.keyboard.press('Enter')
    const before = JSON.parse(await revised.getByLabel('Before change', { exact: true }).innerText())
    const after = JSON.parse(await revised.getByLabel('After change', { exact: true }).innerText())
    assert.equal(before.title, title); assert.equal(after.title, `${title} — revision 1`)
    assert.equal(before.version, 1); assert.equal(after.version, 2)
    for (const theme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: theme }); await axe(page, `Account audit ${width} ${theme}`) }
    await capture(page, log, width, 'template-history', revised)
    const roleHistory = await search(page, log, `member-role:${person.id}`)
    assert.ok(roleHistory.entries.some(entry => entry.actorId === ownerId && entry.before?.role === 'sender' && entry.after?.role === 'viewer'))
    const roleEntry = log.getByRole('article', { name: `member_role.changed · member-role:${person.id}`, exact: true }).first()
    await roleEntry.getByText('Before and after', { exact: true }).click()
    assert.equal(JSON.parse(await roleEntry.getByLabel('Before change').innerText()).role, 'sender')
    assert.equal(JSON.parse(await roleEntry.getByLabel('After change').innerText()).role, 'viewer')
    await capture(page, log, width, 'role-history', roleEntry)
    const connections = await search(page, log, `notice-channel:${ownerId}:slack`)
    assert.ok(connections.entries.some(entry => entry.action === 'notice_channel.changed' && entry.before && entry.after && entry.actorId === ownerId))
    const connection = log.getByRole('article', { name: `notice_channel.changed · notice-channel:${ownerId}:slack`, exact: true }).first()
    await connection.getByText('Before and after', { exact: true }).click()
    for (const label of ['Before change', 'After change']) {
      const value = JSON.parse(await connection.getByLabel(label).innerText())
      assert.equal(value.channel, 'slack'); assert.equal(value.webhook, '[configured; URL redacted]')
    }
    assert.ok(!(await log.innerText()).includes('synthetic-inkwell-'), 'No webhook URL leaks into history')
    await capture(page, log, width, 'integration-history', connection)
    await log.getByText('Filter account changes', { exact: true }).click()
    await log.getByLabel('Actor ID', { exact: true }).fill(ownerId)
    await log.getByLabel('Action', { exact: true }).fill('template.updated')
    await log.getByLabel('Target', { exact: true }).fill(`template:${id}`)
    const filtered = await search(page, log, title)
    assert.ok(filtered.entries.length > 0 && filtered.entries.every(entry => entry.actorId === ownerId && entry.action === 'template.updated' && entry.target === `template:${id}`))
    const href = await log.getByRole('link', { name: 'Export audit CSV', exact: true }).getAttribute('href')
    const exportFilters = new URL(href, app.origin).searchParams
    assert.equal(exportFilters.get('actor'), ownerId); assert.equal(exportFilters.get('action'), 'template.updated'); assert.equal(exportFilters.get('target'), `template:${id}`)
    await search(page, log, 'No matching account change')
    await log.getByText('No account changes match.', { exact: true }).waitFor()
    await capture(page, log, width, 'empty')
    const adminView = await open(admin.session, width)
    await search(adminView.page, adminView.log, title)
    await capture(adminView.page, adminView.log, width, 'admin-history')
    const memberView = await open(person.session, width)
    await memberView.page.getByRole('heading', { name: 'Your account', exact: true }).waitFor()
    assert.equal(await memberView.log.count(), 0, 'Viewer has no account audit screen')
    await memberView.context.close(); await adminView.context.close(); await context.close()
  }
  for (const session of ['', person.session]) for (const path of ['/api/inkwell/audit', '/api/inkwell/audit.csv']) {
    const response = await fetch(app.origin + path, { redirect: 'manual', headers: { cookie: session } })
    assert.ok([401, 403].includes(response.status), 'Audit JSON and CSV require an owner or admin session')
  }
  console.log('Account audit: template, role and integration before and after; owner and admin access; member refusal; search, pagination and full CSV; axe and keyboard at 1440/390 passed')
} catch (error) { await screenshots(app.browser, 'account-audit-failure'); throw error }
finally { await app.close() }
