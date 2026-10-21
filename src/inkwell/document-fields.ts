// PREP-007: the fields a document carries itself. Three sources, read when a PDF is uploaded or prepared with no fields:
// - text tags written in the document, {{type:recipient}} or {{type:recipient:label}}, for example {{signature:1}};
// - Docusign-style anchor strings: the API caller names a string, a field type and a recipient, and every place the
//   document shows that string gets the field, offset from the string's top-left corner;
// - existing AcroForm fields (text, checkbox, signature, dropdown or list, radio group), each keeping its full name.
// A document field's `name` (the tag's label, the anchor string or the form field's full name) is what an API prefill
// map may use instead of the field ID. Recipients are numbered from 1 in routing places; form fields go to recipient 1.
import { PDFCheckBox, PDFDropdown, PDFName, PDFOptionList, PDFRadioGroup, PDFSignature, PDFTextField, type PDFDocument, type PDFField, type PDFWidgetAnnotation } from 'pdf-lib'
import { fieldTypes } from './business-fields'
import { insist, object, type Field } from './model'
import { pageTexts, type PageText } from './pdf-layout'

/** The field types a text tag or an anchor may name: every type that needs no options or stamp image. */
export const taggableTypes = ['signature', 'initials', 'date_signed', 'full_name', 'email', 'company', 'title', 'text', 'date', 'checkbox', 'number'] as const
type Taggable = typeof taggableTypes[number]
export const tagPattern = /\{\{[ \t]*([a-z_]+)[ \t]*:[ \t]*(\d{1,3})[ \t]*(?::[ \t]*([^{}\n]{1,100}?)[ \t]*)?\}\}/g
/** An anchored field's size in points when the caller names none. */
const anchorSizes: Record<Taggable, [number, number]> = { signature: [180, 36], initials: [60, 30], date_signed: [100, 20], full_name: [160, 20], email: [160, 20], company: [160, 20], title: [160, 20], text: [160, 20], date: [100, 20], checkbox: [14, 14], number: [100, 20] }
const typeLabel = (type: Field['type']) => fieldTypes.find(([value]) => value === type)![1]
const oneLine = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max).trim()

export interface Anchor { text: string; type: Taggable; recipient: number; label?: string; x: number; y: number; width: number; height: number }
/** The caller's anchors: text (1–100 characters, matched exactly), type, recipient, optional label, offsets and size in points. */
export function readAnchors(value: unknown): Anchor[] {
  if (value === undefined) return []
  insist(Array.isArray(value) && value.length <= 20, 'Give at most 20 anchors.')
  return value.map(raw => {
    const anchor = object(raw), type = anchor.type as Taggable, size = anchorSizes[type]
    insist(typeof anchor.text === 'string' && anchor.text.trim().length > 0 && anchor.text.length <= 100 && !/[\x00-\x1f]/.test(anchor.text), 'Give each anchor the exact text to find (1–100 characters on one line).')
    insist(taggableTypes.includes(type), `Choose a field type for the anchor "${anchor.text}": ${taggableTypes.join(', ')}.`)
    insist(Number.isInteger(anchor.recipient) && (anchor.recipient as number) >= 1 && (anchor.recipient as number) <= 100, `Name the recipient for the anchor "${anchor.text}" by their place, from 1.`)
    insist(anchor.label === undefined || (typeof anchor.label === 'string' && anchor.label.trim().length > 0 && anchor.label.length <= 100), `Label the anchor "${anchor.text}" in at most 100 characters.`)
    const points = (key: string, fallback: number, min: number) => { const v = anchor[key] ?? fallback; insist(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= 2000, `Give the anchor "${anchor.text}" a ${key} in points.`); return v }
    return { text: anchor.text, type, recipient: anchor.recipient as number, ...(anchor.label ? { label: oneLine(anchor.label as string, 100) } : {}), x: points('x', 0, -2000), y: points('y', 0, -2000), width: points('width', size[0], 1), height: points('height', size[1], 1) }
  })
}

type Box = { page: number; left: number; top: number; right: number; bottom: number }
/** A box in points as a field's page-relative position, kept inside the page. */
function place(box: Box, sizes: { width: number; height: number }[]) {
  const size = sizes[box.page], clamp = (v: number) => Math.min(1, Math.max(0, v))
  const x = clamp(box.left / size.width), y = clamp(box.top / size.height), right = clamp(box.right / size.width), bottom = clamp(box.bottom / size.height)
  return right - x > 0 && bottom - y > 0 ? { page: box.page, x, y, width: right - x, height: bottom - y } : undefined
}
function spans(pages: PageText[], find: (text: string) => Iterable<{ index: number; length: number; match: RegExpExecArray | undefined }>) {
  return pages.flatMap((page, index) => [...find(page.text)].flatMap(hit => {
    if (page.text.slice(hit.index, hit.index + hit.length).includes('\n')) return []
    const drawn = page.glyphs.slice(hit.index, hit.index + hit.length).filter(glyph => glyph !== undefined)
    if (!drawn.length) return []
    return [{ match: hit.match, box: { page: index, left: Math.min(...drawn.map(g => g.left)), right: Math.max(...drawn.map(g => g.right)), top: Math.min(...drawn.map(g => g.top)), bottom: Math.max(...drawn.map(g => g.bottom)) } }]
  }))
}

function tagFields(pages: PageText[], sizes: { width: number; height: number }[]): Field[] {
  return spans(pages, text => [...text.matchAll(tagPattern)].map(match => ({ index: match.index!, length: match[0].length, match }))).flatMap(({ match, box }, i) => {
    const [tag, type, recipient, label] = match!
    insist(taggableTypes.includes(type as Taggable), `The text tag ${tag} names an unknown field type; use ${taggableTypes.join(', ')}.`)
    insist(Number(recipient) >= 1, `The text tag ${tag} must name a recipient from 1.`)
    const at = place(box, sizes)
    return at ? [{ id: `tag-${i + 1}`, label: label ? oneLine(label, 100) : typeLabel(type as Taggable), type: type as Taggable, signer: Number(recipient) - 1, ...at, name: oneLine(label ?? tag, 200), origin: 'text_tag' as const }] : []
  })
}

function anchorFields(pages: PageText[], sizes: { width: number; height: number }[], anchors: Anchor[]): Field[] {
  let n = 0
  return anchors.flatMap(anchor => {
    const hits = spans(pages, text => { const found = []; for (let at = text.indexOf(anchor.text); at >= 0; at = text.indexOf(anchor.text, at + anchor.text.length)) found.push({ index: at, length: anchor.text.length, match: undefined }); return found })
    insist(hits.length, `No text in the document matches the anchor "${anchor.text}".`)
    return hits.flatMap(({ box }) => {
      const at = place({ page: box.page, left: box.left + anchor.x, top: box.top + anchor.y, right: box.left + anchor.x + anchor.width, bottom: box.top + anchor.y + anchor.height }, sizes)
      return at ? [{ id: `anchor-${++n}`, label: anchor.label ?? typeLabel(anchor.type), type: anchor.type, signer: anchor.recipient - 1, ...at, name: anchor.text, origin: 'anchor' as const }] : []
    })
  })
}

function widgetPage(document: PDFDocument, widget: PDFWidgetAnnotation) {
  const pages = document.getPages(), reference = widget.P()
  const byReference = reference ? pages.findIndex(page => page.ref === reference) : -1
  if (byReference >= 0) return byReference
  return pages.findIndex(page => page.node.Annots()?.asArray().some(item => document.context.lookup(item) === widget.dict))
}

/** One field per AcroForm field at its first widget (a radio group spans its widgets on that page); push buttons are skipped.
 * A list with more than 20 options, or options that do not fit Inkwell's limits, comes in as a text field. */
function formFields(document: PDFDocument, sizes: { width: number; height: number }[]): Field[] {
  const pages = document.getPages()
  if (!document.catalog.get(PDFName.of('AcroForm'))) return []
  return document.getForm().getFields().flatMap((field: PDFField, i): Field[] => {
    const widgets = field.acroField.getWidgets(), first = widgets[0]
    if (!first) return []
    const page = widgetPage(document, first)
    if (page < 0) return []
    const sameRow = field instanceof PDFRadioGroup ? widgets.filter(widget => widgetPage(document, widget) === page) : [first]
    const rects = sameRow.map(widget => widget.getRectangle()), crop = pages[page].getCropBox(), rotation = ((pages[page].getRotation().angle % 360) + 360) % 360
    const corners = rects.flatMap(r => [[r.x, r.y], [r.x + r.width, r.y + r.height]]).map(([ux, uy]) => rotation === 90 ? [uy - crop.y, ux - crop.x] : rotation === 180 ? [crop.x + crop.width - ux, uy - crop.y] : rotation === 270 ? [crop.y + crop.height - uy, crop.x + crop.width - ux] : [ux - crop.x, crop.y + crop.height - uy])
    const at = place({ page, left: Math.min(...corners.map(c => c[0])), right: Math.max(...corners.map(c => c[0])), top: Math.min(...corners.map(c => c[1])), bottom: Math.max(...corners.map(c => c[1])) }, sizes)
    if (!at) return []
    const name = field.getName(), alternate = field.acroField.dict.lookup(PDFName.of('TU')), partial = name.split('.').at(-1)!.replace(/\[0\]$/, '')
    const label = oneLine(alternate && 'decodeText' in alternate ? (alternate as { decodeText(): string }).decodeText() : partial, 100) || partial
    const options = field instanceof PDFDropdown || field instanceof PDFOptionList ? field.getOptions() : field instanceof PDFRadioGroup ? field.getOptions() : undefined
    const fits = options && options.length >= 2 && options.length <= 20 && new Set(options).size === options.length && options.every(o => o.trim().length > 0 && o.length <= 100 && !/[\x00-\x1f\x7f]/.test(o)) && JSON.stringify(options.map(o => o.trim())).length <= 500
    const type: Field['type'] | undefined = field instanceof PDFSignature ? 'signature' : field instanceof PDFCheckBox ? 'checkbox' : field instanceof PDFTextField ? 'text' : options ? (fits ? (field instanceof PDFRadioGroup ? 'radio' : 'dropdown') : 'text') : undefined
    if (!type) return []
    return [{ id: `form-${i + 1}`, label, type, signer: 0, ...at, ...(type === 'radio' || type === 'dropdown' ? { options: options!.map(o => o.trim()) } : {}), ...(type === 'signature' ? {} : { required: field.isRequired() }), name: oneLine(name, 200), origin: 'form_field' as const }]
  })
}

/** Every field the document carries, in page order of discovery: form fields, then text tags, then anchors. */
export async function documentFields(document: PDFDocument, sizes: { width: number; height: number }[], anchors: Anchor[] = []): Promise<Field[]> {
  const pages = await pageTexts(document)
  const fields = [...formFields(document, sizes), ...tagFields(pages, sizes), ...anchorFields(pages, sizes, anchors)]
  insist(fields.length <= 100, 'This document carries more than 100 fields; Inkwell places at most 100.')
  return fields
}

/** Whether an envelope's executed PDF replaces the document's own form fields with the Inkwell fields made from them. */
export const importsFormFields = (fields: Field[]) => fields.some(field => field.origin === 'form_field')

/** Where the document shows a text tag, in points from the displayed page's top-left corner. */
export async function tagBoxes(document: PDFDocument) {
  return spans(await pageTexts(document), text => [...text.matchAll(tagPattern)].map(match => ({ index: match.index!, length: match[0].length, match }))).map(hit => hit.box)
}
