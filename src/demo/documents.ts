import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/** Small, readable documents with space for the same fields used by real envelopes. */
export async function agreementPdf(title: string, names: string[], date: string) {
  const document = await PDFDocument.create()
  document.setTitle(title)
  const page = document.addPage([595, 842]), font = await document.embedFont(StandardFonts.Helvetica)
  const lines = [
    'INKWELL / AGREEMENT', '', title.replaceAll('·', '-'), '', `Prepared ${date.slice(0, 10)}`,
    '', `Between ${names[0]} and ${names[1]}.`, '',
    '1. Scope', 'The parties agree to the services and deliverables in the approved project brief.',
    'Changes to scope, delivery dates or fees require written approval by both parties.', '',
    '2. Payment and delivery', 'Invoices are payable within 30 days. The parties will review progress together',
    'at the agreed milestones and raise any delivery concerns promptly.', '',
    '3. Confidentiality', 'Each party will protect confidential information shared during the engagement.', '',
    '4. Acceptance', 'The parties accept these terms by signing in the spaces below.', '',
    'Sample agreement for this demonstration workspace.',
  ]
  lines.forEach((line, i) => page.drawText(line, { x: 44, y: 790 - i * 19, size: i === 0 ? 11 : 10, font, color: rgb(.18, .12, .19) }))
  names.forEach((name, i) => {
    const y = 255 - i * 100
    page.drawText(name, { x: 48, y, size: 10, font })
    page.drawLine({ start: { x: 48, y: y - 48 }, end: { x: 300, y: y - 48 }, thickness: .5 })
    page.drawText('Signature', { x: 48, y: y - 64, size: 8, font })
  })
  return document.save()
}
