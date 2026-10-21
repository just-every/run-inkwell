// PREP-007: where a PDF page shows each character, so text tags and anchor strings can become placed fields. A page's
// content streams (and the form XObjects they draw) are read with their graphics and text state: cm, q and Q; BT, Tf,
// Tc, Tw, Tz, TL, Ts; Td, TD, Tm and T*; Tj, TJ, ' and ". Each shown code is decoded through the font's ToUnicode map,
// else its simple encoding (WinAnsi with any Differences), and advanced by the font's widths (Widths or W, else the
// standard 14 fonts' metrics). Boxes are in the page's displayed orientation, top-left origin, in points.
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, StandardFonts, decodePDFRawStream, type PDFFont, type PDFObject, type PDFPage } from 'pdf-lib'

export interface Glyph { char: string; left: number; top: number; right: number; bottom: number }
/** One page's text in reading order: `text[i]` is drawn at `glyphs[i]`; a line break or added space has no glyph. */
export interface PageText { text: string; glyphs: (Glyph | undefined)[] }

type Matrix = [number, number, number, number, number, number]
const identity: Matrix = [1, 0, 0, 1, 0, 0]
const multiply = (m: Matrix, n: Matrix): Matrix => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]]
const apply = (m: Matrix, x: number, y: number) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]]

interface Font { codeBytes: 1 | 2; decode: (code: number) => string; width: (code: number) => number }
const glyphNames: Record<string, string> = { space: ' ', braceleft: '{', braceright: '}', colon: ':', semicolon: ';', underscore: '_', slash: '/', backslash: '\\', period: '.', comma: ',', hyphen: '-', bracketleft: '[', bracketright: ']', parenleft: '(', parenright: ')', at: '@', numbersign: '#', bar: '|', ampersand: '&', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' }
const standardAliases: Record<string, StandardFonts> = { Arial: StandardFonts.Helvetica, ArialMT: StandardFonts.Helvetica, 'Arial,Bold': StandardFonts.HelveticaBold, 'Arial-BoldMT': StandardFonts.HelveticaBold, TimesNewRoman: StandardFonts.TimesRoman, TimesNewRomanPSMT: StandardFonts.TimesRoman, CourierNew: StandardFonts.Courier, CourierNewPSMT: StandardFonts.Courier }

const number = (value: PDFObject | undefined, fallback = 0) => value instanceof PDFNumber ? value.asNumber() : fallback
const bytesOf = (value: string) => Uint8Array.from(value, c => c.charCodeAt(0) & 0xff)
function streamBytes(document: PDFDocument, value: PDFObject | undefined): Uint8Array[] {
  const object = value ? document.context.lookup(value) : undefined
  if (object instanceof PDFArray) return object.asArray().flatMap(item => streamBytes(document, item))
  // A stream whose filter cannot be decoded here shows no text that can be read, so it carries no tags.
  if (!(object instanceof PDFRawStream)) return []
  try { return [decodePDFRawStream(object).decode()] } catch { return [] }
}

/** A ToUnicode CMap's bfchar and bfrange entries, and its code length from the first codespacerange. */
function toUnicode(bytes: Uint8Array) {
  const source = new TextDecoder('latin1').decode(bytes), map = new Map<number, string>()
  const utf16 = (hex: string) => { let out = ''; for (let i = 0; i + 3 < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)); return out }
  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(source)
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const [, from, to] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(from, 16), utf16(to))
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const [, lo, hi, to, list] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\[([^\]]*)\])/g)) {
    const first = parseInt(lo, 16), last = Math.min(parseInt(hi, 16), first + 0xffff)
    if (list !== undefined) [...list.matchAll(/<([0-9a-fA-F]*)>/g)].forEach(([, hex], i) => { if (first + i <= last) map.set(first + i, utf16(hex)) })
    else for (let code = first, base = to.slice(0, -4), tail = parseInt(to.slice(-4) || '0', 16); code <= last; code++) map.set(code, utf16(base) + String.fromCharCode(tail + code - first))
  }
  return { map, codeBytes: space ? (space[1].length > 2 ? 2 : 1) as 1 | 2 : undefined }
}

const metrics = new Map<string, Promise<PDFFont>>()
async function standardMetrics(name: StandardFonts) {
  if (!metrics.has(name)) metrics.set(name, PDFDocument.create().then(scratch => scratch.embedFont(name)))
  return metrics.get(name)!
}

async function readFont(document: PDFDocument, dict: PDFDict): Promise<Font> {
  const get = (key: string) => document.context.lookup(dict.get(PDFName.of(key)))
  const subtype = get('Subtype')?.toString(), cmap = streamBytes(document, dict.get(PDFName.of('ToUnicode')))[0], unicode = cmap ? toUnicode(cmap) : undefined
  if (subtype === '/Type0') {
    const descendant = document.context.lookup((get('DescendantFonts') as PDFArray | undefined)?.get(0)) as PDFDict | undefined
    const widths = new Map<number, number>(), w = descendant ? document.context.lookup(descendant.get(PDFName.of('W'))) : undefined, fallback = number(descendant ? document.context.lookup(descendant.get(PDFName.of('DW'))) : undefined, 1000)
    if (w instanceof PDFArray) for (let i = 0, items = w.asArray().map(item => document.context.lookup(item)); i < items.length;) {
      const first = number(items[i]), next = items[i + 1]
      if (next instanceof PDFArray) { next.asArray().forEach((width, k) => widths.set(first + k, number(document.context.lookup(width)))); i += 2 }
      else { for (let code = first, last = number(next); code <= last && code - first < 0x10000; code++) widths.set(code, number(items[i + 2])); i += 3 }
    }
    return { codeBytes: unicode?.codeBytes ?? 2, decode: code => unicode?.map.get(code) ?? '�', width: code => widths.get(code) ?? fallback }
  }
  const differences = new Map<number, string>(), encoding = get('Encoding')
  const list = encoding instanceof PDFDict ? document.context.lookup(encoding.get(PDFName.of('Differences'))) : undefined
  if (list instanceof PDFArray) { let code = 0; for (const item of list.asArray().map(value => document.context.lookup(value))) { if (item instanceof PDFNumber) code = item.asNumber(); else if (item instanceof PDFName) { const name = item.decodeText(), uni = /^uni([0-9A-F]{4})$/.exec(name); differences.set(code++, name.length === 1 ? name : glyphNames[name] ?? (uni ? String.fromCharCode(parseInt(uni[1], 16)) : '�')) } } }
  const decode = (code: number) => unicode?.map.get(code) ?? differences.get(code) ?? String.fromCharCode(code)
  const widths = get('Widths'), firstChar = number(get('FirstChar')), descriptor = get('FontDescriptor'), missing = descriptor instanceof PDFDict ? number(document.context.lookup(descriptor.get(PDFName.of('MissingWidth')))) : 0
  const scale = subtype === '/Type3' ? number((get('FontMatrix') as PDFArray | undefined)?.lookup(0), .001) * 1000 : 1
  if (widths instanceof PDFArray) return { codeBytes: 1, decode, width: code => (code >= firstChar && code - firstChar < widths.size() ? number(widths.lookup(code - firstChar)) : missing) * scale }
  const base = get('BaseFont') instanceof PDFName ? (get('BaseFont') as PDFName).decodeText().replace(/^[A-Z]{6}\+/, '') : '', name = (Object.values(StandardFonts) as string[]).includes(base) ? base as StandardFonts : standardAliases[base]
  const standard = name ? await standardMetrics(name) : undefined
  return { codeBytes: 1, decode, width: code => { if (!standard) return missing; try { return standard.widthOfTextAtSize(decode(code), 1000) } catch { return missing } } }
}

type Operand = number | string | { name: string } | Operand[]
const isSpace = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0x0c || b === 0x00
const isDelimiter = (b: number) => isSpace(b) || '()<>[]{}/%'.includes(String.fromCharCode(b))
const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }

/** Content-stream operators with their operands; strings stay one byte per character, and inline image data is skipped. */
function* operations(bytes: Uint8Array): Generator<[string, Operand[]]> {
  let i = 0, operands: Operand[] = []
  const stack: Operand[][] = []
  const push = (value: Operand) => (stack.at(-1) ?? operands).push(value)
  while (i < bytes.length) {
    const b = bytes[i]
    if (isSpace(b)) { i++; continue }
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
      push(value); continue
    }
    if (b === 0x3c && bytes[i + 1] === 0x3c) { i += 2; continue }
    if (b === 0x3e && bytes[i + 1] === 0x3e) { i += 2; continue }
    if (b === 0x3c) {
      let hex = ''; i++
      while (i < bytes.length && bytes[i] !== 0x3e) { const c = String.fromCharCode(bytes[i++]); if (/[0-9a-f]/i.test(c)) hex += c }
      i++; if (hex.length % 2) hex += '0'
      let value = ''; for (let k = 0; k < hex.length; k += 2) value += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16))
      push(value); continue
    }
    if (b === 0x5b) { stack.push([]); i++; continue }
    if (b === 0x5d) { const array = stack.pop(); if (array) push(array); i++; continue }
    if (b === 0x2f) { let name = ''; i++; while (i < bytes.length && !isDelimiter(bytes[i])) name += String.fromCharCode(bytes[i++]); push({ name }); continue }
    let token = ''
    while (i < bytes.length && !isDelimiter(bytes[i])) token += String.fromCharCode(bytes[i++])
    if (!token) { i++; continue }
    const value = Number(token)
    if (Number.isFinite(value) && /^[+-]?[\d.]/.test(token)) { push(value); continue }
    if (stack.length) continue
    if (token === 'ID') { i++; while (i < bytes.length && !(isSpace(bytes[i - 1]) && bytes[i] === 0x45 && bytes[i + 1] === 0x49 && (i + 2 >= bytes.length || isDelimiter(bytes[i + 2])))) i++; i += 2; operands = []; continue }
    yield [token, operands]
    operands = []
  }
}

/** Every character each page shows, with its box, in content order; text across lines is separated by line breaks. */
export async function pageTexts(document: PDFDocument): Promise<PageText[]> {
  const fonts = new Map<PDFDict, Promise<Font>>()
  const fontOf = (dict: PDFDict) => fonts.get(dict) ?? fonts.set(dict, readFont(document, dict)).get(dict)!
  return Promise.all(document.getPages().map(async page => {
    const glyphs: Glyph[] = []
    await run(document, page.node.Resources(), streamBytes(document, page.node.get(PDFName.of('Contents'))), identity, glyphs, fontOf, 0)
    return lines(glyphs.map(glyph => displayed(page, glyph)))
  }))
}

async function run(document: PDFDocument, resources: PDFDict | undefined, streams: Uint8Array[], base: Matrix, glyphs: Glyph[], fontOf: (dict: PDFDict) => Promise<Font>, depth: number) {
  const lookup = (kind: string, name: string) => { const group = resources ? document.context.lookup(resources.get(PDFName.of(kind))) : undefined; return group instanceof PDFDict ? document.context.lookup(group.get(PDFName.of(name))) : undefined }
  type State = { ctm: Matrix; font: Font | undefined; size: number; charSpace: number; wordSpace: number; scale: number; leading: number; rise: number }
  const states: State[] = []
  let state: State = { ctm: base, font: undefined, size: 0, charSpace: 0, wordSpace: 0, scale: 1, leading: 0, rise: 0 }, tm: Matrix = identity, tlm: Matrix = identity
  const moveLine = (x: number, y: number) => { tlm = multiply([1, 0, 0, 1, x, y], tlm); tm = tlm }
  const show = (value: string) => {
    const font = state.font
    if (!font) return
    const codes = bytesOf(value)
    for (let k = 0; k + font.codeBytes <= codes.length; k += font.codeBytes) {
      const code = font.codeBytes === 2 ? codes[k] * 256 + codes[k + 1] : codes[k], width = font.width(code) / 1000 * state.size * state.scale
      const m = multiply(tm, state.ctm), corners = [[0, -.2], [1, -.2], [0, .8], [1, .8]].map(([x, y]) => apply(m, x * width, y * state.size + state.rise))
      const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]), text = font.decode(code)
      for (const char of text.split('')) glyphs.push({ char, left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) })
      tm = multiply([1, 0, 0, 1, width + (state.charSpace + (font.codeBytes === 1 && code === 32 ? state.wordSpace : 0)) * state.scale, 0], tm)
    }
  }
  for (const bytes of streams) for (const [op, args] of operations(bytes)) {
    const n = (i: number) => typeof args[i] === 'number' ? args[i] as number : 0
    if (op === 'q') states.push({ ...state })
    else if (op === 'Q') state = states.pop() ?? state
    else if (op === 'cm') state.ctm = multiply([n(0), n(1), n(2), n(3), n(4), n(5)], state.ctm)
    else if (op === 'BT') tm = tlm = identity
    else if (op === 'Tf') { const dict = typeof args[0] === 'object' && !Array.isArray(args[0]) ? lookup('Font', args[0].name) : undefined; state.font = dict instanceof PDFDict ? await fontOf(dict) : undefined; state.size = n(1) }
    else if (op === 'Tc') state.charSpace = n(0)
    else if (op === 'Tw') state.wordSpace = n(0)
    else if (op === 'Tz') state.scale = n(0) / 100
    else if (op === 'TL') state.leading = n(0)
    else if (op === 'Ts') state.rise = n(0)
    else if (op === 'Td') moveLine(n(0), n(1))
    else if (op === 'TD') { state.leading = -n(1); moveLine(n(0), n(1)) }
    else if (op === 'Tm') tm = tlm = [n(0), n(1), n(2), n(3), n(4), n(5)]
    else if (op === 'T*') moveLine(0, -state.leading)
    else if (op === 'Tj' && typeof args[0] === 'string') show(args[0])
    else if (op === "'" && typeof args[0] === 'string') { moveLine(0, -state.leading); show(args[0]) }
    else if (op === '"' && typeof args[2] === 'string') { state.wordSpace = n(0); state.charSpace = n(1); moveLine(0, -state.leading); show(args[2]) }
    else if (op === 'TJ' && Array.isArray(args[0])) for (const part of args[0]) { if (typeof part === 'string') show(part); else if (typeof part === 'number') tm = multiply([1, 0, 0, 1, -part / 1000 * state.size * state.scale, 0], tm) }
    else if (op === 'Do' && depth < 8 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      const form = lookup('XObject', args[0].name)
      if (form instanceof PDFRawStream && form.dict.get(PDFName.of('Subtype'))?.toString() === '/Form') {
        const matrix = document.context.lookup(form.dict.get(PDFName.of('Matrix'))), inner = document.context.lookup(form.dict.get(PDFName.of('Resources')))
        const m = matrix instanceof PDFArray && matrix.size() === 6 ? matrix.asArray().map(v => number(document.context.lookup(v))) as Matrix : identity
        await run(document, inner instanceof PDFDict ? inner : resources, streamBytes(document, form), multiply(m, state.ctm), glyphs, fontOf, depth + 1)
      }
    }
  }
}

/** A user-space box as the page is displayed: crop box origin, page rotation applied, y measured down from the top. */
function displayed(page: PDFPage, glyph: Glyph): Glyph {
  const { x, y, width, height } = page.getCropBox(), rotation = ((page.getRotation().angle % 360) + 360) % 360
  const map = (ux: number, uy: number) => rotation === 90 ? [uy - y, ux - x] : rotation === 180 ? [x + width - ux, uy - y] : rotation === 270 ? [y + height - uy, x + width - ux] : [ux - x, y + height - uy]
  const a = map(glyph.left, glyph.bottom), b = map(glyph.right, glyph.top)
  return { char: glyph.char, left: Math.min(a[0], b[0]), right: Math.max(a[0], b[0]), top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1]) }
}

/** Glyphs joined in content order: a gap wider than a quarter of the text height adds a space, a new baseline a line break. */
function lines(glyphs: Glyph[]): PageText {
  let text = ''
  const placed: (Glyph | undefined)[] = []
  glyphs.forEach((glyph, i) => {
    const previous = glyphs[i - 1], height = glyph.bottom - glyph.top
    if (previous) {
      const sameLine = Math.abs((previous.top + previous.bottom) - (glyph.top + glyph.bottom)) / 2 < height * .5 && glyph.left > previous.right - height
      if (!sameLine) { text += '\n'; placed.push(undefined) }
      else if (glyph.left - previous.right > height * .25 && previous.char !== ' ' && glyph.char !== ' ') { text += ' '; placed.push(undefined) }
    }
    text += glyph.char; placed.push(glyph)
  })
  return { text, glyphs: placed }
}

