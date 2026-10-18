import { SheetIcon } from '../icons'
import { Cursor, Eyebrow, Heading, Pill, Sparks, Tick } from '../parts'

const signers = [
  ['Dr. Amy Chen', 'Client', 'Email code', 'Tue Oct 13 3:47 pm / 19:47'],
  ['Mark Ellis', 'Finance Director', 'Email code', 'Thu Oct 15 11:20 am / 15:20'],
  ['Rosa Delgado', 'Company Signer', 'Signed in · passkey', 'Thu Oct 15 2:41 pm / 18:41'],
]

/** 07: the certificate of completion for INK-1048, the agent's revision check and the public verify page. */
export function Seal() {
  return (
    <section className="ik-section ik-split ik-sealing" aria-labelledby="seal-title">
      <div className="ik-wrap ik-split-grid">
        <div className="ik-copy">
          <Eyebrow>Seal · Thu Oct 15, 2:41 pm</Eyebrow>
          <Heading id="seal-title" first="Sealed the second" second="Rosa signs." />
          <p className="ik-body">Rosa countersigns from her Waiting for me list. Inkwell seals the PDF and writes a certificate anyone can check.</p>
        </div>
        <div className="ik-stage ik-seal-stage">
          <article className="ik-card ik-certificate">
            <header>
              <svg className="ik-seal ik-seal--lg" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 2l4.6 3.6 5.8-.6 2.2 5.4 5.4 2.2-.6 5.8L45 24l-3.6 4.6.6 5.8-5.4 2.2-2.2 5.4-5.8-.6L24 46l-4.6-3.6-5.8.6-2.2-5.4-5.4-2.2.6-5.8L3 24l3.6-4.6-.6-5.8 5.4-2.2 2.2-5.4 5.8.6z" /><path d="M15.5 24.5l5.5 5.5 11.5-12" /></svg>
              <div><h3>Certificate of completion</h3><p>Envelope INK-1048 · Brightwater Medical · Service Agreement v3 + W-9</p></div>
              <Cursor name="Rosa" className="ik-seal-rosa" />
            </header>
            <div className="ik-cert-table" role="table" aria-label="Signers">
              <div role="row" className="ik-cert-head"><span role="columnheader">Signer</span><span role="columnheader">Verified by</span><span role="columnheader">Signed (ET / UTC)</span></div>
              {signers.map(([name, role, method, when]) => (
                <div role="row" key={name}><span role="cell"><strong>{name}</strong> · {role}</span><span role="cell">{method} <Tick /></span><span role="cell">{when}</span></div>
              ))}
            </div>
            <footer><span className="ik-mono">SHA-256 4f9a…c21e</span><Pill tone="green" className="ik-pill--lg">sealed PDF <Tick /></Pill></footer>
            <Sparks className="ik-se-spark ik-se-spark--1" />
            <Sparks tone="blue" className="ik-se-spark ik-se-spark--2" />
          </article>
          <div className="ik-seal-row">
            <article className="ik-card ik-check">
              <p className="ik-check-title"><span className="ik-live ik-live--lg" />Agent check</p>
              <p>Same revision for all 3 signers <Tick /></p>
              <p>Entity matches HubSpot <Tick /></p>
              <Sparks className="ik-se-spark ik-se-spark--3" />
            </article>
            <article className="ik-card ik-verify">
              <span className="ik-doc-tile ik-doc-tile--round"><SheetIcon /></span>
              <div><h3>Verify a PDF</h3><p>Brightwater-Service-Agreement.pdf</p><Pill tone="green">Matches INK-1048 · unmodified <Tick /></Pill></div>
              <Sparks tone="blue" className="ik-se-spark ik-se-spark--4" />
            </article>
          </div>
        </div>
      </div>
    </section>
  )
}
