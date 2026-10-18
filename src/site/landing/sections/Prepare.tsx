import { DocIcon } from '../icons'
import { Cursor, Eyebrow, Heading, Sparks, Sticky, Tick } from '../parts'

const fields = [
  ['Client', 'Brightwater Medical Group, LLC'],
  ['Clinics', 'Easton $1,620 · Dublin $1,350 · Grandview $1,080'],
  ['Monthly', '$4,050 · locked'],
  ['Term', '12 months · $48,600'],
  ['Start', 'Mon Nov 2'],
]

/** 03: Jamal's HubSpot deal feeds the agent's draft of Service Agreement v3 + W-9, and the agent fills two gaps. */
export function Prepare() {
  return (
    <section className="ik-section ik-split ik-prepare" aria-labelledby="prepare-title">
      <div className="ik-wrap ik-split-grid">
        <div className="ik-copy">
          <Eyebrow>Prepare · Mon Oct 12</Eyebrow>
          <Heading id="prepare-title" first="From the deal" second="to the envelope." />
          <p className="ik-body">Move a HubSpot deal to <strong>Contract sent</strong> and the agent builds the envelope from your template, then asks about anything missing.</p>
        </div>
        <div className="ik-stage ik-prepare-stage">
          <article className="ik-card ik-deal">
            <span className="ik-icon-square"><DocIcon /></span>
            <div><h3>HubSpot deal · Brightwater Medical</h3><p>3 clinics · $48,600 · owner Jamal Price</p><span className="ik-chip">Stage → Contract sent</span></div>
            <Cursor name="Jamal" className="ik-deal-jamal" />
          </article>
          <span className="ik-dots ik-dots--v ik-prepare-dots-1" aria-hidden="true" />
          <article className="ik-card ik-draft">
            <p className="ik-card-eyebrow">Draft · assembled by the agent · 4:30 pm</p>
            <h3 className="ik-card-title">Service Agreement v3 + W-9</h3>
            <dl className="ik-fields">
              {fields.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd><dd className="ik-source">from HubSpot</dd></div>)}
            </dl>
            <Sticky className="ik-draft-sticky">no retyping</Sticky>
          </article>
          <span className="ik-dots ik-dots--v ik-prepare-dots-2" aria-hidden="true" />
          <article className="ik-card ik-card--agent ik-gaps">
            <p className="ik-agent-label"><span className="ik-live" />Agent</p>
            <h3 className="ik-card-title">2 gaps filled</h3>
            <ul className="ik-gap-rows">
              <li><span>Dr. Amy Chen's title</span><span>→</span><span>Medical Director · from Jamal's email thread</span><Tick /></li>
              <li><span>W-9 missing</span><span>→</span><span>Harborline W-9 attached</span><Tick /></li>
            </ul>
          </article>
          <Sparks tone="blue" className="ik-pr-spark ik-pr-spark--1" />
          <Sparks tone="blue" className="ik-pr-spark ik-pr-spark--2" />
          <Sparks tone="blue" className="ik-pr-spark ik-pr-spark--3" />
        </div>
      </div>
    </section>
  )
}
