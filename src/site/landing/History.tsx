import { Feature } from './Feature'
import { ProductCard } from './ProductCard'

const events = [['envelope.prepared', '10:02'], ['envelope.approved', '10:05'], ['signer.email verified', '10:31'], ['signer.signed', '10:33'], ['signer.signed', '14:12'], ['envelope.completed', '14:12'], ['certificate.created', '14:12']]

export function History() {
  return (
    <Feature id="history" eyebrow="History" title="Every step on the record." drawing="left"
      body="Who prepared, sent, verified and signed, and when, in a chained audit trail you can download."
      label="An envelope's audit trail: prepared, approved, email verified, signed twice, completed and certificate created.">
      <ProductCard title="Audit trail (9)">
        <ol className="ik-timeline">{events.map(([name, time], index) => <li key={index}><span>{name}</span><time>{time}</time></li>)}</ol>
      </ProductCard>
    </Feature>
  )
}
