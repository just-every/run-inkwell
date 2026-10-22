import { recipientPages } from './document-visibility'
import { documentFields } from './documents'
import { normalizeFieldSchema } from './field-rules'
import { insist, type Envelope, type Field } from './model'
export { verifyFreeFormRecord } from './archive-policy.mjs'

/** PREP-011: signer-owned placements are unsigned progress until the signing transaction commits them. */
export function placedFields(envelope: Envelope, signer: number, input: unknown): Field[] {
  insist(['signer','witness'].includes(envelope.signers[signer]?.role??'signer'),'This recipient action does not place signing fields.',403)
  insist(envelope.freeForm === true && envelope.freeFormSetting, 'This envelope is not open for free-form placement.', 409)
  insist(Array.isArray(input) && input.length <= 100, 'Place at most 100 fields for yourself.')
  const allowed = new Set(['id', 'label', 'type', 'signer', 'page', 'x', 'y', 'width', 'height', 'required', 'masked', 'document', 'documentPage'])
  for (const field of input) {
    insist(field && typeof field === 'object' && !Array.isArray(field) && Object.keys(field).every(key => allowed.has(key)), 'Free-form fields may only describe your placement and value display.')
    insist(field.signer === signer, 'Place fields only for yourself.')
    insist(['signature', 'initials', 'date_signed', 'full_name', 'text'].includes(field.type), 'Place only signatures, initials, dates signed, full names or single-line text.')
    insist(typeof field.label === 'string' && !/[\x00-\x1f\x7f]/.test(field.label), 'Name each placed field on one line.')
  }
  const pages=recipientPages(envelope,signer)
  const fields = input.length ? normalizeFieldSchema(input.map(f=>{insist(Number.isInteger(f.page)&&pages[f.page]!==undefined,'Place fields on a visible document page.');return {...f,page:pages[f.page]}})) : []
  const signed = envelope.fields.filter(field => envelope.signers[field.signer]?.signedAt)
  insist(signed.length === envelope.fields.length, 'A free-form envelope cannot contain sender fields.', 409)
  for (const field of fields) {
    insist(field.page < envelope.pageSizes.length, 'Each field must name an existing PDF page.')
    insist(!signed.some(previous => previous.id === field.id), 'Use a new ID for each field; signed fields cannot change.')
    insist(!signed.some(previous => overlaps(field, previous)), 'A placed field cannot overlap a field already signed.')
    if (field.type === 'signature') field.required = true
  }
  documentFields(fields,envelope.documents,envelope.signers.length,true,[],envelope.signers)
  return fields
}
export function overlaps(a: Field, b: Field) { return a.page === b.page && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y }
export function signingValuesRecord(envelope: Envelope, signer: number, values: Record<string, string>) {
  return envelope.freeForm ? { fields: envelope.fields.filter(field => field.signer === signer), values, freeFormSetting: envelope.freeFormSetting } : values
}
/** Existing assigned-field progress retains its original JSON shape. */
export function freeFormProgress(progress: string | null): { fields: Field[]; values: Record<string, string> } {
  if (!progress) return { fields: [], values: {} }
  const saved = JSON.parse(progress)
  return { fields: Array.isArray(saved.fields) ? saved.fields : [], values: saved.values && typeof saved.values === 'object' ? saved.values : {} }
}
