import { PDFDocument, StandardFonts } from 'pdf-lib'
import { insist, object, sha256, type Adoption, type Envelope } from './model'

/** SIGNX-002: how a signer adopts their signature. Typed marks use one of three styles drawn with the PDF standard fonts;
 * a drawn mark is a PNG made on the signing page with a finger, pen or mouse; an uploaded mark is a PNG or JPEG image.
 * Images are at most 512 KiB. Envelopes signed before adoption existed were typed in the sans italic style. */
export const typedStyles = {
  sans: { label: 'Sans italic', font: StandardFonts.HelveticaOblique },
  serif: { label: 'Serif italic', font: StandardFonts.TimesRomanItalic },
  'serif-bold': { label: 'Serif bold italic', font: StandardFonts.TimesRomanBoldItalic },
} as const
export type TypedStyle = keyof typeof typedStyles
export const MAX_MARK = 512 * 1024
const typed: Adoption = { method: 'typed', style: 'sans' }
export const adoptionOf = (envelope: Envelope, signer: number): Adoption => envelope.signers[signer].adoption ?? typed
export const markKind = (signer: number) => `mark-${signer}`
const pngMagic = [0x89, 0x50, 0x4e, 0x47], jpegMagic = [0xff, 0xd8, 0xff]

/** The adoption a signing request carries (typed in the sans style when it names none), with the image bytes. */
export async function parseAdoption(value: unknown): Promise<{ adoption: Adoption; image?: Uint8Array }> {
  if (value === undefined) return { adoption: typed }
  const input = object(value)
  if (input.method === 'typed') { insist(typeof input.style === 'string' && Object.hasOwn(typedStyles, input.style), 'Choose a signature style.'); return { adoption: { method: 'typed', style: input.style as TypedStyle } } }
  insist(input.method === 'drawn' || input.method === 'uploaded', 'Adopt your signature by typing, drawing or uploading it.')
  const mediaType = input.method === 'drawn' ? 'image/png' : input.mediaType
  insist(mediaType === 'image/png' || mediaType === 'image/jpeg', 'Upload your signature as a PNG or JPEG image.', 415)
  insist(typeof input.imageBase64 === 'string' && input.imageBase64.length <= Math.ceil(MAX_MARK / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64), 'Provide the signature image as base64, at most 512 KiB.')
  const image = Uint8Array.from(atob(input.imageBase64), c => c.charCodeAt(0))
  insist(image.length > 0 && image.length <= MAX_MARK, 'The signature image must be nonempty and at most 512 KiB.', 413)
  const magic = mediaType === 'image/png' ? pngMagic : jpegMagic
  insist(magic.every((b, i) => image[i] === b), `The signature image is not a ${mediaType === 'image/png' ? 'PNG' : 'JPEG'}.`, 415)
  try { const pdf = await PDFDocument.create(); await (mediaType === 'image/png' ? pdf.embedPng(image) : pdf.embedJpg(image)) } catch { insist(false, 'The signature image could not be read.', 415) }
  return { adoption: { method: input.method, mediaType, sha256: await sha256(image) }, image }
}

/** The same mark adopted again: method, style and image all match. */
export const sameMark = (a: Adoption, b?: Adoption) => Boolean(b) && a.method === b!.method && a.style === b!.style && a.sha256 === b!.sha256

/** How the certificate names an adoption. */
export function describeAdoption(adoption: Adoption, saved?: string) {
  const reused = saved ? ` saved by member ${saved} and reused` : ''
  if (adoption.method === 'typed') return `typed name${reused}, ${typedStyles[adoption.style ?? 'sans'].label} style`
  return `${adoption.method === 'drawn' ? 'drawn signature' : 'uploaded signature image'}${reused}, ${adoption.mediaType === 'image/png' ? 'PNG' : 'JPEG'} SHA-256 ${adoption.sha256}`
}
