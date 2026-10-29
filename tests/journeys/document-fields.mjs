// PREP-007 journey: the fields a document carries itself are placed on the prepare screen, on the built Worker.
// At 1440 and 390 pixels the owner uploads a PDF written with text tags for three recipients and one AcroForm field. The
// screen says how many fields the document placed, adds the third recipient's row, and shows each field where the
// document put it, with no manual placement; the saved envelope holds them with their document names and origins. The
// prepare screen with the placed fields joins SIGNX-003's scan in light and dark, with no sideways scrolling.
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { screenshots, startInkwell } from './worker.mjs'
import { axe } from './a11y.mjs'
import { businessPdf, encryptedPdf } from '../fixtures/business-pdf.mjs'

const { origin, ownerCookie, command, browser, close } = await startInkwell()
const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), sheet = pdf.addPage([612, 792])
sheet.drawText('Harbour Studio - Mutual NDA', { x: 72, y: 720, size: 18, font })
for (const [n, y] of [[1, 600], [2, 520], [3, 440]]) sheet.drawText(`{{signature:${n}}}`, { x: 72, y, size: 14, font })
pdf.getForm().createTextField('client.company').addToPage(sheet, { x: 320, y: 590, width: 200, height: 20 })
const pdfBuffer = Buffer.alloc(20*1024*1024,32);pdfBuffer.set(await pdf.save())
const near = (a, b, label) => assert.ok(Math.abs(a - b) < .01, `${label}: ${a} vs ${b}`)

try {
  await businessUploadJourney()
  let minor = 0
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const label = `${width}px`, title = `Tagged NDA ${width}`
    const context = await browser.newContext({ viewport: { width, height } }); await context.addCookies([ownerCookie()])
    const page = await context.newPage(); await page.goto(`${origin}/app`)
    await page.getByRole('button', { name: 'New envelope' }).click()
    await page.getByLabel('Envelope title').fill(title)
    await page.getByLabel('Fixed PDF document').setInputFiles({ name: 'nda.pdf', mimeType: 'application/pdf', buffer: pdfBuffer })
    await page.getByRole('status').filter({ hasText: 'Placed 4 fields from the document’s own text tags and form fields' }).waitFor()
    await page.locator('.iw-pdf-page .iw-field-edit').nth(3).waitFor()
    for (const [index, name] of ['Mara Quinn', 'Theo Park', 'Ada Lund'].entries()) { await page.getByLabel(`Recipient ${index + 1} name`).fill(name); await page.getByLabel(`Recipient ${index + 1} email`).fill(`${name.split(' ')[0].toLowerCase()}@harbour.example`) }
    const placed = await page.locator('.iw-pdf-page .iw-field-edit').evaluateAll(els => els.map(el => ({ signer: Number(el.dataset.signer), x: parseFloat(el.style.left) / 100, y: parseFloat(el.style.top) / 100 })))
    assert.deepEqual(placed.map(f => f.signer).sort(), [0, 0, 1, 2], `${label}: each tag's recipient, and the form field for recipient 1`)
    for (const [n, y] of [[1, 600], [2, 520], [3, 440]]) assert.ok(placed.some(f => f.signer === n - 1 && Math.abs(f.x - 72 / 612) < .01 && Math.abs(f.y - (792 - y - 14 * .8) / 792) < .01), `${label}: recipient ${n}'s signature sits on its tag`)
    assert.ok(placed.some(f => f.signer === 0 && Math.abs(f.x - 320 / 612) < .01 && Math.abs(f.y - (792 - 610) / 792) < .01), `${label}: the form field sits on its widget`)
    minor += await axe(page, `${label} light, placed from the document`)
    await page.emulateMedia({ colorScheme: 'dark' }); minor += await axe(page, `${label} dark, placed from the document`); await page.emulateMedia({ colorScheme: 'light' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no sideways scrolling`)
    await page.getByRole('button',{name:'Remove field 1',exact:true}).focus()
    await page.getByRole('tooltip',{name:'Remove field',exact:true}).waitFor()
    await page.screenshot({ path: join(process.env.INKWELL_PROOF_DIR??tmpdir(), `prep-001-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Save prepared envelope' }).click()
    await page.getByRole('checkbox', { name: /I reviewed this envelope/ }).waitFor()
    const found = await (await page.request.get(`${origin}/api/inkwell/envelopes?q=${encodeURIComponent(title)}`)).json()
    const saved = (await (await page.request.get(`${origin}/api/inkwell/envelopes/${found.envelopes.find(item => item.title === title).id}`)).json()).envelope
    assert.deepEqual(saved.fields.map(f => [f.origin, f.name, f.signer]).sort(), [['form_field', 'client.company', 0], ['text_tag', '{{signature:1}}', 0], ['text_tag', '{{signature:2}}', 1], ['text_tag', '{{signature:3}}', 2]], `${label}: saved with their document names and origins`)
    for (const f of saved.fields.filter(item => item.origin === 'text_tag')) near(f.x, 72 / 612, `${label} ${f.name} x`)
    const invitation=(await command('envelope.approve',{id:saved.id,eligible:true})).invitations[0]
    await context.close()
    const signing=await browser.newContext({viewport:{width,height}}),signer=await signing.newPage()
    await signer.goto(invitation.url)
    await signer.getByLabel('Verification code').fill(invitation.code)
    await signer.getByRole('button',{name:'Verify code'}).click()
    await signer.getByRole('checkbox',{name:/I have read the electronic record/}).check()
    await signer.getByRole('button',{name:'Agree and continue'}).click()
    await signer.locator('.iw-pdf-page[data-rendered]').first().waitFor()
    if(width===1440){assert.ok(await signer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));minor+=await axe(signer,'business-size signer preview')}
    await signer.screenshot({path:join(process.env.INKWELL_PROOF_DIR??tmpdir(),`prep-001-sign-${width}.png`),fullPage:true})
    await signing.close()
  }
  console.log(`PREP-007: text tags for three recipients and a form field placed on upload with no manual placement and saved with their names at 1440 and 390; SIGNX-003 scan clean in light and dark (${minor} minor or moderate)`)
} catch (error) {
  await screenshots(browser, 'prep-007-failure')
  throw error
} finally {
  await close()
}

// PREP-001: assert the business-size flow once; resize the same screens for release proof.
async function businessUploadJourney() {
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 await context.addCookies([ownerCookie()]);const page=await context.newPage();page.setDefaultTimeout(120_000)
 const capture=async(p,state)=>{
  for(const width of [1440,390]){
   await p.setViewportSize({width,height:width===390?844:1000})
   const pdf=p.locator('.iw-pdf-page')
   if(await pdf.count()){
    await pdf.scrollIntoViewIfNeeded()
    await p.waitForFunction(()=>{const canvas=document.querySelector('.iw-pdf-page canvas');return canvas&&canvas.width>1&&canvas.height>1})
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   }
   await p.screenshot({path:join(tmpdir(),`prep-001-${state}-${width}.png`),fullPage:true})
  }
  await p.setViewportSize({width:1440,height:1000})
 }
 try {
  await page.goto(`${origin}/app`);await page.getByRole('button',{name:'New envelope'}).click()
  await page.getByLabel('Envelope title').fill('Business-size agreement')
  await page.getByLabel('Fixed PDF document').setInputFiles({name:'encrypted.pdf',mimeType:'application/pdf',buffer:Buffer.from(await encryptedPdf())})
  await page.getByRole('alert').filter({hasText:'Encrypted PDFs cannot be signed'}).waitFor();await capture(page,'encrypted')
  await page.getByLabel('Fixed PDF document').setInputFiles({name:'oversized.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(30_000_000)})
  await page.getByRole('alert').filter({hasText:'25 MB'}).waitFor();await capture(page,'refused')
  const bytes=Buffer.from(await businessPdf())
  await page.getByLabel('Fixed PDF document').setInputFiles({name:'business.pdf',mimeType:'application/pdf',buffer:bytes})
  await page.getByRole('status').filter({hasText:'Placed 1 field'}).waitFor()
  await page.getByRole('button',{name:'Remove recipient 2',exact:true}).click()
  await page.getByLabel('Recipient 1 name').fill('Mara Quinn');await page.getByLabel('Recipient 1 email').fill('mara@business.example')
  await page.locator('.iw-pdf-page').scrollIntoViewIfNeeded()
  await page.locator('.iw-pdf-page[data-rendered]').waitFor()
  await axe(page,'PREP-001 1440 preparation');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.getByRole('button',{name:'Remove field 1',exact:true}).focus();await page.getByRole('tooltip').waitFor()
  await capture(page,'prepare')
  await page.getByRole('button',{name:'Save prepared envelope',exact:true}).click()
  const eligible=page.getByRole('checkbox',{name:/I reviewed this envelope/});await eligible.waitFor();await eligible.focus();await page.keyboard.press('Space')
  await page.getByRole('button',{name:'Approve and invite first recipient',exact:true}).click()
  const invitation=page.locator('.iw-manual-invitation');await invitation.getByRole('link').waitFor()
  const link=await invitation.getByRole('link').getAttribute('href'),code=await invitation.locator('strong').innerText()
  const signerContext=await browser.newContext({viewport:{width:1440,height:1000}}),signer=await signerContext.newPage();signer.setDefaultTimeout(120_000)
  try {
   await signer.goto(link);await signer.getByLabel('Verification code',{exact:true}).fill(code);await signer.getByRole('button',{name:'Verify code',exact:true}).click()
   const disclosure=signer.getByRole('checkbox',{name:/I have read the electronic record/});await disclosure.focus();await signer.keyboard.press('Space');await signer.getByRole('button',{name:'Agree and continue',exact:true}).click()
   await signer.locator('.iw-pdf-page').scrollIntoViewIfNeeded()
   await signer.locator('.iw-pdf-page[data-rendered]').waitFor()
   const signature=signer.getByRole('textbox',{name:/Signature Page 1/});await signature.focus();await signer.keyboard.type('Mara Quinn')
   await axe(signer,'PREP-001 1440 signing');assert.ok(await signer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture(signer,'sign')
   const consent=signer.getByRole('checkbox',{name:/I have reviewed this document and consent/});await consent.focus();await signer.keyboard.press('Space')
   await signer.getByRole('button',{name:'Sign document',exact:true}).click();await signer.getByRole('heading',{name:'All signatures are complete.',exact:true}).waitFor()
   await capture(signer,'complete')
  } finally {await signerContext.close()}
  console.log('PREP-001: real 20 MB PDF uploads, previews and signs; 30 MB refusal; 1440 assertions and 1440 plus 390 screen proof')
 } finally {await context.close()}
}
