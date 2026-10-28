import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { startInkwellWithMail } from './mail-worker.mjs'
import { remoteImportFake } from '../fixtures/remote-import.mjs'

export async function remoteImportJourney() {
 const images=process.env.INKWELL_REMOTE_IMPORT_IMAGES??'/tmp/inkwell-remote-import-screens'
 await mkdir(images,{recursive:true})
 // Assertions use one desktop viewport. The phone run records the same changed states once.
 for(const width of [1440,390]) {
  const acrobat=await remoteImportFake('acrobat'),dropbox=await remoteImportFake('dropbox')
  const accountSource=await remoteImportFake('acrobat',{account:'synthetic-inkwell-2',titlePrefix:'Account preview '})
  const app=await startInkwellWithMail({networkEdge:async request=>request.headers.get('authorization')==='Bearer synthetic-inkwell-100'?accountSource.edge(request):await acrobat.edge(request)??await dropbox.edge(request)})
  try {
   const senders=[]
   for(const email of ['first@example.test','second@example.test']) {
    await app.call('/auth/invite',{cookie:app.owner,body:{email,role:'member',displayName:email.split('@')[0]},status:202})
    const message=app.mail(email,''),token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
    const cookie=(await app.call('/auth/confirm',{body:{token},status:303})).cookie
    const actor=(await app.call('/api/inkwell',{cookie})).value.actor
    await app.command('member.role',{operatorId:actor.id,role:'sender'})
    senders.push(cookie)
   }
   const context=await app.browser.newContext({viewport:{width,height:900}})
   await context.addCookies([app.ownerCookie()]);const page=await context.newPage()
   await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Move in',exact:true}).click()
   const screen=page.getByRole('region',{name:'API move-in'})
   await screen.waitFor()

   const capture=async name=>{if(width===1440)assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no sideways scroll');await page.screenshot({path:`${images}/${width}-${name}.png`,fullPage:true})}
   for(const provider of ['acrobat','dropbox']) {
    await screen.getByRole('combobox',{name:/Signing provider/}).selectOption(provider)
    await screen.getByLabel(provider==='acrobat'?'Acrobat access token':'Dropbox Sign API key',{exact:true}).fill('synthetic-inkwell-99')
    await screen.getByLabel('Fallback administrator email',{exact:true}).fill('owner@harbour.example')
    await screen.getByRole('button',{name:'Preview provider import',exact:true}).click()
    await screen.getByRole('heading',{name:'Provider import preview'}).waitFor()
    if(width===1440){assert.equal(await screen.getByText('2 agreements · 1 templates',{exact:true}).count(),1);assert.equal(await screen.getByLabel(provider==='acrobat'?'Acrobat access token':'Dropbox Sign API key',{exact:true}).inputValue(),'')}
    await capture(provider+'-preview')
    await screen.getByRole('checkbox',{name:'I reviewed the source owners, skipped items and batch fingerprint.'}).focus()
    await page.keyboard.press('Space')
    await screen.getByRole('button',{name:'Import reviewed batch',exact:true}).focus();await page.keyboard.press('Enter')
    await screen.getByRole('status').waitFor();await capture(provider+'-complete')
    if(width===1440){
     const axe=await readFile('node_modules/axe-core/axe.min.js','utf8');await page.addScriptTag({content:axe})
     const violations=await page.evaluate(async()=> (await window.axe.run(document.querySelector('[aria-label="API move-in"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations)
     assert.deepEqual(violations.map(v=>v.id),[],'import controls meet accessibility checks')
    }
   }
   await screen.getByRole('combobox',{name:/Signing provider/}).selectOption('acrobat')
   await screen.getByLabel('Acrobat access token',{exact:true}).fill('synthetic-inkwell-100')
   await screen.getByRole('checkbox',{name:/I authorize this installation to read my Acrobat account/}).check()
   await screen.getByRole('button',{name:'Preview entire Acrobat account',exact:true}).click()
   const account=screen.getByRole('region',{name:'Account import job'})
   await account.getByRole('heading',{name:'Account import · previewing',exact:true}).waitFor()
   await app.scheduled(Date.now())
   await screen.getByRole('button',{name:'Refresh account jobs',exact:true}).click()
   await account.getByRole('heading',{name:'Account import · review',exact:true}).waitFor()
   if(width===1440){
    assert.equal(await account.getByText('Account preview acrobat first agreement · Owner: first'+String.fromCharCode(64)+'example.test',{exact:true}).count(),1)
    assert.equal(await account.getByText('Account preview acrobat second agreement · Owner: second'+String.fromCharCode(64)+'example.test',{exact:true}).count(),1)
    assert.match(await account.getByRole('status').innerText(),/2 agreements · 1 templates/)
   }
   await capture('account-preview')
   await account.getByRole('checkbox').focus();await page.keyboard.press('Space')
   await account.getByRole('button',{name:'Approve account import',exact:true}).focus();await page.keyboard.press('Enter')
   await account.getByRole('button',{name:'Pause account job',exact:true}).click()
   await account.getByRole('heading',{name:'Account import · paused',exact:true}).waitFor()
   await capture('account-paused')
   await account.getByRole('button',{name:'Resume account job',exact:true}).focus();await page.keyboard.press('Enter')
   await account.getByRole('heading',{name:'Account import · applying',exact:true}).waitFor()
   await app.scheduled(Date.now())
   await screen.getByRole('button',{name:'Refresh account jobs',exact:true}).click()
   await account.getByRole('heading',{name:'Account import · completed',exact:true}).waitFor()
   if(width===1440){
    const violations=await page.evaluate(async()=> (await window.axe.run(document.querySelector('[aria-label="API move-in"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations)
    assert.deepEqual(violations.map(v=>v.id),[],'account job controls meet accessibility checks')
   }
   if(width===1440)assert.equal(await account.getByText(/Account preview acrobat open agreement · open:/).count(),1,'completed account jobs retain the unmapped report')
   if(width===1440){const native=(await app.call('/api/inkwell/envelopes',{cookie:app.owner})).value.envelopes;assert.equal(native.filter(e=>e.title.startsWith('Account preview ')).length,2,'the reviewed account job creates its visible native agreements')}
   await capture('account-completed')
   await context.close()
   if(width===1440)for(const [i,cookie] of senders.entries()) {
    const senderContext=await app.browser.newContext({viewport:{width,height:900}})
    await senderContext.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:app.origin}])
    const senderPage=await senderContext.newPage();await senderPage.goto(app.origin+'/app')
    await senderPage.getByText(`acrobat ${i===0?'first':'second'} agreement`,{exact:true}).waitFor()
    assert.equal(await senderPage.getByText(`acrobat ${i===0?'second':'first'} agreement`,{exact:true}).count(),0,'other sender records stay private in the UI')
    await senderContext.close()
   }
  }finally{await app.close()}
 }
 console.log('Remote import screens passed: provider preview, keyboard approval, sender privacy, accessibility; proof at 1440 and 390')
}

if(process.argv[1]===fileURLToPath(import.meta.url))await remoteImportJourney()
