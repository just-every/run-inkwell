// ROUTE-005: an owner keeps the "Company Signers" group of three in Settings and picks it as a recipient; at its turn
// one member signs, another member's link shows who signed for the group and when, and the envelope detail names the
// signer and the group, at 1440 and 390 pixels.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe } from './a11y.mjs'

const app = await startInkwellWithMail(), images = '/tmp/sx-inkwell-r18-group-screens'
await mkdir(images, { recursive: true })
try {
 const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
 pdf.addPage([612, 792]).drawText('Harbour Studio - Supply agreement', { x: 60, y: 740, size: 18, font })
 const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
 const fields = [{ id: 'company', label: 'Company signature', signer: 0, type: 'signature', page: 0, x: .1, y: .2, width: .4, height: .05 }]
 for (const width of [1440, 390]) {
  const members = ['Ada Park', 'Ben Ortiz', 'Cy Lane'].map(name => ({ name, email: `${name.split(' ')[0].toLowerCase()}${width}@harbour.example` })), group = `Company Signers ${width}`
  const viewport = { width, height: width === 390 ? 844 : 1000 }
  const owner = await app.browser.newContext({ viewport, hasTouch: width === 390 }); await owner.addCookies([app.ownerCookie()])
  const page = await owner.newPage(); page.setDefaultTimeout(20000)
  const capture = async (name, p) => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} no sideways scroll ${width}`); await p.screenshot({ path: `${images}/${width}-${name}.png` }) }
  // The owner creates the group of three in Settings.
  await page.goto(app.origin + '/app'); await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Signing groups', exact: true }) })
  await panel.getByRole('button', { name: 'New signing group', exact: true }).click(); await panel.getByLabel('Group name').fill(group)
  await panel.getByRole('button', { name: 'Add member', exact: true }).click()
  for (const [i, m] of members.entries()) { await panel.getByLabel(`Member ${i + 1} name`).fill(m.name); await panel.getByLabel(`Member ${i + 1} email`).fill(m.email) }
  await panel.scrollIntoViewIfNeeded(); await axe(page, `ROUTE-005 group form ${width}`); await capture('group-form', page)
  await panel.getByRole('button', { name: 'Save group', exact: true }).click(); await panel.getByText(group, { exact: true }).waitFor()
  const saved = (await app.call('/api/inkwell', { cookie: app.owner })).value.signingGroups.find(g => g.name === group)
  assert.deepEqual(saved.members, members)
  // A draft names the group as its recipient; the draft editor shows the group and its members.
  const title = `Supply ${width}`, { id } = await app.command('envelope.prepare', { title, filename: 'supply.pdf', pdfBase64, signers: [{ group: saved.id }], fields })
  await page.getByRole('button', { name: 'Envelopes', exact: true }).click(); await page.getByRole('row', { name: new RegExp(title) }).first().click()
  let detail = page.getByRole('region', { name: title, exact: true })
  await detail.getByRole('button', { name: 'Edit draft', exact: true }).click()
  await page.getByText(`${group} · any one of 3 signs: Ada Park, Ben Ortiz, Cy Lane`).waitFor(); assert.equal(await page.getByLabel('Recipient 1 signs as').inputValue(), saved.id)
  await axe(page, `ROUTE-005 draft recipient ${width}`); await capture('draft-group', page)
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click()
  await app.command('envelope.approve', { id, eligible: true })
  for (const m of members) assert.ok(app.mail(m.email, 'Please sign:'), `${m.name} gets their own invitation`)
  // Ben signs for the group.
  const ben = await app.verify(members[1].email)
  await app.call(ben.path + '/sign', { body: { values: { company: 'Ben Ortiz' }, consent: true, commandId: crypto.randomUUID() }, cookie: ben.cookie })
  // Ada's link shows the group was signed for, by whom and when.
  const signer = await app.browser.newContext({ viewport, hasTouch: width === 390 }), link = await signer.newPage(); link.setDefaultTimeout(20000)
  await link.goto(new URL(app.mail(members[0].email, 'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).href.replace(/^http:\/\/[^/]+/, app.origin))
  await link.getByRole('heading', { name: new RegExp(`Signed for ${group} by Ben Ortiz at`) }).waitFor()
  assert.equal(await link.getByRole('button', { name: /Send code|Verify/ }).count(), 0, 'nothing more to do on another member’s link')
  await axe(link, `ROUTE-005 member link ${width}`); await capture('member-link-done', link); await signer.close()
  // The envelope detail names the group's members and who signed for it.
  await page.reload(); await page.getByRole('row', { name: new RegExp(title) }).first().click(); detail = page.getByRole('region', { name: title, exact: true })
  await detail.getByText(/Signed for the group by Ben Ortiz/).first().waitFor(); await detail.getByText(/Signing group: Ada Park/).first().waitFor()
  await axe(page, `ROUTE-005 detail ${width}`); await capture('detail-signed', page)
  await owner.close()
 }
 console.log('ROUTE-005 passed at 1440/390: group in Settings, group recipient in the draft, member links, signed-for view, accessibility')
} catch (error) { await screenshots(app.browser, 'route-005'); throw error } finally { await app.close() }
