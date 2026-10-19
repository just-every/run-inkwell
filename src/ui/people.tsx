// ACCESS-001: owners and admins choose whether each member is a sender (prepares, sends and voids their own envelopes,
// and sees only those) or a viewer (reads every envelope). Owners and admins themselves are managed in Base.
import { command, type Person } from './types'
import { ErrorNotice, useAction } from './feedback'
import { roleLabel } from './shell'

export function PeopleRoles({ people, refresh }: { people: Person[]; refresh: () => Promise<void> }) {
  const action = useAction()
  return <section className="iw-panel iw-stack"><h2>People</h2>
    <p className="iw-muted">Senders prepare, send and void their own envelopes and see only those. Viewers read every envelope and change none. Owners and admins act on every envelope.</p>
    <ErrorNotice error={action.error} />
    <dl className="iw-account">{people.map(person => <div key={person.id} style={{ display: 'contents' }}><dt>{person.name || person.email}<br /><small className="iw-muted">{person.email}</small></dt><dd>{['sender', 'viewer'].includes(person.role)
      ? <label><span className="iw-sr">Role for {person.email}</span><select value={person.role} disabled={action.busy} onChange={event => { const role = event.target.value; void action.run(async () => { await command('member.role', { operatorId: person.id, role }); await refresh() }) }}><option value="sender">Sender</option><option value="viewer">Viewer</option></select></label>
      : roleLabel[person.role] ?? person.role}</dd></div>)}</dl>
  </section>
}
