import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PDFDocument } from 'pdf-lib'
import { expect } from '@playwright/test'
import { paymentFlowCases } from '../payments-flow.mjs'
import { paymentEdge } from '../payment-edge.mjs'
import { startInkwellWithMail } from './mail-worker.mjs'
import { axe } from './a11y.mjs'

await paymentFlowCases()
const provider=paymentEdge(),app=await startInkwellWithMail({bindings:{STRIPE_PAYMENTS_SECRET_KEY:'synthetic-inkwell-1',STRIPE_PAYMENTS_TEST_MODE:'true'},networkEdge:provider.edge}),proof=process.env.INKWELL_PAYMENT_PROOF_DIR??join(tmpdir(),'inkwell-payments')
const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Harbour Studio - consulting deposit agreement',{x:40,y:720,size:16});const bytes=Buffer.from(await pdf.save())
const field={id:'client-signature',label:'Client signature',type:'signature',signer:0,page:0,x:.1,y:.6,width:.4,height:.06}
async function capture(page,width,state){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${state}: no sideways scrolling at ${width}`);await page.screenshot({path:join(proof,`${width}-${state}.png`),fullPage:true});await axe(page,state+' '+width)}
async function verify(page,email){
 const token=new URL(app.mail(email,'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
 await page.goto(app.origin+'/sign/'+token)
 await page.getByRole('button',{name:'Email me a code',exact:true}).click();await page.getByRole('status').filter({hasText:'Code sent. Check your email.'}).waitFor()
 await page.getByLabel('Email verification code',{exact:true}).fill(app.mail(email,'Your Inkwell verification code').text.match(/\b\d{6}\b/)[0]);await page.getByRole('button',{name:'Verify code',exact:true}).click()
 await page.getByRole('checkbox',{name:/I have read the electronic record/}).check();await page.getByRole('button',{name:'Agree and continue',exact:true}).click()
 return token
}
try{
 await mkdir(proof,{recursive:true})
 for(const width of [1440,390]){
  const size={width,height:width===390?844:1000},owner=await app.browser.newContext({viewport:size});await owner.addCookies([app.ownerCookie()]);const page=await owner.newPage();page.setDefaultTimeout(20000)
  const title=`Harbour Studio consulting deposit ${width}`,email=`payment-${width}@harbour.example`
  await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Templates',exact:true}).click();await page.getByRole('button',{name:'New template',exact:true}).click()
  await page.getByLabel('Template name',{exact:true}).fill(title);await page.getByLabel('Fixed PDF document',{exact:true}).setInputFiles({name:'consulting.pdf',mimeType:'application/pdf',buffer:bytes})
  await page.getByLabel('Role 1 name',{exact:true}).fill('Client');await page.getByRole('button',{name:'Remove recipient 2',exact:true}).click()
  await page.getByText('Role 1 · Payment at signing',{exact:true}).click();await page.getByLabel('Role 1 Stripe requirement',{exact:true}).selectOption('deposit');await page.getByLabel('Role 1 payment amount',{exact:true}).fill('500')
  const configuration=page.getByRole('checkbox',{name:'I authorize this requirement through our Stripe account before this recipient signs.',exact:true});await configuration.focus();await page.keyboard.press('Space');await expect(configuration).toBeChecked()
  await page.locator('.iw-pdf-page').first().scrollIntoViewIfNeeded();await page.locator('.iw-pdf-page[data-rendered]').first().waitFor();await page.locator('.iw-pdf-page').first().click({position:{x:100,y:200}})
  const remove=page.getByRole('button',{name:'Remove field 1',exact:true});await remove.focus();await expect(page.getByRole('tooltip',{name:'Remove field',exact:true})).toBeVisible();await capture(page,width,'template-configuration')
  await page.getByRole('button',{name:'Save template',exact:true}).click();await page.getByRole('button',{name:'Use '+title,exact:true}).waitFor();await capture(page,width,'template-list')
  await page.getByRole('button',{name:'Use '+title,exact:true}).click();await page.getByLabel('Client name',{exact:true}).fill('Mara Quinn');await page.getByLabel('Client email',{exact:true}).fill(email);await capture(page,width,'template-send')
  await page.getByRole('button',{name:'Prepare to send',exact:true}).click();const detail=page.getByRole('region',{name:title,exact:true});await detail.getByLabel(/confirm it is eligible for electronic signature/).check();await detail.getByRole('button',{name:'Approve and invite first recipient',exact:true}).click()
  await expect.poll(()=>Boolean(app.mail(email,'Please sign:'))).toBe(true)
  const recipient=await app.browser.newContext({viewport:size}),signer=await recipient.newPage();signer.setDefaultTimeout(20000);await verify(signer,email)
  const payment=signer.getByRole('region',{name:'Payment required for signing',exact:true});await expect(payment.getByText('Buyer: Harbour Studio. Provider: Stripe.',{exact:false})).toBeVisible()
  await signer.locator('.iw-sign-fields').getByRole('textbox',{name:/Signature/}).fill('Mara Quinn');await signer.locator('#iw-consent').check();await expect(signer.getByRole('button',{name:'Sign document',exact:true})).toBeDisabled()
  const consent=payment.getByRole('checkbox');await expect(consent).not.toBeChecked();await consent.focus();await signer.keyboard.press('Space');await expect(consent).toBeChecked();await capture(signer,width,'deposit-consent')
  await payment.getByRole('button',{name:'Prepare Stripe checkout',exact:true}).click();await payment.getByRole('link',{name:'Continue to Stripe',exact:true}).waitFor()
  const checkout=[...provider.sessions.keys()].at(-1);assert.ok(checkout)
  provider.decline(checkout);await payment.getByRole('button',{name:'Check payment status',exact:true}).click();await payment.getByRole('status').filter({hasText:'Your signature has not been saved.'}).waitFor();await expect(signer.getByRole('button',{name:'Sign document',exact:true})).toBeDisabled();await capture(signer,width,'deposit-declined')
  provider.succeed(checkout);await payment.getByRole('button',{name:'Check payment status',exact:true}).click();await payment.getByRole('status',{name:'',exact:true}).filter({hasText:'Payment confirmed.'}).waitFor();await capture(signer,width,'deposit-confirmed')
  await signer.getByRole('button',{name:'Sign document',exact:true}).click();await signer.getByRole('heading',{name:'All signatures are complete.',exact:true}).waitFor();await capture(signer,width,'signed')
  await recipient.close()
  for(const kind of ['saved_card','ach_mandate']){
   const nextEmail=`${kind}-${width}@harbour.example`,template=await app.command('template.save',{title:`Harbour ${kind} ${width}`,filename:'consulting.pdf',pdfBase64:bytes.toString('base64'),roles:[{role:'Client',payment:{kind,currency:'usd'},paymentConsent:true}],fields:[field]})
   const prepared=await app.command('template.use',{id:template.id,recipients:[{name:'Mara Quinn',email:nextEmail}]});await app.command('envelope.approve',{id:prepared.id,eligible:true})
   const next=await app.browser.newContext({viewport:size}),view=await next.newPage();await verify(view,nextEmail);await capture(view,width,kind+'-consent');await next.close()
  }
  await owner.close()
 }
 console.log('Payment signing screens: template configuration, list, sending, exact separate consent, declined and confirmed deposit, signed record, saved card and ACH mandate at 1440 and 390 passed.')
}finally{await app.close()}
