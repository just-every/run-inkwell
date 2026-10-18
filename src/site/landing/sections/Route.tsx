import { Avatar, CheckDot, Cursor, Eyebrow, Heading, Sparks, Tick } from '../parts'

/** 04: the template's roles and its over-$10,000 rule, then the route it produced for the Brightwater envelope. */
export function Route() {
  return (
    <section className="ik-section ik-split ik-split--flip ik-route" aria-labelledby="route-title">
      <div className="ik-wrap ik-split-grid">
        <div className="ik-stage ik-route-stage">
          <article className="ik-card ik-template">
            <p className="ik-card-eyebrow">Template · Service Agreement v3</p>
            <ol>
              <li><span className="ik-num">1</span>Client</li>
              <li><span className="ik-num">2</span>Finance Director<span className="ik-chip ik-chip--blue">if total over $10,000</span></li>
              <li><span className="ik-num">3</span>Company Signer</li>
            </ol>
            <Sparks className="ik-rt-spark ik-rt-spark--1" />
          </article>
          <ol className="ik-route-list">
            <li>
              <span className="ik-route-num">1</span>
              <article className="ik-card ik-signer">
                <header><Avatar initials="AC" tone="green" /><div><h3>Dr. Amy Chen</h3><p>Client · Medical Director</p></div><span className="ik-chip">Email code</span></header>
                <p className="ik-signer-done"><CheckDot />Delivered 9:12 · opened 10:02 · signed 3:47 pm <Tick /></p>
              </article>
            </li>
            <li>
              <span className="ik-route-num">2</span>
              <article className="ik-card ik-signer ik-signer--rule">
                <header><Avatar initials="ME" tone="blue" /><div><h3>Mark Ellis</h3><p>Finance Director</p></div><span className="ik-chip ik-chip--blue">Added by rule</span></header>
                <p className="ik-signer-note">Total $48,600 is over $10,000</p>
                <Cursor name="Rosa" className="ik-route-rosa" />
                <Sparks className="ik-rt-spark ik-rt-spark--2" />
              </article>
            </li>
            <li>
              <span className="ik-route-num">3</span>
              <article className="ik-card ik-signer">
                <header><Avatar initials="RD" tone="violet" /><div><h3>Rosa Delgado</h3><p>Company Signer · signs in Inkwell</p></div><span className="ik-chip">Signed in</span></header>
              </article>
            </li>
          </ol>
          <div className="ik-route-branch">
            <article className="ik-card ik-mini"><p className="ik-card-eyebrow">Gets a copy</p><p>ap@brightwatermed.com · completed record only</p></article>
            <article className="ik-card ik-mini"><p className="ik-card-eyebrow">Who sees what</p><p>W-9 · Mark Ellis and Rosa only</p></article>
          </div>
        </div>
        <div className="ik-copy">
          <Eyebrow>Route · Tue Oct 13, 9:12 am</Eyebrow>
          <Heading id="route-title" first="Every signer," second="in the right order." />
          <p className="ik-body">The template knows the roles. A rule adds the finance director when the contract is over $10,000.</p>
        </div>
      </div>
    </section>
  )
}
