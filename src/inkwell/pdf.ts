// Uploaded-original preservation and separate evidence PDF follow
// locket/src/locket/execution.ts and locket/src/locket/pdf.ts. Unlike Locket's
// manual handoff, Inkwell parses actual page trees and overlays each signer's adopted mark (SIGNX-002).
import { appendManifestations } from './compliance/manifestation'
import { PDFDict, PDFDocument, PDFName, StandardFonts, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { importsFormFields, tagBoxes } from './document-fields'
import { insist, Refusal, type Adoption, type Envelope, type Field } from './model'
import { parseStamp } from './stamps'
import { adoptionOf, typedStyles, markKind } from './marks'
import { displayFieldValue, markField } from './business-fields'
import { normalizeFieldSchema, resolveFieldValues, visibleFields, requiredField } from './field-rules'
export async function parsePdf(bytes: Uint8Array, maxPages = 100) { try { const document = await PDFDocument.load(bytes, { updateMetadata:false, ignoreEncryption:true }); insist(!document.isEncrypted, 'Encrypted PDFs cannot be signed.'); insist(document.getPageCount() > 0 && document.getPageCount() <= maxPages, `Use a PDF with 1–${maxPages} pages.`); const pageSizes = document.getPages().map(page => { const {width,height} = page.getCropBox(), rotation = ((page.getRotation().angle % 360)+360)%360; insist([0,90,180,270].includes(rotation), 'This PDF has an unsupported page rotation.'); insist(width > 0 && height > 0 && width <= 14400 && height <= 14400, 'This PDF has an unsupported page size.'); return rotation % 180 ? {width:height,height:width} : {width,height} }); return {document,pageSizes} } catch (error) { if (error instanceof Refusal) throw error; throw new Refusal('The file could not be parsed as an unencrypted PDF.') } }
export function encodable(font: PDFFont, value: string) { try { font.encodeText(value) } catch { throw new Refusal('PDF text must use characters supported by the standard Latin PDF font.') } }
export async function validatePdfText(values: string[]) { const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica); for (const value of values) encodable(font,value) }
export async function validatePrefilledFields(fields: Field[]) { await validatePdfText(fields.filter(field => field.type !== 'stamp').flatMap(field => field.prefill ? [field.prefill.value] : [])); for (const field of fields) if (field.type === 'stamp' && field.prefill) await parseStamp(field.prefill.value, field.label) }
export function validateFields(value: unknown, signers: number, pages: number, removed: number[] = [], noSignature: number[] = []): Field[] {
  const fields = Array.isArray(value)&&value.length===0&&noSignature.length===signers ? [] : normalizeFieldSchema(value)
  for (const field of fields) insist(field.signer < signers && !removed.includes(field.signer) && field.page < pages, 'Each field must name an existing signer and PDF page.')
  for (let i = 0; i < signers; i++) insist(removed.includes(i) || noSignature.includes(i) || fields.some(f => f.signer === i && f.type === 'signature'), `Place a signature field for signer ${i + 1}.`)
  return fields
}
/** SIGNX-002: a mark's image, read once per signer, and each typed style's font, embedded once. */
type Marks = Map<string, Uint8Array>
export async function signedPdf(original: Uint8Array, envelope: Envelope, scans: { bytes: Uint8Array; mediaType: string }[] = [], marks: Marks = new Map()) {
  const { document } = await parsePdf(original, envelope.documents ? 2000 : 100)
  // PREP-007: the executed copy replaces the document's own form fields with the Inkwell fields made from them, and covers
  // every text tag the document shows, so no empty form field or raw tag sits under a signed value.
  if (importsFormFields(envelope.fields)) removeFormFields(document)
  for (const box of envelope.fields.some(field => field.origin === 'text_tag') ? await tagBoxes(document) : []) {
    const page = document.getPage(box.page), size = envelope.pageSizes[box.page]
    page.pushOperators(pushGraphicsState(), displayedSpace(page))
    page.drawRectangle({ x: box.left - .5, y: size.height - box.bottom - .5, width: box.right - box.left + 1, height: box.bottom - box.top + 1, color: rgb(1, 1, 1) })
    page.pushOperators(popGraphicsState())
  }
  const regular = await document.embedFont(StandardFonts.Helvetica), fonts = new Map<string, PDFFont>(), images = new Map<string, PDFImage>()
  const fontFor = async (name: StandardFonts) => fonts.get(name) ?? fonts.set(name, await document.embedFont(name)).get(name)!
  for (let signer = 0; signer < envelope.signers.length; signer++) {
    if (envelope.signers[signer].removedAt || envelope.signers[signer].routeResult?.state === 'skipped' || envelope.signers[signer].paper?.status === 'accepted') continue
    const assigned = envelope.fields.filter(field => field.signer === signer), values = resolveFieldValues(assigned, envelope.signers[signer].values ?? {})
    for (const field of visibleFields(assigned, values)) {
      const raw = values[field.id]
      if (!raw && !requiredField(field, assigned, values)) continue
      insist(raw, 'A required signing value is missing.', 409)
      const value = printedValue(field, raw), adoption = field.type === 'initials' ? envelope.signers[signer].initialsAdoption ?? { method: 'typed', style: 'sans' } : adoptionOf(envelope, signer), image = field.type === 'stamp' || markField(field) && adoption.method !== 'typed', kind = field.type === 'stamp' ? `stamp-${signer}-${field.id}` : markKind(signer, field.type === 'initials')
      const font = markField(field) ? await fontFor(typedStyles[adoption.style ?? 'sans'].font) : regular
      if (field.type !== 'checkbox') encodable(font, value)
      const page = document.getPage(field.page), size = envelope.pageSizes[field.page]
      page.pushOperators(pushGraphicsState(), displayedSpace(page))
      const boxW = field.width * size.width, boxH = field.height * size.height, left = field.x * size.width, bottom = size.height - (field.y + field.height) * size.height
      if (field.type === 'checkbox') {
        const side = Math.min(boxW, boxH, 16), x = left, y = bottom + (boxH - side) / 2, color = rgb(.08, .12, .2)
        page.drawRectangle({ x, y, width: side, height: side, borderColor: color, borderWidth: 1 })
        if (raw === 'true') {
          page.drawLine({ start: { x: x + side * .2, y: y + side * .5 }, end: { x: x + side * .42, y: y + side * .25 }, thickness: 1.5, color })
          page.drawLine({ start: { x: x + side * .42, y: y + side * .25 }, end: { x: x + side * .82, y: y + side * .8 }, thickness: 1.5, color })
        }
      } else if (image) {
        const stamp = field.type === 'stamp' ? await parseStamp(raw, field.label) : undefined
        const bytes = stamp?.image ?? marks.get(kind)
        insist(bytes, 'A signer\'s adopted signature image is missing.', 409)
        const embedded = images.get(kind) ?? images.set(kind, (stamp?.adoption.mediaType ?? adoption.mediaType) === 'image/png' ? await document.embedPng(bytes) : await document.embedJpg(bytes)).get(kind)!
        const scale = Math.min(boxW / embedded.width, boxH / embedded.height), width = embedded.width * scale, height = embedded.height * scale
        page.drawImage(embedded, { x: left + (boxW - width) / 2, y: bottom + (boxH - height) / 2, width, height })
      } else {
        const fontSize = Math.min(16, boxH * .65, boxW / Math.max(.01, font.widthOfTextAtSize(value, 1)))
        insist(fontSize >= 4, `The value for ${field.label} is too long for its field.`)
        page.drawText(value, { x: left, y: bottom + (boxH - fontSize) / 2, size: fontSize, font, color: rgb(.08, .12, .2) })
      }
      page.pushOperators(popGraphicsState())
    }
  }
  for (const scan of scans) await appendScan(document, scan.bytes, scan.mediaType)
  await appendManifestations(document,envelope)
  return document.save()
}

/** Draw in the page as displayed: crop box origin, with the page's rotation undone. */
function displayedSpace(page: PDFPage) {
  const actual = page.getCropBox(), rotation = ((page.getRotation().angle % 360) + 360) % 360
  return rotation === 90 ? concatTransformationMatrix(0, 1, -1, 0, actual.x + actual.width, actual.y) : rotation === 180 ? concatTransformationMatrix(-1, 0, 0, -1, actual.x + actual.width, actual.y + actual.height) : rotation === 270 ? concatTransformationMatrix(0, -1, 1, 0, actual.x, actual.y + actual.height) : concatTransformationMatrix(1, 0, 0, 1, actual.x, actual.y)
}
/** PREP-007: an executed copy keeps no interactive form (widgets, AcroForm with any XFA, usage rights) of its own. */
function removeFormFields(document: PDFDocument) {
  for (const page of document.getPages()) {
    const annotations = page.node.Annots()
    if (!annotations) continue
    const kept = annotations.asArray().filter(item => { const annotation = document.context.lookup(item); return !(annotation instanceof PDFDict && annotation.get(PDFName.of('Subtype')) === PDFName.of('Widget')) })
    if (kept.length) page.node.set(PDFName.of('Annots'), document.context.obj(kept)); else page.node.delete(PDFName.of('Annots'))
  }
  document.catalog.delete(PDFName.of('AcroForm')); document.catalog.delete(PDFName.of('Perms'))
}
const printedValue = (field: Field, value: string) => field.type === 'number' ? (value.startsWith('-') ? `-$${value.slice(1)}` : `$${value}`) : displayFieldValue({ ...field, masked: false, pattern: undefined }, value)
/** SIGNX-008: a hand-signed upload is a PDF scan or one JPEG or PNG photo; its pages follow the document in the executed PDF. */
export const scanTypes = ['application/pdf', 'image/jpeg', 'image/png']
export async function scanPages(bytes: Uint8Array, mediaType: string) { insist(scanTypes.includes(mediaType), 'Upload a PDF scan or a JPEG or PNG photo.', 415); if (mediaType === 'application/pdf') return (await parsePdf(bytes)).pageSizes.length; await appendScan(await PDFDocument.create(), bytes, mediaType); return 1 }
async function appendScan(document: PDFDocument, bytes: Uint8Array, mediaType: string) { if (mediaType === 'application/pdf') { const source = (await parsePdf(bytes)).document; for (const page of await document.copyPages(source, source.getPageIndices())) document.addPage(page); return } let image; try { image = mediaType === 'image/png' ? await document.embedPng(bytes) : await document.embedJpg(bytes) } catch { throw new Refusal('The photo could not be read as a JPEG or PNG image.', 415) } const page = document.addPage([612, 792]), scale = Math.min(552 / image.width, 732 / image.height); page.drawImage(image, { x: (612 - image.width * scale) / 2, y: (792 - image.height * scale) / 2, width: image.width * scale, height: image.height * scale }) }
export async function validateSigningValues(envelope: Envelope, signer: number, raw: Record<string, string>, adoption: Adoption, initialsAdoption: Adoption = { method: 'typed', style: 'sans' }) {
  const fields = envelope.fields.filter(f => f.signer === signer), values = resolveFieldValues(fields, raw)
  const pdf = await PDFDocument.create(), regular = await pdf.embedFont(StandardFonts.Helvetica), signature = await pdf.embedFont(typedStyles[adoption.style ?? 'sans'].font)
  for (const field of visibleFields(fields, values)) {
    if (field.type === 'checkbox' || (!values[field.id] && !requiredField(field, fields, values))) continue
    insist(values[field.id], `Complete ${field.label}.`)
    if (field.type === 'stamp') { await parseStamp(values[field.id], field.label); continue }
    const mark = field.type === 'initials' ? initialsAdoption : adoption
    const font = field.type === 'initials' ? await pdf.embedFont(typedStyles[mark.style ?? 'sans'].font) : field.type === 'signature' ? signature : regular, value = printedValue(field, values[field.id])
    encodable(font, value)
    encodable(regular, value)
    if (markField(field) && mark.method !== 'typed') continue
    const page = envelope.pageSizes[field.page], size = Math.min(16, field.height * page.height * .65, field.width * page.width / Math.max(.01, font.widthOfTextAtSize(value, 1)))
    insist(size >= 4, `The value for ${field.label} is too long for its field.`)
  }
}
