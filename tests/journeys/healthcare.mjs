// COMPLY-002: an administrator enables the profile and reviews members in the built Settings screen.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startInkwellWithMail } from './mail-worker.mjs'
import { screenshots } from './worker.mjs'
import { axe } from './a11y.mjs'

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
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/api/inkwell') && response.ok()), panel.getByRole('checkbox', { name: 'Enable healthcare profile' }).check()])
    await panel.getByRole('button', { name: 'Review member access' }).click()
    const review = panel.getByRole('region', { name: 'Member access review', exact: true })
    await review.getByText('records@harbour.example', { exact: true }).waitFor()
    await review.getByText('No recorded access', { exact: true }).waitFor()
    await review.getByText('Harbour Owner', { exact: true }).waitFor()
    assert.equal(await review.locator('time').count(), 1, 'COMPLY-002: the app page records owner access while the invited member has none')
    assert.ok(await review.locator('time').getAttribute('datetime'))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no sideways scroll`)
    await axe(page, `COMPLY-002 healthcare review ${width}`)
    await panel.screenshot({ path: join(evidence, `comply-002-review-${width}.png`) })
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/api/inkwell') && response.ok()), panel.getByRole('checkbox', { name: 'Enable healthcare profile' }).uncheck()])
    assert.equal((await app.call('/api/inkwell/compliance/access-review', { cookie: app.owner })).value.enabled, false)
    await panel.screenshot({ path: join(evidence, `comply-002-disabled-${width}.png`) })
    await panel.getByRole('link', { name: 'Healthcare shared-responsibility guide' }).click()
    await page.getByRole('heading', { name: 'Healthcare shared responsibility', exact: true }).waitFor()
    await page.getByRole('heading', { name: "The buyer's responsibility", exact: true }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await axe(page, `COMPLY-002 healthcare guide ${width}`)
    await page.screenshot({ path: join(evidence, `comply-002-guide-${width}.png`), fullPage: true })
    await context.close()
  }
  console.log('COMPLY-002 profile enabled, access review, disabled state and shared responsibility guide passed at 1440 and 390')
} catch (error) { await screenshots(app.browser, 'healthcare'); throw error }
finally { await app.close() }
