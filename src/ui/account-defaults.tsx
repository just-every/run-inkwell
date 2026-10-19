// DELIV-007: how completed copies reach every party, chosen by an owner or admin for the whole account.
import { useState } from 'react'
import { command, type Workspace } from './types'
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
