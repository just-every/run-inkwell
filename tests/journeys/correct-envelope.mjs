// DELIV-006 journey: after signer 1 signs, the sender opens Correct from the envelope detail page (MANAGE-005) at 1440
// and 390 pixels. The correction screen locks signer 1 (their details and their signed field cannot be changed there),
// corrects signer 2's email and adds a copy recipient. Signer 1's signature stands, signer 2's old link refuses, the
// detail page's timeline shows the correction, the new link completes the envelope, and the copy recipient gets the
// completed copy. On the built Worker with the Resend fake (tests/journeys/mail-worker.mjs).
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { screenshots } from './worker.mjs'
import { startInkwellWithMail } from './mail-worker.mjs'

const inkwell = await startInkwellWithMail()
try {
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
  const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const ann = `ann.${width}@clients.example`, ben = `ben.${width}@typo.example`, fixed = `ben.${width}@clients.example`, cara = `cara.${width}@clients.example`
    const title = `Harbour Studio — lease ${width}`
    const fields = [0, 1].map(signer => ({ id: `signature-${signer}`, label: 'Signature', type: 'signature', signer, page: 0, x: .1, y: .3 + signer * .2, width: .4, height: .07 }))
    const { id } = await inkwell.command('envelope.prepare', { title, filename: 'lease.pdf', pdfBase64, signers: [{ name: 'Ann Lee', email: ann, order: 1 }, { name: 'Ben Ode', email: ben, order: 2 }], fields })
    await inkwell.command('envelope.approve', { id, eligible: true })
    const first = await inkwell.verify(ann)
    await inkwell.call(first.path + '/sign', { body: { values: { 'signature-0': 'Ann Lee' }, consent: true, commandId: crypto.randomUUID() }, cookie: first.cookie })
    const oldLink = '/api/sign/' + new URL(inkwell.mail(ben, 'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
    const view = async () => (await inkwell.call(`/api/inkwell/envelopes/${id}`, { cookie: inkwell.owner })).value.envelope
    const signed = await view()

    const context = await inkwell.browser.newContext({ viewport: { width, height } })
    await context.addCookies([inkwell.ownerCookie()])
    const page = await context.newPage()
    await page.goto(`${inkwell.origin}/app`)
    await page.getByRole('row', { name: new RegExp(`lease ${width}`) }).click()
    const detail = page.getByRole('region', { name: title })
    await detail.getByRole('button', { name: 'Correct…' }).click()
    await page.getByRole('heading', { name: 'Correct envelope' }).waitFor()
    await page.waitForFunction(() => document.querySelector('[aria-label="Recipient 1 name"]')?.value === 'Ann Lee')
    // Signer 1 has signed: their details and their field are locked on the correction screen.
    for (const label of ['name', 'email', 'routing order']) assert.ok(await page.getByLabel(`Recipient 1 ${label}`).isDisabled(), `${width}px: signer 1's ${label} is locked`)
    assert.equal(await page.getByRole('button', { name: 'Remove recipient 1' }).count(), 0, `${width}px: signer 1 cannot be removed`)
    await page.getByRole('button', { name: 'Remove field 1' }).waitFor()
    assert.ok(await page.getByRole('button', { name: 'Remove field 1' }).isDisabled(), `${width}px: signer 1's signed field cannot be removed`)
    assert.ok(!(await page.getByLabel('Recipient', { exact: true }).locator('option').allTextContents()).some(text => text.includes('Ann Lee')), `${width}px: no field can be placed for signer 1`)
    await page.getByLabel('Recipient 2 email').fill(fixed)
    await page.getByRole('button', { name: 'Add copy recipient' }).click()
    await page.getByLabel('Copy recipient 1 name').fill('Cara Moss')
    await page.getByLabel('Copy recipient 1 email').fill(cara)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll on the correction screen at ${width} pixels`)
    await page.getByRole('button', { name: 'Save correction' }).click()
    const corrected = page.getByRole('region', { name: title })
    await corrected.getByRole('list', { name: 'Ben Ode timeline' }).getByText(/^Corrected/).waitFor()
    await corrected.getByText(fixed, { exact: true }).waitFor()
    await context.close()

    const after = await view()
    assert.deepEqual(after.signers[0], signed.signers[0], `${width}px: signer 1's signature stands`)
    const audit = after.events.find(e => e.action === 'signer.corrected')
    assert.deepEqual([audit.detail.before.email, audit.detail.after.email], [ben, fixed], `${width}px: the audit trail shows the email before and after`)
    assert.deepEqual(after.events.find(e => e.action === 'envelope.corrected').detail.changes.copies, { before: null, after: [{ name: 'Cara Moss', email: cara }] })
    await inkwell.call(oldLink, { status: 404 })
    const second = await inkwell.verify(fixed)
    await inkwell.call(second.path + '/sign', { body: { values: { 'signature-1': 'Ben Ode' }, consent: true, commandId: crypto.randomUUID() }, cookie: second.cookie })
    assert.equal((await view()).status, 'completed', `${width}px: the new link completes the envelope`)
    assert.ok(inkwell.mail(cara, 'Completed:'), `${width}px: the added copy recipient gets the completed copy`)
  }
  console.log('DELIV-006 passed at 1440 and 390 pixels: signer 1 locked on the correction screen, signer 2 corrected and audited, old link refused, new link completed the envelope, copy recipient served')
} catch (error) {
  await screenshots(inkwell.browser, 'deliv-006-failure')
  throw error
} finally {
  await inkwell.close()
}
