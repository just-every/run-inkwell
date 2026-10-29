import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { salesforceEdge,salesforceBindings,salesforceAddress } from '../salesforce-edge.mjs'
import { axe,tabTo } from './a11y.mjs'
export async function salesforceJourney(){
 const edge=salesforceEdge(),app=await startInkwellWithMail({bindings:salesforceBindings,networkEdge:edge.networkEdge}),proof=process.env.INKWELL_SALESFORCE_PROOF_DIR??join(tmpdir(),'inkwell-salesforce')
 try{
  await mkdir(proof,{recursive:true})
  const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Synthetic Salesforce agreement',{x:45,y:720,size:18})
  const template=await app.command('template.save',{title:'Salesforce service agreement',filename:'synthetic-inkwell-8.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Client'}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.7,width:.5,height:.05},{id:'amount',label:'Amount',type:'number',signer:0,page:0,x:.1,y:.3,width:.4,height:.05}]})
  let envelopeId
  const context=await app.browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([app.ownerCookie()]);const page=await context.newPage();page.setDefaultTimeout(20_000)
  const settings=async()=>{await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'Salesforce',exact:true}).waitFor()}
  const panel=page.getByRole('region',{name:'Salesforce connector',exact:true})
  await settings()
  const policyForm=page.getByRole('form',{name:'Salesforce integration sends',exact:true})
  await policyForm.getByRole('combobox').selectOption('autonomous')
  await policyForm.getByRole('checkbox',{name:'Use all templates',exact:true}).uncheck()
  await policyForm.getByRole('checkbox',{name:'Salesforce service agreement',exact:true}).check()
  await capture('send-policy',policyForm)
  await policyForm.getByRole('button',{name:'Save Salesforce integration sends policy',exact:true}).click()
  await expect(policyForm.getByRole('button',{name:'Save Salesforce integration sends policy',exact:true})).toBeDisabled()
  const policies=(await app.call('/api/inkwell/send-policies',{cookie:app.owner})).value.policies
  assert.equal(policies.find(p=>p.source==='salesforce').mode,'autonomous');assert.equal(policies.find(p=>p.source==='integration').mode,'off','Salesforce does not widen HubSpot sending')
  await expect(panel).toContainText('Connected account synthetic-inkwell-2')
  const authorize=panel.getByRole('checkbox',{name:/I authorize this account, record scope/})
  await expect(authorize).not.toBeChecked();await tabTo(page,authorize);await page.keyboard.press('Space')
  await panel.getByRole('button',{name:'Authorize contact sync',exact:true}).click()
  await expect(panel.getByRole('region',{name:'Current Salesforce authorization',exact:true})).toContainText('active')
  await panel.getByRole('button',{name:'Start contact import',exact:true}).click()
  const runs=panel.getByRole('list',{name:'Salesforce sync runs',exact:true});await expect(runs).toContainText('1 pages · 1 records')
  await runs.getByRole('button',{name:'Continue import',exact:true}).click();await expect(runs).toContainText('2 pages · 2 records');await expect(runs).toContainText('No remaining contacts')
  const book=(await app.call('/api/inkwell/contacts?q=Synthetic',{cookie:app.owner})).value
  assert.ok(book.contacts.some(c=>c.email===salesforceAddress(6)&&c.company==='Synthetic company'))
  const launch=panel.getByRole('region',{name:'Prepare from Salesforce',exact:true})
  await launch.getByLabel('CRM record ID',{exact:true}).fill('synthetic-inkwell-3');await launch.getByLabel('CRM agreement template').selectOption(template.id)
  await launch.getByLabel('CRM recipient name',{exact:true}).fill('Synthetic signer');await launch.getByLabel('CRM recipient email',{exact:true}).fill(salesforceAddress(6))
  await launch.getByRole('button',{name:'Add CRM field mapping',exact:true}).click();await launch.getByLabel('Template field ID',{exact:true}).fill('amount');await launch.getByLabel('Salesforce field',{exact:true}).fill('Amount')
  await launch.getByRole('checkbox',{name:'Send under the integration sending policy after preparation',exact:true}).check()
  const consent=launch.getByRole('checkbox',{name:/I authorize Inkwell to read this selected Salesforce record/});await expect(consent).not.toBeChecked();await expect(launch.getByRole('button',{name:'Prepare and request integration send',exact:true})).toBeDisabled()
  // The functional journey asserts once at desktop width. Capture its changed states at both release widths.
  async function capture(name,element){for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await element.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${width}`);await axe(page,`Salesforce ${name} ${width}`);await page.screenshot({path:join(proof,`${width}-${name}.png`)})}await page.setViewportSize({width:1440,height:1000})}
  await capture('authorization-and-import',runs)
  await consent.check();await capture('selected-record-consent',launch)
  const prepared=page.waitForResponse(r=>r.url().endsWith('/api/inkwell/salesforce/prepare')&&r.request().method()==='POST')
  await launch.getByRole('button',{name:'Prepare and request integration send',exact:true}).click();const response=await prepared,value=await response.json();assert.equal(response.status(),200,JSON.stringify(value));envelopeId=value.id
  const e=(await app.call('/api/inkwell/envelopes/'+envelopeId,{cookie:app.owner})).value.envelope;assert.equal(e.status,'awaiting_signature');assert.equal(e.fields.find(f=>f.id==='amount').prefill.source,'Salesforce synthetic-inkwell-2 Opportunity synthetic-inkwell-3.Amount');assert.equal(e.fields.find(f=>f.id==='amount').readOnly,true)
  const detail=page.getByRole('region',{name:e.title,exact:true});await expect(detail).toBeVisible();const close=detail.getByRole('button',{name:'Close',exact:true})
  await close.focus();await expect(page.getByRole('tooltip')).toBeVisible();await capture('prepared-envelope',close)
  const signer=await app.verify(salesforceAddress(6));edge.failNext('file')
  await app.call(signer.path+'/sign',{cookie:signer.cookie,body:{commandId:crypto.randomUUID(),consent:true,values:{signature:'Synthetic signer'},adoption:{method:'typed',style:'sans'}}})
  await settings();const completion=panel.getByRole('region',{name:'Salesforce completion progress',exact:true}),job=completion.getByRole('listitem').filter({hasText:e.title}).first()
  await expect(job).toContainText('Unconfirmed file result.');await capture('completion-held',job)
  await job.getByRole('button',{name:'Reconcile completion',exact:true}).click();await expect(job).toContainText('Attached to record Files');await expect(job).toContainText('completed');await capture('completion-filed',job)
  assert.equal(edge.files.length,1);assert.equal(edge.patches.length,1)
  const artifact=await fetch(app.origin+`/api/inkwell/envelopes/${envelopeId}/artifacts/signed`,{headers:{cookie:app.owner}});assert.equal(artifact.status,200);assert.deepEqual(edge.files[0].bytes,Buffer.from(await artifact.arrayBuffer()))
  const logs=JSON.stringify(app.logs())+(await app.call('/api/inkwell/audit.csv',{cookie:app.owner})).value
  for(const value of ['48600','Synthetic company','Bearer '+salesforceBindings.SALESFORCE_ACCESS_TOKEN])assert.equal(logs.includes(value),false)
  await context.close();console.log('Salesforce native consent, contact sync, locked prefill, signing, completion recovery and Files passed; browser proof at 1440 and 390.')
 }finally{await app.close()}
}
