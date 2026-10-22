import { useState } from 'react'
import { request } from './types'
import { ErrorNotice, useAction } from './feedback'

export function SmsAuthentication({ base, phone, onVerified }: { base:string; phone:string; onVerified:()=>Promise<void> }) {
  const action = useAction(), [sent, setSent] = useState(false), [code, setCode] = useState('')
  return <section className="iw-verify iw-stack" aria-label="SMS verification"><h2>Verify your mobile number</h2>
    <p>Send a one-time code to {phone}. Enter it before viewing or signing this request.</p>
    <button type="button" className="iw-primary iw-fit" disabled={action.busy} onClick={()=>void action.run(async()=>{await request(`${base}/code`,{});setSent(true);setCode('')})}>{action.busy?'Working…':sent?'Send a new SMS code':'Text me a code'}</button>
    {sent&&<form className="iw-stack" onSubmit={event=>{event.preventDefault();void action.run(async()=>{await request(`${base}/verify`,{code});setCode('');await onVerified()})}}>
      <p role="status">Code sent. Check your text messages. It expires in 10 minutes.</p>
      <label>SMS verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value)}/></label>
      <button type="submit" className="iw-primary iw-fit" disabled={action.busy}>{action.busy?'Verifying…':'Verify code'}</button>
    </form>}<ErrorNotice error={action.error}/>
  </section>
}
