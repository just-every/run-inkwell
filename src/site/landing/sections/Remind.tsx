import { BellIcon, BellOffIcon, ClockIcon, RepeatIcon, StopIcon } from '../icons'
import { CheckDot, Cursor, Eyebrow, Heading, Sparks, Sticky, Tick } from '../parts'

type Day = { label: string; weekend?: boolean }
const weekOne: Day[] = [{ label: 'Mon 5' }, { label: 'Tue 6' }, { label: 'Wed 7' }, { label: 'Thu 8' }, { label: 'Fri 9' }]
const weekTwo: Day[] = [{ label: 'Mon 12' }, { label: 'Tue 13' }, { label: 'Wed 14' }, { label: 'Thu 15' }, { label: 'Fri 16' }]
const days: Day[] = [...weekOne, { label: 'Sat 10', weekend: true }, { label: 'Sun 11', weekend: true }, ...weekTwo]

const rules = [
  { icon: <RepeatIcon />, text: 'Every 2 business days' },
  { icon: <ClockIcon />, text: 'Eastern time' },
  { icon: <StopIcon />, text: 'Stops when signed' },
]

/** 09: the Lakeshore Dental NDA's reminders across two weeks: Friday's, the out-of-office, the skipped weekend, Tuesday's
 *  that drew the signature, and Thursday's that never went. At 390 the calendar becomes one card per week. */
export function Remind() {
  return (
    <section className="ik-section ik-remind" aria-labelledby="remind-title">
      <div className="ik-wrap">
        <div className="ik-remind-head">
          <div>
            <Eyebrow>Remind · Oct 7 – 15</Eyebrow>
            <Sparks className="ik-rm-spark ik-rm-spark--1" />
            <Heading id="remind-title" first="Reminders that" second="skip the weekend." />
          </div>
          <p className="ik-body">Business days only, only to the person whose turn it is, and they stop the moment the envelope is signed.</p>
        </div>
        <article className="ik-card ik-calendar-card">
          <header className="ik-calendar-head">
            <h3 className="ik-card-title">Lakeshore Dental NDA · <span>Dr. Priya Raman</span></h3>
            <span className="ik-pill ik-pill--green ik-pill--lg">Signed <Tick /></span>
          </header>
          <div className="ik-calendar" role="img" aria-label="Sent Wednesday Oct 7 at 10:30 am; reminded Friday Oct 9 at 9:00 am, out-of-office reply back Monday; Saturday and Sunday skipped; reminded Tuesday Oct 13 at 9:00 am and signed at 10:14 am; Thursday's reminder cancelled">
            {days.map((day, index) => <div key={day.label} className={`ik-day${day.weekend ? ' ik-day--weekend' : ''}`} style={{ gridColumn: index + 1 }}><span>{day.label}</span>{day.weekend && <small>skipped</small>}</div>)}
            <span className="ik-cal-line" />
            <div className="ik-ev ik-ev--sent"><i /><b>Sent</b><span>10:30 am</span></div>
            <div className="ik-ev ik-ev--fri"><i /><b>Reminder</b><span>9:00 am</span><em>Out-of-office reply: back Mon</em></div>
            <div className="ik-ev ik-ev--tue"><i /><b>Reminder</b><span>9:00 am</span><strong><CheckDot />Signed</strong><span>10:14 am <Tick /></span></div>
            <div className="ik-ev ik-ev--thu"><i /><s>Reminder cancelled</s></div>
            <Sticky className="ik-remind-sticky">no Saturday pings</Sticky>
            <Sparks tone="blue" className="ik-rm-spark ik-rm-spark--2" />
            <Cursor name="Jamal" className="ik-remind-jamal" />
          </div>
          <div className="ik-weeks">
            <div className="ik-week">
              <div className="ik-week-days">{weekOne.map(day => <span key={day.label} className={day.label === 'Wed 7' ? 'is-on' : ''}>{day.label.split(' ')[0]}<b>{day.label.split(' ')[1]}</b>{day.label === 'Wed 7' && <i className="ik-dot-blue" />}{day.label === 'Fri 9' && <i className="ik-dot-green" />}</span>)}<span className="ik-week-skip">Sat–Sun skipped</span></div>
              <ul><li><i className="ik-dot-blue" /><b>Wed 7</b> · Sent 10:30 am</li><li><i className="ik-dot-green" /><b>Fri 9</b> · Reminder 9:00 am</li><li><i className="ik-dot-grey" /><b>Fri 9</b> · Out-of-office reply: back Mon</li></ul>
            </div>
            <div className="ik-week">
              <div className="ik-week-days">{weekTwo.map(day => <span key={day.label} className={day.label === 'Tue 13' ? 'is-on' : ''}>{day.label.split(' ')[0]}<b>{day.label.split(' ')[1]}</b></span>)}</div>
              <ul className="ik-week-events">
                <li><BellIcon /><div><b>Tue 13</b> · Reminder<span>9:00 am</span></div></li>
                <li><CheckDot size={26} /><div><b>Tue 13</b> · Signed<span>10:14 am <Tick /></span></div></li>
                <li className="is-off"><BellOffIcon /><div><s>Thu 15 · Reminder cancelled</s></div></li>
              </ul>
            </div>
          </div>
          <ul className="ik-rules">{rules.map(rule => <li key={rule.text}>{rule.icon}{rule.text}</li>)}</ul>
          <aside className="ik-card ik-card--agent ik-remind-agent">
            <p className="ik-agent-label"><span className="ik-live" />Agent</p>
            <p>Out until Monday · next reminder kept for Tue 9:00 am</p>
            <Sparks tone="blue" className="ik-rm-spark ik-rm-spark--3" />
          </aside>
          <Sticky className="ik-remind-sticky-m">no Saturday pings</Sticky>
        </article>
      </div>
    </section>
  )
}
