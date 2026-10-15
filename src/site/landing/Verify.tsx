import { Check } from '../shell/Check'
import { Feature } from './Feature'
import { ProductCard } from './ProductCard'

const hashes = [['Original SHA-256', '9f2c…e41a'], ['Executed PDF SHA-256', '4b81…07dc'], ['Certificate SHA-256', 'c3e0…5a92']]

export function Verify() {
  return (
    <Feature id="verify" eyebrow="Verify" title="Check it again, any time." drawing="right"
      body="One click recomputes the fingerprint of the original, the signed PDF and the certificate, and checks every step of the audit trail."
      label="Inkwell's artifact integrity panel: three fingerprints, the Verify stored artifacts button and a passed check.">
      <ProductCard title="Artifact integrity">
        <dl className="ik-hashes">{hashes.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
        <span className="ik-drawn-primary">Verify stored artifacts</span>
        <p className="ik-result"><Check /><span>Integrity checks passed.<small>Audit chain: valid · 9 events</small></span></p>
      </ProductCard>
    </Feature>
  )
}
