import type { CSSProperties, ReactNode } from 'react'

// The small pieces every section draws with: eyebrows, two-line headings with the gradient second line, collaborator
// cursors, sticky notes, spark doodles, check dots, pills and initials. All of it is type, CSS and inline SVG.
// The copy in the sections keeps a no-break space before each separator (·, →, =, ×), so no line starts with one.

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="ik-eyebrow">{children}</p>
}

/** A section heading: an ink first line, then the emerald-to-blue second line. */
export function Heading({ first, second, level = 2, id }: { first: string; second: string; level?: 1 | 2; id?: string }) {
  const Tag = level === 1 ? 'h1' : 'h2'
  return <Tag className={level === 1 ? 'ik-h1' : 'ik-h2'} id={id}><span className="ik-line">{first}</span> <span className="ik-line ik-grad">{second}</span></Tag>
}

/** A collaborator's pointer and name tag; Rosa is green, Jamal is blue. */
export function Cursor({ name, className = '', style }: { name: 'Rosa' | 'Jamal'; className?: string; style?: CSSProperties }) {
  return (
    <span className={`ik-cursor ik-cursor--${name.toLowerCase()} ${className}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M3 2.5l17 7.2-7.3 2.3-2.9 7.6z" /></svg>
      <span>{name}</span>
    </span>
  )
}

/** A yellow handwritten sticky note, with an optional underline stroke under its last line. */
export function Sticky({ children, className = '', underline = true }: { children: ReactNode; className?: string; underline?: boolean }) {
  return (
    <p className={`ik-sticky ${className}`}>
      <span>{children}</span>
      {underline && <svg className="ik-sticky-line" viewBox="0 0 120 12" aria-hidden="true"><path d="M3 9C30 4 70 3 117 4" /></svg>}
    </p>
  )
}

/** Three short strokes, the doodled spark beside a card. */
export function Sparks({ tone = 'green', className = '', style }: { tone?: 'green' | 'blue'; className?: string; style?: CSSProperties }) {
  return (
    <svg className={`ik-sparks ik-sparks--${tone} ${className}`} style={style} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M6 24L16 28M14 8l6 12M30 6l-4 14" />
    </svg>
  )
}

/** A filled round check, the mark of a completed step. */
export function CheckDot({ tone = 'green', size = 22 }: { tone?: 'green' | 'blue'; size?: number }) {
  return (
    <svg className={`ik-checkdot ik-checkdot--${tone}`} width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="11" /><path d="M6.4 11.4l3.1 3 6.1-6.3" />
    </svg>
  )
}

/** The small check after a done line. */
export function Tick() {
  return <svg className="ik-tick" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.6l3 3 6-6.8" /></svg>
}

export function Pill({ tone = 'grey', children, className = '' }: { tone?: 'grey' | 'green' | 'blue' | 'red' | 'amber'; children: ReactNode; className?: string }) {
  return <span className={`ik-pill ik-pill--${tone} ${className}`}>{children}</span>
}

export function Avatar({ initials, tone }: { initials: string; tone: 'green' | 'blue' | 'violet' | 'rose' }) {
  return <span className={`ik-avatar ik-avatar--${tone}`} aria-hidden="true">{initials}</span>
}

/** A round icon tile for card headers. */
export function IconTile({ children, tone = 'grey' }: { children: ReactNode; tone?: 'grey' | 'green' | 'blue' | 'orange' }) {
  return <span className={`ik-icon-tile ik-icon-tile--${tone}`} aria-hidden="true">{children}</span>
}
