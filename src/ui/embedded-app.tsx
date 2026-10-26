import { useEffect, useState } from 'react'
import { request, command, type Envelope } from './types'
import { PrepareEnvelope } from './prepare-envelope'
import { SignerApp } from './signer-app'
import { ErrorNotice, useAction } from './feedback'
import { embedEvent } from './embed-client'

type Launch = { mode: 'sign' | 'prepare'; origin: string; token?: string; envelopeId?: string }
const sessionPath = () => '/api/embed/' + window.location.pathname.split('/').at(-1)
const stateLabel = (envelope: Envelope) => envelope.status === 'awaiting_signature' ? 'Awaiting signatures' : envelope.internalApproval?.state === 'pending' ? 'Waiting for internal approval' : envelope.status.replaceAll('_', ' ')

export function EmbeddedApp() {
  const [launch, setLaunch] = useState<Launch>()
  const [envelope, setEnvelope] = useState<Envelope>()
  const [eligible, setEligible] = useState(false)
  const [closed, setClosed] = useState(false)
  const action = useAction()
  const refresh = async (id: string) => setEnvelope((await request<{ envelope: Envelope }>('/api/inkwell/envelopes/' + id)).envelope)
  useEffect(() => {
    void action.run(async () => {
      const opened = await request<Launch>(sessionPath() + '/meta')
      setLaunch(opened)
      if (opened.envelopeId) await refresh(opened.envelopeId)
    })
  }, [])
  const close = () => void action.run(async () => {
    await request(sessionPath() + '/close', {})
    embedEvent(launch!.origin, 'closed')
    setClosed(true)
  })
  const submit = () => void action.run(async () => {
    await command('envelope.approve', { id: envelope!.id, eligible })
    await refresh(envelope!.id)
    embedEvent(launch!.origin, 'sent', envelope!.id)
  })
  if (!launch) return <div className="iw-app iw-signer"><main className="iw-main">
    <h1>Embedded session</h1><ErrorNotice error={action.error} />
    <p role="status">{action.error ? 'This embedded session is unavailable.' : 'Opening embedded session…'}</p>
  </main></div>
  return <div className="iw-app">
    {!closed && <div className="iw-actions" style={{ padding: 16, justifyContent: 'flex-end' }}>
      <button type="button" disabled={action.busy} onClick={close}>Close embedded session</button>
    </div>}
    {closed ? <div className="iw-signer"><main className="iw-main"><h1>Session closed</h1></main></div>
      : launch.mode === 'sign' ? <SignerApp token={launch.token!} parentOrigin={launch.origin} />
      : <div className="iw-signer"><main className="iw-main">
        {envelope && <section className="iw-page-heading"><h1>Prepare and send</h1></section>}
        <ErrorNotice error={action.error} />
        {!envelope ? <PrepareEnvelope onSaved={refresh} onCancel={close} />
          : <section className="iw-callout iw-stack">
            <h2>{envelope.title}</h2><p>Status: {stateLabel(envelope)}</p>
            {envelope.signers.map((signer, i) => <p key={i}>{signer.name} · {signer.email}</p>)}
            {envelope.status === 'prepared' ? <>
              <label className="iw-check"><input type="checkbox" checked={eligible} onChange={event => setEligible(event.target.checked)} />I reviewed this envelope and authorize sending it to these recipients.</label>
              <button className="iw-primary iw-fit" disabled={!eligible || action.busy} onClick={submit}>Approve and send</button>
            </> : <p role="status">The envelope has been submitted. {stateLabel(envelope)}.</p>}
          </section>}
      </main></div>}
  </div>
}
