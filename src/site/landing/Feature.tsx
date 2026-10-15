import type { ReactNode } from 'react'

/**
 * One section: eyebrow, serif heading and one or two lines beside one small drawing. `drawing` says which side the
 * drawing sits on at desktop width; on phones the text comes first and the drawing follows.
 */
export function Feature({ id, eyebrow, title, body, drawing, label, children }: { id: string; eyebrow: string; title: string; body: string; drawing: 'left' | 'right'; label: string; children: ReactNode }) {
  return (
    <section className={`ik-feature ik-feature--${drawing}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="ik-feature-text">
        <p className="ik-eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`}>{title}</h2>
        <p className="ik-body">{body}</p>
      </div>
      <figure className="ik-drawing" aria-label={label}>{children}</figure>
    </section>
  )
}
