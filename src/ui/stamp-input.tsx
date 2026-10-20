import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { MAX_STAMP_BYTES, stampParts } from '../inkwell/stamp-value'

/** Native image chooser shared by sender prefill and signing, within the existing field layout. */
export function StampInput({ label, details, value, onChange, disabled = false, readOnly = false, required = false, masked = false, inputRef }: { label: string; details?: ReactNode; value: string; onChange: (value: string) => void; disabled?: boolean; readOnly?: boolean; required?: boolean; masked?: boolean; inputRef?: RefObject<HTMLInputElement | HTMLSelectElement | null> }) {
  const [error, setError] = useState(''), own = useRef<HTMLInputElement | null>(null)
  async function choose(file?: File) {
    if (!file) return
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > MAX_STAMP_BYTES || !file.size) throw new Error('Choose a nonempty PNG or JPEG image of at most 512 KiB.')
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The image could not be read.')); reader.readAsDataURL(file) })
      setError(''); onChange(data)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The image could not be read.'); if (own.current) own.current.value = '' }
  }
  let preview = ''; try { if (value) { stampParts(value); preview = value } } catch {}
  return <div className="iw-stack"><label>{label}<span>{details}</span><input ref={element => { own.current = element; if (inputRef) inputRef.current = element }} type="file" accept="image/png,image/jpeg" required={required && !value && !readOnly} disabled={disabled || readOnly} onChange={event => void choose(event.target.files?.[0])} aria-invalid={Boolean(error)} /><small>PNG or JPEG, up to 512 KiB. An uploaded image, not a verified seal.</small></label>
    {value && <><p role="status">Stamp loaded{readOnly ? ' · Read-only' : ''}</p>{masked ? <p>Stamp hidden on display.</p> : <img src={preview || undefined} alt={`Preview of ${label}`} style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain' }} />}{!readOnly && <button type="button" disabled={disabled} onClick={() => { if (own.current) own.current.value = ''; onChange(''); setError('') }}>Clear {label}</button>}</>}
    {error && <p className="iw-error" role="alert">{error}</p>}
  </div>
}
