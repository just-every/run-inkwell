import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PDFDocumentLoadingTask, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Field } from './types'
import { ErrorNotice } from './feedback'
import { EditableField, type FieldEditing } from './editable-field'
import { PageThumbnails } from './page-thumbnails'

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | undefined
/** SIGNX-001: start loading pdf.js and its worker before the document is needed (the signing page calls this while it
 * fetches the request), so the first page draws sooner on a slow phone. */
export function preloadPdf() {
  pdfjsReady ??= import('pdfjs-dist').then(pdfjs => { if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: 'module' }); return pdfjs })
  return pdfjsReady
}
// PREP-005: with `editing` the prepare screen's fields can be selected, moved, resized and removed on the page, and
// `onPlace` adds page thumbnails that place a field where they are clicked.
type Props = { source: string | Uint8Array; fields?: Field[]; values?: Record<string, string>; activeField?: string; onPlace?: (page: number, x: number, y: number) => void; editing?: FieldEditing; onPages?: (count: number) => void; toolbar?: ReactNode }
function Page({ page, index, fields, values, activeField, onPlace, editing }: { page: PDFPageProxy; index: number } & Omit<Props, 'source' | 'onPages' | 'toolbar'>) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [rendered, setRendered] = useState(false)
  useEffect(() => { if (!container.current) return; const observer = new ResizeObserver(entries => setWidth(Math.max(100, entries[0].contentRect.width))); observer.observe(container.current); return () => observer.disconnect() }, [])
  useEffect(() => { if (!container.current) return; const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { rootMargin: '600px' }); observer.observe(container.current); return () => observer.disconnect() }, [])
  useEffect(() => {
    if (!canvas.current) return
    if (!visible) { canvas.current.width = 1; canvas.current.height = 1; return }
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
    // SIGNX-001: drawn at the screen's pixel density (up to 3x) so text stays sharp on a phone.
    const ratio = Math.min(window.devicePixelRatio || 1, 3)
    const target = canvas.current; target.width = Math.ceil(viewport.width * ratio); target.height = Math.ceil(viewport.height * ratio)
    const task = page.render({ canvas: target, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
    // SIGNX-001: the first page drawn marks the signer's time to first page.
    task.promise.then(() => { setRendered(true); if (!performance.getEntriesByName('iw-first-page').length) performance.mark('iw-first-page') }, () => {})
    task.promise.catch((reason: Error) => { if (reason.name !== 'RenderingCancelledException') setError('Could not render this PDF page.') })
    return () => task.cancel()
  }, [page, width, visible])
  // SIGNX-001: the page holding the field the signer is on scrolls it into view, also when the page arrives after Next.
  useEffect(() => { if (activeField && fields?.some(field => field.id === activeField && field.page === index)) container.current?.querySelector(`[data-field-id="${CSS.escape(activeField)}"]`)?.scrollIntoView({ block: 'center' }) }, [activeField])
  const aspect = page.getViewport({ scale: 1 })
  // The page itself is the "Place field" button; placed fields sit beside it, above the drawing, so each can take focus.
  return <div className="iw-page-wrap"><p className="iw-caption">Page {index + 1}</p><div ref={container} className="iw-pdf-page" data-rendered={rendered || undefined} style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }} aria-label={onPlace ? undefined : `Document page ${index + 1}`}>
    <canvas ref={canvas} />
    {onPlace && <div className="iw-page-hit iw-placeable" data-place-page={index} role="button" tabIndex={0} aria-label={`Place field on page ${index + 1}; press Enter to place at center`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPlace(index, .38, .45) } }} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onPlace(index, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height) }} />}
    {fields?.filter(field => field.page === index).map(field => editing ? <EditableField key={field.id} field={field} editing={editing} /> : <div key={field.id} data-field-id={field.id} className={`iw-field${field.id === activeField ? ' iw-field-active' : ''}`} style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }}><span>{values?.[field.id] ? field.type === 'checkbox' ? values[field.id] === 'true' ? '☑' : '☐' : field.type === 'number' ? `$${values[field.id]}` : values[field.id] : `${field.signer + 1}: ${field.label}`} </span></div>)}
  </div><ErrorNotice error={error} /></div>
}
export function PdfViewer(props: Props) {
  const [pages, setPages] = useState<PDFPageProxy[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false; let loadingTask: PDFDocumentLoadingTask | undefined
    setPages([]); setError('')
    void (async () => {
      const pdfjs = await preloadPdf()
      if (disposed) return
      loadingTask = pdfjs.getDocument(typeof props.source === 'string' ? { url: props.source, withCredentials: true } : { data: props.source.slice() })
      const document = await loadingTask.promise
      if (disposed) return
      // SIGNX-001: each page shows as soon as it loads; Page draws only those near the screen.
      props.onPages?.(document.numPages)
      for (let index = 1; index <= document.numPages; index++) { const page = await document.getPage(index); if (disposed) return; setPages(current => [...current, page]) }
    })().catch(() => { if (!disposed) setError('Could not load this PDF. Check that it is a readable, unencrypted PDF.') })
    return () => { disposed = true; if (loadingTask) void loadingTask.destroy().catch(() => {}) }
  }, [props.source])
  return <div className="iw-pdf-viewer"><ErrorNotice error={error} />{!pages.length && !error && <p role="status">Loading PDF…</p>}{props.onPlace && pages.length > 0 && <PageThumbnails pages={pages} fields={props.fields ?? []} onPlace={props.onPlace}>{props.toolbar}</PageThumbnails>}{pages.map((page, index) => <Page key={index} page={page} index={index} fields={props.fields} values={props.values} activeField={props.activeField} onPlace={props.onPlace} editing={props.editing} />)}</div>
}
