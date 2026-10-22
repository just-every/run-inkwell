import assert from 'node:assert/strict'
import {expect} from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { axe, tabTo } from './a11y.mjs'
import { screenshots } from './worker.mjs'

async function servicePdf(title, lines) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([612, 792])
  page.drawText(title, { x: 48, y: 738, size: 18, font })
  lines.forEach((line, index) => page.drawText(line, { x: 48, y: 690 - index * 25, size: 10, font }))
  return Buffer.from(await pdf.save()).toString('base64')
}
async function certificateText(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loading = getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname })
  const pdf=await loading.promise
  let text = ''
  for (let page = 1; page <= pdf.numPages; page++) text += (await (await pdf.getPage(page)).getTextContent()).items.map(item => item.str).join(' ') + '\n'
  await loading.destroy();return text.replace(/\s+/g, ' ')
}

/** All changes and acknowledgments use the built application. The initial draft and mail network edge are the setup. */
export async function recipientActions() {
  const app = await startInkwellWithMail(), images = join(process.env.INKWELL_PROOF_DIR ?? 'test-results', 'recipient-actions')
  await mkdir(images, { recursive: true })
  try {
    const services = await servicePdf('Harbour Studio - Services Agreement', [
      'Project: Quay Digital customer-service workshop and implementation plan.',
      'Harbour Studio will deliver two facilitated workshops and a written handover.',
      'Delivery dates: 16 and 23 November 2026. Fixed fee: USD 4,800.',
      'The project owner supplies a purchase reference before approving the engagement.',
      'Confidential materials remain with their intended recipients.',
      'Client representative: Mara Quinn, Project Director.',
    ])
    const staff = await servicePdf('Harbour Studio - Staff-only onboarding notes', [
      'Private instructions for the final project owner only.',
      'Keep the workshop participant roster in the restricted staff workspace.',
      'Confirm room access with the delivery coordinator before the first workshop.',
      'These notes are for review and do not require a signature.',
    ])
    for (const width of [1440, 390]) {
      const viewport = { width, height: width === 390 ? 844 : 1000 }, contexts = []
      try {
        const title = `Harbour services delegation ${width}`, initialEmail = `mara.quinn.${width}@quay.example`, finalEmail = `mara.procurement.${width}@quay.example`
        const people = [
          { name: 'Nadia Bell', email: `nadia.operations.${width}@harbour.example`, role: 'specify_recipients', order: 1, delegates: [4] },
          { name: 'Theo Reed', email: `theo.contracts.${width}@harbour.example`, role: 'editor', order: 2, delegates: [4] },
          { name: 'Elise Chen', email: `elise.account.${width}@harbour.example`, role: 'needs_to_view', order: 3 },
          { name: 'Jordan Vale', email: `jordan.delivery.${width}@harbour.example`, role: 'certified_delivery', order: 4 },
          { name: '', email: '', order: 5, unresolvedIdentity: true },
        ]
        const originalSignature = { id: 'client-signature', label: 'Client signature', type: 'signature', signer: 4, document: 0, documentPage: 0, page: 0, x: .1, y: .73, width: .45, height: .065 }
        const { id } = await app.command('envelope.prepare', { title, documents: [
          { filename: 'harbour-services.pdf', pdfBase64: services, mode: 'sign', visibleTo: { signers: [0, 1, 2, 3, 4], copies: [] } },
          { filename: 'staff-only-notes.pdf', pdfBase64: staff, mode: 'view', visibleTo: { signers: [4], copies: [] } },
        ], signers: people, fields: [originalSignature] })
        const record = async () => (await app.call(`/api/inkwell/envelopes/${id}`, { cookie: app.owner })).value.envelope
        const newContext = async owner => { const context = await app.browser.newContext({ viewport }); contexts.push(context); if (owner) await context.addCookies([app.ownerCookie()]); return context }
        const capture = async (page, state, scope = page.locator('main')) => {
          await scope.waitFor({ state: 'visible' })
          const settle = () => page.evaluate(async () => { await document.fonts.ready; getComputedStyle(document.body).color; for (const animation of document.getAnimations()) { try { animation.finish() } catch {} } await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
          await settle()
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state} ${width}: no horizontal overflow`)
          for (const theme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: theme }); await settle(); await axe(page, `Recipient actions ${state} ${width} ${theme}`) }
          await page.emulateMedia({ colorScheme: 'light' }); await settle()
          const accessibility = await scope.ariaSnapshot(); assert.ok(accessibility.trim(), `${state}: meaningful accessibility tree`)
          await writeFile(join(images, `${width}-${state}.aria.txt`), accessibility)
          await page.screenshot({ path: join(images, `${width}-${state}.png`), fullPage: true })
        }
        const owner = await (await newContext(true)).newPage(); owner.setDefaultTimeout(20000)
        await owner.goto(app.origin + '/app'); await owner.getByRole('row', { name: new RegExp(title) }).click()
        await owner.getByRole('region', { name: title, exact: true }).getByRole('button', { name: 'Edit draft', exact: true }).click()
        await expect(owner.getByLabel('Recipient 1 name',{exact:true})).toHaveValue(people[0].name)
        for (const [index, role] of ['specify_recipients', 'editor', 'needs_to_view', 'certified_delivery', 'signer'].entries()) {
          const action = owner.getByLabel(`Recipient ${index + 1} action`, { exact: true }); await action.waitFor(); assert.equal(await action.inputValue(), role)
        }
        for (const label of ['Recipient 1 may name recipient 5', 'Recipient 2 may edit recipient 5']) {
          const grant = owner.getByRole('checkbox', { name: label, exact: true }); assert.ok(await grant.isChecked()); await grant.uncheck(); await grant.check()
        }
        const openIdentity = owner.getByRole('checkbox', { name: 'Leave recipient 5 identity open', exact: true })
        assert.ok(await openIdentity.isChecked()); await tabTo(owner, openIdentity)
        assert.ok(await owner.getByLabel('Recipient 5 name', { exact: true }).isDisabled())
        await capture(owner, 'sender-roles')
        await owner.getByRole('button', { name: 'Save draft', exact: true }).click()
        let detail = owner.getByRole('region', { name: title, exact: true })
        await detail.getByRole('checkbox', { name: /confirm it is eligible for electronic signature/ }).check()
        const approve = detail.getByRole('button', { name: 'Approve and invite first recipient', exact: true }); await tabTo(owner, approve); await owner.keyboard.press('Enter')
        await detail.getByRole('button', { name: 'Correct…', exact: true }).waitFor()
        const open = async email => {
          const invitation = app.mail(email, ''); assert.ok(invitation, `Current recipient ${email} has an invitation`)
          const url = invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0], base = '/api' + new URL(url).pathname
          const page = await (await newContext(false)).newPage(); page.setDefaultTimeout(20000); await page.goto(url)
          await page.getByRole('button', { name: 'Email me a code', exact: true }).click(); await page.getByText('Code sent. Check your email.', { exact: true }).waitFor()
          const code = app.mail(email, 'Your Inkwell verification code').text.match(/\b\d{6}\b/)[0]
          await page.getByLabel('Email verification code', { exact: true }).fill(code); await page.getByRole('button', { name: 'Verify code', exact: true }).click()
          await page.getByRole('checkbox', { name: /I have read the/ }).check(); await page.getByRole('button', { name: 'Agree and continue', exact: true }).click()
          return { page, base }
        }
        const scoped = async ({ page, base }) => {
          const view = await page.evaluate(async url => { const response = await fetch(url, { credentials: 'same-origin' }); if (!response.ok) throw new Error('Recipient metadata is unavailable'); return response.json() }, base)
          assert.equal(view.documents.length, 1); assert.equal(view.documents[0].filename, 'harbour-services.pdf'); assert.equal(view.pageSizes.length, 1)
          assert.ok(!JSON.stringify(view).includes('staff-only-notes.pdf'), 'Hidden component metadata stays private')
          assert.equal(await page.evaluate(async url => (await fetch(url + '/documents/1', { credentials: 'same-origin' })).status, base), 404, 'Hidden component server door refuses')
        }
        assert.equal(app.mail(people[1].email, ''), undefined); assert.equal(app.mail(initialEmail, ''), undefined)
        const naming = await open(people[0].email), namingForm = naming.page.getByRole('form', { name: 'Name delegated recipients', exact: true })
        await namingForm.waitFor(); await scoped(naming)
        const named = namingForm.getByLabel('Recipient 5, routing order 5 name', { exact: true }); await tabTo(naming.page, named); await naming.page.keyboard.type('Mara Quinn')
        await namingForm.getByLabel('Recipient 5, routing order 5 email', { exact: true }).fill(initialEmail)
        const namingConsent = namingForm.getByRole('checkbox', { name: 'I have reviewed these recipient identities and authorize continuing the routing.', exact: true }); await namingConsent.check()
        await capture(naming.page, 'agent-naming', namingForm)
        const submitNames = namingForm.getByRole('button', { name: 'Name recipients and continue', exact: true }); await tabTo(naming.page, submitNames); await naming.page.keyboard.press('Enter')
        await naming.page.getByRole('heading', { name: 'Your recipient action has been recorded.', exact: true }).waitFor(); await capture(naming.page, 'agent-completed')
        assert.equal((await record()).signers[4].name, 'Mara Quinn'); assert.equal(app.mail(initialEmail, ''), undefined, 'Naming preserves the stable later routing place')
        const editing = await open(people[1].email), editor = editing.page.getByRole('form', { name: 'Edit delegated recipients and fields', exact: true })
        await editor.getByLabel('Field type', { exact: true }).waitFor(); await scoped(editing)
        await editor.getByLabel('Recipient 5, routing order 5 email', { exact: true }).fill(finalEmail)
        await editor.getByLabel('Recipient 5, routing order 5 private message', { exact: true }).fill('Mara, add purchase order QD-2048 before signing the workshop engagement.')
        await editor.getByLabel('Field type', { exact: true }).selectOption('text'); await editor.getByLabel('Field label', { exact: true }).fill('Purchase order reference')
        const place = editor.getByRole('button', { name: /^Place field on page 1;/ }); await tabTo(editing.page, place); await editing.page.keyboard.press('Enter')
        await editor.getByRole('checkbox', { name: /Select field 2: Purchase order reference/ }).waitFor()
        assert.ok(await editor.getByRole('checkbox', { name: /Select field 1: Client signature/ }).isVisible(), 'The existing signature is retained')
        await capture(editing.page, 'editor-fields', editor)
        await editor.getByRole('checkbox', { name: 'I have reviewed these recipient and field changes and authorize passing this envelope to the next routing step.', exact: true }).check()
        const saveEdits = editor.getByRole('button', { name: 'Save edits and continue', exact: true }); await tabTo(editing.page, saveEdits); await editing.page.keyboard.press('Enter')
        await editing.page.getByRole('heading', { name: 'Your recipient action has been recorded.', exact: true }).waitFor(); await capture(editing.page, 'editor-completed')
        const edited = await record(); assert.equal(edited.signers[4].email, finalEmail); assert.ok(edited.signers[4].message.includes('QD-2048'))
        assert.equal(edited.fields.find(field => field.id === originalSignature.id).type, 'signature'); assert.equal(edited.fields.filter(field => field.signer === 4).length, 2)
        assert.equal(app.mail(initialEmail, ''), undefined); assert.equal(app.mail(finalEmail, ''), undefined)
        for (const [index, state] of [[2, 'required'], [3, 'certified']]) {
          const recipient = await open(people[index].email); await recipient.page.getByRole('region', { name: 'Required document opening', exact: true }).waitFor(); await scoped(recipient)
          assert.equal((await record()).signers[index].completedAt, undefined, 'Authentication and metadata do not acknowledge opening')
          const later = index === 2 ? people[3].email : finalEmail; assert.equal(app.mail(later, ''), undefined)
          await capture(recipient.page, `${state}-open`)
          const required = recipient.page.getByRole('button', { name: 'Open required PDF', exact: true }); await tabTo(recipient.page, required); await recipient.page.keyboard.press('Enter')
          await recipient.page.getByRole('heading', { name: 'Your document opening has been recorded.', exact: true }).waitFor(); await capture(recipient.page, `${state}-completed`)
          const observed = await record(); assert.ok(observed.signers[index].completedAt); assert.equal(observed.signers[index].viewedDocuments.length, 1); assert.equal(observed.signers[index].viewedDocuments[0].document, 0)
          assert.ok(app.mail(later, ''), 'The next recipient is invited only after the explicit opening')
        }
        const final = await open(finalEmail), finalForm = final.page.locator('.iw-sign-fields'); await finalForm.waitFor()
        const finalView = await final.page.evaluate(async url => (await fetch(url, { credentials: 'same-origin' })).json(), final.base)
        assert.deepEqual(finalView.documents.map(document => document.filename), ['harbour-services.pdf', 'staff-only-notes.pdf'])
        await finalForm.getByRole('textbox', { name: /^Purchase order reference/ }).fill('QD-2048')
        const signature = finalForm.getByRole('textbox', { name: /^Client signature/ }); await tabTo(final.page, signature); await final.page.keyboard.type('Mara Quinn')
        await capture(final.page, 'final-signing', finalForm)
        await final.page.getByRole('checkbox', { name: /consent to electronic signatures/ }).check(); await final.page.getByRole('button', { name: 'Sign document', exact: true }).click()
        await final.page.getByRole('heading', { name: 'All signatures are complete.', exact: true }).waitFor()
        await owner.goto(app.origin + '/app'); await owner.getByRole('row', { name: new RegExp(title) }).click(); detail = owner.getByRole('region', { name: title, exact: true })
        await detail.getByRole('heading', { name: 'Signing status', exact: true }).scrollIntoViewIfNeeded(); await capture(owner, 'completed-detail', detail)
        const done = await record(); assert.equal(done.status, 'completed')
        const certificate = await owner.request.get(`${app.origin}/api/inkwell/envelopes/${id}/artifacts/certificate`); assert.ok(certificate.ok())
        const text = await certificateText(await certificate.body())
        for (const label of ['Naming agent 1:', 'Editor 2:', 'Needs to view 3:', 'Certified delivery 4:']) assert.ok(text.includes(label), `Certificate names ${label}`)
        for (const index of [2, 3]) assert.ok(text.includes(done.signers[index].completedAt), 'Certificate records each authenticated opening time')
        assert.ok(text.includes('human reading is not asserted'), 'Certified delivery describes its observed evidence without claiming reading')
      } finally { for (const context of contexts) await context.close() }
    }
    console.log(`Recipient naming, editing, required viewing and certified delivery journey passed at 1440/390. Screens: ${images}`)
  } catch (error) { await screenshots(app.browser, 'recipient-actions'); throw error } finally { await app.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await recipientActions()
