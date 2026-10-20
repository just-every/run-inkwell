import { PDFDocument } from 'pdf-lib'

/** PREP-003: recompute stamp evidence from retained bytes, never from a caller's claimed fingerprint.
 * An image equal to the prepared image keeps its sender/API source, including when submitted again by the signer. */
export async function stampEvidence(fields, values) {
  const result = []
  for (const field of fields) {
    const value = values[field.id]
    if (field.type !== 'stamp' || !value) continue
    const match = typeof value === 'string' && value.length <= Math.ceil(524288 / 3) * 4 + 32 && /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
    if (!match) throw new Error('Invalid retained stamp')
    const image = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)), mediaType = match[1]
    const magic = mediaType === 'image/png' ? [137,80,78,71,13,10,26,10] : [255,216,255]
    if (!image.length || image.length > 524288 || !magic.every((b,i) => image[i] === b)) throw new Error('Invalid retained stamp bytes')
    const document = await PDFDocument.create()
    await (mediaType === 'image/png' ? document.embedPng(image) : document.embedJpg(image))
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', image)), b => b.toString(16).padStart(2, '0')).join('')
    result.push({ field: field.id, label: field.label, mediaType, bytes: image.length, sha256,
      supplier: field.prefill?.value === value ? { kind: 'sender/API prefill', source: field.prefill.source, readOnly: Boolean(field.readOnly) } : { kind: 'signer upload' } })
  }
  return result
}
