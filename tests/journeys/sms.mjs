import assert from 'node:assert/strict'
import {expect} from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

/** Preparation, correction, explicit SMS resend, follow-up authorization and signer authentication on built pages. */
export async function smsJourney(){
 const app=await startInkwellWithMail({sms:true}),images=join(process.env.INKWELL_PROOF_DIR??'test-results','sms')
 await mkdir(images,{recursive:true})
 try{
  const pdf=await PDFDocument.create();const letter=pdf.addPage([612,792]);letter.drawText('Harbour Studio - Workshop service agreement',{x:50,y:740,size:14});letter.drawText('Project: Autumn workshop design and facilitation',{x:50,y:710,size:11});letter.drawText('The client approves the agreed schedule and delivery terms below.',{x:50,y:685,size:11});const pdfBase64=Buffer.from(await pdf.save()).toString('base64')
  for(const width of [1440,390]){
   const viewport={width,height:width===390?844:1000},email=`mara.quinn.${width}@harbour.example`,name='Mara Quinn',title=`Harbour workshop services ${width}`
   const {id}=await app.command('envelope.prepare',{title,filename:'sms-agreement.pdf',pdfBase64,signers:[{name,email}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]})
   const context=await app.browser.newContext({viewport});await context.addCookies([app.ownerCookie()])
   const owner=await context.newPage();owner.setDefaultTimeout(20000)
   const capture=async(page,state)=>{
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${state}: no sideways scroll`)
    for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await page.evaluate(()=>{document.documentElement.getBoundingClientRect();for(const animation of document.getAnimations())if(animation.effect?.getTiming().iterations!==Infinity)animation.finish()});await axe(page,`SMS ${state} ${width} ${theme}`)}
    await page.emulateMedia({colorScheme:'light'});await page.screenshot({path:join(images,`${width}-${state}.png`),fullPage:true})
   }
   const templateTitle=`Harbour SMS client template ${width}`,template=await app.command('template.save',{title:templateTitle,filename:'workshop.pdf',pdfBase64,roles:[{role:'Client',order:1,sms:true}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}],expiryDays:30})
   await owner.goto(app.origin+'/app');await owner.getByRole('button',{name:'Templates',exact:true}).click();await owner.getByRole('button',{name:`Use ${templateTitle}`,exact:true}).click()
   await owner.getByLabel('Client name',{exact:true}).fill(name);await owner.getByLabel('Client email',{exact:true}).fill(`template.${email}`);await owner.getByLabel('Client mobile number',{exact:true}).fill('+12025550102');await capture(owner,'template-recipient')
   const prepared=owner.waitForResponse(r=>r.url().endsWith('/api/inkwell/commands')&&r.request().postDataJSON()?.command==='template.use');await owner.getByRole('button',{name:'Prepare to send',exact:true}).click();const response=await prepared;assert.equal(response.status(),200);const fromTemplate=(await app.call('/api/inkwell/envelopes/'+(await response.json()).result.id,{cookie:app.owner})).value.envelope;assert.equal(fromTemplate.template.id,template.id);assert.equal(fromTemplate.signers[0].sms,true);assert.equal(fromTemplate.signers[0].phone,'+12025550102')
   const record=async()=>(await app.call('/api/inkwell/envelopes/'+id,{cookie:app.owner})).value.envelope
   await owner.goto(app.origin+'/app');await owner.getByRole('row',{name:new RegExp(title)}).click()
   await owner.getByRole('region',{name:title}).getByRole('button',{name:'Edit draft',exact:true}).click()
   await expect(owner.getByLabel('Recipient 1 name',{exact:true})).toHaveValue(name);await expect(owner.getByLabel('Recipient 1 email',{exact:true})).toHaveValue(email)
   const authentication=owner.getByLabel('Recipient 1 authentication',{exact:true})
   await authentication.selectOption('sms');await owner.getByLabel('Recipient 1 mobile number',{exact:true}).waitFor();await authentication.focus();await owner.keyboard.press('Tab')
   assert.equal(await owner.getByLabel('Recipient 1 mobile number',{exact:true}).evaluate(el=>el===document.activeElement),true,'SMS selection leads by keyboard to its mobile input: '+await owner.evaluate(()=>document.activeElement.outerHTML))
   await owner.getByLabel('Recipient 1 mobile number',{exact:true}).fill('+12025550102');await capture(owner,'prepare')
   await owner.getByRole('button',{name:'Save draft',exact:true}).click()
   let detail=owner.getByRole('region',{name:title})
   await detail.getByRole('checkbox',{name:/confirm it is eligible for electronic signature/}).check()
   await detail.getByRole('button',{name:'Approve and invite first recipient',exact:true}).click()
   await detail.getByRole('button',{name:'Correct…',exact:true}).waitFor()
   const oldUrl=app.mail(email,'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]
   await detail.getByRole('button',{name:'Correct…',exact:true}).click()
   await owner.getByRole('heading',{name:'Correct envelope',exact:true}).waitFor()
   await owner.getByLabel('Recipient 1 mobile number',{exact:true}).fill('+12025550103');await capture(owner,'correct-phone')
   await owner.getByRole('button',{name:'Save correction',exact:true}).click()
   await app.call('/api'+new URL(oldUrl).pathname,{status:404})
   const corrected=await record(),correction=corrected.events.find(e=>e.action==='signer.corrected')
   assert.equal(correction.detail.before.phone,'+12025550102');assert.equal(correction.detail.after.phone,'+12025550103')
   detail=owner.getByRole('region',{name:title})
   const same=detail.getByRole('button',{name:'Resend by SMS',exact:true});await tabTo(owner,same);await owner.keyboard.press('Enter')
   await detail.getByText(/SMS invitation resent to/).waitFor()
   const sameUrl=app.smsMessages().at(-1).body.match(/http:\/\/\S+\/sign\/\S+/)[0]
   await same.click();assert.equal(app.smsMessages().at(-1).body.match(/http:\/\/\S+\/sign\/\S+/)[0],sameUrl)
   await detail.getByRole('button',{name:'Resend by SMS with a new link',exact:true}).click()
   await detail.getByText(/previous link no longer works/).waitFor()
   const newUrl=app.smsMessages().at(-1).body.match(/http:\/\/\S+\/sign\/\S+/)[0]
   assert.notEqual(newUrl,sameUrl);await app.call('/api'+new URL(sameUrl).pathname,{status:404})
   assert.ok((await record()).messages.filter(m=>m.subject==='SMS invitation'&&m.status==='sent').length>=3)
   await capture(owner,'sms-resend')
   await detail.locator('summary').filter({hasText:'Turn on follow-up'}).click()
   const form=detail.locator('form').filter({has:owner.getByLabel('Maximum contacts per recipient',{exact:true})})
   await form.getByRole('checkbox',{name:'Email',exact:true}).uncheck();await form.getByRole('checkbox',{name:'SMS',exact:true}).check()
   await form.getByLabel('Maximum contacts per recipient',{exact:true}).fill('2')
   await form.getByRole('checkbox',{name:'I authorize follow-up for this envelope under these settings.',exact:true}).check()
   await capture(owner,'sms-followup-grant')
   const authorize=form.getByRole('button',{name:'Turn on follow-up',exact:true});await authorize.focus();await owner.keyboard.press('Enter')
   await detail.getByText(/Grant version 1 · active/).waitFor()
   assert.deepEqual((await app.call('/api/inkwell/envelopes/'+id+'/followup',{cookie:app.owner})).value.grant.channels,['sms'])
   const signerContext=await app.browser.newContext({viewport}),page=await signerContext.newPage();page.setDefaultTimeout(20000)
   await page.goto(newUrl);await page.getByRole('heading',{name:'Verify your mobile number',exact:true}).waitFor();await capture(page,'request-code')
   const send=page.getByRole('button',{name:'Text me a code',exact:true});await tabTo(page,send);await page.keyboard.press('Enter')
   await page.getByLabel('SMS verification code',{exact:true}).waitFor();await capture(page,'enter-code')
   const code=app.smsMessages().at(-1).body.match(/\b\d{6}\b/)[0]
   assert.equal(app.smsMessages().at(-1).to,'+12025550103')
   await page.getByLabel('SMS verification code',{exact:true}).fill(code);await page.keyboard.press('Enter')
   await page.getByRole('checkbox',{name:/I have read the/}).check();await page.getByRole('button',{name:'Agree and continue',exact:true}).click()
   await page.locator('.iw-sign-fields').waitFor();await page.locator('.iw-sign-fields').getByRole('textbox',{name:/Signature/}).fill(name)
   await page.getByRole('checkbox',{name:/consent to electronic signatures/}).check();await page.getByRole('button',{name:'Sign document',exact:true}).click()
   await page.getByRole('heading',{name:'All signatures are complete.',exact:true}).waitFor();await capture(page,'completed')
   const completed=await record();assert.equal(completed.status,'completed');assert.ok(completed.events.some(e=>e.action==='signer.sms_verified'&&e.detail.maskedPhone.includes('0103')))
   await signerContext.close();await context.close()
  }
  console.log(`SMS preparation, correction, resend, follow-up and signing passed at 1440/390 with light/dark axe and keyboard controls. Screens: ${images}`)
 }catch(error){await screenshots(app.browser,'sms-failure');throw error}finally{await app.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.argv.includes('--usage'))await smsJourney();await usageJourney()}


/** ADMIN-006 uses the real built Settings page and signing HTTP doors; only Twilio is replaced. */
export async function usageJourney(){
 const images=join(process.env.INKWELL_PROOF_DIR??'test-results','usage');await mkdir(images,{recursive:true})
 for(const width of [1440,390]){
  const app=await startInkwellWithMail({sms:true,smsPrice:'-1.000000'})
  try {
   const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000}});await context.addCookies([app.ownerCookie()])
   const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Settings',exact:true}).click()
   const usage=page.getByRole('region',{name:'Usage and cost',exact:true})
   await usage.getByLabel('Monthly SMS cap in USD (blank for no cap)',{exact:true}).fill('5')
   await usage.getByLabel('SMS allowance per attempt in USD',{exact:true}).fill('1')
   await tabTo(page,usage.getByRole('checkbox'));await page.keyboard.press('Space');await page.keyboard.press('Tab');await page.keyboard.press('Enter')
   await expect(usage.getByRole('checkbox')).not.toBeChecked()
   await expect(usage.getByRole('button',{name:'Refresh usage'})).toBeEnabled()
   const pdf=await PDFDocument.create();pdf.addPage([612,792]);const pdfBase64=Buffer.from(await pdf.save()).toString('base64')
   const paths=[]
   for(let i=0;i<6;i++){
    const email=`usage-${width}-${i}@harbour.example`,id=(await app.command('envelope.prepare',{title:'Usage agreement '+i,filename:'usage.pdf',pdfBase64,signers:[{name:'Usage client',email,...(i<5?{sms:true,phone:'+12025550102'}:{})}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]})).id
    await app.command('envelope.approve',{id,eligible:true});paths.push('/api'+new URL(app.mail(email,'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname)
   }
   const capture=async state=>{
    await usage.getByRole('button',{name:'Refresh usage'}).click()
    await expect(usage.getByRole('button',{name:'Refresh usage'})).toBeEnabled()
    await usage.scrollIntoViewIfNeeded()
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'usage has no sideways scroll')
    // Every button on this Settings surface has visible text; no icon-only control is introduced.
    assert.equal(await usage.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.textContent.trim()).length),0)
    for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`ADMIN-006 ${width} ${state} ${theme}`)}
    await page.emulateMedia({colorScheme:'light'});await page.screenshot({path:join(images,`${width}-${state}-page.png`),fullPage:false});await usage.screenshot({path:join(images,`${width}-${state}.png`)})
   }
   for(let i=0;i<4;i++)await app.call(paths[i]+'/code',{body:{}})
   await capture('warning');await expect(usage.getByRole('status')).toContainText('SMS warning:')
   await expect(usage.locator('dd').nth(2)).toHaveText('$4.00 USD')
   await app.call(paths[4]+'/code',{body:{}})
   await capture('stopped');await expect(usage.getByRole('status')).toContainText('SMS stopped:')
   await expect(usage.locator('dd').nth(0)).toHaveText('6');await expect(usage.locator('dd').nth(1)).toHaveText('5');await expect(usage.locator('dd').nth(2)).toHaveText('$5.00 USD')
   // A fresh code request on a new SMS place has no resend delay to obscure the cap refusal.
   const extra=(await app.command('envelope.prepare',{title:'Blocked paid code',filename:'usage.pdf',pdfBase64,signers:[{name:'Blocked client',email:'blocked@harbour.example',sms:true,phone:'+12025550103'}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]})).id
   await app.command('envelope.approve',{id:extra,eligible:true});const blocked='/api'+new URL(app.mail('blocked@harbour.example','Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
   await app.call(blocked+'/code',{body:{},status:409});assert.equal(app.smsMessages().length,5)
   await app.call(paths[5]+'/code',{body:{}});const code=app.mail(`usage-${width}-5@harbour.example`,'Your Inkwell verification code').text.match(/\b\d{6}\b/)[0]
   const verified=await app.call(paths[5]+'/verify',{body:{code}});assert.ok(verified.cookie)
   await context.close()
  } finally {await app.close()}
 }
 console.log('ADMIN-006: usage settings, 5 USD warning and stop, matching provider totals and unaffected email passed at 1440 and 390.')
}
