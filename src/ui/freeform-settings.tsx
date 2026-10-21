import { useState } from 'react'
import { command, dateTime, type FreeFormChange, type FreeFormPolicy } from './types'
import { ErrorNotice, useAction } from './feedback'

/** PREP-011 / ADMIN-004: this installation's owner/admin setting and original append-only changes. */
export function FreeFormSettings({ policy, history, refresh }: { policy: FreeFormPolicy; history: FreeFormChange[]; refresh: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(policy.enabled)
  const [saved, setSaved] = useState(false)
  const action = useAction()
  return <section className="iw-panel iw-stack" aria-label="Free-form signing">
    <h2>Free-form signing</h2>
    <p>Allow senders to send a PDF without fields. Each signer places their own fields and must add a signature before finishing.</p>
    <p className="iw-muted">Turning this off holds unreleased free-form sends. Turning it on never releases a held draft; an editor must confirm again. Requests already sent keep the setting version recorded when they were sent.</p>
    <form className="iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => {
      await command('account.freeform', { enabled, expectedVersion: policy.version }); setSaved(true); await refresh()
    }) }}>
      <label className="iw-check"><input type="checkbox" checked={enabled} disabled={action.busy} onChange={event => { setEnabled(event.target.checked); setSaved(false) }} />Allow free-form signing</label>
      <ErrorNotice error={action.error} />
      <button className="iw-fit" disabled={action.busy || enabled === policy.enabled}>{action.busy ? 'Saving…' : 'Save free-form setting'}</button>
    </form>
    <p role="status">{saved ? 'Free-form setting saved. ' : ''}{policy.enabled ? 'Allowed' : 'Off'} · version {policy.version}</p>
    {history.length > 0 && <details><summary>Setting history ({history.length})</summary>
      <ol>{history.map(change => <li key={change.version}>Version {change.version} · {change.before ? 'allowed' : 'off'} → {change.after ? 'allowed' : 'off'} · {change.actor} · <time dateTime={change.at}>{dateTime(change.at)}</time></li>)}</ol>
    </details>}
  </section>
}
