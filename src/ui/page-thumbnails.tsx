import { useEffect, useRef, type ReactNode } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { Field } from './types'
import { colorClass } from './field-layout'

const thumbWidth = 84

function Thumbnail({ page, index, fields, onPlace }: { page: PDFPageProxy; index: number; fields: Field[]; onPlace: (page: number, x: number, y: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvas.current) return
    const viewport = page.getViewport({ scale: thumbWidth / page.getViewport({ scale: 1 }).width }), ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.current.width = Math.ceil(viewport.width * ratio); canvas.current.height = Math.ceil(viewport.height * ratio)
    const task = page.render({ canvas: canvas.current, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
    task.promise.catch(() => {})
    return () => task.cancel()
  }, [page])
  const aspect = page.getViewport({ scale: 1 })
  return <button type="button" className="iw-thumb" data-place-page={index} aria-label={`Page ${index + 1} thumbnail: put a field here (${fields.length} placed)`} style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onPlace(index, event.detail ? (event.clientX - rect.left) / rect.width : .38, event.detail ? (event.clientY - rect.top) / rect.height : .45) }}>
    <canvas ref={canvas} aria-hidden="true" />
    {fields.map(field => <span key={field.id} aria-hidden="true" className={`iw-thumb-field ${colorClass(field.signer)}`} style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }} />)}
    <span className="iw-thumb-number" aria-hidden="true">{index + 1}</span>
  </button>
}

/** PREP-005: every page small, beside the full pages: a click (or Enter, at the center) places the chosen field on that
 * page at that spot, a field or the drag chip dropped on it lands there, and each placed field shows in its recipient's
 * color. The strip stays at the top of the screen while the pages scroll, with the drag chip (`children`) at its start. */
export function PageThumbnails({ pages, fields, onPlace, children }: { pages: PDFPageProxy[]; fields: Field[]; onPlace: (page: number, x: number, y: number) => void; children?: ReactNode }) {
  return <nav className="iw-thumbs" aria-label="Page thumbnails">{children}{pages.map((page, index) => <Thumbnail key={index} page={page} index={index} fields={fields.filter(field => field.page === index)} onPlace={onPlace} />)}</nav>
}
