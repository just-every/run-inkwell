import { Check } from '../shell/Check'
import { Marble } from '../shell/Marble'
import { ProductCard } from './ProductCard'

const label = "Inkwell's flow: fields are placed on the agreement, each person signs in order, and the completed envelope keeps the executed PDF and certificate."

export function Hero() {
  return (
    <section className="ik-hero" id="top" aria-labelledby="top-title">
      <div className="ik-hero-text">
        <h1 id="top-title">Get it signed, keep the record.</h1>
        <p className="ik-sub">Send a PDF to each signer in turn, and keep the signed file, certificate and history.</p>
        <p className="ik-alt">100% free, open source alternative to <strong>DocuSign</strong>, <strong>Dropbox Sign</strong> and <strong>PandaDoc</strong></p>
        <div className="ik-actions">
          <a className="ik-pill" href="/run">Run Inkwell <span aria-hidden="true">→</span></a>
          <a className="ik-pill" href="https://demo.run-inkwell.com/">Try the demo</a>
          <a className="ik-link" href="/docs">Read the docs</a>
        </div>
        <p className="ik-small">Free and open source, MIT licensed.</p>
      </div>
      <figure className="ik-flow" aria-label={label}>
        <ol className="ik-steps">
          <li>
            <h3 className="ik-step"><span className="ik-disc" aria-hidden="true">1</span>Place fields</h3>
            <ProductCard title="Services agreement" className="ik-page-card">
              <span className="ik-lines" aria-hidden="true"><i /><i /><i /></span>
              <span className="ik-field-box">1: Signature</span>
              <span className="ik-field-box">2: Signature</span>
            </ProductCard>
          </li>
          <li>
            <h3 className="ik-step"><span className="ik-disc" aria-hidden="true">2</span>Sign in order</h3>
            <ProductCard className="ik-signed-card">
              <p className="ik-signed-row"><span>Maya Chen</span><Check /><span>Signed</span></p>
              <p className="ik-signed-row"><span>Sam Ortiz</span><Check /><span>Signed</span></p>
            </ProductCard>
          </li>
          <li>
            <h3 className="ik-step"><span className="ik-disc" aria-hidden="true">3</span>Completed</h3>
            <ProductCard className="ik-done-card">
              <span className="ik-chip ik-chip--plum">completed</span>
              <span className="ik-buttons"><span className="ik-drawn-button">Executed PDF</span><span className="ik-drawn-button">Certificate</span></span>
              <p className="ik-done-line">Integrity checks passed.</p>
            </ProductCard>
          </li>
        </ol>
        <Marble className="ik-marble--hero" />
      </figure>
    </section>
  )
}
