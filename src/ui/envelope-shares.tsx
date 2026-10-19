// ADMIN-001: who this envelope is shared with, to view or to edit, for its sender, an owner or an admin to change.
import { useState } from 'react'
import { command, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'

export function EnvelopeShares({ envelope, refresh }: { envelope: Envelope; refresh: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [access, setAccess] = useState<'view' | 'edit'>('view')
  const action = useAction()
  return <div className="iw-stack"><h3>Shared with</h3>
    {envelope.shares?.length ? <ul className="iw-signers">{envelope.shares.map(share => <li key={share.operatorId}><div><strong>{share.name || share.email}</strong><span className="iw-signer-email">{share.email}</span><small>{share.access === 'edit' ? 'Can view and edit' : 'Can view'}</small></div><button className="iw-text-button" disabled={action.busy} aria-label={`Stop sharing with ${share.email}`} onClick={() => void action.run(async () => { await command('envelope.unshare', { id: envelope.id, operatorId: share.operatorId }); await refresh() })}>Remove</button></li>)}</ul> : <p className="iw-muted">Only you, owners, admins and viewers can see this envelope.</p>}
    <form className="iw-actions" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('envelope.share', { id: envelope.id, email, access }); setEmail(''); await refresh() }) }}>
      <label>Member email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Access<select value={access} onChange={event => setAccess(event.target.value as 'view' | 'edit')}><option value="view">Can view</option><option value="edit">Can view and edit</option></select></label>
      <button disabled={action.busy}>{action.busy ? 'Sharing…' : 'Share'}</button>
    </form><ErrorNotice error={action.error} />
  </div>
}
