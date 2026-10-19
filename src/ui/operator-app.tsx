import { useEffect, useRef, useState } from 'react'
import { HydrationUnit } from '../base/hydration/unit'
import { request, canEdit, type Dashboard } from './types'
import { ErrorNotice, useAction } from './feedback'
import { PrepareEnvelope } from './prepare-envelope'
import { EnvelopeDetail } from './envelope-detail'
import { MoveIn } from './move-in'
import { AgentAccess, ArchiveAccess } from './archive-access'
import { AccountSettings, Sidebar, TopBar, type Place } from './shell'
import { PeopleRoles } from './people'
import { AgentStrip, EmptyEnvelopes, EnvelopesHeading, EnvelopeTable, FilterChips } from './envelope-list'
import { matches, needsMe, updatedAt, type Filter } from './envelope-view'

type Tab = 'envelopes' | 'move-in' | 'archive' | 'agents' | 'settings'
const headings: Record<Exclude<Tab, 'envelopes'>, [string, string]> = {
  'move-in': ['Move in', 'Bring your history with you.'],
  archive: ['Archive', 'Keep a complete record.'],
  agents: ['Agent access', 'Prepare with an agent.'],
  settings: ['Settings', 'Your account in this workspace.'],
}
// Wide enough for the list and the envelope panel side by side (public/app/shell.css).
const sideBySide = '(min-width: 1181px)'

export function OperatorApp() {
  const [data, setData] = useState<Dashboard>()
  const [tab, setTab] = useState<Tab>('envelopes')
  const [preparing, setPreparing] = useState(false)
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const opened = useRef(false)
  const action = useAction()
  async function refresh() { setData(await request<Dashboard>('/api/inkwell')) }
  useEffect(() => { void action.run(refresh) }, [])
  // With room for both, the screen opens on the first envelope waiting for a decision.
  useEffect(() => {
    if (!data || opened.current) return
    opened.current = true
    const decision = data.envelopes.find(item => item.status === 'prepared' && needsMe(item, data.actor))
    if (decision && window.matchMedia(sideBySide).matches) setSelected(decision.id)
  }, [data])
  const envelope = data?.envelopes.find(item => item.id === selected)
  const owner = data?.actor.role === 'owner'
  const go = (place: Place) => {
    setPreparing(false); setSelected('')
    if (place === 'envelopes' || place === 'me') { setTab('envelopes'); setFilter(place === 'me' ? 'me' : 'all'); void action.run(refresh) } else setTab(place)
  }
  const place: Place = tab === 'envelopes' ? filter === 'me' ? 'me' : 'envelopes' : tab
  const words = query.trim().toLowerCase()
  const visible = data ? data.envelopes.filter(item => matches(item, data.actor, filter) && (!words || [item.title, ...item.signers.flatMap(signer => [signer.name, signer.email])].some(value => value.toLowerCase().includes(words)))).sort((a, b) => updatedAt(b).localeCompare(updatedAt(a))) : []
  const panel = tab === 'envelopes' && !preparing && envelope
  return <div className={`iw-app iw-operator${panel ? ' iw-has-panel' : ''}`}>
    <HydrationUnit><Sidebar place={place} actor={data?.actor} waiting={data ? data.envelopes.filter(item => needsMe(item, data.actor)).length : 0} onGo={go} /></HydrationUnit>
    <div className="iw-work">
      <HydrationUnit><TopBar query={query} onQuery={value => { setQuery(value); if (tab !== 'envelopes') go('envelopes') }} onNew={data && canEdit(data.actor) ? () => { setTab('envelopes'); setSelected(''); setPreparing(true) } : undefined} /></HydrationUnit>
      <div className="iw-body">
        <main className="iw-main"><HydrationUnit>
          <ErrorNotice error={action.error} />{!data && !action.error && <p role="status">Loading workspace…</p>}{action.error && <div className="iw-actions"><button disabled={action.busy} onClick={() => void action.run(refresh)}>Try again</button><a href="/signin">Sign in</a></div>}
          {data && tab === 'envelopes' && (preparing ? <PrepareEnvelope onCancel={() => setPreparing(false)} onSaved={async id => { await refresh(); setPreparing(false); setSelected(id) }} /> : <>
            <EnvelopesHeading envelopes={data.envelopes} actor={data.actor} />
            <AgentStrip data={data} onReview={setSelected} onAccess={owner ? () => go('agents') : undefined} />
            {data.envelopes.length === 0 ? <div className="iw-card"><EmptyEnvelopes actor={data.actor} onPrepare={() => setPreparing(true)} /></div> : <>
              <FilterChips envelopes={data.envelopes} actor={data.actor} filter={filter} onFilter={setFilter} />
              <div className="iw-card iw-table-card">{visible.length ? <EnvelopeTable envelopes={visible} actor={data.actor} selected={selected} onSelect={setSelected} /> : <EmptyEnvelopes actor={data.actor} filtered={words ? 'No envelopes match your search.' : 'No envelopes with this status.'} onPrepare={() => setPreparing(true)} />}</div>
            </>}
          </>)}
          {data && tab !== 'envelopes' && <section className="iw-heading"><h1>{headings[tab][0]}</h1><p className="iw-heading-line">{headings[tab][1]}</p></section>}
          {data && owner && tab === 'move-in' && <MoveIn />}{data && owner && tab === 'archive' && <ArchiveAccess empty={!data.envelopes.length} refresh={refresh} />}{data && owner && tab === 'agents' && <AgentAccess agents={data.agents} refresh={refresh} />}{data && tab === 'settings' && <AccountSettings actor={data.actor} />}{data && tab === 'settings' && ['owner', 'admin'].includes(data.actor.role) && <PeopleRoles people={data.people ?? []} refresh={refresh} />}
        </HydrationUnit></main>
        {panel && data && <HydrationUnit><aside className="iw-panel-col"><EnvelopeDetail key={panel.id} envelope={panel} actor={data.actor} refresh={refresh} onClose={() => setSelected('')} onOpen={setSelected} /></aside></HydrationUnit>}
      </div>
    </div>
  </div>
}
