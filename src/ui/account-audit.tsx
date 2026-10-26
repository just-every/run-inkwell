import { useEffect, useState } from 'react'
import { dateTime, request } from './types'
import { ErrorNotice, useAction } from './feedback'

type Entry = { id: string; at: string; actorId: string; action: string; target: string; before: unknown; after: unknown }
type AuditPage = { entries: Entry[]; nextCursor: string | null }
type Filters = { q: string; actor: string; action: string; target: string }
const emptyFilters: Filters = { q: '', actor: '', action: '', target: '' }
const actionTitle = (value: string) => {
  const text = value.replace(/[._]/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
const parameters = (filters: Filters) => new URLSearchParams(Object.entries(filters).filter(([, value]) => value))

/** Account configuration history stays within Settings, available to owners and admins. */
export function AccountAudit() {
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [applied, setApplied] = useState<Filters>(emptyFilters)
  const [page, setPage] = useState<AuditPage>()
  const action = useAction()
  async function load(nextFilters: Filters, cursor = '') {
    const params = parameters(nextFilters)
    params.set('limit', '10')
    if (cursor) params.set('cursor', cursor)
    const next = await request<AuditPage>('/api/inkwell/audit?' + params)
    setPage(current => cursor && current ? { ...next, entries: [...current.entries, ...next.entries] } : next)
    setApplied(nextFilters)
  }
  useEffect(() => { void action.run(() => load(emptyFilters)) }, [])
  return <section className="iw-panel iw-stack" aria-label="Account audit log" style={{ minWidth: 0 }}>
    <h2>Account audit log</h2>
    <form className="iw-stack" onSubmit={event => {
      event.preventDefault()
      const next = Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value.trim()])) as Filters
      void action.run(() => load(next))
    }}>
      <label>Search account changes<input type="text" role="searchbox" inputMode="search" maxLength={300} disabled={action.busy} value={filters.q} onChange={event => setFilters(current => ({ ...current, q: event.target.value }))} /></label>
      <details><summary>Filter account changes</summary><div className="iw-stack">
        {(['actor', 'action', 'target'] as const).map(key => <label key={key}>{({ actor: 'Actor ID', action: 'Action', target: 'Target' })[key]}<input maxLength={300} disabled={action.busy} value={filters[key]} onChange={event => setFilters(current => ({ ...current, [key]: event.target.value }))} /></label>)}
      </div></details>
      <div className="iw-actions"><button disabled={action.busy}>Search audit log</button>{page && <a className="iw-button" href={'/api/inkwell/audit.csv?' + parameters(applied)} download>Export audit CSV</a>}</div>
    </form>
    {Object.values(applied).some(Boolean) && <div className="iw-actions" aria-label="Applied audit filters">{Object.entries(applied).filter(([, value]) => value).map(([key, value]) => <span className="iw-pill iw-pill-grey" key={key} style={{ fontSize: 13, whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: '100%' }}>{({ q: 'Search', actor: 'Actor', action: 'Action', target: 'Target' } as Record<string, string>)[key]}: {value}</span>)}</div>}
    <ErrorNotice error={action.error} />
    <p role="status" aria-live="polite">{action.busy ? 'Loading account changes…' : page ? page.entries.length ? `${page.entries.length} account changes shown${page.nextCursor ? ' · More available' : ''}` : 'No account changes match.' : ''}</p>
    {page && page.entries.length > 0 && <ul className="iw-activity" aria-label="Account changes">{page.entries.map(entry => <li key={entry.id} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
      <article aria-label={`${entry.action} · ${entry.target}`} className="iw-stack">
        <div><h3>{actionTitle(entry.action)}</h3><p className="iw-muted"><time dateTime={entry.at}>{dateTime(entry.at)}</time> · Actor {entry.actorId}</p></div>
        <details><summary>Before and after</summary><div className="iw-stack">
          <p>{entry.action} · {entry.target}</p>
          <h4>Before</h4><pre className="iw-json" style={{ fontSize: 13, maxWidth: '100%' }} tabIndex={0} aria-label="Before change">{entry.before === null ? 'No previous value' : JSON.stringify(entry.before, null, 2)}</pre>
          <h4>After</h4><pre className="iw-json" style={{ fontSize: 13, maxWidth: '100%' }} tabIndex={0} aria-label="After change">{entry.after === null ? 'Removed' : JSON.stringify(entry.after, null, 2)}</pre>
        </div></details>
      </article>
    </li>)}</ul>}
    {page?.nextCursor && <button className="iw-fit" disabled={action.busy} onClick={() => void action.run(() => load(applied, page.nextCursor!))}>Show more account changes</button>}
    <details><summary>About this history</summary><p>Changes to access, settings, templates and connections, with the actor ID and values before and after each change. Secrets and document values are excluded. Earlier versioned policy histories are included. Archive restore of account history is pending.</p></details>
  </section>
}
