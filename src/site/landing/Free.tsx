import { Feature } from './Feature'
import { ProductCard } from './ProductCard'

export function Free() {
  return (
    <Feature id="free" eyebrow="Free" title="100% free. Yours to keep." drawing="left"
      body="MIT licensed. Every agreement, certificate and audit trail stays with you, and you can download the lot."
      label="The MIT License, and Inkwell's full archive with its Download full archive button.">
      <div className="ik-pair">
        <ProductCard title="MIT License"><span className="ik-lines" aria-hidden="true"><i /><i /></span></ProductCard>
        <ProductCard title="Full archive"><span className="ik-drawn-primary ik-drawn-primary--fit">Download full archive</span></ProductCard>
      </div>
    </Feature>
  )
}
