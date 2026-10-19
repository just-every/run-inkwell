import { useState } from 'react'
import { command } from './types'
import { ErrorNotice, useAction } from './feedback'

/** ROUTE-007: the host attests before handing their signed-out device to this signer. */
export function HostSigning({ id, signer, name }: { id: string; signer: number; name: string }) {
  const [method, setMethod] = useState('government-photo-id'), [confirmed, setConfirmed] = useState(false)
  const action = useAction()
  return <form className="iw-callout iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => {
    const result = await command<{ signing: { url: string } }>('envelope.host', { id, signer, method, confirmed, screen: { width: window.screen.width, height: window.screen.height } })
    window.location.replace(result.signing.url)
  }) }}>
    <h3>Host {name} in person</h3>
    <label>How I confirmed their identity<select value={method} onChange={event => setMethod(event.target.value)}><option value="government-photo-id">Government photo ID</option><option value="personally-known">Personally known to me</option></select></label>
    <label className="iw-check"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirmed {name}’s identity in person.</label>
    <p>You will be signed out before handing over this device. They can access only this signing request. After they sign or decline, you must sign in again. Inkwell records your attestation; it does not verify their identity or keep an ID image or number.</p>
    <button className="iw-primary iw-fit" disabled={action.busy || !confirmed}>Open in-person signing</button>
    <ErrorNotice error={action.error} />
  </form>
}
