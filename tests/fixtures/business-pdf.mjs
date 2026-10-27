import { PDFDocument, drawObject, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from 'pdf-lib'

// An actual uncompressed RGB page image keeps the document large through PDF rewriting.
export async function businessPdf() {
 const pdf = await PDFDocument.create(), page = pdf.addPage([612, 792])
 const pixels = new Uint8Array(2600 * 2600 * 3).fill(238)
 const image = pdf.context.register(pdf.context.stream(pixels, { Type: 'XObject', Subtype: 'Image', Width: 2600, Height: 2600, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }))
 const name = page.node.newXObject('Photo', image)
 page.pushOperators(pushGraphicsState(), concatTransformationMatrix(500, 0, 0, 500, 50, 200), drawObject(name), popGraphicsState())
 page.drawText('synthetic-inkwell-971 business agreement', { x: 50, y: 740, size: 16 })
 page.drawText('{{signature:1}}', { x: 50, y: 100, size: 14 })
 return new Uint8Array(await pdf.save())
}

export async function encryptedPdf() {
 const pdf=await PDFDocument.create();pdf.addPage([612,792])
 pdf.context.trailerInfo.Encrypt=pdf.context.obj({Filter:'Standard',V:1,R:2,Length:40})
 return new Uint8Array(await pdf.save())
}
