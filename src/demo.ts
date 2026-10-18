import type { Bindings } from './auth.server'
import { canonical, sha256, type Envelope, type AuditEvent } from './inkwell/model'
import { blobWrites } from './inkwell/blobs'
import { signedPdf, certificatePdf } from './inkwell/pdf'
import { agreements, emailFor, OWNER, type When } from './demo/records'
import { agreementPdf } from './demo/documents'
import { seedImported } from './demo/imported'

const ZONE = 'America/New_York'
/** The instant of a demo moment: minutes before now, or a wall-clock time in Columbus some days before today. */
export function demoTime(now: Date, when: When) {
  if (typeof when === 'number') return new Date(now.getTime() - when * 60_000)
  const [daysAgo, clock] = when
  const day = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now.getTime() - daysAgo * 86400000)).map(part => [part.type, part.value]))
  const [hour, minute] = clock.split(':').map(Number)
  const wall = Date.UTC(Number(day.year), Number(day.month) - 1, Number(day.day), hour, minute)
  const offset = (instant: number) => { const name = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, timeZoneName: 'longOffset' }).formatToParts(new Date(instant)).find(part => part.type === 'timeZoneName')?.value ?? 'GMT-05:00'; const [, sign, h, m] = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name) ?? ['', '-', '05', '00']; return (sign === '-' ? -1 : 1) * (Number(h) * 60 + Number(m ?? 0)) * 60_000 }
  return new Date(wall - offset(wall - offset(wall)))
}

/** Fixed identities and atomic, conflict-safe writes make interrupted seeding safe to resume. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
  const owner = await env.DB.prepare("SELECT id, version FROM oa_operators WHERE email=? AND role='owner' AND status='active'").bind(ownerEmail).first<{ id: string; version: number }>()
  if (!owner) throw new Error('Demo owner must exist before sample records are loaded')
  // The owner claim names the owner "Owner"; the sample workspace belongs to Rosa Delgado.
  await env.DB.prepare("UPDATE oa_operators SET display_name=? WHERE id=? AND display_name='Owner'").bind(OWNER, owner.id).run()
  // The preparation agent's token record. Its secret was never kept, so it can only be listed and revoked.
  const agentId = 'demo-agent-01'
  await env.DB.prepare('INSERT INTO iw_agents(id,owner_id,owner_version,token_hash,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').bind(agentId, owner.id, owner.version, await sha256(`${agentId}:${crypto.randomUUID()}`), demoTime(now, [5, '08:30']).toISOString()).run()
  for (const [index, sample] of agreements.entries()) {
    const id = `demo-envelope-${String(index + 1).padStart(2, '0')}`
    if (await env.DB.prepare('SELECT 1 FROM iw_envelopes WHERE id=?').bind(id).first()) continue
    const at = (when: When) => demoTime(now, when).toISOString()
    const createdAt = at(sample.prepared)
    const envelope: Envelope = {
      id, version: 1, title: sample.title, filename: id + '.pdf', status: sample.status,
      createdAt, createdBy: owner.id, expiresAt: new Date(Date.parse(createdAt) + 7 * 86400000).toISOString(),
      signers: sample.signers.map(name => ({ name, email: name === OWNER ? ownerEmail : emailFor(name) })),
      fields: sample.signers.map((_, signer) => ({ id: `signature-${signer}`, label: 'Signature', type: 'signature', signer, page: 0, x: .08, y: .714 + signer * .119, width: .43, height: .04 })),
      pageSizes: [{ width: 595, height: 842 }], originalSha256: '', events: [],
    }
    const event = async (action: string, actor: string, when: string, detail: Record<string, unknown> = {}) => {
      const body = { action, actor, at: when, detail: structuredClone(detail), previousHash: envelope.events.at(-1)?.hash ?? '' }
      envelope.events.push({ ...body, hash: await sha256(canonical(body)) } as AuditEvent)
    }
    const original = await agreementPdf(sample.title, sample.signers, createdAt)
    envelope.originalSha256 = await sha256(original)
    await event('envelope.prepared', sample.agent ? `agent:${agentId}` : owner.id, createdAt, { originalSha256: envelope.originalSha256, orderedSigners: envelope.signers, fields: envelope.fields })
    if (sample.approved) await event('envelope.approved', owner.id, at(sample.approved), { eligible: true, consent: true, originalSha256: envelope.originalSha256 })
    for (const [signer, when] of (sample.signed ?? []).entries()) {
      const person = envelope.signers[signer], signedAt = demoTime(now, when)
      person.signedAt = signedAt.toISOString()
      person.values = { [`signature-${signer}`]: person.name }
      await event('signer.verified', person.email, new Date(signedAt.getTime() - 3 * 60_000).toISOString(), { signer })
      await event('signer.signed', person.email, person.signedAt, { signer, consent: true, values: person.values })
    }
    const blobs = blobWrites(env.DB, id, 'original', original)
    if (sample.status === 'completed') {
      const signed = await signedPdf(original, envelope)
      envelope.signedSha256 = await sha256(signed)
      await event('envelope.completed', 'inkwell', envelope.signers.at(-1)!.signedAt!, { signedSha256: envelope.signedSha256 })
      const certificate = await certificatePdf(envelope)
      envelope.certificateSha256 = await sha256(certificate)
      blobs.push(...blobWrites(env.DB, id, 'signed', signed), ...blobWrites(env.DB, id, 'certificate', certificate))
    }
    if (sample.voided) await event('envelope.voided', owner.id, at(sample.voided.at), { reason: sample.voided.reason })
    const signers = sample.status === 'awaiting_signature' ? await Promise.all(envelope.signers.map(async (_, signer) => {
      const token = await sha256(`${id}:${signer}:demo-invitation`)
      return env.DB.prepare('INSERT INTO iw_signers(envelope_id,signer,token_hash) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(id, signer, await sha256(token))
    })) : []
    await env.DB.batch([
      env.DB.prepare('INSERT INTO iw_envelopes(id,version,data) VALUES(?,1,?) ON CONFLICT DO NOTHING').bind(id, JSON.stringify(envelope)),
      ...blobs,
      ...envelope.events.map((entry, sequence) => env.DB.prepare('INSERT INTO iw_events(envelope_id,sequence,hash,data) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').bind(id, sequence, entry.hash, JSON.stringify(entry))),
      ...signers,
    ])
  }
  await seedImported(env, now, owner.id)
  await env.DB.prepare('INSERT INTO oa_first_run(singleton,completed_by,completed_at) VALUES(1,?,?) ON CONFLICT DO NOTHING').bind(owner.id, now.getTime()).run()
}
