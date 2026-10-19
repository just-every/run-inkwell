import { useState, type FormEvent } from 'react'
import { command } from './types'
import { ErrorNotice, useAction } from './feedback'

// TMPL-002: who a template or folder is shared with, to use or to edit, for the people who manage it.
export type TemplateShare = { operatorId: string; name: string; email: string; access: 'use' | 'edit' }
export type TemplateFolder = { id: string; name: string; ownerId: string; access: 'use' | 'edit' | 'manage'; shares?: TemplateShare[] }

export function SharePanel({ subject, label, shares, onChanged }: { subject: { id: string } | { folderId: string }; label: string; shares: TemplateShare[]; onChanged: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [access, setAccess] = useState<'use' | 'edit'>('use')
  const action = useAction()
  async function share(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => { await command('template.share', { ...subject, email, access }); setEmail(''); await onChanged() })
  }
  return <div className="iw-callout iw-stack" role="region" aria-label={`Sharing ${label}`}>
    <form className="iw-actions" onSubmit={share}><label>Share with (member email)<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><label>Access<select aria-label="Access" value={access} onChange={event => setAccess(event.target.value as 'use' | 'edit')}><option value="use">Can use</option><option value="edit">Can edit</option></select></label><button className="iw-primary" disabled={action.busy}>Share</button></form>
    {shares.length === 0 ? <p className="iw-muted">Not shared with anyone.</p> : <ul className="iw-stack" aria-label={`People with ${label}`}>{shares.map(share => <li key={share.operatorId} className="iw-actions"><span>{share.name} · {share.email} · {share.access === 'edit' ? 'can edit' : 'can use'}</span><button type="button" disabled={action.busy} aria-label={`Stop sharing ${label} with ${share.email}`} onClick={() => void action.run(async () => { await command('template.unshare', { ...subject, operatorId: share.operatorId }); await onChanged() })}>Stop sharing</button></li>)}</ul>}
    <ErrorNotice error={action.error} />
  </div>
}
