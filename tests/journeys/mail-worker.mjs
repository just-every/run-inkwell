// The emitted Worker and its static assets on Miniflare with Resend configured, for browser journeys that need mail and
// provider delivery events (DELIV-001, MANAGE-005). The paid edge is faked: every message to api.resend.com is captured
// and answered with a fresh message id; delivery webhooks are signed with the installation's MAIL_WEBHOOK_KEY.
import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'
import { chromium } from '@playwright/test'

export async function startInkwellWithMail({ inbound = false } = {}) {
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const origin = `http://127.0.0.1:${port}`, setupToken = randomBytes(32).toString('hex'), secret = randomBytes(24)
  const inboundMessages = new Map(), inboundSecret = Buffer.from('synthetic-inkwell-4').toString('base64')
  const persist = await mkdtemp(join(tmpdir(), 'inkwell-mail-journey-')), captured = []
  // The entry module first; Miniflare loads the emitted chunks it imports from the same folder.
  const modules = (await readdir('dist/server', { recursive: true })).filter(file => /\.m?js$/.test(file)).sort((a, b) => (b === 'index.js') - (a === 'index.js')).map(file => ({ type: 'ESModule', path: 'dist/server/' + file }))
  const mf = new Miniflare(convertV4MiniflareOptions({
    host: '127.0.0.1', port, modules, modulesRoot: 'dist/server', assets: { directory: 'dist/client', binding: 'ASSETS', routerConfig: { has_user_worker: true } },
    compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'inkwell' }, d1Persist: persist,
    bindings: { AUTH_ORIGIN: origin, AUTH_LOCAL: 'true', OWNER_EMAIL: 'owner@harbour.example', SESSION_SECRET: randomBytes(32).toString('hex'), SETUP_TOKEN: setupToken, MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'journey-mail-edge', MAIL_FROM: 'Inkwell <inkwell@harbour.example>', MAIL_WEBHOOK_KEY: 'whsec_' + secret.toString('base64'), ...(inbound ? { MAIL_INBOUND_DOMAIN: 'replies.harbour.example', MAIL_INBOUND_SECRET: inboundSecret, MAIL_INBOUND_API_KEY: 'synthetic-inkwell-5' } : {}) },
    outboundService: async request => { if (new URL(request.url).hostname !== 'api.resend.com') throw new Error('Unexpected journey network request'); if (request.method === 'GET') { const message = inboundMessages.get(new URL(request.url).pathname.split('/')[3]); return message ? Response.json(message) : new Response(null, { status: 404 }) } const id = crypto.randomUUID(); captured.push({ ...await request.json(), id }); return Response.json({ id }) },
  }))
  let browser
  async function close() { await browser?.close(); await mf.dispose(); await rm(persist, { recursive: true, force: true }) }
  try {
    await mf.ready
    const db = await mf.getD1Database('DB')
    for (const file of (await readdir('migrations/core')).filter(f => f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile('migrations/core/' + file, 'utf8')).map(sql => db.prepare(sql)))
    browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
    const call = async (path, { body, cookie = '', headers = {}, status = 200 } = {}) => {
      const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { origin, cookie, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
      const text = await response.text(); let value; try { value = JSON.parse(text) } catch { value = text }
      assert.equal(response.status, status, `${path.replace(/\/sign\/[^/]+/, '/sign/[private]')}: ${text.slice(0, 300)}`)
      return { value, cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const owner = (await call('/auth/bootstrap', { body: { token: setupToken, displayName: 'Harbour Owner' }, status: 303 })).cookie
    const setup = await fetch(`${origin}/setup`, { method: 'POST', redirect: 'manual', headers: { origin, cookie: owner, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ displayName: 'Harbour Owner', confirm: 'yes' }) })
    assert.ok([200, 303].includes(setup.status), `setup: ${setup.status}`)
    const command = async (name, input) => (await call('/api/inkwell/commands', { body: { command: name, input, commandId: crypto.randomUUID() }, cookie: owner })).value.result
    const mail = (email, subject) => [...captured].reverse().find(m => m.to.includes(email) && m.subject.startsWith(subject))
    // A Resend webhook for one captured message, signed as Resend (Svix) signs it, at the provider's event time.
    const deliver = async (message, type, at) => {
      const body = JSON.stringify({ type, created_at: new Date(at).toISOString(), data: { email_id: message.id, to: message.to, subject: message.subject } }), id = 'msg_' + randomBytes(8).toString('hex'), timestamp = String(Math.floor(Date.now() / 1000))
      return call('/api/inkwell/mail/events', { body, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64') } })
    }
    // The signer's side through their invitation link: verify the emailed code and agree to electronic records.
    const verify = async email => {
      const path = '/api/sign/' + new URL(mail(email, 'Please sign:').text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
      await call(path + '/code', { body: {} })
      const cookie = (await call(path + '/verify', { body: { code: mail(email, 'Your Inkwell verification code').text.match(/\b\d{6}\b/)[0] } })).cookie
      await call(path + '/disclosure', { body: { version: (await call(path, { cookie })).value.disclosure.version, agree: true }, cookie })
      return { path, cookie }
    }
    const ownerCookie = () => ({ name: owner.slice(0, owner.indexOf('=')), value: owner.slice(owner.indexOf('=') + 1), url: origin })
    const scheduled = async at => { const result = await (await mf.getWorker()).scheduled({ scheduledTime: new Date(at), cron: '17 * * * *' }); assert.equal(result.outcome, 'ok') }
    const reply = async (invitation, from, text, autoSubmitted = '') => {
      const messageId = crypto.randomUUID(), eventId = crypto.randomUUID(), timestamp = String(Math.floor(Date.now() / 1000))
      inboundMessages.set(messageId, { id: messageId, from, to: [invitation.reply_to], subject: 'Re: Signing request', text, headers: { 'Auto-Submitted': autoSubmitted }, attachments: [], message_id: '<' + messageId + '@clients.example>' })
      const body = JSON.stringify({ type: 'email.received', data: { email_id: messageId } })
      return call('/api/inkwell/mail/replies', { body, headers: { 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + createHmac('sha256', Buffer.from(inboundSecret, 'base64')).update(`${eventId}.${timestamp}.${body}`).digest('base64') } })
    }
    return { origin, owner, ownerCookie, reply, call, command, mail, sent: () => [...captured], deliver, verify, scheduled, browser, close }
  } catch (error) { await close(); throw error }
}
