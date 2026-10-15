import { Feature } from './Feature'
import { ProductCard } from './ProductCard'

export function Agents() {
  return (
    <Feature id="agents" eyebrow="Agents" title="Let an agent set it up." drawing="right"
      body="Give an agent a preparation token and it can prepare envelopes. You review each one and send it."
      label="An active preparation token, and the envelope it prepared waiting for review.">
      <ProductCard title="Issued tokens">
        <p className="ik-box"><span>Preparation token</span><span className="ik-chip ik-chip--plum">Active</span></p>
        <p className="ik-box"><span><span>NDA — Harbor Labs</span><small>Priya Nair → Tom Weller</small></span><span className="ik-chip">prepared</span></p>
      </ProductCard>
    </Feature>
  )
}
