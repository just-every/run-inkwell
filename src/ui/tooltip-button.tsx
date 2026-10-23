import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'

/** A short label for icon controls: 300 ms on hover, immediate on keyboard focus. */
export function TooltipButton({ tooltip, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tooltip: string }) {
  const id = useId(), button = useRef<HTMLButtonElement>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [position, setPosition] = useState<{ left: number; top: number }>()
  const clear = () => { clearTimeout(timer.current); timer.current = undefined }
  const hide = () => { clear(); setPosition(undefined) }
  const show = () => {
    clear()
    const rect = button.current?.getBoundingClientRect()
    if (rect) setPosition({ left: Math.max(70, Math.min(innerWidth - 70, rect.left + rect.width / 2)), top: rect.top > 45 ? rect.top - 38 : rect.bottom + 6 })
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return <><button {...props} ref={button} aria-describedby={[props['aria-describedby'], position ? id : undefined].filter(Boolean).join(' ') || undefined}
    onMouseEnter={event => { props.onMouseEnter?.(event); clear(); timer.current = setTimeout(show, 300) }}
    onMouseLeave={event => { props.onMouseLeave?.(event); hide() }}
    onFocus={event => { props.onFocus?.(event); show() }} onBlur={event => { props.onBlur?.(event); hide() }}
    onKeyDown={event => { props.onKeyDown?.(event); if (event.key === 'Escape') hide() }}
    onClick={event => { hide(); props.onClick?.(event) }}>{children}</button>
    {position && createPortal(<span id={id} role="tooltip" style={{ position: 'fixed', zIndex: 1000, left: position.left, top: position.top, transform: 'translateX(-50%)', padding: '6px 10px', borderRadius: 4, background: '#101628', color: '#fff', font: '14px/20px sans-serif', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{tooltip}</span>, document.body)}</>
}
