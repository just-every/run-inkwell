import { Qr } from '../art/Qr'
import { CheckDot, Cursor, Eyebrow, Heading, Sparks, Tick } from '../parts'

/** 11: Harborline's own NDA page with the embedded form Kenji Watanabe signed, the form's card, the embed snippet and the
 *  submission Rosa countersigned. */
export function WebForm() {
  return (
    <section className="ik-section ik-split ik-webform" aria-labelledby="webform-title">
      <div className="ik-wrap ik-split-grid">
        <div className="ik-copy">
          <Eyebrow>Web form · October</Eyebrow>
          <Heading id="webform-title" first="Signed straight from" second="your website." />
          <p className="ik-body">Visitors fill in their name, verify their email and sign. Each one becomes an envelope that routes to Rosa to countersign.</p>
          <article className="ik-card ik-form-card">
            <div><h3>Website NDA form</h3><p>23 signed in October</p><p className="ik-form-link">harborline.com/nda</p><span className="ik-chip">Bot check on · 4 blocked</span></div>
            <Qr className="ik-qr" />
          </article>
        </div>
        <div className="ik-stage ik-webform-stage">
          <div className="ik-browser">
            <div className="ik-browser-bar"><span className="ik-browser-dots"><i /><i /><i /></span><span className="ik-browser-url">harborline.com/nda</span></div>
            <div className="ik-browser-page">
              <div className="ik-site-nav"><strong>Harborline Facility Services</strong><span>Services</span><span>About</span><span>Contact</span></div>
              <h3 className="ik-nda-title">Mutual NDA</h3>
              <p className="ik-nda-sub">Sign before your walkthrough. It takes a minute.</p>
              <div className="ik-nda-form">
                <div className="ik-nda-pair">
                  <div><span className="ik-nda-label">Full name</span><span className="ik-nda-field">Kenji Watanabe</span></div>
                  <div><span className="ik-nda-label">Company</span><span className="ik-nda-field">Riverside Property Group</span></div>
                </div>
                <span className="ik-nda-label">Email</span>
                <div className="ik-nda-email"><span className="ik-nda-field">kenji@riversidepg.com</span><span className="ik-chip ik-chip--green">verified <Tick /></span></div>
                <span className="ik-nda-sign"><span className="ik-signature ik-signature--kenji">Kenji Watanabe</span></span>
                <span className="ik-nda-button">Sign</span>
              </div>
              <p className="ik-nda-by">Signing by Inkwell</p>
            </div>
          </div>
          <span className="ik-wf-link ik-wf-link--1" aria-hidden="true" />
          <span className="ik-wf-link ik-wf-link--2" aria-hidden="true" />
          <article className="ik-embed">
            <p>Embed</p>
            <code>{'<script src="https://sign.harborline.com/forms/nda.js"></script>'}</code>
            <Sparks tone="blue" className="ik-wf-spark ik-wf-spark--1" />
          </article>
          <article className="ik-card ik-submission">
            <p className="ik-card-eyebrow">Submission · Thu Oct 15</p>
            <p><CheckDot />Kenji Watanabe signed <span>4:05 pm</span></p>
            <p><CheckDot />Rosa countersigned <span>4:31 pm</span></p>
            <Cursor name="Rosa" className="ik-wf-rosa" />
            <Sparks tone="blue" className="ik-wf-spark ik-wf-spark--2" />
          </article>
          <Sparks className="ik-wf-spark ik-wf-spark--3" />
        </div>
      </div>
    </section>
  )
}
