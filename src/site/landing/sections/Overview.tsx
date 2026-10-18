import { Eyebrow, Heading, Sparks, Sticky, Cursor, Tick } from '../parts'

type Stop = { day: string; time: string; lines: string[]; node: 'draft' | 'done' | 'bounce'; done?: boolean[] }

// The Brightwater envelope from draft to filing. Every completed event has a filled check; the bounce is the red dot;
// only the Monday draft, not yet sent, is hollow.
const stops: Stop[] = [
  { day: 'Mon Oct 12', time: '4:30 pm', lines: ['Drafted from the HubSpot deal', 'Agent filled 2 gaps'], node: 'draft' },
  { day: 'Tue Oct 13', time: '9:12 am', lines: ['Sent by Rosa', 'Mark Ellis added by rule'], node: 'done' },
  { day: 'Tue Oct 13', time: '3:47 pm', lines: ['Dr. Amy Chen signed', 'Client'], node: 'done', done: [true, false] },
  { day: 'Tue Oct 13', time: '3:48 pm', lines: ["Mark's email bounced", 'Fixed, resent Wed 9:06 am'], node: 'bounce', done: [false, true] },
  { day: 'Thu Oct 15', time: '11:20 am', lines: ['Mark Ellis signed', 'On his iPhone'], node: 'done', done: [true, false] },
  { day: 'Thu Oct 15', time: '2:41 pm', lines: ['Rosa countersigned', 'Sealed PDF'], node: 'done', done: [true, false] },
  { day: 'Thu Oct 15', time: '2:42 pm', lines: ['HubSpot: Closed won', 'Filed to Chest'], node: 'done', done: [true, false] },
]

/** 02: one long card that tells the whole envelope in seven stops. */
export function Overview() {
  return (
    <section className="ik-section ik-overview" aria-labelledby="overview-title">
      <div className="ik-wrap">
        <header className="ik-center-head">
          <Eyebrow>Brightwater Medical · Oct 12 – 15</Eyebrow>
          <div className="ik-head-sparks">
            <Sparks className="ik-ov-spark ik-ov-spark--l" />
            <Heading id="overview-title" first="Sent Tuesday." second="Filed Thursday." />
            <Sparks className="ik-ov-spark ik-ov-spark--r" />
          </div>
          <p className="ik-lead">One service agreement, followed from the deal to the filing cabinet.</p>
        </header>
        <div className="ik-card ik-timeline-card">
          <Sticky className="ik-ov-sticky" underline={false}>zero follow-up emails!</Sticky>
          <Sparks className="ik-ov-spark ik-ov-spark--sticky" />
          <ol className="ik-timeline">
            {stops.map((stop, index) => (
              <li key={stop.time} className={`ik-stop ik-stop--${stop.node}`}>
                <span className="ik-node" aria-hidden="true">{stop.node === 'done' && <svg viewBox="0 0 22 22"><path d="M6.4 11.4l3.1 3 6.1-6.3" /></svg>}</span>
                {index === 5 && <Cursor name="Rosa" className="ik-ov-rosa" />}
                <p className="ik-stop-day">{stop.day}</p>
                <p className="ik-stop-time">{stop.time}</p>
                {stop.lines.map((line, n) => <p key={line} className="ik-stop-line">{line}{stop.done?.[n] && <> <Tick /></>}</p>)}
              </li>
            ))}
          </ol>
          <footer className="ik-timeline-foot">
            <p>Service Agreement + W-9 · $4,050/mo × 12 = $48,600 · 3 signers</p>
            <p className="ik-pill ik-pill--green ik-pill--lg">Sent once · completed Thu 2:41 pm <Tick /></p>
          </footer>
        </div>
      </div>
    </section>
  )
}
