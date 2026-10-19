// PREP-004 + SIGNX-003: configure rules, reveal/hide required fields, calculate USD, sign with keyboard and accessible controls.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { startInkwell, screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

// The local proof may attach to the caller's PID-owned rer dev; CI runs the emitted Worker.
async function localApp(file) {
 const {origin,owner}=JSON.parse(await readFile(file,'utf8'))
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const command=async(command,input)=>{const r=await fetch(origin+'/api/inkwell/commands',{method:'POST',headers:{origin,cookie:owner,'content-type':'application/json'},body:JSON.stringify({command,input,commandId:crypto.randomUUID()})});const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v.result}
 return {origin,browser,command,ownerCookies:()=>owner.split('; ').map(cookie=>({name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:origin})),close:()=>browser.close()}
}
const app=process.env.INKWELL_LOCAL_SESSION ? await localApp(process.env.INKWELL_LOCAL_SESSION) : await startInkwell()
const images='/tmp/sx-inkwell-r14-screens';await mkdir(images,{recursive:true})
try {
 const pdf=await PDFDocument.create(),p=pdf.addPage([612,792]),font=await pdf.embedFont(StandardFonts.Helvetica)
 p.drawText('Harbour Studio - Workshop order',{x:60,y:740,size:20,font});p.drawText('Workshop fee plus materials in USD. Other requests are optional.',{x:60,y:700,size:11,font})
 for(const width of [1440,390]) {
  const title=`Workshop order ${width} ${crypto.randomUUID().slice(0,6)}`,field=(id,label,type,y,extra={})=>({id,label,type,signer:0,page:0,x:.1,y,width:.6,height:.04,...extra})
  const fields=[field('signature','Client signature','signature',.2),field('other','Other requests','checkbox',.3),field('details','Request details','text',.4),field('reference','Request reference','text',.45),field('fee','Workshop fee','number',.5),field('materials','Materials fee','number',.55),field('total','Total USD','number',.6),field('approval','Approval note','text',.65)]
  const {id}=await app.command('envelope.prepare',{title,filename:'workshop.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[{name:'Mara Quinn',email:`mara-${width}@clients.example`}],fields})
  const context=await app.browser.newContext({viewport:{width,height:1000},hasTouch:width===390});await context.addCookies(app.ownerCookies ? app.ownerCookies() : [app.ownerCookie()]);const page=await context.newPage();page.setDefaultTimeout(15000)
  const capture=async phase=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${phase} no horizontal scroll ${width}`);await page.screenshot({path:`${images}/${width}-${phase}.png`,fullPage:false})}
  await page.goto(app.origin+'/app');await page.getByRole('row',{name:new RegExp(title)}).click();await page.getByRole('button',{name:'Edit draft',exact:true}).click()
  await page.locator('.iw-pdf-page').first().scrollIntoViewIfNeeded();await page.locator('.iw-pdf-page[data-rendered]').first().waitFor()
  for(const [index,label] of [[3,'Request details'],[4,'Request reference']]) {
   await page.getByRole('checkbox',{name:new RegExp(`Select field ${index}: ${label}`)}).check()
   await page.getByLabel('Condition field',{exact:true}).selectOption('other');await page.getByLabel('Condition value',{exact:true}).fill('true')
   await page.getByRole('button',{name:'Clear selection',exact:true}).click()
  }
  await page.getByRole('checkbox',{name:/Select field 8: Approval note/}).check();await page.getByLabel('Required condition field',{exact:true}).selectOption('other');await page.getByRole('button',{name:'Clear selection',exact:true}).click()
  const totalSelection=page.getByRole('checkbox',{name:/Select field 7: Total USD/});await totalSelection.check();await totalSelection.focus();const before=await page.locator('[data-field-id=total].iw-field-edit').evaluate(el=>parseFloat(el.style.top));await page.keyboard.press('ArrowDown');assert.equal(await page.locator('[data-field-id=total].iw-field-edit').evaluate(el=>parseFloat(el.style.top)),before+1,'field list moves the field by keyboard');await page.keyboard.press('ArrowUp')
  await page.getByLabel('Calculation operation',{exact:true}).selectOption('sum')
  const inputs=page.getByRole('group',{name:'Calculation inputs (document order)'})
  await inputs.getByRole('checkbox',{name:'Workshop fee',exact:true}).check();await inputs.getByRole('checkbox',{name:'Materials fee',exact:true}).check()
  for(const theme of ['light','dark']) {await page.emulateMedia({colorScheme:theme});await axe(page,`PREP-004 inspector ${width} ${theme}`)};await capture('inspector')
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('button',{name:'Edit draft',exact:true}).waitFor()
  const invitations=(await app.command('envelope.approve',{id,eligible:true})).invitations;assert.equal(invitations.length,1)
  const invitation=invitations[0],signing=await context.newPage();await signing.goto(invitation.url)
  await signing.getByLabel('Verification code',{exact:true}).fill(invitation.code);await signing.getByRole('button',{name:'Verify code',exact:true}).click()
  await signing.getByRole('checkbox',{name:/I have read the electronic record/}).check();await signing.getByRole('button',{name:'Agree and continue'}).click()
  const form=signing.locator('.iw-sign-fields'),other=form.getByRole('checkbox',{name:/Other requests/})
  await other.waitFor();assert.equal(await form.getByRole('textbox',{name:/Approval note/}).getAttribute('required'),null);assert.equal(await form.getByRole('textbox',{name:/Request details/}).count(),0)
  await tabTo(signing,other);await signing.keyboard.press('Space')
  const details=form.getByRole('textbox',{name:/Request details/});await details.waitFor();assert.ok(await details.getAttribute('required')!==null);assert.ok(await form.getByRole('textbox',{name:/Approval note/}).getAttribute('required')!==null)
  assert.ok((await signing.locator('.iw-sign-fields').ariaSnapshot()).includes('Request reference'),'screen-reader tree exposes revealed fields')
  await tabTo(signing,details);await signing.keyboard.type('Late access');await tabTo(signing,other,{backwards:true});await signing.keyboard.press('Space')
  assert.equal(await form.getByRole('textbox',{name:/Request details/}).count(),0,'unchecked fields disappear');assert.equal(await form.getByRole('textbox',{name:/Approval note/}).getAttribute('required'),null,'independent required condition clears while field stays visible')
  const signature=form.getByRole('textbox',{name:/Client signature/});await tabTo(signing,signature);await signing.keyboard.type('Mara Quinn')
  const fee=form.getByRole('textbox',{name:/Workshop fee/}),materials=form.getByRole('textbox',{name:/Materials fee/}),total=form.getByRole('textbox',{name:/Total USD/})
  await tabTo(signing,fee);await signing.keyboard.type('1250.25');await tabTo(signing,materials);await signing.keyboard.type('49.75')
  assert.equal(await total.inputValue(),'1300.00');assert.ok(await total.getAttribute('readonly')!==null)
  await signing.keyboard.press('ControlOrMeta+A');await signing.keyboard.type('59.75');assert.equal(await total.inputValue(),'1310.00','calculation updates live')
  for(const theme of ['light','dark']) {await signing.emulateMedia({colorScheme:theme});await axe(signing,`PREP-004 signing ${width} ${theme}`)}
  await page.close()
  assert.ok(await signing.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await signing.screenshot({path:`${images}/${width}-signing.png`,fullPage:false})
  const consent=signing.getByRole('checkbox',{name:/consent to electronic signatures/});await tabTo(signing,consent);await signing.keyboard.press('Space');await tabTo(signing,signing.getByRole('button',{name:'Sign document',exact:true}));await signing.keyboard.press('Enter')
  await signing.getByRole('heading',{name:'All signatures are complete.'}).waitFor();await signing.locator('.iw-pdf-page').first().scrollIntoViewIfNeeded();await signing.locator('.iw-pdf-page[data-rendered]').first().waitFor();await signing.screenshot({path:`${images}/${width}-completed.png`,fullPage:false})
  const e=await (await context.request.get(app.origin+'/api/inkwell/envelopes/'+id)).json();assert.equal(e.envelope.status,'completed');assert.equal(e.envelope.signers[0].values.total,'1310.00');assert.ok(!('details'in e.envelope.signers[0].values));assert.ok(!('reference'in e.envelope.signers[0].values))
  assert.equal((await context.request.get(app.origin+new URL(invitation.url).pathname.replace('/sign/','/api/sign/')+'/artifacts/signed')).status(),200)
  await context.close()
 }
 console.log('PREP-004 passed: rule inspector, checkbox reveal/hide, required fields, live USD, accessible keyboard signing, completed record at 1440/390')
} catch(error){await screenshots(app.browser,'prep-004');throw error} finally {await app.close()}
