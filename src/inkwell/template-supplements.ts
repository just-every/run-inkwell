// SIGNX-009: template custody keeps supplemental PDFs independently of their source envelopes.
import { readBlob } from './blobs'
import { insist, sha256, type Env, type Envelope, type Supplement } from './model'

export type TemplateSupplementArtifact = { supplement: Supplement; bytes: Uint8Array }

/** Copy document definitions only: recipient views and acknowledgments belong to their original envelope. */
export const supplementDefinition = (s: Supplement): Supplement => ({ id: s.id, label: s.label, filename: s.filename, sha256: s.sha256, pages: s.pages, bytes: s.bytes, requirement: s.requirement })

export function templateSupplementWrites(db: D1Database, templateId: string, supplementId: string, bytes: Uint8Array) {
  const writes: D1PreparedStatement[] = []
  for (let offset = 0, part = 0; offset < bytes.length; offset += 64 * 1024, part++) writes.push(db.prepare('INSERT INTO iw_template_supplement_blobs(template_id,supplement_id,part,data) VALUES(?,?,?,?)').bind(templateId, supplementId, part, bytes.slice(offset, offset + 64 * 1024).buffer))
  return writes
}

/** Every read verifies both contiguous chunks and the document fingerprint before bytes leave template custody. */
export async function templateSupplementBytes(env: Env, templateId: string, supplement: Supplement) {
  const rows = (await env.DB.prepare('SELECT part,data FROM iw_template_supplement_blobs WHERE template_id=? AND supplement_id=? ORDER BY part').bind(templateId, supplement.id).all<{ part: number; data: number[] | ArrayBuffer }>()).results
  insist(rows.length, 'The stored template supplemental document is unavailable.', 503)
  const chunks = rows.map((row, part) => { insist(row.part === part, 'The stored template supplemental document is incomplete.', 503); return new Uint8Array(row.data) })
  const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  insist(bytes.length === supplement.bytes && await sha256(bytes) === supplement.sha256, 'The stored template supplemental document failed its SHA-256 integrity check.', 503)
  return bytes
}

export async function supplementsFromEnvelope(env: Env, envelope: Envelope): Promise<TemplateSupplementArtifact[]> {
  return Promise.all((envelope.supplements ?? []).map(async value => {
    const supplement = supplementDefinition(value), bytes = await readBlob(env, envelope.id, `supplement-${supplement.id}`, supplement.sha256)
    insist(bytes.length === supplement.bytes, 'The stored supplemental document has an incorrect byte length.', 503)
    return { supplement, bytes }
  }))
}

export async function supplementsFromTemplate(env: Env, template: { id: string; supplements?: Supplement[] }): Promise<TemplateSupplementArtifact[]> {
  return Promise.all((template.supplements ?? []).map(async value => {
    const supplement = supplementDefinition(value)
    return { supplement, bytes: await templateSupplementBytes(env, template.id, supplement) }
  }))
}
