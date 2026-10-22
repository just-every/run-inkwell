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
    assert.equal(await review.locator('time').count(), width===1440?1:2, 'COMPLY-002: owner and the prior-width enrolled signer have access; the unused invitation has none')
    for(const time of await review.locator('time').all())assert.ok(await time.getAttribute('datetime'))
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
    // Admin verification, separate activation, password enrollment, meanings and certification through built controls.
    await app.call('/auth/invite',{cookie:app.owner,body:{email,displayName:'Morgan River',role:'member'},status:202})
    const memberToken=new URL(app.mail(email,"You're invited").text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
    const memberCookie=(await app.call('/auth/confirm',{body:{token:memberToken},status:303})).cookie
    const member=(await app.call('/api/inkwell',{cookie:memberCookie})).value.actor
    await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Settings',exact:true}).click()
    const admin=page.getByRole('region',{name:'Part 11 administration',exact:true})
    await admin.getByLabel('Signer account',{exact:true}).selectOption(member.id)
    await admin.getByLabel('Verified printed name',{exact:true}).fill('Morgan River')
    await admin.getByLabel('Identity verification method',{exact:true}).fill('Synthetic supervised government photo ID review')
    await admin.getByRole('checkbox',{name:'I verified this person’s identity outside Inkwell.'}).check()
    await admin.getByRole('button',{name:'Record verified signer',exact:true}).click()
    const activation=await admin.getByLabel('One-use activation token',{exact:true}).inputValue()
    assert.ok(activation)
    await admin.getByRole('button',{name:'Dismiss activation token',exact:true}).click()
    await admin.getByLabel('Custom signing meaning',{exact:true}).fill('Qualified batch release')
    await admin.getByRole('button',{name:'Add signing meaning',exact:true}).click()
    await admin.getByLabel('FDA certification date',{exact:true}).fill('2026-10-22')
    await admin.getByLabel('FDA certification reference',{exact:true}).fill('synthetic-inkwell-1')
    await admin.getByRole('checkbox',{name:'This records our organization’s certification, not an Inkwell certification.'}).check()
    await admin.getByRole('button',{name:'Record FDA certification',exact:true}).click()
    await admin.getByText('synthetic-inkwell-1',{exact:false}).waitFor()
    await admin.getByRole('heading',{name:'Verified signer accounts',exact:true}).waitFor()
    for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`Part 11 administration ${width} ${theme}`)}
    await page.emulateMedia({colorScheme:'light'});await admin.screenshot({path:join(evidence,`part11-administration-${width}.png`)})
    const enrollmentContext=await app.browser.newContext({viewport:{width,height}})
    const [cookieName,cookieValue]=memberCookie.split('=');await enrollmentContext.addCookies([{name:cookieName,value:cookieValue,url:app.origin}])
    const enrollment=await enrollmentContext.newPage();await enrollment.goto(app.origin+'/app');await enrollment.getByRole('button',{name:'Settings',exact:true}).click()
    const credential=enrollment.getByRole('region',{name:'Signer credential',exact:true}),password='synthetic-inkwell-'+crypto.randomUUID()
    await credential.getByLabel('Identity activation token',{exact:true}).fill(activation)
    await credential.getByLabel('New signer password',{exact:true}).fill(password)
    await credential.getByRole('button',{name:'Set signer password',exact:true}).click()
    await credential.getByRole('status').filter({hasText:'Signer password enrolled.'}).waitFor()
    for(const theme of ['light','dark']){await enrollment.emulateMedia({colorScheme:theme});await axe(enrollment,`Signer credential ${width} ${theme}`)}
    await enrollment.emulateMedia({colorScheme:'light'});await credential.screenshot({path:join(evidence,`part11-enrollment-${width}.png`)})
    await enrollmentContext.close()
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
    await tab(signer,reauth.getByLabel('Signer password',{exact:true}));await signer.keyboard.type(password)
    await activate(signer,reauth.getByRole('button',{name:'Confirm signer identity',exact:true}))
    await reauth.getByRole('status').filter({hasText:'Signer identity confirmed'}).waitFor()
    await tab(signer,reauth.getByRole('combobox',{name:'Signing reason',exact:true}));await signer.keyboard.press('ArrowDown');await signer.keyboard.press('ArrowDown');await signer.keyboard.press('ArrowDown')
    assert.equal(await reauth.getByRole('combobox',{name:'Signing reason',exact:true}).inputValue(),'Responsibility')
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
