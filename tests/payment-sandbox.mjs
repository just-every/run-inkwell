import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { chromium } from '@playwright/test'
import { harness } from './harness.mjs'

// Explicit held-key journey. Stripe is real; only native invitation mail uses the test edge.
const key=process.env.STRIPE_PAYMENTS_SECRET_KEY
assert.ok(key&&process.env.INKWELL_STRIPE_SANDBOX==='true','Run with the held Stripe test key and explicit sandbox flag')
const h=await harness({bindings:{STRIPE_PAYMENTS_SECRET_KEY:key,STRIPE_PAYMENTS_TEST_MODE:'true',STRIPE_PAYMENTS_BUYER_NAME:'Run Edit Run sandbox'},networkEdge:async request=>{
 if(new URL(request.url).hostname!=='api.stripe.com')return
 const response=await fetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),...(request.method==='GET'?{}:{body:await request.arrayBuffer()})})
 if(!response.ok){const detail=await response.clone().json().catch(()=>null);console.log(JSON.stringify({stripeProviderError:{status:response.status,type:detail?.error?.type,code:detail?.error?.code,param:detail?.error?.param}}))}
 return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers})
}})
let browser
try{
 const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Harbour Studio - consulting deposit agreement',{x:40,y:720});const bytes=Buffer.from(await pdf.save()).toString('base64')
 const definition={title:'Harbour consulting deposit sandbox',filename:'consulting.pdf',pdfBase64:bytes,roles:[{role:'Client',payment:{kind:'deposit',amount:50000,currency:'usd',method:'card'},paymentConsent:true}],fields:[{id:'signature',label:'Client signature',type:'signature',signer:0,page:0,x:.1,y:.6,width:.4,height:.06}]}
 const template=(await h.command('template.save',definition)).result.id
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 for(const [outcome,card] of [['paid','4242424242424242'],['declined','4000000000000002']]){
  const email=`sandbox-${outcome}@harbour.example`,id=(await h.command('template.use',{id:template,recipients:[{name:'Mara Quinn',email}]})).result.id
  await h.command('envelope.approve',{id,eligible:true})
  const token=new URL((await h.mail(email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1),path='/api/sign/'+token
  await h.post(path+'/code',{},'');const cookie=(await h.post(path+'/verify',{code:(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie;await h.agree(path,cookie)
  const record=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const checkout=(await h.post(path+'/payment/start',{consent:true,requirementVersion:record.signers[0].paymentAuthority.version},cookie)).value
  console.log('Stripe test Checkout created for '+outcome+' deposit')
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(30000)
  await page.goto(checkout.url)
  console.log('Stripe Checkout fields: '+JSON.stringify(await page.locator('input').evaluateAll(inputs=>inputs.map(input=>({name:input.name,type:input.type,placeholder:input.placeholder})))) )
  // Fields are Stripe's hosted Checkout; no card details pass through Inkwell.
  await page.getByLabel('Email',{exact:true}).fill(email)
  await page.getByPlaceholder('1234 1234 1234 1234').fill(card)
  await page.getByPlaceholder('MM / YY').fill('12 / 30')
  await page.getByPlaceholder('CVC').fill('123')
  const name=page.getByLabel('Cardholder name',{exact:true});if(await name.count())await name.fill('Mara Quinn')
  const country=page.getByLabel('Country or region',{exact:true});if(await country.count())await country.selectOption('US')
  const postal=page.getByLabel('ZIP',{exact:true});if(await postal.count())await postal.fill('20001')
  await page.getByRole('button',{name:/Pay.*500|Pay$/}).click()
  if(outcome==='paid')await page.waitForURL(url=>url.origin===h.origin,{timeout:60000})
  else await page.getByText(/declined/i).first().waitFor({timeout:60000})
  const receipt=(await h.post(path+'/payment/check',{},cookie)).value
  const signature={values:{signature:'Mara Quinn'},adoption:{method:'typed',style:'serif'},consent:true,commandId:crypto.randomUUID()}
  await h.post(path+'/sign',signature,cookie,outcome==='paid'?200:409)
  const after=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  if(outcome==='paid'){assert.equal(after.status,'completed');assert.equal(receipt.outcome,'succeeded');assert.ok(after.signers[0].paymentReceipt.paymentIntent)}
  else{assert.equal(after.status,'awaiting_signature');assert.equal(after.signers[0].signedAt,undefined);assert.equal(after.signers[0].values,undefined);assert.notEqual(receipt.outcome,'succeeded')}
  console.log(JSON.stringify({stripeTestMode:true,scenario:outcome,amount:50000,currency:'usd',envelopeStatus:after.status,paymentOutcome:receipt.outcome,paymentReference:receipt.paymentIntent??receipt.reference,signatureSaved:Boolean(after.signers[0].signedAt)}))
  await context.close()
 }
}finally{await browser?.close();await h.close()}
