// DELIV-007: how completed copies reach every party, chosen by an owner or admin for the whole account. RECORD-005: how
// many years completed envelopes are kept.
import { useState } from 'react'
import { command, dateTime, type Retention, type Workspace } from './types'
import { ErrorNotice, useAction } from './feedback'

export function CompletedCopies({ settings, refresh }: { settings: NonNullable<Workspace['settings']>; refresh: () => Promise<void> }) {
  const [delivery, setDelivery] = useState(settings.completedCopies)
  const action = useAction()
  return <section className="iw-panel iw-stack"><h2>Completed copies</h2>
    <p className="iw-muted">When everyone has signed, each signer and copy recipient receives the executed PDF and certificate.</p>
    <form className="iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('account.completed_copies', { delivery }); await refresh() }) }}>
      <label className="iw-check"><input type="radio" name="completed-copies" checked={delivery === 'link'} onChange={() => setDelivery('link')} />A secure link; each person enters a code sent to their mailbox before downloading</label>
      <label className="iw-check"><input type="radio" name="completed-copies" checked={delivery === 'attachment'} onChange={() => setDelivery('attachment')} />Attached to the email; files over 10 MB together go as a secure link</label>
      <ErrorNotice error={action.error} /><button className="iw-fit" disabled={action.busy || delivery === settings.completedCopies}>{action.busy ? 'Saving…' : 'Save'}</button>
    </form>
  </section>
}

export function RetentionRule({ retention, refresh }: { retention: Retention; refresh: () => Promise<void> }) {
  const [years, setYears] = useState(retention.rule ? String(retention.rule.years) : '')
  const action = useAction(), chosen = years === '' ? null : Number(years)
  return <section className="iw-panel iw-stack"><h2>Retention</h2>
    <p className="iw-muted">Envelopes that have ended (completed, declined, voided or expired) are kept this many years, then permanently erased. Owners and admins are warned {retention.warningDays} days before; a legal hold keeps an envelope until it is lifted. Leave empty to keep everything.</p>
    <form className="iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('account.retention', { years: chosen }); await refresh() }) }}>
      <label>Years to keep ended envelopes<input type="number" inputMode="numeric" min={1} max={99} step={1} value={years} onChange={event => setYears(event.target.value)} /></label>
      <ErrorNotice error={action.error} /><button className="iw-fit" disabled={action.busy || chosen === (retention.rule?.years ?? null)}>{action.busy ? 'Saving…' : 'Save'}</button>
    </form>
    {retention.purged.length > 0 && <details><summary>Purged ({retention.purged.length})</summary><ul>{retention.purged.map(p => <li key={p.envelopeId}>{p.envelopeId} · {p.ended} {dateTime(p.endedAt)} · warned {dateTime(p.warnedAt)} · purged {dateTime(p.purgedAt)} under {p.years} years</li>)}</ul></details>}
  </section>
}
