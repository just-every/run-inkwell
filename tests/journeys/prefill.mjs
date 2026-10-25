// PREP-008 + SIGNX-003: sender prefill in template/draft inspectors, source labels and locked terms, keyboard signing.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwell, screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const app=await startInkwell(),images='/tmp/sx-inkwell-r15-screens'
await mkdir(images,{recursive:true})
try {
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
 pdf.addPage([612,792]).drawText('Harbour Studio - Workshop agreement',{x:60,y:740,size:18,font})
 const field=(id,label,type,y)=>({id,label,type,signer:0,page:0,x:.1,y,width:.7,height:.05})
 const fields=[field('signature','Client signature','signature',.2),field('company','Company','text',.3),field('address','Address','text',.4),field('amount','Amount USD','number',.5)]
 for(const width of [1440,390]) {
  const title=`Acme workshop ${width}`,template=(await app.command('template.save',{title,filename:'workshop.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Client'}],fields})).id
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000},hasTouch:width===390});await context.addCookies([app.ownerCookie()]);const page=await context.newPage();page.setDefaultTimeout(20000)
  const capture=async(name,p=page)=>{assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`PREP-008 ${name} ${width}: no horizontal scroll`);await p.screenshot({path:`${images}/${width}-${name}.png`})}
  const configure=async(index,label,value,locked=false)=>{
   await page.getByRole('checkbox',{name:new RegExp(`Select field ${index}: ${label}`)}).check()
   const input=page.getByLabel('Prefill value',{exact:true});await input.fill(value)
   assert.equal(await page.getByLabel('Source (reported by sender or API)',{exact:true}).inputValue(),'Sender input')
   await page.getByLabel('Read-only for signer',{exact:true}).setChecked(locked)
   await input.scrollIntoViewIfNeeded()
   assert.ok((await page.locator('.iw-inspector').ariaSnapshot()).includes('Sender prefill'),'accessibility tree exposes sender prefill')
  }
  await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Templates',exact:true}).click();await page.getByRole('button',{name:`Edit ${title}`,exact:true}).click()
  await configure(2,'Company','Acme Workshops LLC');await page.getByRole('button',{name:'Clear selection',exact:true}).click()
  await configure(3,'Address','48 River Street');await page.getByRole('button',{name:'Clear selection',exact:true}).click()
  await configure(4,'Amount USD','1250.25',true)
  for(const theme of ['light','dark']) {await page.emulateMedia({colorScheme:theme});await axe(page,`PREP-008 template inspector ${width} ${theme}`)}
  await capture('template-inspector');await page.getByRole('button',{name:'Save new version',exact:true}).click();await page.getByRole('button',{name:`Use ${title}`,exact:true}).waitFor()
  const id=(await app.command('template.use',{id:template,recipients:[{name:'Mara Quinn',email:`mara-${width}@clients.example`}]})).id
  await page.goto(app.origin+'/app');await page.getByRole('row',{name:new RegExp(title)}).click();await page.getByRole('button',{name:'Edit draft',exact:true}).click()
  await page.getByRole('checkbox',{name:/Select field 4: Amount USD/}).check()
  assert.equal(await page.getByLabel('Prefill value',{exact:true}).inputValue(),'1250.25');assert.ok(await page.getByLabel('Read-only for signer',{exact:true}).isChecked())
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();await page.getByRole('checkbox',{name:/Select field 3: Address/}).check()
  const address=page.getByLabel('Prefill value',{exact:true});await tabTo(page,address);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('50 River Street')
  await page.getByLabel('Source (reported by sender or API)',{exact:true}).fill('Sender correction')
  await axe(page,`PREP-008 draft inspector ${width}`);await address.scrollIntoViewIfNeeded();await capture('draft-inspector')
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('button',{name:'Edit draft',exact:true}).waitFor()
  const invitation=(await app.command('envelope.approve',{id,eligible:true})).invitations[0]
  const signer=await context.newPage();signer.setDefaultTimeout(20000);await signer.goto(invitation.url)
  await signer.getByLabel('Verification code',{exact:true}).fill(invitation.code);await signer.getByRole('button',{name:'Verify code',exact:true}).click();await signer.getByRole('checkbox',{name:/I have read the electronic record/}).check();await signer.getByRole('button',{name:'Agree and continue',exact:true}).click()
  const form=signer.locator('.iw-sign-fields'),company=form.getByRole('textbox',{name:/^Company/}),amount=form.getByRole('textbox',{name:/^Amount USD/})
  await company.waitFor();assert.equal(await company.inputValue(),'Acme Workshops LLC');assert.equal(await form.getByRole('textbox',{name:/^Address/}).inputValue(),'50 River Street');assert.equal(await amount.inputValue(),'1250.25');assert.ok(await amount.getAttribute('readonly')!==null)
  await tabTo(signer,amount);await signer.keyboard.type('9999');assert.equal(await amount.inputValue(),'1250.25','keyboard cannot change locked amount')
  assert.ok((await form.ariaSnapshot()).includes('Supplied by the caller, not verified with the CRM.'),'screen-reader receives honest provenance')
  await tabTo(signer,company,{backwards:true});await signer.keyboard.press('ControlOrMeta+A');await signer.keyboard.type('Acme Studio LLC')
  await signer.getByRole('button',{name:'Start',exact:true}).click();const guide=signer.getByRole('group',{name:'Guided signing'});await guide.getByRole('textbox',{name:/Client signature/}).fill('Mara Quinn');await signer.getByRole('button',{name:'Next',exact:true}).click()
  await signer.getByText('All 4 required fields complete',{exact:true}).waitFor()
  for(const theme of ['light','dark']) {await signer.emulateMedia({colorScheme:theme});await axe(signer,`PREP-008 signing ${width} ${theme}`)}
  await amount.scrollIntoViewIfNeeded();await capture('signing',signer)
  await page.close()
  const consent=signer.getByRole('checkbox',{name:/consent to electronic signatures/});await tabTo(signer,consent);await signer.keyboard.press('Space');await tabTo(signer,signer.getByRole('button',{name:'Sign document',exact:true}));await signer.keyboard.press('Enter')
  await signer.getByRole('heading',{name:'All signatures are complete.'}).waitFor();await signer.locator('.iw-pdf-page').first().scrollIntoViewIfNeeded();await signer.locator('.iw-pdf-page[data-rendered]').first().waitFor();await capture('completed',signer)
  const record=(await (await context.request.get(app.origin+'/api/inkwell/envelopes/'+id)).json()).envelope
  assert.equal(record.status,'completed');assert.equal(record.signers[0].values.amount,'1250.25');assert.equal(record.signers[0].values.company,'Acme Studio LLC');assert.equal(record.signers[0].values.address,'50 River Street');assert.equal(record.fields.find(f=>f.id==='address').prefill.source,'Sender correction')
  await context.close()
 }
 console.log('PREP-008 passed at 1440/390: template/draft prefill, recorded sources, locked amount, keyboard/screen-reader signing, completed record')
} catch(error){await screenshots(app.browser,'prep-008');throw error} finally {await app.close()}
