import { useState } from 'react'
import { command } from './types'
import { ErrorNotice, useAction } from './feedback'
export function Part11Profile({ id, enabled, available, refresh }: { id: string; enabled: boolean; available: boolean; refresh: () => Promise<void> }) {
 const [confirmed,setConfirmed]=useState(false),action=useAction()
 return <section className="iw-stack" aria-label="Additional signature controls"><h3>Additional signature controls</h3><p>Optional Part 11 profile controls require a fresh emailed code and signing reason for every signature, printed with the signer’s name and UTC time in the executed PDF. These controls are unvalidated; an IQ/OQ/PQ qualification package is not available.</p>{enabled?<p role="status">Additional signature controls required. Copies and templates keep this requirement.</p>:available?<form className="iw-stack" onSubmit={e=>{e.preventDefault();void action.run(async()=>{await command('envelope.part11',{id,confirm:confirmed});await refresh()})}}><label className="iw-check"><input type="checkbox" required checked={confirmed} disabled={action.busy} onChange={e=>setConfirmed(e.target.checked)}/>Require these controls for this envelope. They cannot be removed from its record.</label><button disabled={action.busy||!confirmed}>Require additional signature controls</button><ErrorNotice error={action.error}/></form>:null}</section>
}
