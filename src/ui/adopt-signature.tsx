import { useEffect, useRef, useState } from 'react'

/** SIGNX-002: the signer adopts the mark applied to every signature field: their name typed in a style, drawn with a
 * finger, pen or mouse, or an uploaded PNG or JPEG of at most 512 KiB. */
export type AdoptionInput = { method: 'typed'; style: Style } | { method: 'drawn'; imageBase64: string } | { method: 'uploaded'; mediaType: 'image/png' | 'image/jpeg'; imageBase64: string }
export type SavedMark = { adoption: { method: 'typed' | 'drawn' | 'uploaded'; style?: Style; mediaType?: 'image/png' | 'image/jpeg' }; imageBase64?: string }
type Style = 'sans' | 'serif' | 'serif-bold'
const styles: { id: Style; label: string; className: string }[] = [
  { id: 'sans', label: 'Sans italic', className: 'iw-mark-sans' },
  { id: 'serif', label: 'Serif italic', className: 'iw-mark-serif' },
  { id: 'serif-bold', label: 'Serif bold italic', className: 'iw-mark-serif-bold' },
]
export const defaultAdoption: AdoptionInput = { method: 'typed', style: 'sans' }
const MAX_MARK = 512 * 1024
export function fromSaved(saved: SavedMark): AdoptionInput {
  const { adoption, imageBase64 } = saved
  if (adoption.method === 'typed' || !imageBase64) return { method: 'typed', style: adoption.style ?? 'sans' }
  return adoption.method === 'drawn' ? { method: 'drawn', imageBase64 } : { method: 'uploaded', mediaType: adoption.mediaType ?? 'image/png', imageBase64 }
}
const base64 = (bytes: Uint8Array) => { let out = ''; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out) }

type Props = { kind?: 'signature' | 'initials'; name: string; value: AdoptionInput; onChange: (value: AdoptionInput) => void; disabled: boolean }
export function AdoptSignature({ kind = 'signature', name, value, onChange, disabled }: Props) {
  const [method, setMethod] = useState<AdoptionInput['method']>(value.method)
  const [error, setError] = useState('')
  const shown = name.trim() || (kind === 'initials' ? 'Your initials' : 'Your name')
  function choose(next: AdoptionInput['method']) { setMethod(next); setError(''); if (next === 'typed') onChange(value.method === 'typed' ? value : defaultAdoption) }
  async function upload(file?: File) {
    setError('')
    if (!file) return
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') return setError('Choose a PNG or JPEG image.')
    if (file.size > MAX_MARK) return setError('Choose an image of at most 512 KB.')
    onChange({ method: 'uploaded', mediaType: file.type, imageBase64: base64(new Uint8Array(await file.arrayBuffer())) })
  }
  const image = value.method !== 'typed' && value.method === method ? `data:${value.method === 'uploaded' ? value.mediaType : 'image/png'};base64,${value.imageBase64}` : undefined
  return <fieldset className="iw-adopt iw-stack" disabled={disabled}>
    <legend>Adopt your {kind} <span>applied to every {kind} field</span></legend>
    <div className="iw-adopt-methods" role="radiogroup" aria-label={`How to adopt your ${kind}`}>
      {(['typed', 'drawn', 'uploaded'] as const).map(id => <label key={id} className="iw-check"><input type="radio" name={`iw-adopt-method-${kind}`} checked={method === id} onChange={() => choose(id)} />{id === 'typed' ? 'Type' : id === 'drawn' ? 'Draw' : 'Upload'}</label>)}
    </div>
    {method === 'typed' && <div className="iw-adopt-styles" role="radiogroup" aria-label={`${kind === 'signature' ? 'Signature' : 'Initials'} style`}>
      {styles.map(style => <label key={style.id} className="iw-check"><input type="radio" name={`iw-adopt-style-${kind}`} checked={value.method === 'typed' && value.style === style.id} onChange={() => onChange({ method: 'typed', style: style.id })} /><span><span className={`iw-mark-preview ${style.className}`}>{shown}</span><small>{style.label}</small></span></label>)}
    </div>}
    {method === 'drawn' && <DrawPad kind={kind} onDrawn={imageBase64 => onChange(imageBase64 ? { method: 'drawn', imageBase64 } : defaultAdoption)} drawn={image} />}
    {method === 'uploaded' && <label>{kind === 'signature' ? 'Signature' : 'Initials'} image (PNG or JPEG, up to 512 KB)<input type="file" accept="image/png,image/jpeg" onChange={event => void upload(event.target.files?.[0])} /></label>}
    {method === 'uploaded' && image && <img className="iw-mark-image" src={image} alt={`Your uploaded ${kind}`} />}
    {method !== 'typed' && !image && <p className="iw-muted" role="status">{method === 'drawn' ? `Draw your ${kind} in the box.` : `Choose an image of your ${kind}.`} Until then your typed {kind === 'signature' ? 'name' : 'initials'} is used.</p>}
    {error && <p className="iw-error" role="alert">{error}</p>}
  </fieldset>
}

/** A drawing area for a finger, pen or mouse. Each stroke ends by exporting the drawing, cropped to the ink, as a PNG. */
function DrawPad({ kind, onDrawn, drawn }: { kind: 'signature' | 'initials'; onDrawn: (imageBase64?: string) => void; drawn?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null), bounds = useRef<{ x0: number; y0: number; x1: number; y1: number } | undefined>(undefined), last = useRef<{ x: number; y: number } | undefined>(undefined)
  useEffect(() => {
    const element = canvas.current!, ratio = Math.min(3, window.devicePixelRatio || 1)
    element.width = element.clientWidth * ratio; element.height = element.clientHeight * ratio
    const context = element.getContext('2d')!
    context.scale(ratio, ratio); context.lineWidth = 2.4; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#14203a'
    if (drawn) { const image = new Image(); image.onload = () => context.drawImage(image, 8, 8, Math.min(image.width / ratio, element.clientWidth - 16), Math.min(image.height / ratio, element.clientHeight - 16)); image.src = drawn }
  }, [])
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const r = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top } }
  function extend({ x, y }: { x: number; y: number }) { const b = bounds.current; bounds.current = b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y } }
  function down(event: React.PointerEvent<HTMLCanvasElement>) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); last.current = point(event); extend(last.current) }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return
    const next = point(event), context = event.currentTarget.getContext('2d')!
    context.beginPath(); context.moveTo(last.current.x, last.current.y); context.lineTo(next.x, next.y); context.stroke()
    last.current = next; extend(next)
  }
  function up() {
    if (!last.current) return
    last.current = undefined
    const element = canvas.current!, b = bounds.current!, ratio = element.width / element.clientWidth, pad = 4
    const x = Math.max(0, (b.x0 - pad) * ratio), y = Math.max(0, (b.y0 - pad) * ratio), w = Math.min(element.width - x, (b.x1 - b.x0 + 2 * pad) * ratio), h = Math.min(element.height - y, (b.y1 - b.y0 + 2 * pad) * ratio)
    const crop = document.createElement('canvas'); crop.width = Math.max(1, Math.round(w)); crop.height = Math.max(1, Math.round(h))
    crop.getContext('2d')!.drawImage(element, x, y, w, h, 0, 0, crop.width, crop.height)
    onDrawn(crop.toDataURL('image/png').split(',')[1])
  }
  function clear() { const element = canvas.current!; element.getContext('2d')!.clearRect(0, 0, element.width, element.height); bounds.current = undefined; onDrawn(undefined) }
  return <div className="iw-stack">
    <canvas ref={canvas} className="iw-draw-pad" role="img" aria-label={`${kind === 'signature' ? 'Signature' : 'Initials'} drawing area: draw with your finger, a pen or the mouse`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    <button type="button" className="iw-fit" onClick={clear}>Clear drawing</button>
  </div>
}
