import { Check } from '../shell/Check'
import { Feature } from './Feature'
import { ProductCard } from './ProductCard'

export function Signers() {
  return (
    <Feature id="signers" eyebrow="Signers" title="Easy for every signer." drawing="right"
      body="Each person opens their own private link, reads the document, types their name and signs. The next person is invited after."
      label="A signer's fields: their typed name in the signature field, the Sign document button and the recorded signature.">
      <ProductCard title="Services agreement">
        <p className="ik-card-sub">For Sam Ortiz · sam@ortiz.example</p>
        <p className="ik-card-label">Your fields</p>
        <span className="ik-field-group"><small>Page 1 · signature</small><span className="ik-typed">Sam Ortiz</span></span>
        <span className="ik-drawn-primary">Sign document</span>
        <p className="ik-result ik-result--small"><Check /><span>Your signature has been recorded.</span></p>
      </ProductCard>
    </Feature>
  )
}
