import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { axe } from './a11y.mjs'

// Real independent host pages embed the emitted application; only the mail provider is faked.
const app=await startInkwellWithMail(),proof=process.env.INKWELL_EMBED_PROOF_DIR??join(tmpdir(),'inkwell-embedding')
let launchUrl=''
const host=()=>createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harbour Studio client portal</title><style>body{margin:0;font:16px system-ui;background:#f5f7f8;color:#162a32}header{padding:16px}h1{font-size:22px}iframe{width:100%;height:1100px;border:0;background:white}output{display:block;padding:16px}</style><header><h1>Harbour Studio client portal</h1><p>Review your consulting agreement securely.</p></header><iframe title="Inkwell document workspace" src="${launchUrl}"></iframe><output aria-live="polite">Waiting for the document workspace</output><script>window.events=[];const frame=document.querySelector('iframe');addEventListener('message',e=>{if(e.origin!==${JSON.stringify(app.origin)}||e.source!==frame.contentWindow||!e.data?.type?.startsWith('inkwell.'))return;window.events.push(e.data);document.querySelector('output').textContent=e.data.type})</script></html>`)})
const allowed=host(),denied=host()
await Promise.all([new Promise(r=>allowed.listen(0,'127.0.0.1',r)),new Promise(r=>denied.listen(0,'127.0.0.1',r))])
const allowedOrigin=`http://localhost:${allowed.address().port}`,deniedOrigin=`http://localhost:${denied.address().port}`
const launch=async(mode,token)=>(await app.call('/api/inkwell/embeds',{cookie:app.owner,body:{mode,token,origin:allowedOrigin,consent:true}})).value.url
const tokenFor=email=>new URL(app.mail(email,'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
const makePdf=async text=>{const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText(text,{x:50,y:730,size:16});return Buffer.from(await pdf.save())}
const bytes=await makePdf('Harbour Studio - Client consulting agreement'),privateBytes=await makePdf('Private management compensation memo')
const field={id:'client-signature',label:'Client signature',type:'signature',signer:0,page:0,x:.1,y:.7,width:.5,height:.05}
const prepare=async(email,title)=>app.command('envelope.prepare',{title,filename:'consulting.pdf',documents:[{filename:'consulting.pdf',pdfBase64:bytes.toString('base64'),mode:'sign'},{filename:'private-memo.pdf',pdfBase64:privateBytes.toString('base64'),mode:'sign',visibleTo:{signers:[1],copies:[]}}],signers:[{name:'Mara Quinn',email},{name:'Alex Rivera',email:'alex-manager@harbour.example'}],fields:[{...field,document:0},{...field,id:'manager-signature',signer:1,document:0},{...field,id:'manager-memo',signer:1,document:1}]})
const events=page=>page.evaluate(()=>window.events)
async function capture(page,frame,width,state){
 assert.ok(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth),`${state}: frame has no sideways scroll at ${width}`)
 await page.screenshot({path:join(proof,`${width}-${state}.png`),fullPage:true})
}
try{
 await mkdir(proof,{recursive:true})
 await app.call('/api/inkwell/embed-origins',{body:{origin:allowedOrigin,enabled:true,consent:true},status:401})
 await app.call('/api/inkwell/embed-origins',{cookie:app.owner,body:{origin:allowedOrigin,enabled:true},status:400})
 await app.call('/api/inkwell/embed-origins',{cookie:app.owner,body:{origin:'https://*.harbour.example',enabled:true,consent:true},status:400})
 await app.call('/api/inkwell/embeds',{cookie:app.owner,body:{origin:allowedOrigin,mode:'prepare',consent:true},status:403})
 await app.call('/api/inkwell/embed-origins',{cookie:app.owner,body:{origin:allowedOrigin,enabled:true,consent:true}})
 await app.call('/api/inkwell/embeds',{cookie:app.owner,body:{origin:deniedOrigin,mode:'prepare',consent:true},status:403})
 for(const width of [1440,390]){
  let refusedByPolicy=false
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage();page.setDefaultTimeout(20000);page.on('console',message=>{if(message.text().includes('frame-ancestors'))refusedByPolicy=true})
  const email=`mara-embedded-${width}@harbour.example`,prepared=await prepare(email,`Harbour Studio consulting agreement ${width}`)
  await app.command('envelope.approve',{id:prepared.id,eligible:true})
  const token=tokenFor(email)
  launchUrl=await launch('sign',token)
  const entry=await fetch(launchUrl)
  assert.equal(entry.status,200);assert.equal(entry.headers.get('content-security-policy'),`frame-ancestors ${allowedOrigin}`)
  assert.ok(entry.headers.get('set-cookie').includes('Partitioned'))
  await page.goto(deniedOrigin)
  await expect.poll(()=>refusedByPolicy).toBe(true)
  await expect(page.frameLocator('iframe').getByRole('heading',{name:`Harbour Studio consulting agreement ${width}`})).toHaveCount(0)
  await page.screenshot({path:join(proof,`${width}-origin-refused.png`),fullPage:true})
  await page.goto(allowedOrigin)
  const frame=page.frameLocator('iframe')
  await frame.getByRole('button',{name:'Email me a code',exact:true}).click()
  await frame.getByRole('status').filter({hasText:'Code sent. Check your email.'}).waitFor()
  const code=app.mail(email,'Your Inkwell verification code').text.match(/\b\d{6}\b/)[0]
  await frame.getByLabel('Email verification code',{exact:true}).fill(code)
  await frame.getByRole('button',{name:'Verify code',exact:true}).click()
  await frame.getByRole('checkbox',{name:/I have read the electronic record/}).check()
  await frame.getByRole('button',{name:'Agree and continue',exact:true}).click()
  await frame.locator('.iw-pdf-page').first().scrollIntoViewIfNeeded()
  await frame.locator('.iw-pdf-page[data-rendered]').first().waitFor()
  const recipientApi='/api/embed/'+new URL(launchUrl).pathname.split('/').at(-1)+'/api/sign/'+token
  const hidden=await frame.locator('body').evaluate(async(el,path)=>{const r=await fetch(path+'/documents/1');return r.status},recipientApi)
  assert.ok([403,404].includes(hidden),'embedded signer cannot download the hidden management memo')
  await frame.locator('.iw-sign-fields').getByRole('textbox',{name:/Client signature/}).fill('Mara Quinn')
  await frame.getByRole('checkbox',{name:/consent to electronic signatures/}).check()
  await capture(page,frame,width,'signing')
  await axe(page.frames().find(f=>f.url()===launchUrl),'Embedded signing '+width)
  await frame.getByRole('button',{name:'Sign document',exact:true}).click()
  await expect(page.locator('output')).toHaveText('inkwell.signed')
  await frame.getByRole('heading',{name:'Your signature has been recorded.'}).waitFor()
  assert.deepEqual((await events(page)).at(-1),{type:'inkwell.signed'},'signed event carries no recipient content or credentials')
  await capture(page,frame,width,'signed')
  await frame.getByRole('button',{name:'Close embedded session',exact:true}).click()
  await expect(page.locator('output')).toHaveText('inkwell.closed')
  await capture(page,frame,width,'closed')
  // A second real invitation proves the decline outcome and event.
  const declining=await prepare(`decline-${width}@harbour.example`,`Harbour Studio declined agreement ${width}`)
  await app.command('envelope.approve',{id:declining.id,eligible:true})
  const declineEmail=`decline-${width}@harbour.example`
  launchUrl=await launch('sign',tokenFor(declineEmail));await page.reload()
  await frame.getByRole('button',{name:'Email me a code',exact:true}).click()
  await frame.getByRole('status').filter({hasText:'Code sent. Check your email.'}).waitFor()
  await frame.getByLabel('Email verification code',{exact:true}).fill(app.mail(declineEmail,'Your Inkwell verification code').text.match(/\b\d{6}\b/)[0])
  await frame.getByRole('button',{name:'Verify code',exact:true}).click()
  await frame.getByRole('button',{name:'Decline to sign…',exact:true}).click()
  await frame.getByLabel('Reason for declining',{exact:true}).fill('The consulting scope needs revision.')
  await frame.getByRole('button',{name:'Decline',exact:true}).click()
  await expect(page.locator('output')).toHaveText('inkwell.declined')
  await frame.getByRole('heading',{name:'This envelope was declined.'}).waitFor()
  await capture(page,frame,width,'declined')
  // Preparation uses an empty browser context: no ambient native member cookie is available to the frame.
  launchUrl=await launch('prepare');await page.reload()
  await frame.getByRole('heading',{name:'Prepare an envelope',exact:true}).waitFor().catch(async error=>{console.error(await frame.locator('body').innerText());throw error})
  await frame.getByLabel('Fixed PDF document',{exact:true}).setInputFiles({name:'consulting.pdf',mimeType:'application/pdf',buffer:bytes})
  await frame.getByLabel('Envelope title',{exact:true}).fill(`Harbour Studio embedded send ${width}`)
  await frame.getByLabel('Recipient 1 name',{exact:true}).fill('Mara Quinn')
  await frame.getByLabel('Recipient 1 email',{exact:true}).fill(`prepared-${width}@harbour.example`)
  await frame.getByRole('button',{name:'Remove recipient 2',exact:true}).click()
  await frame.locator('.iw-pdf-page').first().scrollIntoViewIfNeeded()
  await frame.locator('.iw-pdf-page[data-rendered]').first().waitFor()
  await frame.locator('.iw-pdf-page').first().click({position:{x:100,y:200}})
  const remove=frame.getByRole('button',{name:'Remove field 1',exact:true})
  await remove.focus();await expect(frame.getByRole('tooltip',{name:'Remove field',exact:true})).toBeVisible()
  await frame.getByRole('heading',{name:'Prepare an envelope',exact:true}).click()
  await remove.hover();await expect(frame.getByRole('tooltip',{name:'Remove field',exact:true})).toBeVisible()
  await capture(page,frame,width,'preparing')
  await axe(page.frames().find(f=>f.url()===launchUrl),'Embedded preparing '+width)
  await frame.getByRole('button',{name:'Save prepared envelope',exact:true}).click()
  await frame.getByRole('checkbox',{name:/I reviewed this envelope and authorize/}).waitFor().catch(async error=>{console.error('Preparation alerts:',await frame.getByRole('alert').allTextContents());throw error})
  assert.equal(app.mail(`prepared-${width}@harbour.example`,'Please sign:'),undefined,'preparation never sends automatically')
  await page.reload()
  await frame.getByRole('checkbox',{name:/I reviewed this envelope and authorize/}).check()
  await capture(page,frame,width,'send-review')
  await frame.getByRole('button',{name:'Approve and send',exact:true}).click()
  await expect(page.locator('output')).toHaveText('inkwell.sent')
  const sent=(await events(page)).at(-1)
  const envelope=(await app.call('/api/inkwell/envelopes/'+sent.envelopeId,{cookie:app.owner})).value.envelope
  assert.equal(envelope.status,'awaiting_signature');assert.ok(app.mail(`prepared-${width}@harbour.example`,'Please sign:'))
  await capture(page,frame,width,'sent')
  const base='/api/embed/'+new URL(launchUrl).pathname.split('/').at(-1)
  assert.equal(await frame.locator('body').evaluate(async(el,base)=>(await fetch(base+'/api/inkwell/api-keys')).status,base),403)
  assert.equal(await frame.locator('body').evaluate(async(el,base)=>(await fetch(base+'/api/inkwell/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command:'agent.issue',commandId:crypto.randomUUID(),input:{}})})).status,base),403)
  await context.close()
 }
 // Native session revocation is checked again at the embedded public API door.
 const adminEmail='embedded-admin@harbour.example'
 await app.call('/auth/invite',{cookie:app.owner,body:{email:adminEmail,displayName:'Alex Rivera',role:'admin'},status:202})
 const confirmation=new URL(app.mail(adminEmail,'').text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
 const admin=(await app.call('/auth/confirm',{body:{token:confirmation},status:303})).cookie
 const adminGrant=(await app.call('/api/inkwell/embeds',{cookie:admin,body:{mode:'prepare',origin:allowedOrigin,consent:true}})).value.url
 const admission=await fetch(adminGrant),marker=admission.headers.get('set-cookie').split(';')[0],adminId=new URL(adminGrant).pathname.split('/').at(-1)
 const meta=await app.call('/api/embed/'+adminId+'/meta',{cookie:marker})
 assert.deepEqual(Object.keys(meta.value).sort(),['envelopeId','mode','origin'],'embedded metadata contains no native session or member details')
 await app.call('/api/embed/'+adminId+'/meta',{cookie:marker,headers:{authorization:'Bearer synthetic-inkwell-1'},status:403})
 await app.call('/auth/signout',{cookie:admin,body:{},status:204})
 await app.call('/api/embed/'+adminId+'/meta',{cookie:marker,status:401})
 // Removing a parent origin invalidates already issued launches immediately.
 const revoked=await launch('prepare')
 await app.call('/api/inkwell/embed-origins',{cookie:app.owner,body:{origin:allowedOrigin,enabled:false}})
 assert.equal((await fetch(revoked)).status,403)
 console.log('Embedded signing and sending: allowed and refused hosts, native verification, hidden document refusal, signed, declined and closed events, explicit preparation and sending, tooltip focus and hover at 1440 and 390 passed.')
}finally{await Promise.all([new Promise(r=>allowed.close(r)),new Promise(r=>denied.close(r))]);await app.close()}
