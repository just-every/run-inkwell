import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { expect } from '@playwright/test'
import { startInkwellWithMail } from './mail-worker.mjs'
import { gmailCard } from '../google-addon-harness.mjs'
import { googleEdge } from '../google-edge.mjs'
import { axe, tabTo } from './a11y.mjs'
const edge=await googleEdge(),app=await startInkwellWithMail({bindings:{GOOGLE_ACCESS_TOKEN:'synthetic-inkwell-1'},networkEdge:edge.networkEdge})
const proof=process.env.INKWELL_GOOGLE_PROOF_DIR??'/tmp/inkwell-google'
const widths=process.env.INKWELL_GOOGLE_PROOF==='both'?[1440,390]:[1440]
try{
 await mkdir(proof,{recursive:true})
 const field={id:'signature-0',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.4,height:.05}
 const template=await app.command('template.save',{title:'Google filing agreement',filename:'agreement.pdf',pdfBase64:edge.bytes.toString('base64'),roles:[{role:'Client',order:1}],fields:[field]})
 const id=(await app.command('template.use',{id:template.id,recipients:[{name:'Harbour Owner',email:'owner@harbour.example'}]})).id
 // The first screen saves the rule by keyboard before this envelope completes.
 let completed=false
 for(const width of widths){
  const context=await app.browser.newContext({viewport:{width,height:1000}});await context.addCookies([app.ownerCookie()])
  const page=await context.newPage();page.setDefaultTimeout(20000)
  const card=await gmailCard(app.origin),entry=card.widgets.find(widget=>widget.text==='Prepare in Inkwell').url
  await page.goto(entry)
  const source=page.getByRole('group',{name:'Google Workspace',exact:true})
  await expect(source.getByLabel('Google source ID',{exact:true})).toHaveValue('gmail-message')
  await source.getByLabel('Google source',{exact:true}).selectOption('drive')
  await source.getByLabel('Google source ID',{exact:true}).fill('google-doc')
  await tabTo(page,source.getByRole('button',{name:'Open Google source',exact:true}));await page.keyboard.press('Enter')
  await expect(source.getByRole('status')).toContainText('Imported Client proposal.pdf. PDF fingerprint: '+edge.hash())
  await page.getByRole('button',{name:/Place field on page 1/}).waitFor()
  await source.getByLabel('Google source',{exact:true}).selectOption('message')
  await source.getByLabel('Google source ID',{exact:true}).fill('gmail-message')
  await source.getByRole('button',{name:'Open Google source',exact:true}).click()
  await expect(source.getByText('client-agreement.pdf',{exact:true})).toBeVisible()
  await tabTo(page,source.getByRole('button',{name:'Use attachment',exact:true}));await page.keyboard.press('Enter')
  await expect(page.getByLabel('Recipient 1 name',{exact:true})).toHaveValue('Mara Quinn')
  await expect(page.getByLabel('Recipient 1 email',{exact:true})).toHaveValue('mara@client.example')
  await expect(page.getByLabel('Recipient 2 email',{exact:true})).toHaveValue('lee@client.example')
  await page.getByRole('button',{name:/Place field on page 1/}).waitFor()
  await expect(page.getByText('Could not load this PDF. Check that it is a readable, unencrypted PDF.',{exact:true})).toHaveCount(0)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Google preparation fits the viewport')
  await axe(page,'Google preparation')
  await page.screenshot({path:`${proof}/${width}-gmail-proposals.png`,fullPage:true})
  await tabTo(page,source.getByRole('button',{name:'Sign attachment myself',exact:true}),{backwards:true});await page.keyboard.press('Enter')
  await expect(page.getByLabel('Recipient 1 email',{exact:true})).toHaveValue('owner@harbour.example')
  await expect(page.getByLabel('Recipient 2 email',{exact:true})).toHaveCount(0)
  assert.equal(app.sent().filter(m=>m.subject.startsWith('Please sign:')).length,0,'importing sends no invitations')
  await page.getByRole('button',{name:/Place field on page 1/}).click()
  const remove=page.getByRole('button',{name:'Remove field 1',exact:true})
  await remove.hover();await expect(page.getByRole('tooltip',{name:'Remove field',exact:true})).toBeVisible()
  await page.mouse.move(0,0);await remove.focus();await expect(page.getByRole('tooltip',{name:'Remove field',exact:true})).toBeVisible()
  await page.screenshot({path:`${proof}/${width}-google-self-sign.png`,fullPage:true})
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click()
  const filing=page.getByRole('region',{name:'Automatic filing',exact:true})
  await filing.getByLabel('Filing provider',{exact:true}).selectOption('google')
  await expect(filing.getByLabel('Google Drive folder ID',{exact:true})).toBeVisible()
  await expect(filing.getByText('Google Drive credential configured.',{exact:true})).toBeVisible()
  await filing.getByLabel('Filing template',{exact:true}).selectOption(template.id)
  await filing.getByLabel('Google Drive folder ID',{exact:true}).fill('completed-folder')
  await filing.getByRole('checkbox',{name:'Enable automatic filing for this template and provider',exact:true}).check()
  await filing.getByRole('checkbox').last().check()
  await tabTo(page,filing.getByRole('button',{name:'Save filing rule',exact:true}));await page.keyboard.press('Enter')
  await expect(filing.getByText('Filing rule saved.',{exact:true})).toBeVisible()
  if(!completed){
   await app.command('envelope.approve',{id,eligible:true})
   const opened=await app.call('/api/inkwell/commands',{body:{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()},cookie:app.owner})
   const path='/api'+new URL(opened.value.result.signing.url).pathname,cookie=opened.cookie
   const view=(await app.call(path,{cookie})).value
   await app.call(path+'/disclosure',{body:{version:view.disclosure.version,agree:true},cookie})
   await app.call(path+'/sign',{body:{values:{'signature-0':'Harbour Owner'},consent:true,commandId:crypto.randomUUID()},cookie});completed=true
  }
  await filing.getByRole('button',{name:'Refresh filing status',exact:true}).click()
  await expect(filing.getByRole('list',{name:'Filing receipts'}).getByRole('listitem')).toHaveCount(2)
  await expect(filing.getByRole('list',{name:'Filing receipts'}).getByText(/Filed ·/)).toHaveCount(2)
  assert.ok(await filing.locator('small').evaluateAll(elements=>elements.length>=3&&elements.every(element=>parseFloat(getComputedStyle(element).fontSize)>=13)),'populated filing text is at least 13px')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'populated Google filing fits the viewport')
  await filing.scrollIntoViewIfNeeded();await axe(page,'Google filing');await filing.screenshot({path:`${proof}/${width}-google-filing.png`})
  await context.close()
 }
 console.log('Google built preparation, participant proposals, self-sign choice, filing and field tooltips passed at '+widths.join(' and '))
}finally{await app.close()}
