// DELIV-007: a recipient's completed copy, signed out. The link from the completion email opens only after a code
// sent to that recipient's own mailbox; then the executed PDF and certificate download here.
import { useEffect, useState } from 'react'
import { HydrationUnit } from '../base/hydration/unit'
import { dateTime, request } from './types'
import { ErrorNotice, useAction } from './feedback'
import { Check } from './marks'
import { Brand } from './shell'

type CopyView = { title: string; completedAt?: string; recipient: { name: string; email: string; role: 'signer' | 'copy' }; verified: boolean }
export function CompletedCopy({ token }: { token: string }) {
  const [view, setView] = useState<CopyView>()
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const action = useAction(), base = `/api/copy/${encodeURIComponent(token)}`
  async function refresh() { setView(await request<CopyView>(base)) }
  useEffect(() => { void action.run(refresh) }, [token])
  return <div className="iw-app iw-signer"><HydrationUnit><header className="iw-header"><Brand href="/" /><span className="iw-header-note">Completed copy</span></header></HydrationUnit><main className="iw-main">
    <HydrationUnit><section className="iw-page-heading"><div><p className="iw-eyebrow">Completed</p><h1>{view?.title || 'Your completed copy'}</h1>{view && <p>For {view.recipient.name} · {view.recipient.email}{view.completedAt ? ` · completed ${dateTime(view.completedAt)}` : ''}</p>}</div></section></HydrationUnit>
    <HydrationUnit><section className="iw-panel iw-stack"><ErrorNotice error={action.error} />{!view && !action.error && <p role="status">Loading your completed copy…</p>}{!view && action.error && <p>This link could not be opened. Check the link in your email or contact the sender.</p>}
      {view && !view.verified && <div className="iw-verify iw-stack"><h2>Confirm your email</h2><p>We will send a one-time code to {view.recipient.email}. Enter it to download the executed PDF and its certificate.</p>
        <button className="iw-primary iw-fit" disabled={action.busy} onClick={() => void action.run(async () => { await request(`${base}/code`, {}); setCodeSent(true) })}>{action.busy ? 'Working…' : codeSent ? 'Send a new code' : 'Email me a code'}</button>
        {codeSent && <form className="iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => { await request(`${base}/verify`, { code }); setCode(''); await refresh() }) }}><p role="status">Code sent. Check your email.</p><label>Email code<input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label><button className="iw-primary iw-fit" disabled={action.busy}>{action.busy ? 'Checking…' : 'Open my copy'}</button></form>}
      </div>}
      {view?.verified && <div className="iw-callout iw-stack iw-done"><h2><Check />All signatures are complete.</h2><p>Keep the executed PDF and certificate for your records.</p><div className="iw-actions"><a className="iw-button iw-primary" href={`${base}/artifacts/signed`} download>Download executed PDF</a><a className="iw-button" href={`${base}/artifacts/certificate`} download>Download certificate</a></div></div>}
    </section></HydrationUnit>
  </main></div>
}
