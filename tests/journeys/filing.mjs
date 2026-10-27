import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { filingEdge } from '../filing-edge.mjs'
import { axe, tabTo } from './a11y.mjs'
import { screenshots } from './worker.mjs'

const edge=filingEdge(),app=await startInkwellWithMail({bindings:{BOX_ACCESS_TOKEN:'synthetic-inkwell-1',DROPBOX_ACCESS_TOKEN:'synthetic-inkwell-2'},networkEdge:edge.networkEdge})
const proof=process.env.INKWELL_FILING_PROOF_DIR??join(tmpdir(),'inkwell-filing')
async function capture(page,panel,width,state){
 await panel.getByRole('heading',{name:'Automatic filing',exact:true}).scrollIntoViewIfNeeded()
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${state} at ${width}: no sideways scroll`)
 await axe(page,`Automatic filing ${state} at ${width}`)
 await panel.screenshot({path:join(proof,`${width}-${state}.png`)})
}
try{
 await mkdir(proof,{recursive:true})
 const doc=await PDFDocument.create();doc.addPage([612,792]).drawText('Harbour Studio - Client services agreement',{x:50,y:730,size:16})
 const template=await app.command('template.save',{title:'Harbour Studio client services',filename:'client-services.pdf',pdfBase64:Buffer.from(await doc.save()).toString('base64'),roles:[{role:'Client',order:1}],fields:[{id:'client-signature',label:'Client signature',type:'signature',signer:0,page:0,x:.1,y:.7,width:.5,height:.05}]})
 for(const width of [1440,390]){
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000}})
  await context.addCookies([app.ownerCookie()]);const page=await context.newPage();page.setDefaultTimeout(15000)
  await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Settings',exact:true}).click()
  const panel=page.getByRole('region',{name:'Automatic filing',exact:true})
  await panel.getByLabel('Filing template',{exact:true}).selectOption(template.id)
  for(const provider of ['box','dropbox']){
   await panel.getByLabel('Filing provider',{exact:true}).selectOption(provider)
   const label=provider==='box'?'Box folder ID':'Dropbox folder path'
   await panel.getByLabel(label,{exact:true}).fill(provider==='box'?'123456':'/Harbour Studio completed')
   const enable=panel.getByRole('checkbox',{name:'Enable automatic filing for this template and provider',exact:true})
   await enable.check()
   const consent=panel.getByRole('checkbox',{name:/I authorize automatic transfer/})
   await expect(consent).not.toBeChecked();await expect(panel.getByRole('button',{name:'Save filing rule',exact:true})).toBeDisabled()
   await tabTo(page,consent);await page.keyboard.press('Space')
   await tabTo(page,panel.getByRole('button',{name:'Save filing rule',exact:true}));await page.keyboard.press('Enter')
   await expect(panel.getByRole('status').filter({hasText:'Filing rule saved.'})).toBeVisible()
   await capture(page,panel,width,`${provider}-configured`)
  }
  edge.failNext('box','after');edge.failNext('dropbox','after')
  const email=`mara-${width}@harbour.example`,prepared=await app.command('template.use',{id:template.id,recipients:[{name:'Mara Quinn',email}]})
  await app.command('envelope.approve',{id:prepared.id,eligible:true});const signer=await app.verify(email)
  await app.call(signer.path+'/sign',{cookie:signer.cookie,body:{commandId:crypto.randomUUID(),values:{'client-signature':'Mara Quinn'},consent:true,adoption:{method:'typed',style:'sans'}}})
  await panel.getByRole('button',{name:'Refresh filing status',exact:true}).click()
  await expect(panel.getByText('Unconfirmed; retry verifies the existing remote file before accepting it.',{exact:true})).toHaveCount(2)
  await capture(page,panel,width,'unconfirmed')
  edge.moveFolder('/Harbour Studio completed','/Reviewed completed')
  await tabTo(page,panel.getByRole('button',{name:'Retry filing',exact:true}).first(),{backwards:true});await page.keyboard.press('Enter')
  await expect(panel.getByText(/Folder moved:/)).toHaveCount(1)
  await capture(page,panel,width,'folder-repair-proposed')
  await tabTo(page,panel.getByRole('button',{name:'Approve folder repair',exact:true}));await page.keyboard.press('Enter')
  await expect(panel.getByRole('button',{name:'Retry filing',exact:true})).toHaveCount(0)
  await capture(page,panel,width,'filed')
  const files=edge.files().filter(file=>file.name.includes(prepared.id));assert.equal(files.length,4)
  assert.equal(new Set(files.map(file=>JSON.stringify([file.provider,file.folder,file.name]))).size,4)
  await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click()
  await expect(page.getByRole('region',{name:'Automatic filing',exact:true}).getByText(/Filed ·/)).toHaveCount(width===1440?4:8)
  // Leave the next viewport with disabled rules so both keyboard journeys prove explicit fresh consent.
  for(const provider of ['box','dropbox']){
   const view=(await app.call('/api/inkwell/filing',{cookie:app.owner})).value,rule=view.rules.find(rule=>rule.provider===provider)
   await app.call('/api/inkwell/filing',{cookie:app.owner,body:{commandId:crypto.randomUUID(),templateId:template.id,provider,folder:rule.folder,enabled:false,expectedVersion:rule.version}})
  }
  edge.moveFolder('/Reviewed completed','/Harbour Studio completed')
  await context.close()
 }
 const legacyTemplate=await app.command('template.save',{title:'Legacy filing recovery',filename:'legacy.pdf',pdfBase64:Buffer.from(await doc.save()).toString('base64'),roles:[{role:'Client',order:1}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.7,width:.5,height:.05}]})
 await app.call('/api/inkwell/filing',{cookie:app.owner,body:{commandId:crypto.randomUUID(),templateId:legacyTemplate.id,provider:'dropbox',folder:'/Legacy completed',enabled:true,consent:true,expectedVersion:0}})
 edge.failNext('dropbox','after')
 const legacy=await app.command('template.use',{id:legacyTemplate.id,recipients:[{name:'Mara Quinn',email:'legacy@harbour.example'}]})
 await app.command('envelope.approve',{id:legacy.id,eligible:true});const signer=await app.verify('legacy@harbour.example')
 await app.call(signer.path+'/sign',{cookie:signer.cookie,body:{commandId:crypto.randomUUID(),values:{signature:'Mara Quinn'},consent:true,adoption:{method:'typed',style:'sans'}}})
 await app.db.prepare("UPDATE iw_filing_rules SET folder_ref=NULL WHERE template_id=?").bind(legacyTemplate.id).run()
 await app.db.prepare("UPDATE iw_filing_jobs SET folder_ref=NULL WHERE envelope_id=?").bind(legacy.id).run()
 edge.moveFolder('/Legacy completed','/Legacy reviewed')
 const legacyViews=[]
 for(const width of [1440,390]){
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000}});await context.addCookies([app.ownerCookie()])
  const page=await context.newPage();await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Settings',exact:true}).click()
  const panel=page.getByRole('region',{name:'Automatic filing',exact:true})
  const input=panel.getByLabel('Inspect legacy Dropbox folder',{exact:true})
  await input.fill('/Legacy reviewed');await input.scrollIntoViewIfNeeded()
  await capture(page,panel,width,'legacy-inspection')
  legacyViews.push({context,page,panel,width})
 }
 const desktop=legacyViews[0]
 await tabTo(desktop.page,desktop.panel.getByRole('button',{name:'Inspect existing artifact',exact:true}));await desktop.page.keyboard.press('Enter')
 await expect(desktop.panel.getByRole('button',{name:'Approve folder repair',exact:true})).toHaveCount(1)
 for(const view of legacyViews){
  if(view!==desktop){await view.panel.getByRole('button',{name:'Refresh filing status',exact:true}).click();await expect(view.panel.getByRole('button',{name:'Approve folder repair',exact:true})).toHaveCount(1)}
  await capture(view.page,view.panel,view.width,'legacy-proposal')
 }
 const attempts=edge.attempts().length
 await tabTo(desktop.page,desktop.panel.getByRole('button',{name:'Approve folder repair',exact:true}));await desktop.page.keyboard.press('Enter')
 await expect(desktop.panel.getByRole('button',{name:'Approve folder repair',exact:true})).toHaveCount(0)
 assert.equal(edge.attempts().length,attempts);assert.equal(edge.files().filter(file=>file.name.includes(legacy.id)).length,2)
 for(const view of legacyViews){await view.panel.getByRole('button',{name:'Refresh filing status',exact:true}).click();await capture(view.page,view.panel,view.width,'legacy-reconciled');await view.context.close()}
 console.log('Automatic filing: both providers, explicit consent, visible interrupted uploads and verified retries at 1440 and 390 passed.')
}catch(error){await screenshots(app.browser,'inkwell-filing-failure');throw error}finally{await app.close()}
