// The emitted Worker on its own migrated local store, with a bootstrapped owner, for browser journeys. No mail provider:
// the sender receives each private signing link and code (SEND-001's suppressed-mail invitations).
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { reserveWorkerPort } from '../worker-port.mjs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

export async function startInkwell() {
  const { port, origin, release } = await reserveWorkerPort()
  const setupToken = randomBytes(32).toString('hex')
  const persist = await mkdtemp(join(tmpdir(), 'inkwell-journey-'))
  let worker, browser
  async function close() {
    await browser?.close()
    if (worker) {
      worker.kill('SIGTERM')
      await new Promise(resolve => worker.exitCode !== null ? resolve() : worker.once('exit', resolve))
    }
    await release()
    await rm(persist, { recursive: true, force: true })
    // wrangler dev keeps its scratch (.wrangler/tmp) beside the config it runs, which here is the emitted Worker; the artifact producer refuses that folder in dist/server, so leave the build output as rer build wrote it.
    await rm('dist/server/.wrangler', { recursive: true, force: true })
  }
  try {
    await writeFile(join(persist, 'journey.env'), `AUTH_ORIGIN=${origin}\nAUTH_LOCAL=true\nOWNER_EMAIL=owner@harbour.example\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nSETUP_TOKEN=${setupToken}\n`)
    const wrangler = ['node_modules/wrangler/bin/wrangler.js'], env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }
    execFileSync(process.execPath, [...wrangler, 'd1', 'migrations', 'apply', 'foundation', '--local', '--persist-to', persist, '--config', 'dist/server/wrangler.json'], { stdio: 'inherit', env })
    worker = spawn(process.execPath, [...wrangler, 'dev', '--inspector-port', '0', '--local', '--persist-to', persist, '--env-file', join(persist, 'journey.env'), '--ip', '127.0.0.1', '--config', 'dist/server/wrangler.json', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'], env })
    let output = ''
    worker.stdout.on('data', chunk => { output += chunk })
    worker.stderr.on('data', chunk => { output += chunk })
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: [...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? ['--no-sandbox'] : []), '--use-mock-keychain', '--password-store=basic'] })
    for (let attempt = 0; attempt < 120; attempt++) {
      if (worker.exitCode !== null) throw new Error(output)
      try { if ((await fetch(`${origin}/health`)).ok) break } catch {}
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    const bootstrap = await fetch(`${origin}/auth/bootstrap`, { method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: setupToken, displayName: 'Harbour Owner' }) })
    assert.equal(bootstrap.status, 303, output)
    const owner = bootstrap.headers.get('set-cookie').split(';')[0]
    // The owner confirms first-run setup (the same form the app shows) before opening operator screens.
    const setup = await fetch(`${origin}/setup`, { method: 'POST', redirect: 'manual', headers: { origin, cookie: owner, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ displayName: 'Harbour Owner', confirm: 'yes' }) })
    assert.ok([200, 303].includes(setup.status), `setup: ${setup.status}`)
    const command = async (name, input) => {
      // A local workerd connection can close after commit. Reuse the command receipt
      // on one transport retry; a new ID could duplicate a preparation or invitation.
      const body = JSON.stringify({ command: name, input, commandId: crypto.randomUUID() })
      for (let attempt = 0; attempt < 2; attempt++) {
        let response
        try {
          response = await fetch(`${origin}/api/inkwell/commands`, { method: 'POST', headers: { origin, cookie: owner, 'content-type': 'application/json' }, body })
        } catch (error) {
          if (attempt === 0 && ['UND_ERR_SOCKET', 'ECONNRESET'].includes(error.cause?.code)) continue
          throw error
        }
        const text = await response.text()
        if (attempt === 0 && response.status === 500 && text.trim() === 'Error: Network connection lost.') continue
        assert.equal(response.status, 200, `command ${name}: HTTP ${response.status}`)
        const value = JSON.parse(text)
        return value.result
      }
    }
    // A browser context signed in as the owner, for operator screens.
    const ownerCookie = () => ({ name: owner.slice(0, owner.indexOf('=')), value: owner.slice(owner.indexOf('=') + 1), url: origin })
    return { origin, owner, ownerCookie, command, browser, close }
  } catch (error) { await close(); throw error }
}

/** On failure, keep a screenshot of every open page in the temp folder for the CI log's reader. */
export async function screenshots(browser, name) {
  for (const context of browser.contexts()) for (const [i, page] of context.pages().entries()) await page.screenshot({ path: join(tmpdir(), `${name}-${i}.png`) }).catch(() => {})
}
