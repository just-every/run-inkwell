// RECORD-005: an owner or admin places a legal hold on one envelope with a reason, or lifts it. While held, neither the
// retention rule nor an erase request removes it.
import { useState } from 'react'
import { command, dateTime, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'

export function LegalHold({ envelope, refresh }: { envelope: Envelope; refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState('')
  const action = useAction(), hold = envelope.legalHold
  if (hold) return <div className="iw-callout iw-stack"><p><strong>On legal hold</strong> since {dateTime(hold.at)}: {hold.reason}</p><p className="iw-muted">The retention rule and erasure leave it in place until the hold is lifted.</p>
    <ErrorNotice error={action.error} /><button className="iw-fit" disabled={action.busy} onClick={() => void action.run(async () => { await command('envelope.lift_hold', { id: envelope.id }); await refresh() })}>{action.busy ? 'Lifting…' : 'Lift legal hold'}</button></div>
  return <div className="iw-quiet"><button disabled={action.busy} onClick={() => setOpen(value => !value)}>Place legal hold…</button>{open && <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.hold', { id: envelope.id, reason }); setOpen(false); setReason(''); await refresh() }) }}>
    <label>Reason for the hold<input required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <ErrorNotice error={action.error} /><button className="iw-fit" disabled={action.busy || reason.trim().length < 3}>{action.busy ? 'Placing…' : 'Place hold'}</button></form>}</div>
}
