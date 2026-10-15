import { useEffect, useState } from 'react'
import { HydrationUnit } from '../base/hydration/unit'
import { request, dateTime, canEdit, type Dashboard } from './types'
import { ErrorNotice, useAction } from './feedback'
import { PrepareEnvelope } from './prepare-envelope'
import { EnvelopeDetail } from './envelope-detail'
import { MoveIn } from './move-in'
import { AgentAccess, ArchiveAccess } from './archive-access'

type Tab = 'envelopes' | 'move-in' | 'archive' | 'agents'
export function OperatorApp() {
  const [data, setData] = useState<Dashboard>()
  const [tab, setTab] = useState<Tab>('envelopes')
  const [preparing, setPreparing] = useState(false)
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState('all')
  const action = useAction()
  async function refresh() { setData(await request<Dashboard>('/api/inkwell')) }
  useEffect(() => { void action.run(refresh) }, [])
  const envelope = data?.envelopes.find(item => item.id === selected)
  const owner = data?.actor.role === 'owner'
  return <div className="iw-app"><HydrationUnit><header className="iw-header"><a className="iw-brand" href="/app"><img src="/brand/mark.svg" width={32} height={32} alt="" />Inkwell</a><div className="iw-header-right">{data && <span>{data.actor.name || data.actor.email}<small>{data.actor.role}</small></span>}<a href="/auth/settings/identity">Identity settings</a></div></header></HydrationUnit>
    <HydrationUnit><nav className="iw-tabs" aria-label="Workspace"><button aria-current={tab === 'envelopes' ? 'page' : undefined} onClick={() => { setTab('envelopes'); setSelected(''); setPreparing(false); void action.run(refresh) }}>Envelopes</button>{owner && <><button aria-current={tab === 'move-in' ? 'page' : undefined} onClick={() => setTab('move-in')}>Move in</button><button aria-current={tab === 'archive' ? 'page' : undefined} onClick={() => setTab('archive')}>Archive</button><button aria-current={tab === 'agents' ? 'page' : undefined} onClick={() => setTab('agents')}>Agent access</button></>}</nav></HydrationUnit>
    <main className="iw-main"><HydrationUnit><section className="iw-page-heading"><div><p className="iw-eyebrow">Document workspace</p><h1>{tab === 'envelopes' ? 'Agreements, in order.' : tab === 'move-in' ? 'Bring your history with you.' : tab === 'archive' ? 'Keep a complete record.' : 'Prepare with an agent.'}</h1><p>{tab === 'envelopes' ? 'Prepare a fixed PDF, review it, and collect signatures one recipient at a time.' : 'Your documents and their history stay under your control.'}</p></div>{data && tab === 'envelopes' && canEdit(data.actor) && !preparing && <button className="iw-primary" onClick={() => { setSelected(''); setPreparing(true) }}>New envelope</button>}</section></HydrationUnit>
      <HydrationUnit><section className="iw-content"><ErrorNotice error={action.error} />{!data && !action.error && <p role="status">Loading workspace…</p>}{action.error && <div className="iw-actions"><button disabled={action.busy} onClick={() => void action.run(refresh)}>Try again</button><a href="/signin">Sign in</a></div>}
        {data && tab === 'envelopes' && <>{preparing ? <PrepareEnvelope onCancel={() => setPreparing(false)} onSaved={async id => { await refresh(); setPreparing(false); setSelected(id) }} /> : envelope ? <EnvelopeDetail key={envelope.id} envelope={envelope} actor={data.actor} refresh={refresh} onClose={() => setSelected('')} /> : <div className="iw-panel"><div className="iw-section-head"><h2>Envelopes <span className="iw-count">{data.envelopes.length}</span></h2><div className="iw-actions"><label className="iw-inline-label">Status<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All</option><option value="prepared">Prepared</option><option value="awaiting_signature">Awaiting signature</option><option value="completed">Completed</option><option value="voided">Voided</option><option value="expired">Expired</option></select></label><button disabled={action.busy} onClick={() => void action.run(refresh)}>Refresh</button></div></div>{data.envelopes.length === 0 ? <div className="iw-empty"><h3>Your first agreement starts here.</h3><p>Upload a PDF and choose who signs first. Saved envelopes wait for human approval.</p>{canEdit(data.actor) && <button className="iw-primary" onClick={() => setPreparing(true)}>Prepare an envelope</button>}</div> : <div className="iw-envelope-list">{data.envelopes.filter(item => filter === 'all' || item.status === filter).map(item => <button key={item.id} className="iw-envelope-row" onClick={() => setSelected(item.id)}><span><strong>{item.title}</strong><small>{item.signers.map(signer => signer.name).join(' → ')}</small></span><span><span className={`iw-status iw-status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span><small>{dateTime(item.createdAt)}</small></span><span aria-hidden="true">→</span></button>)}{!data.envelopes.some(item => filter === 'all' || item.status === filter) && <p>No envelopes with this status.</p>}</div>}</div>}</>}
        {data && owner && tab === 'move-in' && <MoveIn />}{data && owner && tab === 'archive' && <ArchiveAccess empty={!data.envelopes.length} refresh={refresh} />}{data && owner && tab === 'agents' && <AgentAccess agents={data.agents} refresh={refresh} />}
      </section></HydrationUnit>
    </main><HydrationUnit><footer className="iw-footer">Inkwell · Documents, signatures, and a verifiable record.</footer></HydrationUnit>
  </div>
}
