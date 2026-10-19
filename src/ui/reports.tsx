// MANAGE-004: what happened to envelopes over whole days in the account's zone, per sender and in total, with the
// same numbers as CSV.
import { useEffect, useState } from 'react'
import { request } from './types'
import { ErrorNotice, useAction } from './feedback'

type Line = { sent: number; completed: number; declined: number; expired: number; medianHoursToComplete: number | null; averageHoursToComplete: number | null }
type Report = { from: string; to: string; timeZone: string; totals: Line; senders: (Line & { id: string; name: string; email: string })[] }
// Today in the account's zone, and the day 29 days before it: a 30-day range by default.
const zoneDay = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
const hours = (value: number | null) => value === null ? '—' : value < 48 ? `${value} h` : `${Math.round(value / 2.4) / 10} days`

export function Reports() {
  const [from, setFrom] = useState(() => zoneDay(Date.now() - 29 * 86_400_000))
  const [to, setTo] = useState(() => zoneDay(Date.now()))
  const [report, setReport] = useState<Report>()
  const action = useAction()
  const query = new URLSearchParams({ from, to }).toString()
  async function load() { setReport(await request<Report>(`/api/inkwell/reports/envelopes?${query}`)) }
  useEffect(() => { void action.run(load) }, [])
  return <section className="iw-panel iw-stack">
    <form className="iw-actions" onSubmit={event => { event.preventDefault(); void action.run(load) }}>
      <label>From<input type="date" required value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>
      <label>To<input type="date" required value={to} min={from} onChange={event => setTo(event.target.value)} /></label>
      <button disabled={action.busy}>{action.busy ? 'Loading…' : 'Show report'}</button>
      {report && <a className="iw-button" href={`/api/inkwell/reports/envelopes.csv?${new URLSearchParams({ from: report.from, to: report.to })}`} download>Export CSV</a>}
    </form>
    <ErrorNotice error={action.error} />
    {report && <>
      <p className="iw-muted">Whole days {report.from} to {report.to}, Eastern time. Time to complete runs from sending to the last signature.</p>
      <dl className="iw-account" aria-label="All senders"><dt>Sent</dt><dd>{report.totals.sent}</dd><dt>Completed</dt><dd>{report.totals.completed}</dd><dt>Declined</dt><dd>{report.totals.declined}</dd><dt>Expired</dt><dd>{report.totals.expired}</dd><dt>Median time to complete</dt><dd>{hours(report.totals.medianHoursToComplete)}</dd><dt>Average time to complete</dt><dd>{hours(report.totals.averageHoursToComplete)}</dd></dl>
      {report.senders.length > 0 && <div className="iw-card iw-table-card"><div className="iw-table" role="table" aria-label="Turnaround by sender">
        <div className="iw-table-head" role="row"><span role="columnheader">Sender</span><span role="columnheader">Sent</span><span role="columnheader">Completed</span><span role="columnheader">Declined · expired</span><span role="columnheader">Median</span></div>
        {report.senders.map(line => <div key={line.id} role="row" className="iw-row"><span role="cell"><strong>{line.name}</strong>{line.email && <small> {line.email}</small>}</span><span role="cell">{line.sent} sent</span><span role="cell">{line.completed} completed</span><span role="cell">{line.declined} declined · {line.expired} expired</span><span role="cell">{hours(line.medianHoursToComplete)} median</span></div>)}
      </div></div>}
    </>}
  </section>
}
