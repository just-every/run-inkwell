import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { hubspotEdge } from '../hubspot-edge.mjs'
import { axe, tabTo } from './a11y.mjs'
import { screenshots } from './worker.mjs'

const edge=hubspotEdge(),app=await startInkwellWithMail({bindings:{HUBSPOT_ACCESS_TOKEN:'synthetic-inkwell-1',HUBSPOT_ACCOUNT_ID:'7249'},networkEdge:edge.networkEdge})
const proof=process.env.INKWELL_HUBSPOT_PROOF_DIR??join(tmpdir(),'inkwell-hubspot')
try{
 await mkdir(proof,{recursive:true})
 await app.command('account.healthcare',{enabled:true})
 const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Brightwater Medical - Service Agreement',{x:48,y:735,size:18})
 const template=await app.command('template.save',{title:'Brightwater service agreement',filename:'brightwater-services.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Client',order:1}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.7,width:.5,height:.05},{id:'amount',label:'Service fee',type:'number',signer:0,page:0,x:.1,y:.3,width:.4,height:.05}]})
 for(const width of [1440,390]){
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000}});await context.addCookies([app.ownerCookie()]);const page=await context.newPage();page.setDefaultTimeout(20000)
  const settings=async()=>{await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'HubSpot',exact:true}).waitFor()}
  const capture=async(name,element)=>{await element.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${name} fits`);await axe(page,`HubSpot ${name} at ${width}`);await page.screenshot({path:join(proof,`${width}-${name}.png`)})}
  await settings()
  const policy=page.getByRole('form',{name:'HubSpot integration sends',exact:true})
  await policy.getByRole('combobox').selectOption('autonomous')
  const all=policy.getByRole('checkbox',{name:'Use all templates',exact:true})
  if(await all.isChecked())await all.uncheck()
  await policy.getByRole('checkbox',{name:'Brightwater service agreement',exact:true}).check()
  await policy.getByLabel('Reason (optional)',{exact:true}).fill(`Reviewed for Brightwater agreements at ${width}`)
  await capture('integration-policy',policy)
  await policy.getByRole('button',{name:'Save HubSpot integration sends policy',exact:true}).click()
  await expect(policy.getByRole('button',{name:'Save HubSpot integration sends policy',exact:true})).toBeDisabled()
  const approved=(await app.call('/api/inkwell/send-policies',{cookie:app.owner})).value.policies.find(p=>p.source==='integration')
  assert.equal(approved.mode,'autonomous');assert.deepEqual(approved.templates,[template.id])
  const panel=page.getByRole('region',{name:'HubSpot connector',exact:true})
  await expect(panel.getByText('Connected account 7249',{exact:true})).toBeVisible()
  await panel.getByLabel('Sync cadence').selectOption('hourly')
  const disclosure=panel.getByText(/Owners, admins and senders can read these contacts\./)
  if(width===1440)await expect(disclosure).toBeVisible()
  await disclosure.scrollIntoViewIfNeeded()
  await capture('reader-disclosure',disclosure)
  const authorization=panel.getByRole('checkbox',{name:/I authorize this account, record scope/})
  await expect(authorization).not.toBeChecked();await expect(panel.getByRole('button',{name:'Authorize contact sync',exact:true})).toBeDisabled()
  await tabTo(page,authorization);await page.keyboard.press('Space');await capture('configuration',authorization)
  await tabTo(page,panel.getByRole('button',{name:'Authorize contact sync',exact:true}));await page.keyboard.press('Enter')
  await panel.getByRole('status').filter({hasText:'Contact authorization saved.'}).waitFor()
  await expect(panel.getByRole('region',{name:'Current HubSpot authorization'})).toContainText('active')
  await panel.getByRole('button',{name:'Start contact import',exact:true}).click()
  const runs=panel.getByRole('list',{name:'HubSpot sync runs'});await expect(runs.getByRole('listitem').first()).toContainText('1 pages · 1 records ·')
  await expect(runs.getByRole('button',{name:'Continue import',exact:true}).first()).toBeVisible();await capture('import-progress',runs)
  await runs.getByRole('button',{name:'Continue import',exact:true}).first().click()
  await expect(runs.getByRole('listitem').first()).toContainText('2 pages · 2 records ·');await expect(runs.getByRole('listitem').first()).toContainText('No remaining contacts')
  const book=(await app.call('/api/inkwell/contacts?q=Brightwater',{cookie:app.owner})).value
  assert.deepEqual(book.contacts.map(c=>({name:c.name,email:c.email,company:c.company})),[{name:'Nadia Park',email:'nadia@brightwater.example',company:'Brightwater Medical'}])
  await capture('import-completed',runs)
  const ben=(await app.call('/api/inkwell/contacts?q=ben',{cookie:app.owner})).value.contacts[0]
  await app.call('/api/inkwell/contacts',{cookie:app.owner,body:{...ben,name:'Ben Hart, local update'}})
  edge.contacts.get('102').firstname=`Ben ${width}`
  await panel.getByRole('button',{name:'Start contact import',exact:true}).click()
  await expect(runs.getByRole('listitem').first()).toContainText('More contacts to import')
  await runs.getByRole('button',{name:'Continue import',exact:true}).first().click()
  const conflict=panel.getByRole('region',{name:'Contact conflict 102',exact:true})
  await expect(conflict).toContainText('Local: Ben Hart, local update');await expect(conflict).toContainText(`Proposed: Ben ${width} Hart`)
  await capture('contact-conflict',conflict)
  await conflict.getByRole('button',{name:'Use provider contact',exact:true}).click();await expect(conflict).toHaveCount(0)
  assert.equal((await app.call('/api/inkwell/contacts?q=ben',{cookie:app.owner})).value.contacts[0].name,`Ben ${width} Hart`)
  const launch=panel.getByRole('region',{name:'Prepare from HubSpot',exact:true})
  await launch.getByLabel('CRM record ID',{exact:true}).fill('901');await launch.getByLabel('CRM agreement template').selectOption(template.id)
  await launch.getByLabel('CRM recipient name',{exact:true}).fill('Nadia Park');const email=`nadia.${width}@brightwater.example`;await launch.getByLabel('CRM recipient email',{exact:true}).fill(email)
  await launch.getByRole('button',{name:'Add CRM field mapping',exact:true}).click();await launch.getByLabel('Template field ID',{exact:true}).fill('amount');await launch.getByLabel('HubSpot property',{exact:true}).fill('amount')
  await launch.getByRole('checkbox',{name:'Send under the integration sending policy after preparation',exact:true}).check()
  const consent=launch.getByRole('checkbox',{name:/I authorize Inkwell to read these selected/});await expect(consent).not.toBeChecked();await expect(launch.getByRole('button',{name:'Prepare and request integration send',exact:true})).toBeDisabled()
  await consent.check();await capture('crm-launch',consent)
  await capture('crm-consent',launch.getByRole('button',{name:'Prepare and request integration send',exact:true}))
  const prepared=page.waitForResponse(r=>r.url().endsWith('/api/inkwell/hubspot/prepare')&&r.request().method()==='POST')
  await launch.getByRole('button',{name:'Prepare and request integration send',exact:true}).click()
  const response=await prepared,value=await response.json();assert.equal(response.status(),200,JSON.stringify(value));const id=value.id
  const envelope=(await app.call('/api/inkwell/envelopes/'+id,{cookie:app.owner})).value.envelope
  assert.equal(envelope.status,'awaiting_signature');assert.equal(envelope.fields.find(f=>f.id==='amount').prefill.value,'48600.00');assert.equal(envelope.fields.find(f=>f.id==='amount').readOnly,true)
  assert.ok(envelope.events.some(e=>e.action==='hubspot.record_prepared'&&e.detail.followupGranted===false&&e.detail.noAccessGranted===true))
  const detail=page.getByRole('region',{name:envelope.title,exact:true});await expect(detail).toBeVisible()
  const close=detail.getByRole('button',{name:'Close',exact:true});await close.focus();await expect(page.getByRole('tooltip')).toBeVisible();await capture('draft-tooltip',close);await page.keyboard.press('Tab');await close.hover();await expect(page.getByRole('tooltip')).toBeVisible()
  edge.renameProperty(width===1440?'inkwell_status':'inkwell_status_desktop',width===1440?'inkwell_status_desktop':'inkwell_status_phone')
  const signer=await app.verify(email),signed={commandId:crypto.randomUUID(),values:{signature:'Nadia Park'},consent:true,adoption:{method:'typed',style:'sans'}}
  await app.call(signer.path+'/sign',{cookie:signer.cookie,body:signed})
  assert.equal((await app.call('/api/inkwell/envelopes/'+id,{cookie:app.owner})).value.envelope.status,'completed')
  await settings();const completion=page.getByRole('region',{name:'HubSpot completion progress',exact:true}),job=completion.getByRole('listitem').filter({hasText:envelope.title}).first()
  await expect(job).toContainText('Proposed CRM mapping repair. Owner approval is required.');await capture('mapping-repair',job)
  edge.intercept(request=>new URL(request.url).pathname.startsWith('/crm/v3/properties/')?Response.json({}, {status:401}):undefined)
  await job.getByRole('button',{name:'Reconcile completion',exact:true}).click()
  const renewal=job.getByRole('button',{name:'Renew completion authorization',exact:true})
  await expect(renewal).toBeVisible();await capture('authorization-held',job)
  edge.intercept(undefined)
  await tabTo(page,renewal);await page.keyboard.press('Enter')
  await expect(job.getByRole('button',{name:'Approve mapping repair and replay',exact:true})).toBeVisible()

  const repair=job.getByRole('button',{name:'Approve mapping repair and replay',exact:true})
  edge.failNext('file','after')
  await tabTo(page,repair);await page.keyboard.press('Enter')
  await expect(job).toContainText('Unconfirmed file result.')
  const moved=edge.files().find(file=>file.name.startsWith(id+'-'));moved.path='/reviewed/'+moved.name
  await job.getByRole('button',{name:'Reconcile completion',exact:true}).click()
  const movedApproval=job.getByRole('button',{name:'Approve moved PDF and reconcile',exact:true})
  await expect(movedApproval).toBeVisible();await capture('moved-pdf-repair',job)
  await tabTo(page,movedApproval);await page.keyboard.press('Enter')
  await expect(job).toContainText('Timeline note attached');await expect(job).toContainText('completed')
  await capture('writeback-completed',job)
  await app.call(signer.path+'/sign',{cookie:signer.cookie,body:signed})
  const completed=(await app.call('/api/inkwell/envelopes/'+id,{cookie:app.owner})).value.envelope
  const files=edge.files().filter(f=>f.name.startsWith(id+'-')),notes=edge.notes().filter(n=>n.properties.hs_note_body.includes(id)),updates=edge.patches().filter(p=>p.properties.inkwell_envelope_id===id)
  assert.equal(files.length,1);assert.equal(notes.length,1);assert.equal(updates.length,1)
  const artifact=await fetch(app.origin+`/api/inkwell/envelopes/${id}/artifacts/signed`,{headers:{cookie:app.owner}});assert.equal(artifact.status,200);assert.deepEqual(files[0].bytes,Buffer.from(await artifact.arrayBuffer()))
  assert.equal(edge.deals.get('901').inkwell_signed_sha256,completed.signedSha256)
  const invitation=app.mail(email,'Please sign:')
  await app.deliver(invitation,'email.delivered',Date.now()-60_000)
  await app.db.prepare("UPDATE rer_mail_event_states SET status='accepted',terminal=0 WHERE provider_message_id=?").bind(invitation.id).run()
  await job.getByText('Delivery reconciliation',{exact:true}).click()
  await tabTo(page,job.getByRole('button',{name:'Check delivery records',exact:true}));await page.keyboard.press('Enter')
  if(width===1440)await expect(job).toContainText('resend: accepted → delivered')
  await capture('delivery-repair-proposed',job)
  await tabTo(page,job.getByRole('button',{name:'Approve delivery repair',exact:true}));await page.keyboard.press('Enter')
  await expect(job).toContainText('Delivery repair recorded.')
  await capture('delivery-repair-completed',job)
  if(width===1440){
   const state=await app.db.prepare('SELECT status FROM rer_mail_event_states WHERE provider_message_id=?').bind(invitation.id).first()
   assert.equal(state.status,'delivered')
   assert.equal(app.sent().filter(message=>message.id===invitation.id).length,1)
  }
  if(width===1440){
   const logs=JSON.stringify(app.logs()),audit=(await app.call('/api/inkwell/audit.csv',{cookie:app.owner})).value
   assert.match(logs,/inkwell.request/,'built Worker emits operational logs')
   for(const value of ['48600.00','Brightwater Medical','Nadia Park','nadia@brightwater.example','Ben Hart, local update','Bearer synthetic-inkwell-1'])assert.equal((logs+audit).includes(value),false,'built Worker logs and full audit exclude '+value)
  }
  await context.close()
 }
 console.log('INTEG-001 configuration, paged sync, native locked preparation, policy send, completion, uncertain result reconciliation, replay and tooltips passed at 1440 and 390.')
}catch(error){await screenshots(app.browser,'inkwell-hubspot-failure');throw error}finally{await app.close()}
