import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { providerBindings, providerEdges } from '../provider-edge.mjs'
import { axe, tabTo } from './a11y.mjs'

/** Real built preparation, provider admission and sender-lock notice; only paid provider edges are replaced. */
export async function providerAuthJourney() {
 const edge=providerEdges(),app=await startInkwellWithMail({bindings:providerBindings,networkEdge:edge.networkEdge}),images=join(process.env.INKWELL_PROOF_DIR??'test-results','provider-auth')
 await mkdir(images,{recursive:true})
 try {
  const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Harbour Studio service agreement',{x:50,y:740,size:16});const pdfBase64=Buffer.from(await pdf.save()).toString('base64')
  const fields=[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]
  for(const width of [1440,390]) {
   const viewport={width,height:width===390?844:1000},context=await app.browser.newContext({viewport});await context.addCookies([app.ownerCookie()]);const owner=await context.newPage();owner.setDefaultTimeout(20000)
   const capture=async(page,state)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${state} has no sideways scroll`);for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`${state} ${width} ${theme}`)}await page.emulateMedia({colorScheme:'light'});await page.screenshot({path:join(images,`${width}-${state}.png`),fullPage:true})}
   const email=`mara.identity.${width}@harbour.example`,title=`Harbour identity agreement ${width}`,id=(await app.command('envelope.prepare',{title,filename:'harbour.pdf',pdfBase64,signers:[{name:'Mara Quinn',email}],fields})).id
   await owner.goto(app.origin+'/app');await owner.getByRole('row',{name:new RegExp(title)}).click();await owner.getByRole('region',{name:title}).getByRole('button',{name:'Edit draft',exact:true}).click()
   await expect(owner.getByLabel('Recipient 1 name',{exact:true})).toHaveValue('Mara Quinn');await owner.getByLabel('Recipient 1 authentication',{exact:true}).selectOption('knowledge');await expect(owner.getByLabel('Recipient 1 authentication',{exact:true})).toHaveValue('knowledge');await owner.getByLabel('Recipient 1 authentication',{exact:true}).selectOption('voice');await owner.getByLabel('Recipient 1 mobile number',{exact:true}).fill('+12025550102');await owner.getByLabel('Recipient 1 authentication',{exact:true}).selectOption('identity');await capture(owner,'identity-prepare')
   await owner.getByRole('button',{name:'Save draft',exact:true}).click();let detail=owner.getByRole('region',{name:title})
   await detail.getByRole('checkbox',{name:/confirm it is eligible for electronic signature/}).check();await detail.getByRole('button',{name:'Approve and invite first recipient',exact:true}).click();await detail.getByRole('button',{name:'Correct…',exact:true}).waitFor()
   const close=detail.getByRole('button',{name:'Close',exact:true});await close.focus();await expect(owner.getByRole('tooltip')).toBeVisible();await capture(owner,'detail-tooltip');await owner.keyboard.press('Tab');await close.hover();await expect(owner.getByRole('tooltip')).toBeVisible()
   const signerContext=await app.browser.newContext({viewport}),page=await signerContext.newPage();page.setDefaultTimeout(20000)
   const invitation=(address)=>app.mail(address,'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]
   await page.goto(invitation(email));await page.getByRole('heading',{name:'Verify your identity',exact:true}).waitFor();await capture(page,'identity-consent')
   await tabTo(page,page.getByRole('checkbox'));await page.keyboard.press('Space');await tabTo(page,page.getByRole('button',{name:'Start identity verification',exact:true}));await page.keyboard.press('Enter')
   await page.getByRole('link',{name:'Open Stripe verification'}).waitFor();edge.result('failed');await page.getByRole('button',{name:'Check verification result',exact:true}).click();await page.getByText(/Identity verification failed or the name did not match/).waitFor();await capture(page,'identity-retry')
   // A fresh recipient exercises a matching provider result without waiting on resend spacing.
   const matched=`mara.matched.${width}@harbour.example`,matchedId=(await app.command('envelope.prepare',{title:`Harbour verified agreement ${width}`,filename:'harbour.pdf',pdfBase64,signers:[{name:'Mara Quinn',email:matched,providerAuth:'identity'}],fields})).id
   await app.command('envelope.approve',{id:matchedId,eligible:true});await page.goto(invitation(matched));await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start identity verification',exact:true}).click();await page.getByRole('link',{name:'Open Stripe verification'}).waitFor();edge.result('passed');await page.getByRole('button',{name:'Check verification result',exact:true}).click()
   await page.getByRole('checkbox',{name:/I have read the/}).check();await page.getByRole('button',{name:'Agree and continue',exact:true}).click();await page.locator('.iw-sign-fields').waitFor();await page.locator('.iw-sign-fields').getByRole('textbox',{name:/Signature/}).fill('Mara Quinn');await page.getByRole('checkbox',{name:/consent to electronic signatures/}).check();await page.getByRole('button',{name:'Sign document',exact:true}).click();await page.getByRole('heading',{name:'All signatures are complete.',exact:true}).waitFor();await capture(page,'identity-completed')
   assert.equal((await app.call('/api/inkwell/envelopes/'+matchedId,{cookie:app.owner})).value.envelope.status,'completed')
   await owner.goto(app.origin+'/app');await owner.getByRole('row',{name:new RegExp(`Harbour verified agreement ${width}`)}).click();await owner.getByText(/Stripe Identity ID and selfie, name matched, verified/).waitFor();await capture(owner,'identity-authentication-timeline')
   // The template carries voice authentication and asks for the sender-set number.
   const templateTitle=`Harbour voice template ${width}`,template=await app.command('template.save',{title:templateTitle,filename:'harbour.pdf',pdfBase64,roles:[{role:'Client',order:1,providerAuth:'voice'}],fields})
   await owner.goto(app.origin+'/app');await owner.getByRole('button',{name:'Templates',exact:true}).click();await owner.getByRole('button',{name:`Use ${templateTitle}`,exact:true}).click();const voiceEmail=`mara.voice.${width}@harbour.example`
   await owner.getByLabel('Client name',{exact:true}).fill('Mara Quinn');await owner.getByLabel('Client email',{exact:true}).fill(voiceEmail);await owner.getByLabel('Client mobile number',{exact:true}).fill('+12025550102');await capture(owner,'voice-template')
   const prepared=owner.waitForResponse(r=>r.url().endsWith('/api/inkwell/commands')&&r.request().postDataJSON()?.command==='template.use');await owner.getByRole('button',{name:'Prepare to send',exact:true}).click();const voiceId=(await(await prepared).json()).result.id;assert.equal((await app.call('/api/inkwell/envelopes/'+voiceId,{cookie:app.owner})).value.envelope.template.id,template.id)
   await app.command('envelope.approve',{id:voiceId,eligible:true});await page.goto(invitation(voiceEmail));await page.getByRole('heading',{name:'Verify by voice call',exact:true}).waitFor();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Call me with a code',exact:true}).click();await expect(page.getByRole('button',{name:'Start a new verification'})).toBeVisible();await page.getByLabel('Voice-call code',{exact:true}).fill('123456');await capture(page,'voice-code');await page.getByRole('button',{name:'Verify voice-call code'}).click();await page.getByRole('button',{name:'Agree and continue',exact:true}).waitFor()
   // Two provider-scored failures in one hosted session lock and notify once.
   const knowledgeEmail=`devon.knowledge.${width}@harbour.example`,knowledgeId=(await app.command('envelope.prepare',{title:`Harbour knowledge agreement ${width}`,filename:'harbour.pdf',pdfBase64,signers:[{name:'Devon Gray',email:knowledgeEmail,providerAuth:'knowledge'}],fields})).id
   await app.command('envelope.approve',{id:knowledgeId,eligible:true});await page.goto(invitation(knowledgeEmail));await page.getByRole('heading',{name:'Verify with knowledge questions',exact:true}).waitFor();await page.getByLabel('Date of birth',{exact:true}).fill('1985-06-15');await page.getByRole('checkbox').check();await capture(page,'knowledge-consent');await page.getByRole('button',{name:'Start knowledge questions',exact:true}).click();await page.getByRole('link',{name:'Open Authenticate questions'}).waitFor();edge.knowledgeResult('failed',2);await page.getByRole('button',{name:'Check verification result',exact:true}).click();await page.getByRole('heading',{name:'This invitation is locked.',exact:true}).waitFor();await capture(page,'knowledge-locked')
   await owner.goto(app.origin+'/app');await owner.getByRole('button',{name:'Activity',exact:true}).click();await owner.getByRole('listitem').filter({hasText:`Harbour knowledge agreement ${width}`}).getByText('Verification locked',{exact:true}).waitFor();await capture(owner,'sender-lock-notice')
   assert.ok(app.mail('owner@harbour.example','Verification locked:'))
   const companionTitle=`Harbour identity template ${width}`;await app.command('template.save',{title:companionTitle,filename:'identity.pdf',pdfBase64,roles:[{role:'Client',order:1,providerAuth:'identity'}],fields})
   await owner.goto(app.origin+'/app');await owner.getByRole('button',{name:'Templates',exact:true}).click();await owner.getByLabel(`Select ${templateTitle} for combination`,{exact:true}).check();await owner.getByLabel(`Select ${companionTitle} for combination`,{exact:true}).check();await owner.getByRole('button',{name:'Combine selected templates',exact:true}).click()
   const method=owner.getByLabel('Client, routing order 1 authentication',{exact:true});await expect(method).toHaveValue('');await expect(owner.getByRole('button',{name:'Prepare combined envelope',exact:true})).toBeDisabled();await capture(owner,'combined-method-conflict')
   await method.selectOption('identity');await expect(method).toHaveValue('identity');await owner.getByLabel('Client, routing order 1 name',{exact:true}).fill('Mara Quinn');await owner.getByLabel('Client, routing order 1 email',{exact:true}).fill(`combined.${width}@harbour.example`);await capture(owner,'combined-method-choice')
   const combinedResponse=owner.waitForResponse(r=>r.url().endsWith('/api/inkwell/commands')&&r.request().postDataJSON()?.command==='template.combine');await owner.getByRole('button',{name:'Prepare combined envelope',exact:true}).click();const combinedId=(await(await combinedResponse).json()).result.id;assert.equal((await app.call('/api/inkwell/envelopes/'+combinedId,{cookie:app.owner})).value.envelope.signers[0].providerAuth,'identity')
   await signerContext.close();await context.close()
  }
  console.log('Provider verification preparation, templates, consent, retry, successful signing, voice admission, knowledge lock and sender notice passed at 1440 and 390 with light and dark accessibility scans.')
 }finally{await app.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await providerAuthJourney()
