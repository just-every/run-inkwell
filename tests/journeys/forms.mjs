// FORM-001 admission/submission public APIs feed the existing signer and owner review screens.
import assert from 'node:assert/strict'
import jsQR from 'jsqr'
import { mkdir } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { axe } from './a11y.mjs'
const app=await startInkwellWithMail({turnstile:true}),proof=process.env.INKWELL_FORMS_PROOF_DIR??'/tmp/inkwell-form-screens'
await mkdir(proof,{recursive:true})
try{
 const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Supplier signing agreement',{x:60,y:730})
 for(const width of [1440,390]){
  const template=await app.command('template.save',{title:`Public supplier agreement ${width}`,filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Customer',order:1},{role:'Company',order:2}],fields:[{id:'customer',label:'Customer signature',type:'signature',signer:0,page:0,x:.1,y:.25,width:.4,height:.05},{id:'company',label:'Company signature',type:'signature',signer:1,page:0,x:.1,y:.45,width:.4,height:.05}]})
  const form=(await app.call('/api/inkwell/forms',{cookie:app.owner,body:{templateId:template.id,templateVersion:1,publicRole:0,fixedRecipients:[null,{name:'Company signer',email:`company.form.${width}@harbour.example`}],commandId:crypto.randomUUID()}})).value.form
  const policy=async mode=>{const p=(await app.call('/api/inkwell/send-policies',{cookie:app.owner})).value.policies.find(p=>p.source==='web_form');return app.command('account.send_policy',{source:'web_form',mode,templates:[template.id],expectedVersion:p.version})}
  const submit=async(email,name)=>{
   const challenge=(await app.call(`/api/forms/${form.id}/code`,{body:{email,turnstileToken:'synthetic-inkwell-code'}})).value.challengeId
   const code=app.mail(email,'Your Inkwell web-form verification code').text.match(/\b\d{6}\b/)[0]
   const grant=(await app.call(`/api/forms/${form.id}/verify`,{body:{challengeId:challenge,code,turnstileToken:'synthetic-inkwell-verify'}})).value.admissionToken
   return app.call(`/api/forms/${form.id}/submit`,{body:{name,admissionToken:grant,turnstileToken:'synthetic-inkwell-submit',commandId:crypto.randomUUID()},headers:{'cf-connecting-ip':width===390?'192.0.2.39':'192.0.2.14'}})
  }
  await policy('autonomous')
  const viewport={width,height:width===390?844:1000}
  const signer=await app.browser.newContext({viewport,hasTouch:width===390})
  await signer.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>route.fulfill({contentType:'application/javascript',body:"window.turnstile={render:(element,options)=>{element.textContent='Bot check complete';queueMicrotask(()=>options.callback('synthetic-inkwell-'+options.action.split('_').at(-1)));return 'synthetic-widget'},remove:()=>{}}"}))
  const page=await signer.newPage();page.setDefaultTimeout(20000)
  const capture=async(name,p=page)=>{assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await axe(p,`FORM-001 ${name} ${width}`);await p.screenshot({path:`${proof}/${width}-${name}.png`})}
  await signer.route(app.origin+'/synthetic-embed-proof',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><head><title>Embedded signing form proof</title></head><body style="margin:0">${form.embedSnippet}</body></html>`}))
  await page.goto(app.origin+'/synthetic-embed-proof');const frame=page.frameLocator('iframe');await frame.getByLabel('Your name',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${proof}/${width}-embedded-entry.png`})
  await page.goto(app.origin+'/form/'+form.id)
  const qr=await signer.request.get(form.qrUrl);assert.equal(qr.status(),200)
  const pixels=await page.evaluate(async svg=>{const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,512,512);context.drawImage(image,0,0,512,512);return [...context.getImageData(0,0,512,512).data]},await qr.text())
  assert.equal(jsQR(new Uint8ClampedArray(pixels),512,512)?.data,form.publicUrl,'the downloaded QR encodes the exact public form URL')
  await page.getByLabel('Your name',{exact:true}).fill('Mara Quinn');await page.getByLabel('Your email',{exact:true}).fill(`public.form.${width}@clients.example`);await capture('public-entry')
  await page.getByRole('button',{name:'Email me a code',exact:true}).click();await page.getByLabel('Email verification code',{exact:true}).waitFor();await capture('public-email-code')
  await page.getByLabel('Email verification code',{exact:true}).fill(app.mail(`public.form.${width}@clients.example`,'Your Inkwell web-form verification code').text.match(/\b\d{6}\b/)[0]);await page.getByRole('button',{name:'Verify email',exact:true}).click()
  await page.getByRole('button',{name:'Continue to agreement',exact:true}).waitFor();await capture('public-verified')
  await page.getByRole('button',{name:'Continue to agreement',exact:true}).click()
  await page.waitForURL('**/sign/*');const created=(await app.call('/api/inkwell/envelopes?q='+encodeURIComponent(`Public supplier agreement ${width}`),{cookie:app.owner})).value.envelopes.find(envelope=>envelope.formSubmission?.id===form.id);assert.ok(created);const sent={value:{result:{id:created.id,signingPath:new URL(page.url()).pathname}}}
  const signerCookie=(await signer.cookies()).find(cookie=>cookie.name==='inkwell_signer');sent.cookie=signerCookie.name+'='+signerCookie.value
  await page.getByRole('heading',{name:'Electronic record and signature disclosure',exact:true}).waitFor();await capture('verified-disclosure')
  await page.getByRole('checkbox',{name:/I have read the electronic record/}).check();await page.getByRole('button',{name:'Agree and continue',exact:true}).click()
  await page.getByRole('radio',{name:'Type',exact:true}).waitFor();await capture('signing')
  const path='/api'+sent.value.result.signingPath
  await page.getByRole('textbox',{name:/Customer signature/}).fill('Mara Quinn');await page.getByRole('checkbox',{name:/I have reviewed this document/}).check();await page.getByRole('button',{name:'Sign document',exact:true}).click()
  await page.getByRole('heading',{name:'Your signature has been recorded.',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'Your signature has been recorded.',exact:true}).waitFor();await capture('signed')
  const company=await app.verify(`company.form.${width}@harbour.example`)
  await app.call(company.path+'/sign',{cookie:company.cookie,body:{values:{company:'Company signer'},consent:true,commandId:crypto.randomUUID()}})
  assert.equal((await app.call('/api/inkwell/envelopes/'+sent.value.result.id,{cookie:app.owner})).value.envelope.status,'completed')
  await signer.close()
  await policy('off');const held=await submit(`held.form.${width}@clients.example`,'Held customer')
  const owner=await app.browser.newContext({viewport,hasTouch:width===390});await owner.addCookies([app.ownerCookie()]);const review=await owner.newPage();review.setDefaultTimeout(20000)
  await review.goto(app.origin+'/app');await review.getByRole('row',{name:new RegExp(`Public supplier agreement ${width}`)}).first().click()
  await review.getByText('Sending held.',{exact:true}).waitFor();await capture('held-owner-review',review)
  const detail=review.getByRole('region',{name:`Public supplier agreement ${width}`,exact:true}),close=detail.getByRole('button',{name:'Close',exact:true})
  await close.hover();await review.getByRole('tooltip',{name:'Close details',exact:true}).waitFor();await review.mouse.move(0,0);await review.getByRole('tooltip').waitFor({state:'detached'});await close.focus();assert.ok(await review.getByRole('tooltip',{name:'Close details',exact:true}).isVisible());await review.keyboard.press('Escape')
  await detail.getByLabel(/confirm it is eligible for electronic signature/).check();await detail.getByRole('button',{name:'Approve and invite first recipient',exact:true}).click();await review.getByText('Sending held.',{exact:true}).waitFor({state:'detached'});await capture('owner-confirmed',review)
  assert.equal((await app.call('/api/inkwell/envelopes/'+held.value.result.id,{cookie:app.owner})).value.envelope.status,'awaiting_signature');await owner.close()
 }
 console.log('FORM-001/SEND-001 public API admission, autonomous signed/countersigned record and unsigned owner-reviewed hold passed at 1440/390; public entry, QR and embed proved; dashboard publication controls remain API-based.')
}finally{await app.close()}
