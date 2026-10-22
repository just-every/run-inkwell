// COMPLY-002: an administrator enables the profile and reviews members in the built Settings screen.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'
import { PDFDocument } from 'pdf-lib'

const app = await startInkwellWithMail(), evidence = process.env.INKWELL_SCREENSHOTS || join(tmpdir(), 'inkwell-healthcare')
await mkdir(evidence, { recursive: true })
try {
  await app.call('/auth/invite', { cookie: app.owner, body: { email: 'records@harbour.example', displayName: 'Records colleague', role: 'member' }, status: 202 })
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await app.browser.newContext({ viewport: { width, height } })
    await context.addCookies([app.ownerCookie()])
    const page = await context.newPage()
    await page.goto(app.origin + '/app')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const panel = page.getByRole('region', { name: 'Healthcare profile', exact: true })
    await panel.getByRole('heading', { name: 'Healthcare profile' }).waitFor()
    await panel.getByRole('checkbox', { name: 'Enable healthcare profile' }).check()
    await panel.getByRole('button', { name: 'Save healthcare profile' }).click()
    await panel.getByRole('status').filter({ hasText: 'Healthcare profile enabled.' }).waitFor()
    await panel.getByRole('button', { name: 'Review member access' }).click()
    const review = panel.getByRole('region', { name: 'Member access review', exact: true })
    await review.getByText('records@harbour.example', { exact: true }).waitFor()
    await review.getByRole('listitem').filter({ hasText: 'No recorded access' }).waitFor()
    await review.getByText('owner@harbour.example', { exact: true }).waitFor()
    assert.equal(await review.locator('time').count(), 1, 'COMPLY-002: the app page records owner access while the invited member has none')
    assert.ok(await review.locator('time').getAttribute('datetime'))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no sideways scroll`)
    await axe(page, `COMPLY-002 healthcare review ${width}`)
    await panel.screenshot({ path: join(evidence, `comply-002-review-${width}.png`) })
    await panel.getByRole('checkbox', { name: 'Enable healthcare profile' }).uncheck()
    await panel.getByRole('button', { name: 'Save healthcare profile' }).click()
    await panel.getByRole('status').filter({ hasText: 'Healthcare profile disabled.' }).waitFor()
    assert.equal((await app.call('/api/inkwell/compliance/access-review', { cookie: app.owner })).value.enabled, false)
    await panel.screenshot({ path: join(evidence, `comply-002-disabled-${width}.png`) })
    await panel.getByText('Healthcare shared-responsibility guide', { exact: true }).click()
    await panel.getByRole('region', { name: 'Healthcare shared responsibility', exact: true }).waitFor()
    await page.getByRole('heading', { name: "The buyer's responsibility", exact: true }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await axe(page, `COMPLY-002 healthcare guide ${width}`)
    await panel.screenshot({ path: join(evidence, `comply-002-guide-${width}.png`) })
    // The optional signature profile is explicitly enabled on this draft, then enforced in the signer page.
    const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Synthetic qualification agreement',{x:50,y:700,size:14})
    const email=`qualification-${width}@harbour.example`,title=`Qualification agreement ${width}`
    const id=(await app.command('envelope.prepare',{title,filename:'qualification.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[{name:'Morgan River',email}],fields:[{id:'signature',label:'Qualification signature',type:'signature',signer:0,page:0,x:.1,y:.5,width:.5,height:.06}]})).id
    const tab=async(p,target)=>{await target.waitFor();if(await target.evaluate(el=>el===document.activeElement))return;const backwards=await target.evaluate(el=>Boolean(document.activeElement?.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_PRECEDING));await tabTo(p,target,{backwards})}
    const activate=async(p,target)=>{await tab(p,target);await p.keyboard.press('Enter')}
    await page.goto(app.origin+'/app');await page.getByRole('row',{name:new RegExp(title)}).click()
    const controls=page.getByRole('region',{name:'Additional signature controls',exact:true}),confirm=controls.getByRole('checkbox')
    await tab(page,confirm);await page.keyboard.press('Space');await activate(page,controls.getByRole('button',{name:'Require additional signature controls',exact:true}))
    await controls.getByRole('status').filter({hasText:'Additional signature controls required.'}).waitFor()
    assert.ok((await controls.ariaSnapshot()).includes('unvalidated'))
    for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`Signature profile enabled ${width} ${theme}`)}
    await page.emulateMedia({colorScheme:'light'});await controls.screenshot({path:join(evidence,`signature-profile-${width}.png`)})
    await app.command('envelope.approve',{id,eligible:true})
    const signingContext=await app.browser.newContext({viewport:{width,height}}),signer=await signingContext.newPage()
    const invitation=app.mail(email,'Please sign:'),link=invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]
    await signer.goto(link);await activate(signer,signer.getByRole('button',{name:'Email me a code',exact:true}))
    await tab(signer,signer.getByLabel('Email verification code',{exact:true}));await signer.keyboard.type(app.mail(email,'Your Inkwell verification code').text.match(/\b\d{6}\b/)[0])
    await activate(signer,signer.getByRole('button',{name:'Verify code',exact:true}))
    await tab(signer,signer.getByRole('checkbox',{name:/I have read the electronic record/}));await signer.keyboard.press('Space');await activate(signer,signer.getByRole('button',{name:'Agree and continue',exact:true}))
    await tab(signer,signer.getByRole('textbox',{name:'Qualification signature Page 1 · signature',exact:true}));await signer.keyboard.type('Morgan River')
    const reauth=signer.getByRole('region',{name:'Signature re-authentication',exact:true})
    await tab(signer,reauth.getByLabel('Signing reason',{exact:true}));await signer.keyboard.press('ArrowDown')
    assert.equal(await reauth.getByLabel('Signing reason',{exact:true}).inputValue(),'Approval')
    await activate(signer,reauth.getByRole('button',{name:'Email a fresh signature code',exact:true}))
    await reauth.getByRole('status').filter({hasText:'Signature code sent.'}).waitFor()
    await tab(signer,reauth.getByLabel('Signature code',{exact:true}));await signer.keyboard.type(app.mail(email,'Your Inkwell signature code').text.match(/\b\d{6}\b/)[0])
    assert.ok((await reauth.ariaSnapshot()).includes('Signature code'))
    for(const theme of ['light','dark']){await signer.emulateMedia({colorScheme:theme});await axe(signer,`Signature re-authentication ${width} ${theme}`)}
    await signer.emulateMedia({colorScheme:'light'});assert.ok(await signer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await reauth.screenshot({path:join(evidence,`signature-reauthentication-${width}.png`)})
    await tab(signer,signer.getByRole('checkbox',{name:/I have reviewed this document and consent/}));await signer.keyboard.press('Space');await activate(signer,signer.getByRole('button',{name:'Sign document',exact:true}))
    await signer.getByRole('heading',{name:'All signatures are complete.',exact:true}).waitFor()
    assert.equal((await app.call(`/api/inkwell/envelopes/${id}/verify`,{cookie:app.owner})).value.ok,true)
    await signer.screenshot({path:join(evidence,`signature-complete-${width}.png`)})
    await signingContext.close()
    await context.close()
  }
  console.log('COMPLY-002 healthcare and COMPLY-001 conservative signature controls passed at 1440 and 390: keyboard, accessibility tree and light/dark axe')
} catch (error) { await screenshots(app.browser, 'healthcare'); throw error }
finally { await app.close() }
