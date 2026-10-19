// TMPL-005 fixtures: a two-page W-9-style form drawn fresh each call (a later revision line gives a copy with different
// bytes and nearly the same text), and an unrelated agreement on the same US Letter pages.
import { PDFDocument, StandardFonts } from 'pdf-lib'

const w9 = [
 ['Form W-9 Request for Taxpayer Identification Number and Certification', 'Give form to the requester. Do not send to the IRS.', 'Line 1 Name of entity or individual as shown on your income tax return.', 'Line 2 Business name or disregarded entity name, if different from above.', 'Line 3a Check the appropriate box for federal tax classification of the entity whose name is entered on line 1.', 'Individual or sole proprietor, C corporation, S corporation, Partnership, Trust or estate, Limited liability company.', 'Line 5 Address, number, street, and apartment or suite number. Line 6 City, state, and ZIP code.', 'Part I Taxpayer Identification Number. Enter your TIN in the appropriate box to avoid backup withholding.'],
 ['Part II Certification. Under penalties of perjury, I certify that the number shown on this form is my correct taxpayer identification number.', 'I am not subject to backup withholding because I am exempt or have not been notified by the Internal Revenue Service.', 'I am a U.S. citizen or other U.S. person, and the FATCA codes entered on this form, if any, are correct.', 'Sign here. Signature of U.S. person. Date.'],
]
const agreement = [
 ['Mutual Services Agreement between Harbour Studio and the Client', 'The studio will design, build and deliver the workshop materials described in the attached statement of work.', 'The client will review each delivery within ten business days and pay each invoice within thirty days of receipt.', 'Either party may end this agreement with thirty days written notice to the other party at its stated address.'],
 ['Confidential information stays confidential for three years after this agreement ends, except as the law requires.', 'This agreement is governed by the laws of the State of New York. Signed by both parties on the dates below.'],
]
async function draw(pages) {
 const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
 for (const lines of pages) { const page = pdf.addPage([612, 792]); lines.forEach((line, i) => page.drawText(line, { x: 48, y: 740 - i * 28, size: 9, font })) }
 return Buffer.from(await pdf.save())
}
export const w9Pdf = (revision = 'Rev. March 2024') => draw([[...w9[0], revision], w9[1]])
export const agreementPdf = () => draw(agreement)
