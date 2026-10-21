import { expect } from '@playwright/test'
// SIGNX-009 supplemental-document slice joins SIGNX-003 through the built public pages.
import assert from 'node:assert/strict'
import { mkdir, readFile, copyFile } from 'node:fs/promises'
import { startInkwellWithMail } from './mail-worker.mjs'
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
    await activate(signer,comments.locator('summary'))
    await tab(signer,comments.getByLabel('Comment page'));await signer.keyboard.press('ControlOrMeta+A');await signer.keyboard.type('2')
    await tab(signer,comments.getByLabel('New comment',{exact:true}));await signer.keyboard.type('Can delivery move to Friday?')
    await tab(signer,comments.getByRole('checkbox',{name:'Mara Quinn (you)',exact:true}));await signer.keyboard.press('Space')
    await activate(signer,comments.getByRole('button',{name:'Post comment',exact:true}))
    const thread=comments.getByRole('article',{name:'Thread on page 2',exact:true});await thread.getByText('Can delivery move to Friday?',{exact:true}).waitFor()
    await page.reload();await page.getByRole('row',{name:new RegExp(title)}).click()
    const senderComments=page.getByRole('region',{name:'Document comments',exact:true})
    await activate(page,senderComments.locator('summary'))
    await senderComments.getByText('No comments shared with you.',{exact:true}).waitFor()
    assert.equal(await page.getByText('Can delivery move to Friday?',{exact:true}).count(),0,'an unselected sender cannot read the thread in the UI')
    await activate(signer,thread.getByRole('button',{name:'Change thread audience',exact:true}))
    for(const name of ['Mara Quinn (you)','Sender','Noor Haddad']){await tab(signer,thread.getByRole('checkbox',{name,exact:true}));await signer.keyboard.press('Space')}
    await activate(signer,thread.getByRole('button',{name:'Save thread audience',exact:true}))
    await page.reload();await page.getByRole('row',{name:new RegExp(title)}).click()
    const senderThread=senderComments.getByRole('article',{name:'Thread on page 2',exact:true})
    await activate(page,senderComments.locator('summary'))
    await senderThread.getByText('Can delivery move to Friday?',{exact:true}).waitFor()
    await tab(page,senderThread.getByLabel('Reply on page 2',{exact:true}));await page.keyboard.type('Friday is agreed; please keep the same scope.')
    await activate(page,senderThread.getByRole('button',{name:'Post reply',exact:true}))
    await senderThread.getByText('Friday is agreed; please keep the same scope.',{exact:true}).waitFor()
    assert.ok((await senderThread.ariaSnapshot()).includes('Can delivery move to Friday?'),'the accessibility tree exposes the page anchor and shared transcript')
    for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`SIGNX-009 sender comments ${width} ${theme}`)}
    await page.emulateMedia({colorScheme:'light'});await senderThread.scrollIntoViewIfNeeded();await capture(page,'sender-thread')
    await signer.reload();await activate(signer,comments.locator('summary'));await thread.getByText('Friday is agreed; please keep the same scope.',{exact:true}).waitFor()
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
    const nextComments=nextPage.getByRole('region',{name:'Document comments',exact:true});await activate(nextPage,nextComments.locator('summary'));await nextComments.getByText('Friday is agreed; please keep the same scope.',{exact:true}).waitFor()
    assert.ok((await nextComments.ariaSnapshot()).includes('Thank you, ready to sign.'),'the next explicitly selected recipient sees the inherited reply audience')
    await activate(nextPage,nextPage.getByRole('button',{name:'Open Supplier handbook',exact:true}));await activate(nextPage,nextPage.getByRole('button',{name:'I acknowledge Supplier handbook',exact:true}))
    await tab(nextPage,nextPage.getByRole('textbox',{name:'Next supplier signature Page 2 · signature',exact:true}));await nextPage.keyboard.type('Noor Haddad')
    await tab(nextPage,nextPage.getByRole('checkbox',{name:/I have reviewed this document and consent/}));await nextPage.keyboard.press('Space');await activate(nextPage,nextPage.getByRole('button',{name:'Sign document',exact:true}))
    await nextPage.getByRole('heading',{name:'All signatures are complete.',exact:true}).waitFor()
    await activate(nextPage,nextComments.locator('summary'))
    assert.equal(await nextComments.getByRole('textbox').count(),0,'terminal transcript has no write controls')
    await nextComments.scrollIntoViewIfNeeded();await capture(nextPage,'completed-thread');await nextContext.close()
    await signer.reload();await signer.getByRole('heading', { name: 'All signatures are complete.', exact: true }).waitFor()
    await documents.getByRole('status').filter({ hasText: 'Acknowledged' }).waitFor(); await capture(signer, 'completed')
    const completed = (await (await page.request.get(`${app.origin}/api/inkwell/envelopes/${id}`)).json()).envelope
    assert.equal(completed.status, 'completed'); assert.ok(completed.events.some(e => e.action === 'signer.supplement_acknowledged' && e.detail.sha256 === completed.supplements[0].sha256))
    await page.reload(); await page.getByRole('row', { name: new RegExp(title) }).click(); await page.getByRole('link', { name: 'Supplier handbook', exact: true }).waitFor(); await page.getByRole('region', { name: 'Supplemental documents', exact: true }).scrollIntoViewIfNeeded(); await capture(page, 'sender-completed')
    assert.equal(await page.getByLabel('Supplement label').count(), 0, 'sent documents have no editing form')
    // A correction reusing the mailbox is a new audience/acknowledgment identity in the built UI too.
    const epochId=(await app.command('envelope.prepare',{title:`Corrected recipient ${width}`,filename:'identity.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[{name:'Mara Quinn',email:'epoch@supplier.example'}],fields:[{id:'signature',type:'signature',label:'Signature',signer:0,page:0,x:.1,y:.5,width:.5,height:.06}]})).id
    const epochSupplement=(await app.command('envelope.supplement',{id:epochId,label:'Identity handbook',filename:'handbook.pdf',pdfBase64:handbookBytes.toString('base64'),requirement:'acknowledge'})).supplementId
    const epochInvite=(await app.command('envelope.approve',{id:epochId,eligible:true})).invitations[0]
    const epochContext=await app.browser.newContext({viewport:{width,height:width===390?844:1000}}),epochPage=await epochContext.newPage()
    const enter=async invite=>{await epochPage.goto(invite.url);await tab(epochPage,epochPage.getByLabel('Verification code',{exact:true}));await epochPage.keyboard.type(invite.code);await activate(epochPage,epochPage.getByRole('button',{name:'Verify code',exact:true}));await tab(epochPage,epochPage.getByRole('checkbox',{name:/I have read the electronic record/}));await epochPage.keyboard.press('Space');await activate(epochPage,epochPage.getByRole('button',{name:'Agree and continue',exact:true}))}
    await enter(epochInvite)
    const epochBase=new URL(epochInvite.url).pathname.replace('/sign/','/api/sign/')
    for(const [suffix,body] of [[`/supplements/${epochSupplement}/document`,undefined],[`/supplements/${epochSupplement}/acknowledge`,{acknowledge:true}],['/comments',{action:'create',page:1,text:'Only the earlier identity may read this.',audience:['recipient:0'],commandId:crypto.randomUUID()}]]){
     const response=body?await epochPage.request.post(app.origin+epochBase+suffix,{data:body,headers:{origin:app.origin}}):await epochPage.request.get(app.origin+epochBase+suffix);assert.equal(response.status(),200)
    }
    await app.command('envelope.correct',{id:epochId,signers:[{name:'Mara Corrected',email:'epoch@supplier.example'}]})
    const replacement=(await app.command('envelope.invite',{id:epochId})).invitations[0]
    await enter(replacement)
    const replacementComments=epochPage.getByRole('region',{name:'Document comments',exact:true});await activate(epochPage,replacementComments.locator('summary'));await replacementComments.getByText('No comments shared with you.',{exact:true}).waitFor()
    assert.equal(await epochPage.getByText('Only the earlier identity may read this.',{exact:true}).count(),0)
    assert.ok(await epochPage.getByRole('button',{name:'I acknowledge Identity handbook',exact:true}).isDisabled(),'replacement must open and acknowledge again')
    assert.equal(await epochPage.getByRole('status').filter({hasText:'Acknowledged'}).count(),0)
    await capture(epochPage,'same-email-replacement');await epochContext.close()
    await signingContext.close(); await context.close()
  }
  for(const width of [1440,390]) {
    const originals=[];for(const title of ['Service agreement','Supplier W-9','View-only policy']){const doc=await PDFDocument.create();doc.addPage([612,792]).drawText(title,{x:54,y:720,size:18});originals.push(Buffer.from(await doc.save()))}
    const template=(await app.command('template.save',{title:`Supplier W-9 fields ${width}`,filename:'w9.pdf',pdfBase64:originals[1].toString('base64'),roles:[{role:'Supplier',order:1},{role:'Studio',order:2}],fields:[0,1].map(signer=>({id:`w9-${signer}`,type:'signature',label:`W9 signature ${signer+1}`,signer,page:0,x:.1,y:.4+signer*.15,width:.5,height:.06}))})).id
    const title=`Three-document agreement ${width}`,id=(await app.command('envelope.prepare',{title,filename:'agreement.pdf',pdfBase64:originals[0].toString('base64'),signers:[{name:'Mara Quinn',email:`multi-mara-${width}@supplier.example`},{name:'Noor Haddad',email:`multi-noor-${width}@supplier.example`}],fields:[0,1].map(signer=>({id:`agreement-${signer}`,type:'signature',label:`Agreement signature ${signer+1}`,signer,page:0,x:.1,y:.4+signer*.15,width:.5,height:.06}))})).id
    const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000}});await context.addCookies([app.ownerCookie()]);const page=await context.newPage()
    await page.goto(app.origin+'/app');await page.getByRole('row',{name:new RegExp(title)}).click();await page.getByRole('button',{name:'Edit draft',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).waitFor()
    const add=async(name,buffer)=>{const control=page.getByLabel('Additional PDF',{exact:true});await expect(control).toBeEnabled();const [chooser]=await Promise.all([page.waitForEvent('filechooser'),activate(page,control)]);await chooser.setFiles({name,mimeType:'application/pdf',buffer})}
    await add('w9.pdf',originals[1]);await page.getByRole('button',{name:`Apply Supplier W-9 fields ${width}`,exact:true}).click();await page.getByRole('region',{name:'Matching templates',exact:true}).waitFor({state:'detached'})
    await add('policy.pdf',originals[2]);await page.getByLabel('Document 3 signing requirement',{exact:true}).selectOption('view')
    const list=page.getByRole('region',{name:'Envelope documents',exact:true});await list.getByRole('button',{name:'Move policy.pdf up',exact:true}).click();await list.getByRole('button',{name:'Move policy.pdf down',exact:true}).click()
    await expect(list.locator('ol > li > strong')).toHaveText(['agreement.pdf','w9.pdf','policy.pdf'])
    for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`PREP-002 preparation ${width} ${theme}`)}
    await page.emulateMedia({colorScheme:'light'});await list.scrollIntoViewIfNeeded();await page.screenshot({path:`${proof}/${width}-multi-prepare.png`})
    await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('button',{name:'Edit draft',exact:true}).waitFor()
    const detail=page.getByRole('region',{name:'Envelope documents',exact:true});await detail.getByRole('link',{name:'Original policy.pdf',exact:true}).waitFor();assert.ok((await detail.ariaSnapshot()).includes('View only'))
    await detail.scrollIntoViewIfNeeded();await page.screenshot({path:`${proof}/${width}-multi-detail.png`})
    await page.getByRole('checkbox',{name:/I reviewed this envelope/}).check();await page.getByRole('button',{name:'Approve and invite first recipient',exact:true}).click()
    const invites=page.locator('.iw-manual-invitation');await invites.getByRole('link').waitFor();const first={url:await invites.getByRole('link').getAttribute('href'),code:await invites.locator('strong').innerText()}
    for(const [index,name] of ['Mara Quinn','Noor Haddad'].entries()){
      const invitation=index===0?first:(await app.command('envelope.invite',{id,signer:1})).invitations[0],signing=await app.browser.newContext({viewport:{width,height:width===390?844:1000}}),signer=await signing.newPage()
      await signer.goto(invitation.url);await signer.getByLabel('Verification code',{exact:true}).fill(invitation.code);await signer.getByRole('button',{name:'Verify code',exact:true}).click();await signer.getByRole('checkbox',{name:/I have read the electronic record/}).check();await signer.getByRole('button',{name:'Agree and continue',exact:true}).click()
      const documents=signer.getByRole('region',{name:'Envelope documents',exact:true});await documents.getByRole('link',{name:'Download policy.pdf',exact:true}).waitFor()
      for(const label of [`Agreement signature ${index+1} Page 1 · signature`,`W9 signature ${index+1} Page 2 · signature`]){await tab(signer,signer.getByRole('textbox',{name:label,exact:true}));await signer.keyboard.type(name)}
      assert.equal(await signer.getByRole('textbox',{name:/Page 3/}).count(),0)
      for(const theme of ['light','dark']){await signer.emulateMedia({colorScheme:theme});await axe(signer,`PREP-002 signer ${index+1} ${width} ${theme}`)}
      await signer.emulateMedia({colorScheme:'light'});await documents.scrollIntoViewIfNeeded();await signer.screenshot({path:`${proof}/${width}-multi-signer-${index+1}.png`})
      await tab(signer,signer.getByRole('checkbox',{name:/I have reviewed this document and consent/}));await signer.keyboard.press('Space');await activate(signer,signer.getByRole('button',{name:'Sign document',exact:true}));await signer.getByRole('heading',{name:index===0?'Your signature has been recorded.':'All signatures are complete.',exact:true}).waitFor();await signing.close()
    }
    const record=(await (await page.request.get(app.origin+`/api/inkwell/envelopes/${id}`)).json()).envelope
    assert.equal(record.documents.length,3);assert.equal(record.status,'completed');assert.ok(record.documents.every(d=>d.signedSha256))
    assert.equal((await PDFDocument.load(await (await page.request.get(app.origin+`/api/inkwell/envelopes/${id}/artifacts/signed`)).body())).getPageCount(),3)
    await page.reload();await page.getByRole('row',{name:new RegExp(title)}).click();for(const filename of ['agreement.pdf','w9.pdf','policy.pdf'])await page.getByRole('link',{name:`Executed ${filename}`,exact:true}).waitFor()
    await page.getByRole('region',{name:'Envelope documents',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${proof}/${width}-multi-completed.png`})
    await app.command('template.from_envelope',{id,title:`Three-document template ${width}`});await page.getByRole('button',{name:'Templates',exact:true}).click();await page.getByRole('button',{name:`Edit Three-document template ${width}`,exact:true}).click()
    const templateDocs=page.getByRole('region',{name:'Envelope documents',exact:true});await expect(templateDocs.locator('ol > li > strong')).toHaveText(['agreement.pdf','w9.pdf','policy.pdf'])
    for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`PREP-002 template edit ${width} ${theme}`)}
    await page.emulateMedia({colorScheme:'light'});await templateDocs.scrollIntoViewIfNeeded();await page.screenshot({path:`${proof}/${width}-multi-template.png`});await page.getByRole('button',{name:'Save new version',exact:true}).click();await page.getByRole('heading',{name:'Your templates',exact:true}).waitFor();await context.close()
  }
  for(const width of [1440,390]) {
    const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000}});await context.addCookies([app.ownerCookie()]);const page=await context.newPage();await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Archive',exact:true}).click()
    const documents=page.getByRole('region',{name:'Document export',exact:true});await documents.getByLabel('Records to export',{exact:true}).selectOption('selected');await documents.getByLabel('Find envelopes for export',{exact:true}).fill(`Three-document agreement ${width}`);await documents.getByRole('checkbox',{name:`Three-document agreement ${width}`,exact:true}).check();await activate(page,documents.getByRole('button',{name:'Prepare document export',exact:true}));await documents.getByRole('status').filter({hasText:'Document export ready'}).waitFor()
    const bundlePromise=page.waitForEvent('download');await activate(page,documents.getByRole('link',{name:'Download document export',exact:true}));const bundle=await bundlePromise;assert.ok(bundle.suggestedFilename().endsWith('.tar'));assert.ok((await readFile(await bundle.path())).includes(Buffer.from('index.csv')))
    for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`PORT-002 archive ${width} ${theme}`)}
    await page.emulateMedia({colorScheme:'light'});await documents.scrollIntoViewIfNeeded();await page.screenshot({path:`${proof}/${width}-port-selected.png`})
    let requests=0;await page.route('**/archive/transfers/exports/*/advance',route=>++requests===2?route.abort('failed'):route.continue())
    const whole=page.getByRole('region',{name:'Whole installation archive',exact:true});await activate(page,whole.getByRole('button',{name:'Build installation archive',exact:true}));await page.getByRole('alert').waitFor();await whole.getByRole('status').filter({hasText:'1 chunks'}).waitFor()
    await whole.scrollIntoViewIfNeeded();await page.screenshot({path:`${proof}/${width}-port-paused.png`});await page.unroute('**/archive/transfers/exports/*/advance');await page.reload();await page.getByRole('button',{name:'Archive',exact:true}).click();await whole.getByRole('status').filter({hasText:'1 chunks'}).waitFor();await activate(page,whole.getByRole('button',{name:'Resume building archive',exact:true}));await whole.getByRole('link',{name:'Download installation archive',exact:true}).waitFor()
    const archivePromise=page.waitForEvent('download');await activate(page,whole.getByRole('link',{name:'Download installation archive',exact:true}));const archive=await archivePromise,file=`${proof}/${width}-installation.ndjson`;await copyFile(await archive.path(),file);assert.equal(JSON.parse((await readFile(file,'utf8')).split('\n')[0]).kind,'manifest')
    await whole.scrollIntoViewIfNeeded();await page.screenshot({path:`${proof}/${width}-port-ready.png`})
    const target=await startInkwell()
    try {
      const destination=await target.browser.newContext({viewport:{width,height:width===390?844:1000}});await destination.addCookies([target.ownerCookie()]);const restorePage=await destination.newPage();await restorePage.goto(target.origin+'/app');await restorePage.getByRole('button',{name:'Archive',exact:true}).click()
      const restore=restorePage.getByRole('region',{name:'Resumable archive restore',exact:true}),choose=async()=>{const chooser=restorePage.waitForEvent('filechooser');await activate(restorePage,restore.getByLabel('Installation archive (NDJSON)',{exact:true}));await(await chooser).setFiles(file);await restore.getByRole('checkbox',{name:/I selected the intended archive/}).check()}
      await choose();await restorePage.route('**/archive/transfers/imports/*/finalize',route=>route.abort('failed'));await activate(restorePage,restore.getByRole('button',{name:'Restore or resume archive',exact:true}));await restore.getByRole('alert').waitFor();assert.equal((await(await restorePage.request.get(target.origin+'/api/inkwell/envelopes')).json()).total,0,'interrupted restore publishes no records')
      await restore.scrollIntoViewIfNeeded();await restorePage.screenshot({path:`${proof}/${width}-port-restore-paused.png`});await restorePage.unroute('**/archive/transfers/imports/*/finalize');await restorePage.reload();await restorePage.getByRole('button',{name:'Archive',exact:true}).click();await choose();await activate(restorePage,restore.getByRole('button',{name:'Restore or resume archive',exact:true}));await restore.getByRole('status').filter({hasText:'Archive restored; every stored fingerprint passed.'}).waitFor()
      const records=(await(await restorePage.request.get(target.origin+'/api/inkwell/envelopes?limit=100')).json()).envelopes;assert.ok(records.length>0);for(const e of records)assert.equal((await(await restorePage.request.get(target.origin+`/api/inkwell/envelopes/${e.id}/verify`)).json()).ok,true)
      for(const theme of ['light','dark']){await restorePage.emulateMedia({colorScheme:theme});await axe(restorePage,`PORT-002 restored ${width} ${theme}`)}await restorePage.emulateMedia({colorScheme:'light'});await restore.scrollIntoViewIfNeeded();await restorePage.screenshot({path:`${proof}/${width}-port-restored.png`});await destination.close()
    }finally{await target.close()}
    await context.close()
  }
  const adminApp=await startInkwellWithMail()
  try {
    await adminApp.command('envelope.prepare',{title:'Admin export example',filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[{name:'Mara Quinn',email:'admin-export@supplier.example'}],fields:[{id:'signature',type:'signature',label:'Signature',signer:0,page:0,x:.1,y:.5,width:.5,height:.06}]})
    const email='archive-admin@harbour.example';await adminApp.call('/auth/invite',{cookie:adminApp.owner,body:{email,displayName:'Archive admin',role:'admin'},status:202});const message=adminApp.mail(email,''),token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token'),admin=(await adminApp.call('/auth/confirm',{body:{token},status:303})).cookie
    for(const width of [1440,390]){const context=await adminApp.browser.newContext({viewport:{width,height:width===390?844:1000}});await context.addCookies([{name:admin.split('=')[0],value:admin.slice(admin.indexOf('=')+1),url:adminApp.origin}]);const page=await context.newPage();await page.goto(adminApp.origin+'/app');await page.getByRole('button',{name:'Archive',exact:true}).click();await activate(page,page.getByRole('button',{name:'Prepare document export',exact:true}));await page.getByRole('link',{name:'Download document export',exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:'Whole installation archive',exact:true}).count(),0);await axe(page,`PORT-002 admin export ${width}`);await page.screenshot({path:`${proof}/${width}-port-admin.png`});await context.close()}
  }finally{await adminApp.close()}
  console.log('PORT-002: selected export, durable interrupted build and restore, fingerprint-verified publication, owner/admin boundaries and accessible Archive screens at 1440/390 passed')
  console.log('PREP-002: ordered three-document preparation, W-9 template application, view-only policy, two single-session signers, separate/combined records; light/dark accessibility proof at 1440 and 390 passed')
  console.log('SIGNX-009: supplemental PDF authoring, opening and acknowledgment, keyboard and accessibility-tree completion; SIGNX-003 light/dark scans at 1440 and 390 passed')
} catch (error) { await screenshots(app.browser, 'supplements-failure'); throw error } finally { await app.close() }
