// The Envelopes screen's body: the heading with what is in flight, the agent strip, the filter chips and the table.
import { canEdit, shortDay, type Actor, type Dashboard, type Envelope } from './types'
import { inFlight, matches, needsMe, nextAction, pill, preparedByAgent, signedCount, titleParts, updatedAt, type Filter } from './envelope-view'
import { Icon } from './icons'
import { Pill, Roundel } from './marks'

const chips: { filter: Filter; label: string; tone?: string }[] = [
  { filter: 'all', label: 'All' }, { filter: 'me', label: 'Waiting for me', tone: 'amber' }, { filter: 'others', label: 'Waiting for others' },
  { filter: 'attention', label: 'Needs attention', tone: 'rose' }, { filter: 'completed', label: 'Completed' }, { filter: 'voided', label: 'Voided' },
]

export function EnvelopesHeading({ envelopes, actor }: { envelopes: Envelope[]; actor: Actor }) {
  const flying = envelopes.filter(inFlight).length, mine = envelopes.filter(item => needsMe(item, actor)).length
  return <section className="iw-heading"><h1>Envelopes</h1><p className="iw-heading-line">{flying} in flight{mine > 0 && <>, <span className="iw-grad">{mine} need{mine === 1 ? 's' : ''} you</span></>}</p></section>
}

/** What preparation agents have put in front of this person; agents prepare, a person approves. */
export function AgentStrip({ data, onReview, onAccess }: { data: Dashboard; onReview: (id: string) => void; onAccess?: () => void }) {
  const prepared = data.envelopes.filter(preparedByAgent)
  const waiting = prepared.filter(item => item.status === 'prepared')
  const active = data.agents?.filter(agent => !agent.revokedAt).length ?? 0
  const summary = prepared.length ? `prepared ${prepared.length} envelope${prepared.length === 1 ? '' : 's'} with a preparation token.` : active ? `${active} preparation token${active === 1 ? ' is' : 's are'} active. Nothing prepared yet.` : 'no preparation token yet. Agents can prepare envelopes; a person approves each one.'
  return <section className="iw-agent" aria-label="Inkwell agent">
    <img src="/brand/mark.svg" width={34} height={34} alt="" />
    <p><strong>Inkwell agent:</strong> {summary}</p>
    {waiting.length > 0 && canEdit(data.actor) && <button className="iw-link" onClick={() => onReview(waiting[0].id)}>{waiting.length} envelope{waiting.length === 1 ? ' needs' : 's need'} your approval.</button>}
    {onAccess && <button className="iw-agent-access" onClick={onAccess}>Agent access</button>}
  </section>
}

export function FilterChips({ envelopes, actor, filter, onFilter }: { envelopes: Envelope[]; actor: Actor; filter: Filter; onFilter: (filter: Filter) => void }) {
  return <div className="iw-chips" role="group" aria-label="Filter envelopes">{chips.map(chip => <button key={chip.filter} className={`iw-chip${chip.tone ? ` iw-chip-${chip.tone}` : ''}`} aria-pressed={filter === chip.filter} onClick={() => onFilter(chip.filter)}>{chip.label}<span>{envelopes.filter(item => matches(item, actor, chip.filter)).length}</span></button>)}</div>
}

export function EnvelopeTable({ envelopes, actor, selected, onSelect }: { envelopes: Envelope[]; actor: Actor; selected: string; onSelect: (id: string) => void }) {
  return <div className="iw-table" role="table" aria-label="Envelopes">
    <div className="iw-table-head" role="row"><span role="columnheader">Envelope</span><span role="columnheader">Signers</span><span role="columnheader">Status</span><span role="columnheader">Next action</span><span role="columnheader">Updated <span aria-hidden="true">↓</span></span></div>
    {envelopes.map(item => {
      const { name, detail } = titleParts(item.title), state = pill(item, actor), next = nextAction(item, actor), done = signedCount(item)
      return <button key={item.id} role="row" className={`iw-row${state.tone === 'rose' ? ' iw-row-alert' : ''}`} aria-current={selected === item.id ? 'true' : undefined} onClick={() => onSelect(item.id)}>
        <span className="iw-cell-envelope" role="cell"><span className="iw-row-icon"><Icon name="document" /></span><span><strong>{name}</strong>{detail && <small>{detail}</small>}</span></span>
        <span className="iw-cell-signers" role="cell"><span>{done} of {item.signers.length}</span><span className="iw-progress" aria-hidden="true"><span style={{ width: `${(done / item.signers.length) * 100}%` }} /></span></span>
        <span className="iw-cell-status" role="cell"><Pill {...state} /></span>
        <span className={`iw-cell-next${next.urgent ? ' iw-urgent' : ''}`} role="cell">{next.label}</span>
        <span className="iw-cell-updated" role="cell">{shortDay(updatedAt(item))}</span>
      </button>
    })}
  </div>
}

export function EmptyEnvelopes({ actor, filtered, onPrepare }: { actor: Actor; filtered?: string; onPrepare: () => void }) {
  return <div className="iw-empty"><Roundel size={72} />{filtered ? <h3>{filtered}</h3> : <><h3>Your first agreement starts here.</h3><p>Upload a PDF and choose who signs first. Saved envelopes wait for human approval.</p>{canEdit(actor) && <button className="iw-primary" onClick={onPrepare}>Prepare an envelope</button>}</>}</div>
}
