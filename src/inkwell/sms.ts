import { usageMonth, admitSmsUsage, smsReceiptCharge, cancelCappedSms } from './usage'
import { dayOfWeek, localDate, localHour } from './followup-time'
import { id, insist, now, Refusal, type Envelope, type Env } from './model'

export interface SmsBindings { TWILIO_ACCOUNT_SID?: string; TWILIO_AUTH_TOKEN?: string; TWILIO_FROM?: string }
type SmsKind = 'code' | 'invitation' | 'followup'

export function smsReady(env: Env): boolean {
  const v = env as Env & SmsBindings
  return Boolean(v.TWILIO_ACCOUNT_SID && /^[A-Za-z0-9_-]{1,100}$/.test(v.TWILIO_ACCOUNT_SID) && v.TWILIO_AUTH_TOKEN && /^[+][1-9]\d{7,14}$/.test(v.TWILIO_FROM ?? ''))
}

/** NANP syntax is validated here; actual mobile ownership is established by the SMS code. */
export function usMobile(value: unknown): string {
  insist(typeof value === 'string' && value.length <= 40 && /^[+\d ().-]+$/.test(value), 'Enter a US mobile number.')
  const digits = value.replace(/\D/g, ''), local = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
  insist(/^[2-9]\d{2}[2-9]\d{6}$/.test(local) && (!value.trim().startsWith('+') || digits.length === 11 && digits[0] === '1'), 'Enter a US mobile number with country code +1.')
  return '+1' + local
}
export const maskedMobile = (phone: string): string => '+1 (***) ***-' + usMobile(phone).slice(-4)

/** Shared preparation/template/correction normalization; no phone secret is stored in templates. */
export function smsIdentity(value: { sms?: unknown; phone?: unknown; linkOnly?: unknown; inPerson?: unknown; group?: unknown }, previous?: { sms?: boolean; phone?: string }) {
  const sms = value.sms === undefined ? previous?.sms === true : value.sms
  insist(typeof sms === 'boolean', 'Choose whether this recipient verifies an SMS code.')
  const phone = value.phone === undefined ? previous?.phone : value.phone === '' ? undefined : usMobile(value.phone)
  insist(!sms || phone, 'Enter a US mobile number for SMS verification.')
  insist(!sms || !value.linkOnly, 'Choose SMS code or link only, not both.')
  insist(!(sms || phone) || (!value.inPerson && value.group === undefined), 'SMS numbers belong to individual remote recipients.')
  return { ...(phone ? { phone } : {}), ...(sms ? { sms: true } : {}) }
}
export function smsInvitation(env: Env, e: Envelope, signer: number, token: string) {
  insist(e.signers[signer]?.phone, 'Add this recipient’s US mobile number before resending by SMS.', 409)
  return smsWrite(env, e, signer, e.signers[signer].phone!, 'invitation', `Inkwell: ${e.signers[signer].name}, review ${e.title}: ${new URL('/sign/' + token, env.AUTH_ORIGIN).href}\nThis signing link is private and expires ${e.expiresAt}.`)
}

/** Insert after the recipient's link/code writes in the same guarded transaction. Follow-up producers must use the active explicit grant in this transaction; its version and the
 * committed envelope version are captured here and rechecked at the network claim. */
export function smsWrite(env: Env, e: Envelope, signer: number, phone: string, kind: SmsKind, body: string): D1PreparedStatement {
  insist(smsReady(env), 'SMS delivery is not configured. Ask the owner to configure Twilio.', 503)
  const person = e.signers[signer]
  insist(person && !person.group && !person.inPerson, 'SMS delivery requires an individual remote recipient.', 409)
  insist(typeof body === 'string' && body.length > 0 && body.length <= 1600, 'SMS messages must contain 1–1600 characters.')
  return env.DB.prepare(`INSERT INTO iw_sms(id,envelope_id,signer,kind,recipient,recipient_email,token_hash,code_generation,body,created_at,followup_version,followup_envelope_version)
    VALUES(?,?,?,?,?,?,(SELECT token_hash FROM iw_signers WHERE envelope_id=? AND signer=?),
    (SELECT code_generation FROM iw_signers WHERE envelope_id=? AND signer=?),?,?,
    CASE WHEN ?='followup' THEN (SELECT MAX(version) FROM iw_followup_grants WHERE envelope_id=? AND state='active') END,
    CASE WHEN ?='followup' THEN (SELECT version FROM iw_envelopes WHERE id=?) END)`)
    .bind(id(), e.id, signer, kind, usMobile(phone), person.email, e.id, signer, e.id, signer, body, now(), kind, e.id, kind, e.id)
}

/** Read a small provider response without retaining/logging its potentially private payload. */
async function providerResult(response: Response): Promise<{ sid: string; status: string; charge: number | null }> {
  const reader = response.body?.getReader()
  insist(reader, 'SMS provider returned no receipt.', 503)
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break
      size += part.value.byteLength
      if (size > 16 * 1024) { await reader.cancel(); throw new Error('SMS receipt too large.') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  const result = JSON.parse(new TextDecoder().decode(bytes)) as { sid?: unknown; status?: unknown; price?: unknown; price_unit?: unknown }
  insist(typeof result.sid === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(result.sid), 'SMS provider returned an invalid receipt.', 503)
  insist(typeof result.status === 'string' && ['accepted', 'queued', 'sending', 'sent', 'delivered', 'failed', 'undelivered'].includes(result.status), 'SMS provider returned an invalid status.', 503)
  return { sid: result.sid, status: result.status, charge: smsReceiptCharge(result.price, result.price_unit) }
}

/** One durable claim, one network attempt. A crash in sending stays claimed; an uncertain response never retries.
 * Fixed Twilio Messages API: https://www.twilio.com/docs/messaging/api/message-resource . */
export async function dispatchSms(env: Env, envelopeId?: string): Promise<void> {
  const jobs = (await env.DB.prepare(`SELECT id FROM iw_sms WHERE state='pending' ${envelopeId ? 'AND envelope_id=?' : ''} ORDER BY created_at LIMIT 100`)
    .bind(...(envelopeId ? [envelopeId] : [])).all<{ id: string }>()).results
  if (!jobs.length) return
  insist(smsReady(env), 'SMS delivery is not configured. Ask the owner to configure Twilio.', 503)
  const settings = env as Env & SmsBindings
  for (const job of jobs) {
    await admitSmsUsage(env)
    let claimed: { id: string; recipient: string; body: string } | null
    try { claimed = await env.DB.prepare(`UPDATE iw_sms SET state='sending',usage_month=? WHERE id=? AND state='pending'
      AND EXISTS(SELECT 1 FROM iw_envelopes e JOIN iw_signers s ON s.envelope_id=e.id AND s.signer=iw_sms.signer
        WHERE e.id=iw_sms.envelope_id AND s.token_hash=iw_sms.token_hash
        AND (iw_sms.kind!='code' OR s.code_generation=iw_sms.code_generation AND s.code_expires>?)
        AND json_extract(e.data,'$.status')='awaiting_signature' AND json_extract(e.data,'$.expiresAt')>?
        AND json_extract(e.data,'$.signers['||iw_sms.signer||'].phone')=iw_sms.recipient
        AND json_extract(e.data,'$.signers['||iw_sms.signer||'].email')=iw_sms.recipient_email
        AND COALESCE(json_extract(e.data,'$.signers['||iw_sms.signer||'].inPerson'),0)!=1
        AND EXISTS(SELECT 1 FROM json_each(e.data,'$.signers') p WHERE p.key=iw_sms.signer
          AND ((json_extract(p.value,'$.signedAt') IS NULL AND json_extract(p.value,'$.completedAt') IS NULL) OR json_extract(p.value,'$.witnessReturnRequired')=1)
          AND (json_extract(p.value,'$.includeWhen') IS NULL OR json_extract(p.value,'$.routeResult.state')='included')
          AND json_extract(p.value,'$.removedAt') IS NULL AND COALESCE(json_extract(p.value,'$.routeResult.state'),'')!='skipped'
          AND COALESCE(json_extract(p.value,'$.order'),p.key+1)=(SELECT MIN(COALESCE(json_extract(q.value,'$.order'),q.key+1))
            FROM json_each(e.data,'$.signers') q WHERE ((json_extract(q.value,'$.signedAt') IS NULL
            AND json_extract(q.value,'$.completedAt') IS NULL) OR json_extract(q.value,'$.witnessReturnRequired')=1) AND json_extract(q.value,'$.removedAt') IS NULL
            AND COALESCE(json_extract(q.value,'$.routeResult.state'),'')!='skipped'))
        AND (iw_sms.kind!='followup' OR EXISTS(SELECT 1 FROM iw_followup_grants g JOIN oa_operators o ON o.id=g.member_id
          WHERE g.envelope_id=e.id AND g.version=iw_sms.followup_version AND g.state='active'
          AND EXISTS(SELECT 1 FROM json_each(g.data,'$.channels') WHERE value='sms')
          AND json_extract(g.data,'$.smsRecipients."'||iw_sms.signer||'"')=iw_sms.recipient
          AND EXISTS(SELECT 1 FROM json_each(g.data,'$.days') WHERE value=?)
          AND json_extract(g.data,'$.startHour')<=? AND json_extract(g.data,'$.endHour')>?
          AND e.version=iw_sms.followup_envelope_version AND o.status='active' AND o.version=g.member_version
          AND (o.role IN ('owner','admin') OR (o.role='member'
            AND COALESCE((SELECT role FROM iw_member_roles WHERE operator_id=o.id),'viewer')='sender'
            AND (json_extract(e.data,'$.createdBy')=o.id OR EXISTS(SELECT 1 FROM iw_effective_shares WHERE envelope_id=e.id AND operator_id=o.id AND access='edit')))))))
      RETURNING id,recipient,body`).bind(usageMonth(), job.id, Date.now(), now(), dayOfWeek(localDate(Date.now())), localHour(Date.now()), localHour(Date.now())).first<{ id: string; recipient: string; body: string }>()
    } catch (error) {
      if (!String(error).includes('SMS monthly cap reached')) throw error
      await cancelCappedSms(env)
      throw new Refusal('SMS monthly cap reached. Queued SMS messages were cancelled and will not retry automatically.', 409)
    }
    if (!claimed) {
      await env.DB.prepare("UPDATE iw_sms SET state='cancelled',body='' WHERE id=? AND state='pending'").bind(job.id).run()
      continue
    }
    let state: 'sent' | 'failed' | 'uncertain' = 'uncertain', messageId: string | null = null, charge: number | null = null
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${settings.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: 'Basic ' + btoa(settings.TWILIO_ACCOUNT_SID + ':' + settings.TWILIO_AUTH_TOKEN), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: claimed.recipient, From: settings.TWILIO_FROM!, Body: claimed.body }).toString(),
      })
      if (response.ok) {
        const receipt = await providerResult(response); messageId = receipt.sid; charge = receipt.charge
        state = ['failed', 'undelivered'].includes(receipt.status) ? 'failed' : 'sent'
      } else {
        // A definite client refusal failed; server errors may have accepted the message.
        state = response.status >= 400 && response.status < 500 ? 'failed' : 'uncertain'
        await response.body?.cancel()
      }
    } catch { state = 'uncertain' } finally { clearTimeout(timeout) }
    await env.DB.prepare('UPDATE iw_usage_sms SET charged_micros=?,outcome=? WHERE id=?').bind(charge, state, claimed.id).run()
    await env.DB.prepare("UPDATE iw_sms SET state=?,provider='twilio',provider_message_id=?,sent_at=CASE WHEN ?='sent' THEN ? END,body='' WHERE id=? AND state='sending'")
      .bind(state, messageId, state, now(), claimed.id).run()
    insist(state === 'sent', 'The signing change was saved, but SMS delivery could not be confirmed. Check Twilio before sending another message.', 503)
  }
}

/** Installation-local per-message facts; acceptance is never presented as delivery. */
export async function smsMessages(env: Env, envelopeId: string): Promise<import('./delivery').Message[]> {
  const rows = (await env.DB.prepare('SELECT id,kind,signer,recipient,state,created_at,sent_at,cancellation_reason FROM iw_sms WHERE envelope_id=? ORDER BY created_at,rowid').bind(envelopeId).all<{id:string;kind:string;signer:number;recipient:string;state:string;created_at:string;sent_at:string|null;cancellation_reason:string|null}>()).results
  return rows.map(r => ({ id:r.id, kind:r.kind, signer:r.signer, recipient:maskedMobile(r.recipient), subject:'SMS ' + r.kind,
    status:r.state==='pending'?'queued':r.state==='sending'?'uncertain':r.state==='cancelled'?'not_sent':r.state as 'sent'|'failed'|'uncertain',
    label:r.state==='sent'?'SMS accepted by Twilio; delivery not confirmed':r.state==='pending'?'SMS queued':r.state==='sending'?'SMS delivery uncertain':r.state==='cancelled'?(r.cancellation_reason==='monthly_cap'?'SMS not sent: monthly cap reached. Cancelled messages will not retry; the recipient still requires SMS verification.':'SMS not sent: recipient or signing authority changed.'):'SMS ' + r.state,
    createdAt:r.created_at, ...(r.sent_at?{sentAt:r.sent_at}:{}) }))
}
