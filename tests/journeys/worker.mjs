// The emitted Worker on its own migrated local store, with a bootstrapped owner, for browser journeys. No mail provider:
// the sender receives each private signing link and code (SEND-001's suppressed-mail invitations).
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

export async function startInkwell() {
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const origin = `http://127.0.0.1:${port}`, setupToken = randomBytes(32).toString('hex')
  const persist = await mkdtemp(join(tmpdir(), 'inkwell-journey-'))
  await writeFile(join(persist, 'journey.env'), `AUTH_ORIGIN=${origin}\nAUTH_LOCAL=true\nOWNER_EMAIL=owner@harbour.example\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nSETUP_TOKEN=${setupToken}\n`)
  const wrangler = ['node_modules/wrangler/bin/wrangler.js'], env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }
  execFileSync(process.execPath, [...wrangler, 'd1', 'migrations', 'apply', 'foundation', '--local', '--persist-to', persist, '--config', 'dist/server/wrangler.json'], { stdio: 'pipe', env })
  const worker = spawn(process.execPath, [...wrangler, 'dev', '--inspector-port', '0', '--local', '--persist-to', persist, '--env-file', join(persist, 'journey.env'), '--ip', '127.0.0.1', '--config', 'dist/server/wrangler.json', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'], env })
  let output = ''
  worker.stdout.on('data', chunk => { output += chunk })
  worker.stderr.on('data', chunk => { output += chunk })
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
  async function close() {
    await browser.close()
    worker.kill('SIGTERM')
    await new Promise(resolve => worker.exitCode !== null ? resolve() : worker.once('exit', resolve))
    await rm(persist, { recursive: true, force: true })
  }
  try {
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
      const response = await fetch(`${origin}/api/inkwell/commands`, { method: 'POST', headers: { origin, cookie: owner, 'content-type': 'application/json' }, body: JSON.stringify({ command: name, input, commandId: crypto.randomUUID() }) })
      const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value.result
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
