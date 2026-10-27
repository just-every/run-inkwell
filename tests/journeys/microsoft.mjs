import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from '@playwright/test'
import { microsoftEdge } from '../microsoft-edge.mjs'
import { startInkwellWithMail } from './mail-worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const edge=await microsoftEdge(),app=await startInkwellWithMail({bindings:{MICROSOFT_GRAPH_ACCESS_TOKEN:'synthetic-inkwell-1'},networkEdge:edge.networkEdge})
const proof=process.env.INKWELL_MICROSOFT_PROOF_DIR??join(tmpdir(),'inkwell-microsoft')
try{
 await mkdir(proof,{recursive:true})
 await app.command('account.send_policy',{source:'microsoft',mode:'person',expectedVersion:0})
 const template=await app.command('template.save',{title:'Microsoft filing template',filename:'agreement.pdf',pdfBase64:Buffer.from(edge.original).toString('base64'),roles:[{role:'Client'}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.6,width:.4,height:.05}]})
 for(const width of (process.env.INKWELL_MICROSOFT_PROOF_DIR?[1440,390]:[1440])){
  const atDesktop=async check=>{if(width===1440)await check()}
  const context=await app.browser.newContext({viewport:{width,height:1000}});await context.addCookies([app.ownerCookie()])
  // The Outlook host harness supplies the actual open item, rather than client-supplied PDF or recipient facts.
  await context.addInitScript(()=>{window.Office={context:{mailbox:{item:{itemId:'outlook-send'},convertToRestId:id=>id}}}})
  const page=await context.newPage();page.setDefaultTimeout(15000)
  await page.goto(app.origin+'/app');await page.getByRole('button',{name:'New envelope',exact:true}).click()
  const panel=page.getByRole('region',{name:'Microsoft 365 source'})
  await atDesktop(()=>expect(panel.getByLabel('Microsoft source',{exact:true})).toHaveValue('outlook'))
  await atDesktop(()=>expect(panel.getByLabel('Outlook message ID',{exact:true})).toHaveValue('outlook-send'))
  await tabTo(page,panel.getByRole('button',{name:'Load Microsoft document',exact:true}));await page.keyboard.press('Enter')
  await page.getByText('Loaded Microsoft document: outlook-agreement.pdf',{exact:true}).waitFor()
  await atDesktop(async()=>{await expect(page.getByLabel('Recipient 1 email',{exact:true})).toHaveValue('mara@clients.example');await expect(page.getByLabel('Recipient 2 email',{exact:true})).toHaveValue('alex@clients.example')})
  await atDesktop(()=>expect(page.getByLabel('Envelope title',{exact:true})).toHaveValue('outlook-agreement'))
  if(width===1440)await axe(page,'Microsoft Outlook preparation '+width)
  if(width===1440)assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Microsoft preparation has no sideways scroll')
  const pdfPage=page.locator('.iw-pdf-page').first();await pdfPage.scrollIntoViewIfNeeded();await page.locator('.iw-pdf-page[data-rendered]').first().waitFor();await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:join(proof,`${width}-outlook.png`),fullPage:true})
  const remove=page.getByRole('button',{name:'Remove field 1',exact:true});await remove.focus();await atDesktop(()=>expect(page.getByRole('tooltip',{name:'Remove field',exact:true})).toBeVisible());await page.keyboard.press('Tab');await remove.hover();await atDesktop(()=>expect(page.getByRole('tooltip',{name:'Remove field',exact:true})).toBeVisible())
  if(width===1440){
   await page.getByRole('button',{name:'Save prepared envelope',exact:true}).click()
   const detail=page.getByRole('region',{name:'outlook-agreement',exact:true});await detail.getByLabel(/confirm it is eligible for electronic signature/).check();await detail.getByRole('button',{name:'Approve and invite first recipient',exact:true}).click()
   await expect.poll(()=>Boolean(app.mail('mara@clients.example','Please sign:'))).toBe(true)
   await page.getByRole('button',{name:'New envelope',exact:true}).click()
  }
  for(const kind of ['onedrive','sharepoint','word']){
   if(kind==='word'){await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.evaluate(()=>{window.Office={context:{document:{url:'https://harbour.sharepoint.com/open-document.docx'}}}});await page.getByRole('button',{name:'New envelope',exact:true}).click();await atDesktop(()=>expect(panel.getByLabel('Open Word document',{exact:true})).toHaveValue('https://harbour.sharepoint.com/open-document.docx'))}
   else{await panel.getByLabel('Microsoft source',{exact:true}).selectOption(kind);await panel.getByLabel('Microsoft drive ID',{exact:true}).fill('personal-drive');await panel.getByLabel('Microsoft file ID',{exact:true}).fill('document')}
   await panel.getByRole('checkbox',{name:'Sign it myself',exact:true}).check();await panel.getByRole('button',{name:'Load Microsoft document',exact:true}).click()
   await page.getByText('Loaded Microsoft document: '+(kind==='word'?'open-document.pdf':'onedrive-agreement.pdf'),{exact:true}).waitFor()
   await atDesktop(async()=>{await expect(page.getByLabel('Recipient 1 email',{exact:true})).toHaveValue('owner@harbour.example');await expect(page.getByLabel('Envelope title',{exact:true})).toHaveValue(kind==='word'?'open-document':'onedrive-agreement')})
   await panel.screenshot({path:join(proof,`${width}-${kind}.png`)})
  }
  if(width===1440){await page.getByRole('button',{name:'Save prepared envelope',exact:true}).click();const detail=page.getByRole('region',{name:'open-document',exact:true});await detail.getByLabel(/confirm it is eligible for electronic signature/).check();await Promise.all([page.waitForURL(/\/sign\//),detail.getByRole('button',{name:'Approve and sign now',exact:true}).click()]);await page.screenshot({path:join(proof,`${width}-native-signing.png`),fullPage:true})}
  await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Settings',exact:true}).click()
  const filing=page.getByRole('region',{name:'Automatic filing',exact:true});await filing.getByLabel('Filing template',{exact:true}).selectOption(template.id);await filing.getByLabel('Filing provider',{exact:true}).selectOption('sharepoint');await filing.getByLabel('SharePoint drive and folder IDs',{exact:true}).fill('share-drive:completed')
  await filing.getByRole('checkbox',{name:'Enable automatic filing for this template and provider',exact:true}).check();await filing.getByRole('checkbox',{name:/I authorize automatic transfer/}).check()
  await tabTo(page,filing.getByRole('button',{name:'Save filing rule',exact:true}));await page.keyboard.press('Enter');await expect(filing.getByText('Filing rule saved.',{exact:true})).toBeVisible()
  if(width===1440){await axe(page,'Microsoft SharePoint settings '+width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'SharePoint settings has no sideways scroll')}await filing.screenshot({path:join(proof,`${width}-sharepoint-settings.png`)})
  await context.close()
 }
 console.log('Microsoft add-in harness, Graph proposals, native sends, SharePoint consent, keyboard, tooltips and responsive proof passed.')
}finally{await app.close()}
