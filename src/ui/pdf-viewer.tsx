import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Field } from './types'
import { ErrorNotice } from './feedback'

type Props = { source: string | Uint8Array; fields?: Field[]; values?: Record<string, string>; onPlace?: (page: number, x: number, y: number) => void }
function Page({ page, index, fields, values, onPlace }: { page: PDFPageProxy; index: number } & Omit<Props, 'source'>) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!container.current) return; const observer = new ResizeObserver(entries => setWidth(Math.max(100, entries[0].contentRect.width))); observer.observe(container.current); return () => observer.disconnect() }, [])
  useEffect(() => { if (!container.current) return; const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { rootMargin: '600px' }); observer.observe(container.current); return () => observer.disconnect() }, [])
  useEffect(() => {
    if (!canvas.current) return
    if (!visible) { canvas.current.width = 1; canvas.current.height = 1; return }
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const target = canvas.current; target.width = Math.ceil(viewport.width * ratio); target.height = Math.ceil(viewport.height * ratio)
    const task = page.render({ canvas: target, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
    task.promise.catch((reason: Error) => { if (reason.name !== 'RenderingCancelledException') setError('Could not render this PDF page.') })
    return () => task.cancel()
  }, [page, width, visible])
  const aspect = page.getViewport({ scale: 1 })
  return <div className="iw-page-wrap"><p className="iw-caption">Page {index + 1}</p><div ref={container} className={`iw-pdf-page ${onPlace ? 'iw-placeable' : ''}`} style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }} role={onPlace ? 'button' : undefined} tabIndex={onPlace ? 0 : undefined} aria-label={onPlace ? `Place field on page ${index + 1}; press Enter to place at center` : `Document page ${index + 1}`} onKeyDown={event => { if (onPlace && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onPlace(index, .38, .45) } }} onClick={event => { if (!onPlace) return; const rect = event.currentTarget.getBoundingClientRect(); onPlace(index, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height) }}>
    <canvas ref={canvas} />
    {fields?.filter(field => field.page === index).map(field => <div key={field.id} className={`iw-field iw-field-${field.signer % 5}`} style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }}><span>{values?.[field.id] || `${field.signer + 1}: ${field.label}`}</span></div>)}
  </div><ErrorNotice error={error} /></div>
}
export function PdfViewer(props: Props) {
  const [pages, setPages] = useState<PDFPageProxy[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false; let loadingTask: PDFDocumentLoadingTask | undefined
    setPages([]); setError('')
    void (async () => {
      const pdfjs = await import('pdfjs-dist')
      if (disposed) return
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      loadingTask = pdfjs.getDocument(typeof props.source === 'string' ? { url: props.source, withCredentials: true } : { data: props.source.slice() })
      const document = await loadingTask.promise
      if (disposed) return
      const loaded = await Promise.all(Array.from({ length: document.numPages }, (_, index) => document.getPage(index + 1)))
      if (!disposed) setPages(loaded)
    })().catch(() => { if (!disposed) setError('Could not load this PDF. Check that it is a readable, unencrypted PDF.') })
    return () => { disposed = true; if (loadingTask) void loadingTask.destroy().catch(() => {}) }
  }, [props.source])
  return <div className="iw-pdf-viewer"><ErrorNotice error={error} />{!pages.length && !error && <p role="status">Loading PDF…</p>}{pages.map((page, index) => <Page key={index} page={page} index={index} fields={props.fields} values={props.values} onPlace={props.onPlace} />)}</div>
}
