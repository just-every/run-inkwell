// TMPL-005: the words a PDF shows, for comparing an upload with a template's document. A page's text is the strings its
// text operators show (Tj, TJ, ' and "), read one byte per character; a wide gap inside TJ, a text move or a new text
// block separates words. Fonts with two-byte codes compare by those codes, so a copy made the same way still matches.
import { PDFArray, PDFRawStream, decodePDFRawStream, type PDFDocument, type PDFPage } from 'pdf-lib'

function contentBytes(page: PDFPage) {
  const contents = page.node.Contents(), streams = contents instanceof PDFArray ? contents.asArray().map(ref => page.doc.context.lookup(ref)) : [contents]
  return streams.flatMap(stream => stream instanceof PDFRawStream ? [decodePDFRawStream(stream).decode()] : [])
}

const space = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0x0c || b === 0x00
const delimiter = (b: number) => space(b) || '()<>[]{}/%'.includes(String.fromCharCode(b))
const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }

/** The text one content stream shows, with a space wherever the page moves to a new place. */
function streamText(bytes: Uint8Array) {
  let out = '', i = 0
  const shown: string[] = [], operands: (string | number)[] = []
  let array: (string | number)[] | undefined
  while (i < bytes.length) {
    const b = bytes[i]
    if (space(b)) { i++; continue }
    if (b === 0x25) { while (i < bytes.length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++; continue }
    if (b === 0x28) {
      let depth = 1, value = ''; i++
      while (i < bytes.length && depth) {
        const c = bytes[i++]
        if (c === 0x5c) { const next = String.fromCharCode(bytes[i++]); if (/[0-7]/.test(next)) { let octal = next; while (octal.length < 3 && /[0-7]/.test(String.fromCharCode(bytes[i]))) octal += String.fromCharCode(bytes[i++]); value += String.fromCharCode(parseInt(octal, 8) & 0xff) } else if (next !== '\n' && next !== '\r') value += escapes[next] ?? next; continue }
        if (c === 0x28) depth++
        else if (c === 0x29 && !--depth) break
        value += String.fromCharCode(c)
      }
      ;(array ?? operands).push(value); continue
    }
    if (b === 0x3c && bytes[i + 1] !== 0x3c) {
      let hex = ''; i++
      while (i < bytes.length && bytes[i] !== 0x3e) { const c = String.fromCharCode(bytes[i++]); if (/[0-9a-f]/i.test(c)) hex += c }
      i++; if (hex.length % 2) hex += '0'
      let value = ''; for (let k = 0; k < hex.length; k += 2) value += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16))
      ;(array ?? operands).push(value); continue
    }
    if (b === 0x5b) { array = []; i++; continue }
    if (b === 0x5d) { if (array) operands.push(array.map(part => typeof part === 'number' ? (part < -200 ? ' ' : '') : part).join('')); array = undefined; i++; continue }
    let token = ''
    while (i < bytes.length && !delimiter(bytes[i])) token += String.fromCharCode(bytes[i++])
    if (!token) { i++; continue }
    const number = Number(token)
    if (Number.isFinite(number) && /^[+-]?[\d.]/.test(token)) { (array ?? operands).push(number); continue }
    if (array) continue
    if (['Tj', 'TJ', "'", '"'].includes(token)) shown.push(...operands.filter((o): o is string => typeof o === 'string'))
    else if (['BT', 'ET', 'Td', 'TD', 'Tm', 'T*'].includes(token) && shown.length) { out += shown.join('') + ' '; shown.length = 0 }
    operands.length = 0
  }
  return out + shown.join('')
}

/** Every word the document shows, lower-cased, in page order. */
export function documentWords(document: PDFDocument) {
  return document.getPages().flatMap(page => contentBytes(page).map(streamText).join(' ').toLowerCase().match(/[a-z0-9]+/g) ?? [])
}
