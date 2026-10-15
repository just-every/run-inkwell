import type { ReactNode } from 'react'

/** A white product card on paper: every drawing on the page is one or two of these, holding real labels. */
export function ProductCard({ title, className = '', children }: { title?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={`ik-card ${className}`}>
      {title && <p className="ik-card-title">{title}</p>}
      {children}
    </div>
  )
}
