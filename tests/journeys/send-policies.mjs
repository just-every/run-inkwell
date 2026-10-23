// ADMIN-004: Settings narrows a source to selected templates, persists it, enforces it on real sends,
// and widens it back to all. Built Worker; only the paid mail edge is faked by mail-worker.mjs.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const app = await startInkwellWithMail()
const proof = process.env.INKWELL_SEND_POLICIES_PROOF_DIR ?? join(tmpdir(), 'inkwell-send-policies')
const current = async source => (await app.call('/api/inkwell/send-policies', { cookie: app.owner })).value.policies.find(policy => policy.source === source)
async function capture(page, row, width, state) {
  await row.scrollIntoViewIfNeeded()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state} at ${width}: no sideways scroll`)
  await axe(page, `ADMIN-004 ${state} ${width}`)
  await page.screenshot({ path: join(proof, `${width}-${state}.png`), fullPage: false })
}
async function save(page, row) {
  const answered = page.waitForResponse(response => response.url().endsWith('/api/inkwell/commands') && response.request().postDataJSON()?.command === 'account.send_policy')
  await tabTo(page, row.getByRole('button', { name: /^Save / }))
  await page.keyboard.press('Enter')
  assert.ok((await answered).ok(), 'the policy save succeeds through its command door')
  await expect(row.getByRole('button', { name: /^Save / })).toBeDisabled()
}
async function prepare(template, email) {
  return app.command('template.use', { id: template.id, recipients: [{ name: 'Mara Quinn', email }] })
}
try {
  await mkdir(proof, { recursive: true })
  const pdf = await PDFDocument.create()
  pdf.addPage([612, 792]).drawText('Harbour Studio - Client services agreement', { x: 50, y: 730, size: 16 })
  const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
  const templates = []
  for (const title of ['Client services agreement', 'Supplier confidentiality agreement']) {
    const saved = await app.command('template.save', { title, filename: 'agreement.pdf', pdfBase64, roles: [{ role: 'Client', order: 1 }], fields: [{ id: 'client-signature', label: 'Client signature', type: 'signature', signer: 0, page: 0, x: .1, y: .7, width: .5, height: .05 }] })
    templates.push({ id: saved.id, title })
  }
  for (const width of [1440, 390]) {
    // Start the dormant web form source in its unrestricted off state, through the same public command.
    await app.command('account.send_policy', { source: 'web_form', mode: 'off', templates: null, expectedVersion: (await current('web_form')).version })
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } })
    await context.addCookies([app.ownerCookie()])
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    await page.goto(app.origin + '/app')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const panel = page.getByRole('region', { name: 'Send policies', exact: true })
    const row = panel.getByRole('form', { name: 'Template sends', exact: true })
    const all = row.getByRole('checkbox', { name: 'Use all templates', exact: true })
    await expect(all).toBeChecked()
    assert.equal(await panel.getByRole('form', { name: 'Ad hoc sends', exact: true }).getByRole('group', { name: 'Allowed templates', exact: true }).count(), 0, 'ad hoc sends have no template selection')
    const before = await current('template')
    await row.getByRole('combobox').focus()
    await tabTo(page, all); await page.keyboard.press('Space')
    await tabTo(page, row.getByRole('checkbox', { name: templates[0].title, exact: true })); await page.keyboard.press('Space')
    await expect(row.getByRole('checkbox', { name: templates[1].title, exact: true })).not.toBeChecked()
    const reason = `Limit template sends to client agreements during supplier review (${width})`
    await row.getByLabel('Reason (optional)', { exact: true }).fill(reason)
    await capture(page, row, width, 'selected-before-save')
    await save(page, row)
    assert.ok((await current('template')).version > before.version, 'saving creates a newer policy version')
    assert.equal((await current('template')).reason, reason, 'the entered review reason is retained')
    // Leave Settings and reload before reopening, so local component state cannot stand in for persistence.
    await page.getByRole('button', { name: 'Templates', exact: true }).click()
    await page.reload()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(all).not.toBeChecked()
    await expect(row.getByRole('checkbox', { name: templates[0].title, exact: true })).toBeChecked()
    await expect(row.getByRole('checkbox', { name: templates[1].title, exact: true })).not.toBeChecked()
    await capture(page, row, width, 'selected-persisted')

    const blockedEmail = `supplier.${width}@clients.example`, allowedEmail = `client.${width}@clients.example`
    const blocked = await prepare(templates[1], blockedEmail)
    await app.call('/api/inkwell/commands', { cookie: app.owner, body: { command: 'envelope.approve', commandId: crypto.randomUUID(), input: { id: blocked.id, eligible: true } }, status: 403 })
    assert.equal(app.mail(blockedEmail, 'Please sign:'), undefined, 'an excluded template cannot invite its recipient')
    const allowed = await prepare(templates[0], allowedEmail)
    await app.command('envelope.approve', { id: allowed.id, eligible: true })
    assert.ok(app.mail(allowedEmail, 'Please sign:'), 'the selected template invites its recipient')

    // Widen using the visible control and prove the formerly blocked send can now invite.
    await row.getByRole('combobox').focus()
    await tabTo(page, all); await page.keyboard.press('Space')
    await save(page, row)
    await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(all).toBeChecked()
    await app.command('envelope.approve', { id: blocked.id, eligible: true })
    assert.ok(app.mail(blockedEmail, 'Please sign:'), 'widening to all permits the previously excluded template')
    await capture(page, row, width, 'all-templates-restored')

    // Enabling a web form needs an explicit, nonempty list; both invalid choices stay unsaved.
    const web = panel.getByRole('form', { name: 'Web form sends', exact: true })
    const webBefore = await current('web_form')
    await web.getByRole('combobox').selectOption('person')
    await web.getByRole('button', { name: /^Save / }).click()
    await expect(web.getByRole('alert')).toBeVisible()
    assert.equal((await current('web_form')).version, webBefore.version, 'all templates cannot enable a web form')
    await web.getByRole('checkbox', { name: 'Use all templates', exact: true }).uncheck()
    await web.getByRole('button', { name: /^Save / }).click()
    await expect(web.getByRole('alert')).toBeVisible()
    assert.equal((await current('web_form')).version, webBefore.version, 'an empty list cannot enable a web form')
    await expect(web.getByRole('checkbox',{name:'Use all templates',exact:true})).toBeFocused()
    await capture(page, web, width, 'web-form-needs-template')
    await tabTo(page, web.getByRole('checkbox', { name: templates[0].title, exact: true })); await page.keyboard.press('Space')
    await save(page, web)
    await expect(web.getByRole('alert')).toHaveCount(0)
    assert.ok((await current('web_form')).version > webBefore.version, 'a nonempty selected list allows saving the enabled web form')
    await capture(page, web, width, 'web-form-selected')
    // ADMIN-004 A4: select a member-group scope in Settings and prove it narrows this principal's next send.
    const principal=(await app.call('/api/inkwell',{cookie:app.owner})).value.actor.id
    const scope=(await app.call('/api/inkwell/send-policy-scopes',{cookie:app.owner,body:{kind:'group',name:`Field ${width}`,members:[principal],expectedVersion:0,commandId:crypto.randomUUID()}})).value.scope
    await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click()
    const selector=panel.getByLabel('Policy scope',{exact:true})
    await selector.selectOption(`group:${scope.id}`)
    const adHoc=panel.getByRole('form',{name:'Ad hoc sends',exact:true})
    await adHoc.getByRole('combobox').selectOption('off');await save(page,adHoc)
    await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await selector.selectOption(`group:${scope.id}`)
    await expect(adHoc.getByRole('combobox')).toHaveValue('off');await capture(page,adHoc,width,'group-policy-off')
    const email=`group.${width}@clients.example`
    const envelope=(await app.command('envelope.prepare',{title:`Field group letter ${width}`,filename:'group.pdf',pdfBase64,signers:[{name:'Mara Quinn',email}],fields:[{id:'group-sign',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.3,width:.4,height:.05}]})).id
    await app.call('/api/inkwell/commands',{cookie:app.owner,body:{command:'envelope.approve',commandId:crypto.randomUUID(),input:{id:envelope,eligible:true}},status:403})
    assert.equal(app.mail(email,'Please sign:'),undefined)
    await adHoc.getByRole('combobox').selectOption('person');await save(page,adHoc)
    await app.command('envelope.approve',{id:envelope,eligible:true});assert.ok(app.mail(email,'Please sign:'))
    const record=(await app.call('/api/inkwell/envelopes/'+envelope,{cookie:app.owner})).value.envelope
    assert.ok(record.events.findLast(e=>e.action==='envelope.approved').detail.sendPolicy.policies.some(p=>p.scopeId===scope.id&&p.version===2))
    await capture(page,adHoc,width,'group-policy-person')
    await app.call('/api/inkwell/send-policy-scopes',{cookie:app.owner,body:{id:scope.id,kind:'group',name:scope.name,members:[],expectedVersion:scope.version,commandId:crypto.randomUUID()}})
    await context.close()
  }
  console.log('ADMIN-004: keyboard template selection, reason, persisted Settings, excluded/allowed sends, widening to all and web form validation passed at 1440/390')
} catch (error) { await screenshots(app.browser, 'send-policies-failure'); throw error }
finally { await app.close() }
