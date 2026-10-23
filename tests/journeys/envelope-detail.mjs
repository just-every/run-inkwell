// MANAGE-005 journey: an envelope with three recipients in routing orders 1, 2 and 3, mid-routing (the first has signed,
// the second has verified and viewed, the third waits). At 1440 and 390 pixels the detail page shows each recipient's
// sent, delivered, viewed and signed times, in the account's time zone and UTC, matching the provider's delivery events
// (DELIV-001) and the audit trail, says what each recipient is waiting on, and its Remind action sends exactly one
// reminder, to the current signer only; its Resend actions send the same link again or a new one (DELIV-005).
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { axe } from './a11y.mjs'
import { PDFDocument } from 'pdf-lib'
import { screenshots } from './worker.mjs'
import { startInkwellWithMail } from './mail-worker.mjs'

const inkwell = await startInkwellWithMail({ inbound: true })
// Browsers and Node may space "10:02 AM" with different space characters; compare with plain spaces.
const plain = text => text.replace(/\s+/g, ' ')
const zoned = at => plain(`${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(at))} · ${new Date(at).toISOString().slice(11, 16)} UTC`)
try {
  const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
  const signers = [['Mara Quinn', 'mara@clients.example'], ['Noor Haddad', 'noor@clients.example'], ['Owen Price', 'owen@clients.example']].map(([name, email], i) => ({ name, email, order: i + 1 }))
  const title = 'Harbour Studio — supplier agreement'
  const { id } = await inkwell.command('envelope.prepare', { title, filename: 'supplier.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), signers, fields: signers.map((_, signer) => ({ id: `signature-${signer}`, label: 'Signature', type: 'signature', signer, page: 0, x: .1, y: .3 + signer * .15, width: .4, height: .07 })) })
  await inkwell.command('envelope.approve', { id, eligible: true })
  // Order 1: delivered by the provider a minute ago, verified, viewed, signed.
  const delivered = [Date.now() - 120_000, Date.now() - 60_000]
  await inkwell.deliver(inkwell.mail(signers[0].email, 'Please sign:'), 'email.delivered', delivered[0])
  const first = await inkwell.verify(signers[0].email)
  await inkwell.call(first.path + '/document', { cookie: first.cookie })
  await inkwell.call(first.path + '/sign', { body: { values: { 'signature-0': 'Mara Quinn' }, consent: true, commandId: crypto.randomUUID() }, cookie: first.cookie })
  // Order 2: invited after the signature, delivered, verified and viewed, not signed.
  await inkwell.deliver(inkwell.mail(signers[1].email, 'Please sign:'), 'email.delivered', delivered[1])
  const second = await inkwell.verify(signers[1].email)
  await inkwell.call(second.path + '/document', { cookie: second.cookie })
  assert.equal(inkwell.mail(signers[2].email, 'Please sign:'), undefined, 'order 3 is not invited yet')

  // The facts the page must show: the provider's delivery times and the audit trail's sent/viewed/signed times.
  const envelope = (await inkwell.call(`/api/inkwell/envelopes/${id}`, { cookie: inkwell.owner })).value.envelope
  const audit = (action, signer) => envelope.events.find(e => e.action === action && e.detail.signer === signer).at
  const invitation = signer => envelope.messages.find(m => m.kind === 'invitation' && m.signer === signer)
  const expected = [
    [['Sent', invitation(0).sentAt], ['Delivered', new Date(delivered[0]).toISOString()], ['Viewed', audit('signer.viewed', 0)], ['Signed', audit('signer.signed', 0)]],
    [['Sent', invitation(1).sentAt], ['Delivered', new Date(delivered[1]).toISOString()], ['Viewed', audit('signer.viewed', 1)]],
    [],
  ]

  let reminders = 0
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await inkwell.browser.newContext({ viewport: { width, height } })
    await context.addCookies([inkwell.ownerCookie()])
    const page = await context.newPage()
    await page.goto(`${inkwell.origin}/app`)
    await page.getByRole('row', { name: /supplier agreement/ }).click()
    const detail = page.getByRole('region', { name: title })
    await detail.waitFor()
    for (const [signer, steps] of expected.entries()) {
      const list = detail.getByRole('list', { name: `${signers[signer].name} timeline` })
      if (!steps.length) { assert.equal(await list.count(), 0, `${signers[signer].name} has no timeline yet`); continue }
      const items = (await list.getByRole('listitem').allTextContents()).map(plain)
      for (const [step, at] of steps) assert.ok(items.some(item => item.startsWith(`${step} ${zoned(at)}`)), `${width}px: ${signers[signer].name} ${step} ${zoned(at)} in ${JSON.stringify(items)}`)
      assert.ok(!items.some(item => item.startsWith('Signed')) || signer === 0, `${signers[signer].name} has not signed`)
    }
    await detail.getByText('Waiting on: The recipient to sign').waitFor()
    await detail.getByText('Waiting on: Routing order 2 to finish: Noor Haddad').waitFor()
    const before = inkwell.sent().length
    await detail.getByRole('button', { name: 'Remind' }).click()
    await detail.getByRole('status').filter({ hasText: `Reminder sent to ${signers[1].email}` }).waitFor()
    const added = inkwell.sent().slice(before)
    assert.deepEqual(added.map(m => [m.to, m.subject]), [[[signers[1].email], `Reminder to sign: ${title}`]], `${width}px: one reminder, to the current signer only`)
    reminders++
    // DELIV-005: Resend from the same page: the same link at 1440, a new link (the old one refuses) at 390.
    const newLink = width === 390, prior = inkwell.mail(signers[1].email, 'Please sign:'), link = message => message.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]
    await detail.getByRole('button', { name: newLink ? 'Resend with a new link' : 'Resend', exact: true }).click()
    await detail.getByRole('status').filter({ hasText: newLink ? `Invitation resent to ${signers[1].email} with a new link` : `Invitation resent to ${signers[1].email} with the same link` }).waitFor()
    const resent = inkwell.mail(signers[1].email, 'Please sign:')
    assert.notEqual(resent.id, prior.id, `${width}px: the invitation was resent`)
    assert.equal(link(resent) === link(prior), !newLink, `${width}px: ${newLink ? 'a new' : 'the same'} link`)
    if (newLink) await inkwell.call('/api/sign/' + new URL(link(prior)).pathname.split('/').at(-1), { status: 404 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll at ${width} pixels`)
    await context.close()
  }
  const audited = (await inkwell.call(`/api/inkwell/envelopes/${id}`, { cookie: inkwell.owner })).value.envelope.events.filter(e => e.action === 'signer.reminded')
  assert.deepEqual(audited.map(e => [e.detail.signer, e.detail.manual]), Array(reminders).fill([1, true]), 'each reminder is in the audit trail for the current signer')
  // AGENT-003: authorize, inspect the three causes, correct a proposal, resume and revoke through the built page.
  const images=process.env.INKWELL_FOLLOWUP_IMAGES??'/tmp/inkwell-followup-screens'
  await mkdir(images,{recursive:true})
  for(const width of [1440,390]){
    const title=`Harbour supplier follow-up ${width}`, emails=[`alex${width}@clients.example`,`blair${width}@clients.example`,`casey${width}@clients.example`]
    const {id}=await inkwell.command('envelope.prepare',{title,filename:'supply.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:emails.map((email,i)=>({name:['Alex Client','Blair Away','Casey Client'][i],email,order:1})),fields:emails.map((_,signer)=>({id:'sig'+signer,label:'Signature',type:'signature',signer,page:0,x:.1,y:.2+signer*.15,width:.4,height:.05}))})
    await inkwell.command('envelope.approve',{id,eligible:true})
    await inkwell.call('/api/inkwell/contacts',{cookie:inkwell.owner,body:{name:'Alex Client',email:`correct${width}@clients.example`}})
    const context=await inkwell.browser.newContext({viewport:{width,height:width===390?844:1000}});await context.addCookies([inkwell.ownerCookie()])
    const page=await context.newPage();page.setDefaultTimeout(20000)
    const open=async()=>{await page.goto(inkwell.origin+'/app');await page.getByRole('row',{name:new RegExp(title)}).click();await page.getByRole('region',{name:'Signer follow-up',exact:true}).getByRole('status').first().waitFor()}
    const capture=async(name,target)=>{const panel=page.getByRole('region',{name:'Signer follow-up',exact:true});await (target??panel).scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} no sideways scroll`);await page.screenshot({path:`${images}/${width}-${name}.png`})}
    await open()
    let followup=page.getByRole('region',{name:'Signer follow-up',exact:true})
    await followup.locator('summary').filter({hasText:'Turn on follow-up'}).click()
    await followup.getByLabel('Maximum contacts per recipient').fill('2')
    await followup.getByLabel('I authorize follow-up for this envelope under these settings.').check()
    await capture('grant-settings-top',followup.getByLabel('Maximum contacts per recipient'));await capture('grant-settings');await axe(page,`follow-up settings ${width}`)
    const enable=followup.getByRole('button',{name:'Turn on follow-up',exact:true});await enable.focus();await page.keyboard.press('Enter')
    await followup.getByText(/Grant version 1 · active/).waitFor();await capture('grant-active')
    for(const signer of [1,2])await inkwell.command('envelope.resend',{id,signer})
    let monday=new Date();monday.setUTCHours(14,0,0,0);do{monday.setUTCDate(monday.getUTCDate()+1)}while(monday.getUTCDay()!==1)
    await inkwell.reply(inkwell.mail(emails[1],'Please sign:'),emails[1],`Out of office; returning ${monday.toISOString().slice(0,10)}`,'auto-replied')
    await inkwell.reply(inkwell.mail(emails[2],'Please sign:'),emails[2],'Clause 4 needs review by our legal team.')
    await inkwell.deliver(inkwell.mail(emails[0],'Please sign:'),'email.bounced',Date.now())
    await inkwell.scheduled(monday.getTime()-3*86400000)
    await open();followup=page.getByRole('region',{name:'Signer follow-up',exact:true})
    await followup.getByText(/Unavailable/).waitFor();await followup.getByText(/Substantive reply/).waitFor()
    await followup.getByText(/Proposed corrected address:/).waitFor()
    await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Activity',exact:true}).click()
    const feed=page.getByRole('region',{name:'Activity feed'});await feed.getByText('a signer replied',{exact:false}).first().waitFor();await axe(page,`follow-up activity ${width}`)
    await page.screenshot({path:`${images}/${width}-routed-activity.png`})
    await feed.getByRole('button',{name:title,exact:true}).first().click();followup=page.getByRole('region',{name:'Signer follow-up',exact:true});await followup.getByText(/Proposed corrected address:/).waitFor()
    await followup.getByText(/Casey Client · Authenticated reply/).click()
    await followup.getByText('Clause 4 needs review by our legal team.',{exact:true}).waitFor()
    await capture('causes-and-reply');await capture('private-reply',followup.getByText('Clause 4 needs review by our legal team.',{exact:true}));await axe(page,`follow-up causes and private reply ${width}`)
    const detail=page.getByRole('region',{name:title,exact:true})
    await detail.getByLabel('Corrected email for Alex Client').fill(`correct${width}@clients.example`)
    await detail.getByRole('button',{name:'Correct and resend',exact:true}).click()
    await detail.getByLabel('Corrected email for Alex Client').waitFor({state:'detached'})
    await followup.getByRole('button',{name:'Resume follow-up for Casey Client'}).click()
    await followup.getByRole('button',{name:'Resume follow-up for Casey Client'}).waitFor({state:'detached'})
    await capture('human-correction-and-resume')
    await followup.getByRole('button',{name:'Revoke follow-up',exact:true}).click()
    await followup.getByText(/Grant version 1 · revoked/).waitFor();await capture('grant-revoked');await axe(page,`follow-up revoked ${width}`)
    await inkwell.call('/api/inkwell/contacts/remove',{cookie:inkwell.owner,body:{email:`correct${width}@clients.example`}})
    await context.close()
  }
  // MANAGE-002: the existing management journey also covers template metadata, filing and exports.
  const organizationImages=process.env.INKWELL_ORGANIZATION_IMAGES??'/tmp/inkwell-organization-screens'
  await mkdir(organizationImages,{recursive:true})
  const shareEmail='folder.reader@harbour.example'
  await inkwell.call('/auth/invite',{cookie:inkwell.owner,body:{email:shareEmail,displayName:'Folder Reader',role:'member'},status:202})
  const inviteMail=inkwell.mail(shareEmail,''),inviteToken=new URL(inviteMail.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  await inkwell.call('/auth/confirm',{body:{token:inviteToken},status:303})
  for(const width of [1440,390]){
    const title=`Cost center agreement ${width}`,folderName=`Finance records ${width}`
    const definition={title,filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Client',order:1}],fields:[{id:'sig',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.4,width:.4,height:.05}]}
    await inkwell.command('template.save',definition)
    const second=await inkwell.command('template.save',{...definition,title:`Companion ${width}`})
    const context=await inkwell.browser.newContext({viewport:{width,height:width===390?844:1000}});await context.addCookies([inkwell.ownerCookie()])
    const page=await context.newPage();page.setDefaultTimeout(20000)
    const capture=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: organization has no sideways scroll`);await axe(page,`${width}: ${name}`);await page.screenshot({path:`${organizationImages}/${width}-${name}.png`,fullPage:true})}
    await page.goto(inkwell.origin+'/app');await page.getByRole('button',{name:'Templates',exact:true}).click()
    await page.getByRole('button',{name:`Edit ${title}`,exact:true}).click()
    await page.getByLabel('Template name').waitFor();await page.getByRole('button',{name:'Add custom field',exact:true}).click()
    await page.getByLabel('Custom field 1 name',{exact:true}).fill('Cost center')
    await page.getByLabel('Required before preparing an envelope',{exact:true}).check();await page.getByLabel('Tags',{exact:true}).fill('finance')
    await page.getByLabel('Custom field 1 name',{exact:true}).scrollIntoViewIfNeeded();await capture('template-metadata')
    await page.getByRole('button',{name:'Save new version',exact:true}).click()
    await page.getByRole('button',{name:`Use ${title}`,exact:true}).click()
    await page.getByLabel('Client name',{exact:true}).fill('Finance Client');await page.getByLabel('Client email',{exact:true}).fill(`finance${width}@clients.example`)
    assert.equal(await page.getByLabel('Cost center',{exact:true}).getAttribute('required'),'')
    await page.getByLabel('Cost center',{exact:true}).fill(`Finance ${width}`);await capture('template-use')
    await page.getByRole('button',{name:'Prepare to send',exact:true}).click()
    let detail=page.getByRole('region',{name:title,exact:true});await detail.waitFor()
    await detail.getByRole('button',{name:'Edit draft',exact:true}).click()
    await page.getByLabel('Custom field 1 value',{exact:true}).waitFor();assert.equal(await page.getByLabel('Custom field 1 value',{exact:true}).inputValue(),`Finance ${width}`)
    await capture('draft-metadata');await page.getByRole('button',{name:'Save draft',exact:true}).click();await detail.waitFor()
    const close=detail.getByRole('button',{name:'Close',exact:true});await close.focus();await page.getByRole('tooltip',{name:'Close details'}).waitFor();await close.blur();await close.hover();await page.getByRole('tooltip',{name:'Close details'}).waitFor();await close.click()
    await page.locator('summary').filter({hasText:/^Folders$/}).click()
    await page.getByLabel('New envelope folder',{exact:true}).fill(folderName);await page.getByRole('button',{name:'Create envelope folder',exact:true}).click()
    await page.locator('summary').filter({hasText:`${folderName} settings`}).click()
    await page.getByLabel('Folder retention years',{exact:true}).fill('3');await page.getByRole('button',{name:'Save folder retention',exact:true}).click()
    await page.getByRole('button',{name:'Save folder retention',exact:true}).waitFor()
    await page.getByLabel('Share folder with email',{exact:true}).fill(shareEmail);await page.getByRole('button',{name:'Share folder',exact:true}).click()
    await page.getByText(shareEmail+' · view',{exact:false}).waitFor();await capture('folder-settings')
    await page.getByRole('row',{name:new RegExp(title)}).click();detail=page.getByRole('region',{name:title,exact:true})
    await detail.getByLabel('Move to folder',{exact:true}).selectOption({label:folderName});await detail.getByRole('button',{name:'Save envelope folder',exact:true}).click()
    await detail.getByRole('heading',{name:'Custom envelope fields',exact:true}).scrollIntoViewIfNeeded();await capture('filed-envelope');await detail.getByRole('button',{name:'Close',exact:true}).click()
    await page.getByLabel('Custom field name',{exact:true}).fill('Cost center');await page.getByLabel('Custom field value',{exact:true}).fill(`Finance ${width}`);await page.getByLabel('Envelope tag',{exact:true}).fill('finance')
    await page.getByRole('row',{name:new RegExp(title)}).waitFor();await page.getByText('Showing 1 of 1',{exact:true}).waitFor()
    const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Export matching envelopes',exact:true}).click();const download=await downloadPromise
    const {readFile}=await import('node:fs/promises');const csv=await readFile(await download.path(),'utf8');assert.ok(csv.includes(`Finance ${width}`)&&csv.includes('Cost center'))
    await capture('filtered-export')
    await page.getByRole('button',{name:'Templates',exact:true}).click()
    await page.getByLabel(`Select ${title} for combination`,{exact:true}).check();await page.getByLabel(`Select Companion ${width} for combination`,{exact:true}).check()
    await page.getByRole('button',{name:'Combine selected templates',exact:true}).click();await page.getByLabel('Cost center',{exact:true}).fill(`Finance ${width}`)
    await page.getByLabel('Cost center',{exact:true}).scrollIntoViewIfNeeded();await capture('combined-metadata')
    await context.close()
  }
  console.log('MANAGE-002 built management screens passed at 1440 and 390: required metadata, folders, retention, shares, scoped export, keyboard and tooltips')
  console.log('AGENT-003 built controls passed at 1440/390: explicit grant, three causes, private reply, human correction, resume and revoke')
  console.log('MANAGE-005 passed at 1440 and 390 pixels: sent, delivered, viewed and signed times match the provider events and audit trail; Remind reached only the current signer')
} catch (error) {
  await screenshots(inkwell.browser, 'manage-005-failure')
  throw error
} finally {
  await inkwell.close()
}
