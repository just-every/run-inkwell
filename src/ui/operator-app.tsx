import { useEffect, useRef, useState } from 'react'
import { HydrationUnit } from '../base/hydration/unit'
import { request, canApprove, canEdit, type Envelope, type Page, type Workspace } from './types'
import { ErrorNotice, useAction } from './feedback'
import { PrepareEnvelope } from './prepare-envelope'
import { EnvelopeDetail } from './envelope-detail'
import { MoveIn } from './move-in'
import { AgentAccess, ArchiveAccess } from './archive-access'
import { AccountSettings, Sidebar, TopBar, type Place } from './shell'
import { PeopleRoles } from './people'
import { AgentStrip, EmptyEnvelopes, EnvelopesHeading, EnvelopeTable, FilterChips, MoreEnvelopes, NarrowFilters, needingMe, type Filter, type Narrow } from './envelope-list'

type Tab = 'envelopes' | 'move-in' | 'archive' | 'agents' | 'settings'
const headings: Record<Exclude<Tab, 'envelopes'>, [string, string]> = {
  'move-in': ['Move in', 'Bring your history with you.'],
  archive: ['Archive', 'Keep a complete record.'],
  agents: ['Agent access', 'Prepare with an agent.'],
  settings: ['Settings', 'Your account in this workspace.'],
}
// Wide enough for the list and the envelope panel side by side (public/app/shell.css).
const sideBySide = '(min-width: 1181px)'

// MANAGE-001: the screen reads the server's search a page at a time. A chosen day is the viewer's own local day.
const localDay = (day: string, plus = 0) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d + plus).toISOString() }
const search = (params: Record<string, string>) => request<Page>('/api/inkwell/envelopes?' + new URLSearchParams(Object.entries(params).filter(([, value]) => value)))

export function OperatorApp() {
  const [data, setData] = useState<Workspace>()
  const [summary, setSummary] = useState<Page>()
  const [agentPage, setAgentPage] = useState<Page>()
  const [page, setPage] = useState<Page>()
  const [tab, setTab] = useState<Tab>('envelopes')
  const [preparing, setPreparing] = useState(false)
  const [selected, setSelected] = useState('')
  const [envelope, setEnvelope] = useState<Envelope>()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [narrow, setNarrow] = useState<Narrow>({ from: '', to: '', sender: '' })
  const opened = useRef(false), shownFor = useRef(0), selectedRef = useRef('')
  const action = useAction(), paging = useAction()
  const words = query.trim()
  const params = { q: words, status: filter === 'all' ? '' : filter, from: narrow.from && localDay(narrow.from), to: narrow.to && localDay(narrow.to, 1), sender: narrow.sender }
  // Only the newest search's answer is shown, so a slow earlier page never replaces a later one.
  async function loadPage() { const ticket = ++shownFor.current, next = await search(params); if (ticket === shownFor.current) setPage(next) }
  async function loadEnvelope(id: string) { const next = id ? (await request<{ envelope: Envelope }>(`/api/inkwell/envelopes/${encodeURIComponent(id)}`)).envelope : undefined; if (selectedRef.current === id) setEnvelope(next) }
  async function refresh() {
    const [workspace, drafts, agents] = await Promise.all([request<Workspace>('/api/inkwell'), search({ status: 'draft', limit: '1' }), search({ preparedBy: 'agent', status: 'draft', limit: '1' })])
    setData(workspace); setSummary(drafts); setAgentPage(agents)
    await Promise.all([loadPage(), loadEnvelope(selectedRef.current)])
  }
  function choose(id: string) { selectedRef.current = id; setSelected(id); setEnvelope(undefined); if (id) void action.run(() => loadEnvelope(id)) }
  useEffect(() => { void action.run(refresh) }, [])
  // A new search, status or narrowing asks the server again; typing settles for a moment first.
  const asked = useRef(false)
  useEffect(() => { if (!asked.current) { asked.current = true; return } const timer = setTimeout(() => void action.run(loadPage), words ? 250 : 0); return () => clearTimeout(timer) }, [words, filter, narrow.from, narrow.to, narrow.sender])
  // With room for both, the screen opens on the first draft waiting for this person's approval.
  useEffect(() => {
    if (!data || !summary || opened.current) return
    opened.current = true
    const decision = summary.envelopes[0]
    if (decision && canApprove(data.actor) && window.matchMedia(sideBySide).matches) choose(decision.id)
  }, [data, summary])
  async function more() { if (!page?.next) return; const next = await search({ ...params, cursor: page.next }); setPage({ ...next, envelopes: [...page.envelopes, ...next.envelopes] }) }
  const owner = data?.actor.role === 'owner'
  const go = (place: Place) => {
    setPreparing(false); choose('')
    if (place === 'envelopes' || place === 'me') { setTab('envelopes'); setFilter(place === 'me' ? 'waiting_for_me' : 'all'); void action.run(refresh) } else setTab(place)
  }
  const place: Place = tab === 'envelopes' ? filter === 'waiting_for_me' ? 'me' : 'envelopes' : tab
  const filtered = Boolean(words || narrow.from || narrow.to || narrow.sender)
  const panel = tab === 'envelopes' && !preparing && envelope?.id === selected && envelope
  return <div className={`iw-app iw-operator${panel ? ' iw-has-panel' : ''}`}>
    <HydrationUnit><Sidebar place={place} actor={data?.actor} waiting={summary?.counts.waiting_for_me ?? 0} onGo={go} /></HydrationUnit>
    <div className="iw-work">
      <HydrationUnit><TopBar query={query} onQuery={value => { setQuery(value); if (tab !== 'envelopes') go('envelopes') }} onNew={data && canEdit(data.actor) ? () => { setTab('envelopes'); choose(''); setPreparing(true) } : undefined} /></HydrationUnit>
      <div className="iw-body">
        <main className="iw-main"><HydrationUnit>
          <ErrorNotice error={action.error} />{!data && !action.error && <p role="status">Loading workspace…</p>}{action.error && <div className="iw-actions"><button disabled={action.busy} onClick={() => void action.run(refresh)}>Try again</button><a href="/signin">Sign in</a></div>}
          {data && tab === 'envelopes' && (preparing ? <PrepareEnvelope onCancel={() => setPreparing(false)} onSaved={async id => { await refresh(); setPreparing(false); choose(id) }} /> : <>
            {summary && <EnvelopesHeading counts={summary.counts} actor={data.actor} />}
            {agentPage && <AgentStrip prepared={agentPage} actor={data.actor} agents={data.agents ?? []} onReview={choose} onAccess={owner ? () => go('agents') : undefined} />}
            {summary?.total === 0 ? <div className="iw-card"><EmptyEnvelopes actor={data.actor} onPrepare={() => setPreparing(true)} /></div> : page && <>
              <FilterChips page={page} filter={filter} onFilter={setFilter} />
              <NarrowFilters narrow={narrow} people={data.people ?? []} onNarrow={setNarrow} />
              <div className="iw-card iw-table-card">{page.envelopes.length ? <EnvelopeTable envelopes={page.envelopes} actor={data.actor} selected={selected} onSelect={choose} /> : <EmptyEnvelopes actor={data.actor} filtered={filtered ? 'No envelopes match your search.' : 'No envelopes with this status.'} onPrepare={() => setPreparing(true)} />}</div>
              {page.envelopes.length > 0 && <MoreEnvelopes page={page} filter={filter} busy={paging.busy} onMore={() => void paging.run(more)} />}<ErrorNotice error={paging.error} />
            </>}
          </>)}
          {data && tab !== 'envelopes' && <section className="iw-heading"><h1>{headings[tab][0]}</h1><p className="iw-heading-line">{headings[tab][1]}</p></section>}
          {data && owner && tab === 'move-in' && <MoveIn />}{data && owner && tab === 'archive' && <ArchiveAccess empty={summary?.total === 0} refresh={refresh} />}{data && owner && tab === 'agents' && <AgentAccess agents={data.agents} refresh={refresh} />}{data && tab === 'settings' && <AccountSettings actor={data.actor} />}{data && tab === 'settings' && ['owner', 'admin'].includes(data.actor.role) && <PeopleRoles people={data.people ?? []} refresh={refresh} />}
        </HydrationUnit></main>
        {panel && data && <HydrationUnit><aside className="iw-panel-col"><EnvelopeDetail key={panel.id} envelope={panel} actor={data.actor} refresh={refresh} onClose={() => choose('')} onOpen={choose} /></aside></HydrationUnit>}
      </div>
    </div>
  </div>
}
