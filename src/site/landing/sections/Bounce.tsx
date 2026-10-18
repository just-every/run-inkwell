import { CheckDot, Cursor, Eyebrow, Heading, Pill, Sparks, Sticky, Tick } from '../parts'

const correction = [
  ['Before', 'mellis@brightwatermd.example'],
  ['After', 'mellis@brightwatermed.example'],
  ['By', 'Rosa Delgado · 9:05 am'],
  ['Old link', 'stopped'],
]

/** 05: the invitation to Mark bounces, the agent spots the typo, Rosa corrects it once and Amy's signature stands. */
export function Bounce() {
  return (
    <section className="ik-section ik-bounce" aria-labelledby="bounce-title">
      <div className="ik-wrap">
        <div className="ik-copy ik-copy--wide">
          <Eyebrow>Bounce · Tue Oct 13, 3:48 pm</Eyebrow>
          <Heading id="bounce-title" first="A bounced email," second="fixed by morning." />
          <p className="ik-body">The agent spots the typo against HubSpot, Rosa corrects it once, and Amy's signature stands.</p>
        </div>
        <div className="ik-bounce-row">
          <article className="ik-card ik-invite">
            <h3 className="ik-card-title">Invitation to Mark Ellis</h3>
            <Pill tone="red"><s>Bounced: mellis@brightwatermd.example</s></Pill>
            <p>Domain not found · 3:48 pm</p>
            <p>Reminders paused</p>
            <Sticky className="ik-bounce-sticky" underline={false}>md → med</Sticky>
          </article>
          <span className="ik-arrow-dots" aria-hidden="true" />
          <article className="ik-card ik-card--agent ik-typo">
            <p className="ik-agent-pill"><span className="ik-live" />Agent</p>
            <h3 className="ik-card-title">Likely typo</h3>
            <p>HubSpot contact: <strong>mellis@brightwatermed.example</strong></p>
            <p>Amy Chen signed from <strong>@brightwatermed.example</strong></p>
            <p className="ik-suggest"><CheckDot />Suggest <span>brightwatermed</span></p>
          </article>
          <span className="ik-arrow-dots" aria-hidden="true" />
          <div className="ik-correction-col">
            <article className="ik-card ik-correction">
              <h3 className="ik-card-title">Correction · Wed Oct 14</h3>
              <dl className="ik-kv">
                {correction.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
                <div><dt>Dr. Amy Chen</dt><dd>signature kept <Tick /></dd></div>
              </dl>
              <p className="ik-resent"><CheckDot />Resent Wed Oct 14, 9:06 am <Tick /></p>
              <Cursor name="Rosa" className="ik-bounce-rosa" />
              <Sparks tone="blue" className="ik-bn-spark" />
            </article>
            <p className="ik-opened"><CheckDot />Mark Ellis opened it at 9:41 am <Tick /></p>
          </div>
        </div>
      </div>
    </section>
  )
}
