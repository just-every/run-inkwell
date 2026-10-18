import { CheckDot, Eyebrow, Heading, Sparks, Tick } from '../parts'

/** 06: guided phone signing at step 4 of 6, with the email code check and the signer assistant beside the phone. */
export function Sign() {
  return (
    <section className="ik-section ik-split ik-split--flip ik-sign" aria-labelledby="sign-title">
      <div className="ik-wrap ik-split-grid">
        <div className="ik-stage ik-sign-stage">
          <div className="ik-phone" role="img" aria-label="Mark Ellis's phone at step 4 of 6, Sign here, with his drawn signature">
            <div className="ik-phone-screen">
              <div className="ik-phone-status"><span>11:20</span><span className="ik-phone-island" /><span className="ik-phone-icons"><i /><i /><i /></span></div>
              <div className="ik-phone-top"><strong>Harborline Facility Services</strong><span>English <b>|</b> Español</span></div>
              <div className="ik-phone-progress"><span /></div>
              <p className="ik-phone-step">Step 4 of 6 · Sign here</p>
              <div className="ik-phone-doc">
                <p className="ik-phone-doc-title">5. Signatures</p>
                <p>Each party signs below to accept this Agreement for Brightwater Medical Group, LLC and Harborline Facility Services.</p>
                <div className="ik-phone-sign">
                  <span className="ik-phone-flag">Sign here</span>
                  <span className="ik-signature ik-signature--mark">Mark Ellis</span>
                </div>
                <div className="ik-phone-buttons"><span>Clear</span><span>Adopt and sign</span></div>
              </div>
              <p className="ik-phone-foot">Section 5 · page 5 of 6</p>
            </div>
          </div>
          <article className="ik-card ik-verified">
            <CheckDot size={30} />
            <div><p className="ik-card-eyebrow">Verified</p><p><strong>Email code</strong> · 11:18 am <Tick /></p></div>
          </article>
          <article className="ik-card ik-assistant">
            <p className="ik-assistant-label"><span className="ik-live ik-live--blue" />Signer assistant</p>
            <h3>What does 'net 30' mean?</h3>
            <p>Invoices are due 30 days after you receive them. Section 3, page 2.</p>
          </article>
          <span className="ik-sign-link ik-sign-link--1" aria-hidden="true" />
          <span className="ik-sign-link ik-sign-link--2" aria-hidden="true" />
          <Sparks className="ik-sg-spark ik-sg-spark--1" />
          <Sparks className="ik-sg-spark ik-sg-spark--2" />
          <Sparks className="ik-sg-spark ik-sg-spark--3" />
          <Sparks className="ik-sg-spark ik-sg-spark--4" />
        </div>
        <div className="ik-copy">
          <Eyebrow>Sign · Thu Oct 15, 11:20 am</Eyebrow>
          <Heading id="sign-title" first="Signed on his phone," second="step by step." />
          <p className="ik-body">Mark taps Next through each field, in English or Spanish, and finishes in two minutes.</p>
          <p className="ik-pill ik-pill--green ik-pill--lg ik-sign-pill"><strong>Mark Ellis signed on iPhone</strong> · Thu Oct 15, 11:20 am <Tick /></p>
        </div>
      </div>
    </section>
  )
}
