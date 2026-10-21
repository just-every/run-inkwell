// SIGNX-009 supplemental-document slice joins SIGNX-003 through the built public pages.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { startInkwell, screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const app = await startInkwell(), proof = process.env.INKWELL_SUPPLEMENT_PROOF_DIR ?? '/tmp/inkwell-supplements'
await mkdir(proof, { recursive: true })
const pdf = await PDFDocument.create(); pdf.addPage([612, 792]).drawText('Harbour Studio - Services Agreement', { x: 54, y: 720, size: 18 })
pdf.addPage([612,792]).drawText('Questions about delivery dates', {x:54,y:720,size:18})
const handbook = await PDFDocument.create(); handbook.addPage([612, 792]).drawText('Harbour Studio - Supplier Handbook', { x: 54, y: 720, size: 18 }); handbook.getPage(0).drawText('Contact the studio before changing delivery dates.', { x: 54, y: 660, size: 12 })
const handbookBytes = Buffer.from(await handbook.save())
const tab = async (page, control) => { await control.waitFor(); if (await control.evaluate(el => el === document.activeElement)) return; const backwards = await control.evaluate(el => Boolean(document.activeElement?.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)); await tabTo(page, control, { backwards }) }
const activate = async (page, control) => { await tab(page, control); await page.keyboard.press('Enter') }
try {
  for (const width of [1440, 390]) {
    const title = `Harbour supplier agreement ${width}`, context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } })
    await context.addCookies([app.ownerCookie()]); const page = await context.newPage()
    const id = (await app.command('envelope.prepare', { title, filename: 'services.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers: [{ name: 'Mara Quinn', email: 'mara@supplier.example' },{name:'Noor Haddad',email:'noor@supplier.example'}], fields: [{ id: 'signature', type: 'signature', label: 'Supplier signature', signer: 0, page: 0, x: .1, y: .5, width: .5, height: .06 },{id:'second',type:'signature',label:'Next supplier signature',signer:1,page:1,x:.1,y:.5,width:.5,height:.06}] })).id
    const capture = async (p, state) => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${state}: no sideways scrolling`); await p.screenshot({ path: `${proof}/${width}-${state}.png` }) }
    await page.goto(app.origin + '/app'); await page.getByRole('row', { name: new RegExp(title) }).click()
    await tab(page, page.getByLabel('Supplement label')); await page.keyboard.type('Supplier handbook')
    const chooser = page.waitForEvent('filechooser'); await activate(page, page.getByLabel('Supplemental PDF')); await (await chooser).setFiles({ name: 'handbook.pdf', mimeType: 'application/pdf', buffer: handbookBytes })
    await activate(page, page.getByRole('button', { name: 'Add supplemental document', exact: true }))
    await page.getByRole('link', { name: 'Supplier handbook', exact: true }).waitFor()
    const record = (await (await page.request.get(`${app.origin}/api/inkwell/envelopes/${id}`)).json()).envelope
    assert.equal(record.supplements.length, 1)
    for (const theme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: theme }); await axe(page, `SIGNX-009 draft ${width} ${theme}`) }
    await page.emulateMedia({ colorScheme: 'light' }); await page.getByRole('region', { name: 'Supplemental documents', exact: true }).scrollIntoViewIfNeeded(); await capture(page, 'sender-documents')
    const eligible = page.getByRole('checkbox', { name: /I reviewed this envelope/ }); await tab(page, eligible); await page.keyboard.press('Space')
    await activate(page, page.getByRole('button', { name: 'Approve and invite first recipient', exact: true }))
    const invitation = page.locator('.iw-manual-invitation'); await invitation.getByRole('link').waitFor()
    const link = await invitation.getByRole('link').getAttribute('href'), code = await invitation.locator('strong').innerText()
    const signingContext = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } }), signer = await signingContext.newPage()
    await signer.goto(link); await tab(signer, signer.getByLabel('Verification code', { exact: true })); await signer.keyboard.type(code); await activate(signer, signer.getByRole('button', { name: 'Verify code', exact: true }))
    const disclosure = signer.getByRole('checkbox', { name: /I have read the electronic record/ }); await tab(signer, disclosure); await signer.keyboard.press('Space'); await activate(signer, signer.getByRole('button', { name: 'Agree and continue', exact: true }))
    const comments=signer.getByRole('region',{name:'Document comments',exact:true})
    await tab(signer,comments.getByLabel('Comment page'));await signer.keyboard.press('ControlOrMeta+A');await signer.keyboard.type('2')
    await tab(signer,comments.getByLabel('New comment',{exact:true}));await signer.keyboard.type('Can delivery move to Friday?')
    await tab(signer,comments.getByRole('checkbox',{name:'Mara Quinn (you)',exact:true}));await signer.keyboard.press('Space')
    await activate(signer,comments.getByRole('button',{name:'Post comment',exact:true}))
    const thread=comments.getByRole('article',{name:'Thread on page 2',exact:true});await thread.getByText('Can delivery move to Friday?',{exact:true}).waitFor()
    await page.reload();await page.getByRole('row',{name:new RegExp(title)}).click()
    const senderComments=page.getByRole('region',{name:'Document comments',exact:true})
    await senderComments.getByText('No comments shared with you.',{exact:true}).waitFor()
    assert.equal(await page.getByText('Can delivery move to Friday?',{exact:true}).count(),0,'an unselected sender cannot read the thread in the UI')
    await activate(signer,thread.getByRole('button',{name:'Change thread audience',exact:true}))
    for(const name of ['Mara Quinn (you)','Sender','Noor Haddad']){await tab(signer,thread.getByRole('checkbox',{name,exact:true}));await signer.keyboard.press('Space')}
    await activate(signer,thread.getByRole('button',{name:'Save thread audience',exact:true}))
    await page.reload();await page.getByRole('row',{name:new RegExp(title)}).click()
    const senderThread=senderComments.getByRole('article',{name:'Thread on page 2',exact:true})
    await senderThread.getByText('Can delivery move to Friday?',{exact:true}).waitFor()
    await tab(page,senderThread.getByLabel('Reply on page 2',{exact:true}));await page.keyboard.type('Friday is agreed; please keep the same scope.')
    await activate(page,senderThread.getByRole('button',{name:'Post reply',exact:true}))
    await senderThread.getByText('Friday is agreed; please keep the same scope.',{exact:true}).waitFor()
    assert.ok((await senderThread.ariaSnapshot()).includes('Can delivery move to Friday?'),'the accessibility tree exposes the page anchor and shared transcript')
    for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`SIGNX-009 sender comments ${width} ${theme}`)}
    await page.emulateMedia({colorScheme:'light'});await senderThread.scrollIntoViewIfNeeded();await capture(page,'sender-thread')
    await signer.reload();await thread.getByText('Friday is agreed; please keep the same scope.',{exact:true}).waitFor()
    await tab(signer,thread.getByLabel('Reply on page 2',{exact:true}));await signer.keyboard.type('Thank you, ready to sign.')
    await activate(signer,thread.getByRole('button',{name:'Post reply',exact:true}));await thread.getByText('Thank you, ready to sign.',{exact:true}).waitFor()
    assert.ok((await thread.ariaSnapshot()).includes('Thank you, ready to sign.'))
    for(const theme of ['light','dark']){await signer.emulateMedia({colorScheme:theme});await axe(signer,`SIGNX-009 recipient comments ${width} ${theme}`)}
    await signer.emulateMedia({colorScheme:'light'});await thread.scrollIntoViewIfNeeded();await capture(signer,'recipient-thread')
    const documents = signer.getByRole('region', { name: 'Supplemental documents', exact: true }), acknowledgment = documents.getByRole('button', { name: 'I acknowledge Supplier handbook', exact: true })
    await documents.waitFor(); assert.ok(await acknowledgment.isDisabled())
    await activate(signer, documents.getByRole('button', { name: 'Open Supplier handbook', exact: true }))
    await documents.locator('.iw-pdf-page[data-rendered]').waitFor()
    assert.ok((await documents.ariaSnapshot()).includes('Supplier handbook'))
    assert.ok(!(await acknowledgment.isDisabled()), 'opened document enables the named acknowledgment')
    for (const theme of ['light', 'dark']) { await signer.emulateMedia({ colorScheme: theme }); await axe(signer, `SIGNX-009 opened handbook ${width} ${theme}`) }
    await signer.emulateMedia({ colorScheme: 'light' }); await documents.scrollIntoViewIfNeeded(); await capture(signer, 'signer-handbook')
    await activate(signer, acknowledgment); await documents.getByRole('status').filter({ hasText: 'Acknowledged' }).waitFor()
    assert.ok((await documents.ariaSnapshot()).includes('Acknowledged'), 'the accessibility tree exposes the saved acknowledgment state')
    const signature = signer.getByRole('textbox', { name: 'Supplier signature Page 1 · signature', exact: true }); await tab(signer, signature); await signer.keyboard.type('Mara Quinn')
    const consent = signer.getByRole('checkbox', { name: /I have reviewed this document and consent/ }); await tab(signer, consent); await signer.keyboard.press('Space')
    const finish = signer.getByRole('button', { name: 'Sign document', exact: true }); assert.ok(!(await finish.isDisabled())); await activate(signer, finish)
    await signer.getByRole('heading', { name: 'Your signature has been recorded.', exact: true }).waitFor()
    const next=(await app.command('envelope.invite',{id,signer:1})).invitations[0]
    const nextContext=await app.browser.newContext({viewport:{width,height:width===390?844:1000}}),nextPage=await nextContext.newPage()
    await nextPage.goto(next.url);await tab(nextPage,nextPage.getByLabel('Verification code',{exact:true}));await nextPage.keyboard.type(next.code);await activate(nextPage,nextPage.getByRole('button',{name:'Verify code',exact:true}))
    const nextDisclosure=nextPage.getByRole('checkbox',{name:/I have read the electronic record/});await tab(nextPage,nextDisclosure);await nextPage.keyboard.press('Space');await activate(nextPage,nextPage.getByRole('button',{name:'Agree and continue',exact:true}))
    const nextComments=nextPage.getByRole('region',{name:'Document comments',exact:true});await nextComments.getByText('Friday is agreed; please keep the same scope.',{exact:true}).waitFor()
    assert.ok((await nextComments.ariaSnapshot()).includes('Thank you, ready to sign.'),'the next explicitly selected recipient sees the inherited reply audience')
    await activate(nextPage,nextPage.getByRole('button',{name:'Open Supplier handbook',exact:true}));await activate(nextPage,nextPage.getByRole('button',{name:'I acknowledge Supplier handbook',exact:true}))
    await tab(nextPage,nextPage.getByRole('textbox',{name:'Next supplier signature Page 2 · signature',exact:true}));await nextPage.keyboard.type('Noor Haddad')
    await tab(nextPage,nextPage.getByRole('checkbox',{name:/I have reviewed this document and consent/}));await nextPage.keyboard.press('Space');await activate(nextPage,nextPage.getByRole('button',{name:'Sign document',exact:true}))
    await nextPage.getByRole('heading',{name:'All signatures are complete.',exact:true}).waitFor()
    assert.equal(await nextComments.getByRole('textbox').count(),0,'terminal transcript has no write controls')
    await nextComments.scrollIntoViewIfNeeded();await capture(nextPage,'completed-thread');await nextContext.close()
    await signer.reload();await signer.getByRole('heading', { name: 'All signatures are complete.', exact: true }).waitFor()
    await documents.getByRole('status').filter({ hasText: 'Acknowledged' }).waitFor(); await capture(signer, 'completed')
    const completed = (await (await page.request.get(`${app.origin}/api/inkwell/envelopes/${id}`)).json()).envelope
    assert.equal(completed.status, 'completed'); assert.ok(completed.events.some(e => e.action === 'signer.supplement_acknowledged' && e.detail.sha256 === completed.supplements[0].sha256))
    await page.reload(); await page.getByRole('row', { name: new RegExp(title) }).click(); await page.getByRole('link', { name: 'Supplier handbook', exact: true }).waitFor(); await page.getByRole('region', { name: 'Supplemental documents', exact: true }).scrollIntoViewIfNeeded(); await capture(page, 'sender-completed')
    assert.equal(await page.getByLabel('Supplement label').count(), 0, 'sent documents have no editing form')
    await signingContext.close(); await context.close()
  }
  console.log('SIGNX-009: supplemental PDF authoring, opening and acknowledgment, keyboard and accessibility-tree completion; SIGNX-003 light/dark scans at 1440 and 390 passed')
} catch (error) { await screenshots(app.browser, 'supplements-failure'); throw error } finally { await app.close() }
