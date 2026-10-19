// The Envelopes screen's body: the heading with what is in flight, the agent strip, the status chips, the date and
// sender filters, and one page of the table. Every count and row comes from the server's search (MANAGE-001).
import { canApprove, canEdit, shortDay, type Actor, type Bucket, type Envelope, type Page, type Person } from './types'
import { nextAction, pill, signedCount, titleParts } from './envelope-view'
import { Icon } from './icons'
import { Pill, Roundel } from './marks'

export type Filter = Bucket | 'all'
const chips: { filter: Filter; label: string; tone?: string }[] = [
  { filter: 'all', label: 'All' }, { filter: 'draft', label: 'Drafts', tone: 'rose' }, { filter: 'waiting_for_me', label: 'Waiting for me', tone: 'amber' }, { filter: 'waiting_for_others', label: 'Waiting for others' },
  { filter: 'completed', label: 'Completed' }, { filter: 'declined', label: 'Declined' }, { filter: 'voided', label: 'Voided' }, { filter: 'expired', label: 'Expired' }, { filter: 'imported', label: 'Imported' },
]
/** What needs the signed-in person: their signing turns, and drafts when they approve. */
export const needingMe = (counts: Page['counts'], actor: Actor) => counts.waiting_for_me + (canApprove(actor) ? counts.draft : 0)

export function EnvelopesHeading({ counts, actor }: { counts: Page['counts']; actor: Actor }) {
  const flying = counts.draft + counts.waiting_for_me + counts.waiting_for_others, mine = needingMe(counts, actor)
  return <section className="iw-heading"><h1>Envelopes</h1><p className="iw-heading-line">{flying} in flight{mine > 0 && <>, <span className="iw-grad">{mine} need{mine === 1 ? 's' : ''} you</span></>}</p></section>
}

/** What preparation agents have put in front of this person; agents prepare, a person approves. */
export function AgentStrip({ prepared, actor, agents, onReview, onAccess }: { prepared: Page; actor: Actor; agents: { revokedAt?: string }[]; onReview: (id: string) => void; onAccess?: () => void }) {
  const waiting = prepared.counts.draft, first = prepared.envelopes[0]
  const active = agents.filter(agent => !agent.revokedAt).length
  const summary = prepared.total ? `prepared ${prepared.total} envelope${prepared.total === 1 ? '' : 's'} with a preparation token.` : active ? `${active} preparation token${active === 1 ? ' is' : 's are'} active. Nothing prepared yet.` : 'no preparation token yet. Agents can prepare envelopes; a person approves each one.'
  return <section className="iw-agent" aria-label="Inkwell agent">
    <img src="/brand/mark.svg" width={34} height={34} alt="" />
    <p><strong>Inkwell agent:</strong> {summary}</p>
    {waiting > 0 && first && canEdit(actor) && <button className="iw-link" onClick={() => onReview(first.id)}>{waiting} envelope{waiting === 1 ? ' needs' : 's need'} your approval.</button>}
    {onAccess && <button className="iw-agent-access" onClick={onAccess}>Agent access</button>}
  </section>
}

export function FilterChips({ page, filter, onFilter }: { page: Page; filter: Filter; onFilter: (filter: Filter) => void }) {
  const count = (chip: Filter) => chip === 'all' ? page.total : page.counts[chip]
  return <div className="iw-chips" role="group" aria-label="Filter envelopes">{chips.filter(chip => chip.filter !== 'imported' || page.counts.imported > 0 || filter === 'imported').map(chip => <button key={chip.filter} className={`iw-chip${chip.tone ? ` iw-chip-${chip.tone}` : ''}`} aria-pressed={filter === chip.filter} onClick={() => onFilter(chip.filter)}>{chip.label}<span>{count(chip.filter)}</span></button>)}</div>
}

/** Prepared-date bounds in the viewer's own days (the To day included) and, for owners and admins, who prepared it. */
export type Narrow = { from: string; to: string; sender: string }
export function NarrowFilters({ narrow, people, onNarrow }: { narrow: Narrow; people: Person[]; onNarrow: (narrow: Narrow) => void }) {
  const senders = people.filter(person => person.role !== 'viewer')
  return <div className="iw-actions" role="group" aria-label="Narrow envelopes">
    <label>Prepared from<input type="date" value={narrow.from} max={narrow.to || undefined} onChange={event => onNarrow({ ...narrow, from: event.target.value })} /></label>
    <label>Prepared to<input type="date" value={narrow.to} min={narrow.from || undefined} onChange={event => onNarrow({ ...narrow, to: event.target.value })} /></label>
    {senders.length > 0 && <label>Sender<select value={narrow.sender} onChange={event => onNarrow({ ...narrow, sender: event.target.value })}><option value="">Anyone</option>{senders.map(person => <option key={person.id} value={person.id}>{person.name || person.email}</option>)}</select></label>}
  </div>
}

/** The rest of the search, one server page at a time. */
export function MoreEnvelopes({ page, filter, busy, onMore }: { page: Page; filter: Filter; busy: boolean; onMore: () => void }) {
  return <div className="iw-actions"><p role="status">Showing {page.envelopes.length} of {filter === 'all' ? page.total : page.counts[filter]}</p>{page.next && <button disabled={busy} onClick={onMore}>Show more</button>}</div>
}

export function EnvelopeTable({ envelopes, actor, selected, onSelect }: { envelopes: Envelope[]; actor: Actor; selected: string; onSelect: (id: string) => void }) {
  return <div className="iw-table" role="table" aria-label="Envelopes">
    <div className="iw-table-head" role="row"><span role="columnheader">Envelope</span><span role="columnheader">Signers</span><span role="columnheader">Status</span><span role="columnheader">Next action</span><span role="columnheader">Prepared <span aria-hidden="true">↓</span></span></div>
    {envelopes.map(item => {
      const { name, detail } = titleParts(item.title), state = pill(item, actor), next = nextAction(item, actor), done = signedCount(item)
      return <button key={item.id} role="row" className={`iw-row${state.tone === 'rose' ? ' iw-row-alert' : ''}`} aria-current={selected === item.id ? 'true' : undefined} onClick={() => onSelect(item.id)}>
        <span className="iw-cell-envelope" role="cell"><span className="iw-row-icon"><Icon name="document" /></span><span><strong>{name}</strong>{detail && <small>{detail}</small>}</span></span>
        <span className="iw-cell-signers" role="cell"><span>{done} of {item.signers.length}</span><span className="iw-progress" aria-hidden="true"><span style={{ width: `${(done / item.signers.length) * 100}%` }} /></span></span>
        <span className="iw-cell-status" role="cell"><Pill {...state} /></span>
        <span className={`iw-cell-next${next.urgent ? ' iw-urgent' : ''}`} role="cell">{next.label}</span>
        <span className="iw-cell-updated" role="cell">{shortDay(item.createdAt)}</span>
      </button>
    })}
  </div>
}

export function EmptyEnvelopes({ actor, filtered, onPrepare }: { actor: Actor; filtered?: string; onPrepare: () => void }) {
  return <div className="iw-empty"><Roundel size={72} />{filtered ? <h3>{filtered}</h3> : <><h3>Your first agreement starts here.</h3><p>Upload a PDF and choose who signs first. Saved envelopes wait for human approval.</p>{canEdit(actor) && <button className="iw-primary" onClick={onPrepare}>Prepare an envelope</button>}</>}</div>
}
