import type { Bindings } from './auth.server'
import { canonical, sha256, type Envelope, type AuditEvent } from './inkwell/model'
import { blobWrites } from './inkwell/blobs'
import { signedPdf, certificatePdf } from './inkwell/pdf'
import { agreements, emailFor } from './demo/records'
import { agreementPdf } from './demo/documents'
import { seedImported } from './demo/imported'

/** Fixed identities and atomic, conflict-safe writes make interrupted seeding safe to resume. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
  const owner = await env.DB.prepare("SELECT id FROM oa_operators WHERE email=? AND role='owner' AND status='active'").bind(ownerEmail).first<{ id: string }>()
  if (!owner) throw new Error('Demo owner must exist before sample records are loaded')
  // The owner claim names the owner "Owner"; the sample workspace belongs to Maya Chen.
  await env.DB.prepare("UPDATE oa_operators SET display_name='Maya Chen' WHERE id=? AND display_name='Owner'").bind(owner.id).run()
  const at = (days: number, hours = 0) => new Date(now.getTime() + days * 86400000 + hours * 3600000).toISOString()
  for (const [index, sample] of agreements.entries()) {
    const id = `demo-envelope-${String(index + 1).padStart(2, '0')}`
    if (await env.DB.prepare('SELECT 1 FROM iw_envelopes WHERE id=?').bind(id).first()) continue
    const createdDay = index - agreements.length
    const createdAt = at(createdDay)
    const envelope: Envelope = {
      id, version: 1, title: sample.title, filename: id + '.pdf', status: sample.status,
      createdAt, createdBy: owner.id, expiresAt: at(sample.status === 'expired' ? -2 : 7),
      signers: sample.names.map(name => ({ name, email: emailFor(name) })),
      fields: sample.names.map((_, signer) => ({ id: `signature-${signer}`, label: 'Signature', type: 'signature', signer, page: 0, x: .08, y: .70 + signer * .12, width: .43, height: .04 })),
      pageSizes: [{ width: 595, height: 842 }], originalSha256: '', events: [],
    }
    const event = async (action: string, actor: string, when: string, detail: Record<string, unknown> = {}) => {
      const body = { action, actor, at: when, detail: structuredClone(detail), previousHash: envelope.events.at(-1)?.hash ?? '' }
      envelope.events.push({ ...body, hash: await sha256(canonical(body)) } as AuditEvent)
    }
    const original = await agreementPdf(sample.title, sample.names, createdAt)
    envelope.originalSha256 = await sha256(original)
    await event('envelope.prepared', owner.id, createdAt, { originalSha256: envelope.originalSha256, orderedSigners: envelope.signers, fields: envelope.fields })
    if (sample.status !== 'prepared') await event('envelope.approved', owner.id, at(createdDay, 1), { eligible: true, consent: true, originalSha256: envelope.originalSha256 })
    if (sample.status === 'completed' || sample.status === 'awaiting_signature' && index % 2 === 0) {
      for (const [signer, person] of envelope.signers.entries()) {
        if (sample.status !== 'completed' && signer > 0) break
        person.signedAt = at(createdDay + 1, signer + 1)
        person.values = { [`signature-${signer}`]: person.name }
        await event('signer.verified', person.email, at(createdDay + 1, signer), { signer })
        await event('signer.signed', person.email, person.signedAt, { signer, consent: true, values: person.values })
      }
    }
    const blobs = blobWrites(env.DB, id, 'original', original)
    if (sample.status === 'completed') {
      const signed = await signedPdf(original, envelope)
      envelope.signedSha256 = await sha256(signed)
      await event('envelope.completed', 'inkwell', at(createdDay + 1, 4), { signedSha256: envelope.signedSha256 })
      const certificate = await certificatePdf(envelope)
      envelope.certificateSha256 = await sha256(certificate)
      blobs.push(...blobWrites(env.DB, id, 'signed', signed), ...blobWrites(env.DB, id, 'certificate', certificate))
    }
    if (sample.status === 'voided') await event('envelope.voided', owner.id, at(createdDay + 1), { reason: 'Replaced by the revised agreement after the project scope changed.' })
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
