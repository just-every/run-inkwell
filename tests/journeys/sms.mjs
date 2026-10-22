import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe } from './a11y.mjs'

export async function smsJourney(){
 const app=await startInkwellWithMail({sms:true}),images='artifacts/sms'
 await mkdir(images,{recursive:true})
 try{
  const pdf=await PDFDocument.create();pdf.addPage([612,792]);const pdfBase64=Buffer.from(await pdf.save()).toString('base64')
  for(const width of [1440,390]){
   const viewport={width,height:width===390?844:1000},email=`sms.${width}@example.test`,name=`SMS Client ${width}`
   const {id}=await app.command('envelope.prepare',{title:`SMS signing ${width}`,filename:'sms-agreement.pdf',pdfBase64,signers:[{name,email,sms:true,phone:'+12025550102'}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.07}]})
   await app.command('envelope.approve',{id,eligible:true})
   const context=await app.browser.newContext({viewport}),page=await context.newPage();page.setDefaultTimeout(20000)
   const capture=async state=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${state}: no sideways scroll`);for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`SMS ${state} ${width} ${theme}`)}await page.emulateMedia({colorScheme:'light'});await page.screenshot({path:`${images}/${width}-${state}.png`,fullPage:true})}
   const url=app.mail(email,'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]
   await page.goto(url);await page.getByRole('heading',{name:'Verify your mobile number'}).waitFor();await capture('request-code')
   await page.getByRole('button',{name:'Text me a code',exact:true}).click();await page.getByLabel('SMS verification code',{exact:true}).waitFor();await capture('enter-code')
   const code=app.smsMessages().at(-1).body.match(/\b\d{6}\b/)[0]
   await page.getByLabel('SMS verification code',{exact:true}).fill(code);await page.getByRole('button',{name:'Verify code',exact:true}).click()
   await page.getByRole('checkbox',{name:/I have read the/}).check();await page.getByRole('button',{name:'Agree and continue',exact:true}).click()
   await page.locator('.iw-sign-fields').waitFor();await page.getByLabel('Signature',{exact:true}).fill(name)
   await page.getByRole('checkbox',{name:/consent to electronic signatures/}).check();await page.getByRole('button',{name:'Sign document',exact:true}).click()
   await page.getByRole('heading',{name:'All signatures are complete.'}).waitFor();await capture('completed')
   const owner=await app.browser.newContext({viewport});await owner.addCookies([app.ownerCookie()]);const detail=await owner.newPage();await detail.goto(app.origin+'/app')
   await detail.getByText(`SMS signing ${width}`,{exact:true}).first().click()
   const record=(await app.call('/api/inkwell/envelopes/'+id,{cookie:app.owner})).value.envelope
   assert.equal(record.status,'completed');assert.ok(record.events.some(e=>e.action==='signer.sms_verified'&&e.detail.maskedPhone.includes('0102')))
   await owner.close();await context.close()
  }
  console.log(`SMS authentication and signing passed at 1440/390 with light/dark axe. Screens: ${images}`)
 }catch(error){await screenshots(app.browser,'sms-failure');throw error}finally{await app.close()}
}
if(process.argv[1]?.endsWith('/sms.mjs'))await smsJourney()
