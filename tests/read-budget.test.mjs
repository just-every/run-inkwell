import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

// The hourly pass, the minute cron and the dashboard once scanned every envelope, so what they read grew with the history
// kept (a month of 15 a day was 3.6k rows an hour, more with delivery events on file). They now read by index, and a
// small installation on D1's free allowance (5M rows read a day, shared) stays far from it however long it runs.
let h
before(async () => { h = await harness({ mailProvider: 'resend' }) })
after(async () => { await h.close() })

const day = 86_400_000, now = Date.UTC(2026, 10, 20, 15, 17)
const envelope = (i, open, createdAt) => ({ id: `hist-${i}`, version: 1, title: `History ${i}`, filename: 'a.pdf', status: open ? 'awaiting_signature' : i % 9 ? 'completed' : 'declined', createdAt, createdBy: 'owner', expiresAt: new Date(now + (open ? 20 : -5) * day).toISOString(), signers: [{ name: 'A', email: 'a@harbour.example' }, { name: 'B', email: 'b@harbour.example' }], fields: [], pageSizes: [{ width: 595, height: 842 }], originalSha256: '0'.repeat(64), events: Array.from({ length: 14 }, (_, n) => ({ action: n === 13 && !open ? 'envelope.completed' : 'envelope.event', at: createdAt, actor: 'owner', detail: {}, previousHash: '', hash: '1'.repeat(64) })) })
async function addHistory(from, count, openCount) {
  const statements = []
  for (let i = from; i < from + count; i++) {
    const createdAt = new Date(now - (i < from + openCount ? 1 : 1 + Math.floor((i - from) / 15)) * day).toISOString(), e = envelope(i, i < from + openCount, createdAt)
    statements.push(h.db.prepare('INSERT INTO iw_envelopes(id,version,data) VALUES(?,1,?)').bind(e.id, JSON.stringify(e)))
    for (let m = 0; m < 3; m++) {
      const mail = `hist-mail-${i}-${m}`, provider = `pm-${i}-${m}`
      statements.push(h.db.prepare("INSERT INTO iw_mail(id,envelope_id,signer,kind,recipient,subject,body,state,created_at,provider,provider_message_id,sent_at) VALUES(?,?,?,?,?,'s','',?,?,'resend',?,?)").bind(mail, e.id, m % 2, m === 2 ? 'notice' : 'invitation', 'a@harbour.example', 'sent', createdAt, provider, createdAt))
      for (const type of ['sent', 'delivered', 'opened']) statements.push(h.db.prepare("INSERT INTO rer_mail_event_receipts(provider,tenant_id,event_namespace,event_id,fingerprint,event_json,commit_token,ordinal) VALUES('resend','inkwell','resend-webhook',?,'f',?,'c',0)").bind(`${mail}-${type}`, JSON.stringify({ provider: 'resend', providerMessageId: provider, deliveryId: mail, recipients: ['a@harbour.example'], status: type === 'opened' ? 'delivered' : type, type: 'email.' + type, occurredAt: Date.parse(createdAt) })))
    }
  }
  for (let i = 0; i < statements.length; i += 90) await h.db.batch(statements.slice(i, i + 90))
}
const reads = async (op, extra = '') => { const r = await h.mf.dispatchFetch(`${h.origin}/__d1-reads?op=${op}${extra}`, { headers: { host: new URL(h.origin).host } }); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).rows }

test('SCALE: the hourly pass, the minute cron and the dashboard read rows by index, so what they read does not grow with the envelopes kept', async () => {
  await h.db.prepare("INSERT INTO iw_settings(key,value,updated_at,updated_by) VALUES('retention_years','7','2026-01-01T00:00:00Z','owner')").run()
  await addHistory(0, 450, 15)
  const month = { hourly: await reads('hourly', `&at=${now}`), minute: await reads('minute'), dashboard: await reads('dashboard') }
  await addHistory(450, 450, 0)
  const twoMonths = { hourly: await reads('hourly', `&at=${now}`), minute: await reads('minute'), dashboard: await reads('dashboard') }
  // A scan read about 8 rows an envelope (3.6k an hour at 450); the ceilings are far above what an indexed pass reads.
  assert.ok(month.hourly < 1500 && twoMonths.hourly < 1500, `the hourly pass read ${month.hourly} rows with 450 envelopes and ${twoMonths.hourly} with 900`)
  assert.ok(twoMonths.hourly <= month.hourly + 100, 'the hourly pass reads the same however many envelopes are kept')
  assert.ok(month.minute < 20 && twoMonths.minute < 20, 'the minute cron reads almost nothing')
  assert.ok(twoMonths.dashboard < 3 * 900 + 400, `the dashboard read ${twoMonths.dashboard} rows for 900 envelopes`)
})
