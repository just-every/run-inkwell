// SIGNX-003's accessibility checks, shared by every journey that joins its scan and keyboard-only pass.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { expect } from '@playwright/test'

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js')

/** axe-core's WCAG 2.0, 2.1 and 2.2 A and AA rules: no serious or critical violation. Returns the minor count. */
export async function axe(page, label) {
  await page.addScriptTag({ path: axePath })
  const { violations } = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }))
  const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  assert.deepEqual(serious.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), [], `${label}: no serious or critical WCAG violation`)
  return violations.length
}
/** Press Tab (or Shift+Tab with `backwards`) until `target` has focus (at most 80 presses), checking that each control
 * reached shows its focus. */
export async function tabTo(page, target, { backwards = false } = {}) {
  await target.waitFor({ state: 'visible' })
  // Async loads can show a control before it enters the keyboard tab order.
  await expect(target).toBeEnabled()
  for (let presses = 0; presses < 80; presses++) {
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab')
    // Focus styles fade in (a 0.15 s transition): read them at their end state. A date field's own calendar button is
    // the one control whose focus ring the browser draws inside the field (its host then does not match :focus).
    const focus = await page.evaluate(() => { const el = document.activeElement; el?.getAnimations().forEach(animation => animation.finish()); const style = el && getComputedStyle(el); return el && el !== document.body ? { tag: el.tagName, text: el.outerHTML.slice(0, 160), visible: (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none' || (el.type === 'date' && !el.matches(':focus')) } : null })
    if (focus) assert.ok(focus.visible, `visible focus on ${focus.tag} "${focus.text}"`)
    if (await target.evaluate(el => el === document.activeElement).catch(() => false)) return
  }
  throw new Error(`Tab never reached ${target}`)
}
