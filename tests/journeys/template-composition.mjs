// Built-page composition: HTTP fixtures, actual template selection/preparation/signing, only the mail provider fake.
import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { w9Pdf } from '../fixtures/forms.mjs'
import { startInkwellWithMail } from './mail-worker.mjs'
import { axe, tabTo } from './a11y.mjs'
import { screenshots } from './worker.mjs'

export async function templateComposition() {
 const app=await startInkwellWithMail(),images=process.env.INKWELL_PROOF_DIR??'test-results/template-composition';await mkdir(images,{recursive:true})
 try {
  const pdf=async lines=>{const d=await PDFDocument.create(),p=d.addPage([612,792]);lines.forEach((line,i)=>p.drawText(line,{x:48,y:740-i*28,size:11}));return Buffer.from(await d.save())}
  const nda=await pdf(['Harbour Studio - Mutual nondisclosure agreement','The parties exchange confidential workshop plans and customer information.','Each party protects the information and uses it only for the project.','These obligations continue for three years after the project ends.'])
  const policy=await pdf(['Harbour Studio - Visitor information','Reception opens at 9 am. Contact the project coordinator before visiting.'])
  const later=await pdf(['Harbour Studio - Delivery acknowledgement','The client confirms receipt after reviewing the onboarding documents.'])
  const field=(id,label,type,page=0)=>({id,label,type,signer:0,page,x:.1,y:type==='signature'?.7:.55,width:.65,height:.05})
  for(const width of [1440,390]){
   const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000}});await context.addCookies([app.ownerCookie()]);const owner=await context.newPage();owner.setDefaultTimeout(20000)
   const capture=async(page,state)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${state}: no horizontal overflow`);for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`composition ${width} ${state} ${theme}`);await page.screenshot({path:`${images}/composition-${width}-${state}-${theme}.png`})}await page.emulateMedia({colorScheme:'light'})}
   const titles=[`Harbour NDA ${width}`,`Harbour W9 ${width}`,`Harbour delivery ${width}`]
   const source=(title,bytes,order,fields,extra={})=>({title,filename:title.replaceAll(' ','-')+'.pdf',pdfBase64:bytes.toString('base64'),roles:[{role:'Client',order}],fields,expiryDays:30,reminders:{afterDays:2,everyDays:3},...extra})
   const ndaInput=source(titles[0],nda,1,[field('signature','NDA signature','signature'),field('contact','Confidentiality contact','text')])
   const w9Input=source(titles[1],await w9Pdf(),1,[field('signature','W9 signature','signature',1),field('tin','Taxpayer identifier','text')],{roles:[{role:'Client',order:1,sms:true}],expiryDays:45,reminders:{afterDays:5,everyDays:7}})
   const a=await app.command('template.save',ndaInput),b=await app.command('template.save',w9Input),c=await app.command('template.save',source(titles[2],later,2,[field('signature','Delivery signature','signature')]))
   const revision=await app.command('template.update',{id:b.id,...w9Input,message:'Please review your taxpayer certification.'})
   await owner.goto(app.origin+'/app');await owner.getByRole('button',{name:'Templates',exact:true}).click()
   for(const title of titles){const checkbox=owner.getByRole('checkbox',{name:`Select ${title} for combination`,exact:true});await tabTo(owner,checkbox);await owner.keyboard.press('Space');await expect(checkbox).toBeChecked()}
   await capture(owner,'selected-templates');await owner.getByRole('button',{name:'Combine selected templates',exact:true}).click()
   const preview=owner.getByRole('region',{name:'Composition preview',exact:true}),ready=()=>expect(owner.getByRole('button',{name:'Prepare combined envelope',exact:true})).toBeEnabled()
   await ready();await expect(preview).toContainText('2 roles');await expect(preview).toContainText('expires after 30 days');await expect(preview).toContainText('reminders after 2, then every 3')
   await expect(preview).toContainText('Proposed: SMS code');await expect(preview).toContainText('remains separate recipients');assert.ok((await preview.ariaSnapshot()).includes('Selected: SMS code'),'the accessibility tree exposes the stricter identity proposal')
   // Order changes re-preview and keep first-source settings as the default until the sender explicitly chooses otherwise.
   await owner.getByRole('button',{name:`Move ${titles[1]} up`,exact:true}).click();await ready();await expect(preview).toContainText('expires after 45 days')
   await owner.getByRole('button',{name:`Move ${titles[0]} up`,exact:true}).click();await ready();await expect(preview).toContainText('expires after 30 days')
   const settings=owner.getByLabel('Envelope settings from',{exact:true});await tabTo(owner,settings);await settings.selectOption(b.id);await ready();await expect(preview).toContainText('expires after 45 days');await expect(preview).toContainText('reminders after 5, then every 7')
   await preview.scrollIntoViewIfNeeded();await capture(owner,'conflicts-and-settings')
   const identity=owner.getByLabel('Client, routing order 1 authentication',{exact:true});await expect(identity).toHaveValue('sms');await identity.selectOption('email');await ready();await expect(identity).toHaveValue('email');await expect(preview).toContainText('Selected: Email code')
   const email=`composition-client-${width}@clients.example`,name='Mara Quinn'
   for(const order of [1,2]){await owner.getByLabel(`Client, routing order ${order} name`,{exact:true}).fill(name);await owner.getByLabel(`Client, routing order ${order} email`,{exact:true}).fill(email)}
   const recipientGroup=owner.getByRole('group',{name:'Recipients',exact:true});assert.ok((await recipientGroup.ariaSnapshot()).includes('Client, routing order 2 email'),'same-label recipients retain separate accessible order labels')
   await owner.getByRole('button',{name:`Move ${titles[1]} up`,exact:true}).click();await ready();await expect(owner.getByLabel('Client, routing order 1 email',{exact:true})).toHaveValue(email)
   await owner.getByRole('button',{name:`Move ${titles[0]} up`,exact:true}).click();await ready();await expect(owner.getByLabel('Client, routing order 2 name',{exact:true})).toHaveValue(name)
   await recipientGroup.scrollIntoViewIfNeeded();await capture(owner,'recipient-actions')
   await owner.getByLabel('Additional PDFs',{exact:true}).setInputFiles({name:'visitor-information.pdf',mimeType:'application/pdf',buffer:policy});await expect(preview).toContainText('4 of 20 documents')
   await owner.getByRole('region',{name:'Combined documents',exact:true}).scrollIntoViewIfNeeded();await capture(owner,'additional-pdf')
   const preparedResponse=owner.waitForResponse(r=>r.url().endsWith('/api/inkwell/commands')&&r.request().postDataJSON()?.command==='template.combine')
   await owner.getByRole('button',{name:'Prepare combined envelope',exact:true}).click();const prepared=await preparedResponse;assert.equal(prepared.status(),200);const id=(await prepared.json()).result.id
   let detail=owner.getByRole('region',{name:titles[1],exact:true});await detail.getByRole('button',{name:'Edit draft',exact:true}).waitFor()
   const read=async()=>(await app.call('/api/inkwell/envelopes/'+id,{cookie:app.owner})).value.envelope,e=await read()
   assert.equal(e.signers.length,2);assert.equal(e.documents.length,4);assert.deepEqual(e.signers.map(s=>s.order),[1,2]);assert.ok(e.signers.every(s=>!s.sms));assert.deepEqual(e.reminders,{afterDays:5,everyDays:7})
   assert.ok(Math.abs((Date.parse(e.expiresAt)-Date.parse(e.createdAt))/86400000-45)<.01);assert.equal(e.fields.filter(f=>f.signer===0&&f.type==='signature').length,2)
   assert.deepEqual(e.templates.map(t=>[t.id,t.version]),[[a.id,a.version],[b.id,revision.version],[c.id,c.version]])
   const sourceList=detail.getByRole('region',{name:'Source templates',exact:true});await expect(sourceList).toContainText(`${titles[1]} · version ${revision.version}`);await sourceList.scrollIntoViewIfNeeded();await capture(owner,'prepared-sources')
   await detail.getByLabel(/confirm it is eligible for electronic signature/).check();await detail.getByRole('button',{name:'Approve and invite first recipient',exact:true}).click();await detail.getByRole('heading',{name:'Signing status',exact:true}).waitFor()
   const open=async()=>{await expect.poll(()=>Boolean(app.mail(email,'Please sign:'))).toBe(true);const invitation=app.mail(email,'Please sign:'),url=invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0],ctx=await app.browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await ctx.newPage();page.setDefaultTimeout(20000);await page.goto(url);await page.getByRole('button',{name:'Email me a code',exact:true}).click();await page.getByText('Code sent. Check your email.',{exact:true}).waitFor();await page.getByLabel('Email verification code',{exact:true}).fill(app.mail(email,'Your Inkwell verification code').text.match(/\b\d{6}\b/)[0]);await page.getByRole('button',{name:'Verify code',exact:true}).click();await page.getByRole('checkbox',{name:/I have read the electronic record/}).check();await page.getByRole('button',{name:'Agree and continue',exact:true}).click();await page.locator('.iw-sign-fields').waitFor();return{ctx,page,url}}
   const first=await open(),form=first.page.locator('.iw-sign-fields'),docs=first.page.getByRole('region',{name:'Envelope documents',exact:true})
   await expect(docs).toContainText(ndaInput.filename);await expect(docs).toContainText(w9Input.filename);await expect(docs).not.toContainText(titles[2].replaceAll(' ','-')+'.pdf')
   const contact=form.getByRole('textbox',{name:/Confidentiality contact/});await tabTo(first.page,contact);await first.page.keyboard.type('Mara Quinn, Harbour procurement')
   await form.getByRole('textbox',{name:/Taxpayer identifier/}).fill('synthetic-taxpayer-144');for(const label of ['NDA signature','W9 signature'])await form.getByRole('textbox',{name:new RegExp(label)}).fill(name)
   assert.ok((await form.ariaSnapshot()).includes('W9 signature'),'one accessible signing form contains both source signatures');await form.scrollIntoViewIfNeeded();await capture(first.page,'nda-and-w9-session')
   await first.page.getByRole('checkbox',{name:/consent to electronic signatures/}).check();await first.page.getByRole('button',{name:'Sign document',exact:true}).click();await first.page.getByRole('heading',{name:'Your signature has been recorded.',exact:true}).waitFor()
   const afterFirst=await read();assert.ok(afterFirst.signers[0].signedAt);assert.equal(afterFirst.signers[1].signedAt,undefined)
   const second=await open();assert.notEqual(second.url,first.url,'order 2 authenticates a distinct invitation even with the same email');await second.page.locator('.iw-sign-fields').getByRole('textbox',{name:/Delivery signature/}).fill(name)
   await second.page.locator('.iw-sign-fields').scrollIntoViewIfNeeded();await capture(second.page,'later-order-session');await second.page.getByRole('checkbox',{name:/consent to electronic signatures/}).check();await second.page.getByRole('button',{name:'Sign document',exact:true}).click();await second.page.getByRole('heading',{name:'All signatures are complete.',exact:true}).waitFor()
   await owner.goto(app.origin+'/app');await owner.getByRole('row',{name:new RegExp(titles[1])}).click();detail=owner.getByRole('region',{name:titles[1],exact:true});await detail.getByRole('link',{name:'Executed PDF',exact:true}).waitFor();await detail.getByRole('region',{name:'Source templates',exact:true}).scrollIntoViewIfNeeded();await capture(owner,'completed-sources')
   const done=await read();assert.equal(done.status,'completed');assert.ok(done.documents.every(d=>d.signedSha256));assert.equal((await app.call(`/api/inkwell/envelopes/${id}/verify`,{cookie:app.owner})).value.ok,true)
   const response=await fetch(`${app.origin}/api/inkwell/envelopes/${id}/artifacts/certificate`,{headers:{cookie:app.owner}});assert.equal(response.status,200)
   const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),certificate=await getDocument({data:new Uint8Array(await response.arrayBuffer()),standardFontDataUrl:new URL('../../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise;let text='';for(let n=1;n<=certificate.numPages;n++)text+=(await(await certificate.getPage(n)).getTextContent()).items.map(i=>i.str).join(' ')+'\n'
   for(const source of e.templates){assert.ok(text.includes(source.title));assert.match(text,new RegExp(source.title+'[^\\n]*'+source.version))}
   await certificate.destroy();await first.ctx.close();await second.ctx.close();await context.close()
  }
  console.log(`Template composition passed at 1440/390: merged and distinct orders, settings and identity choices, extra PDF, complete signing, source versions, keyboard and light/dark accessibility. Screens: ${images}`)
 }catch(error){await screenshots(app.browser,'template-composition');throw error}finally{await app.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await templateComposition()
