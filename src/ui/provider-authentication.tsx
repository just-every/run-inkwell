import { useState } from 'react'
import { request } from './types'
import { ErrorNotice, useAction } from './feedback'

export function ProviderAuthentication({ base, method, phone, onVerified }: { base: string; method: 'identity' | 'voice' | 'knowledge'; phone?: string; onVerified: () => Promise<void> }) {
  const action = useAction(), [consent, setConsent] = useState(false), [url, setUrl] = useState<string>(), [started, setStarted] = useState(false), [code, setCode] = useState(''), [dob, setDob] = useState(''), [pending, setPending] = useState(false)
  const identity = method === 'identity', knowledge = method === 'knowledge', hosted = identity || knowledge
  return <section className="iw-verify iw-stack" aria-label="Provider verification">
    <h2>{identity ? 'Verify your identity' : knowledge ? 'Verify with knowledge questions' : 'Verify by voice call'}</h2>
    <p>{identity ? 'Stripe Identity checks your government photo ID and a matching selfie on its own page. Your full name must match the recipient named above. Inkwell keeps the verification reference, result and name match, never your ID images.' : knowledge ? 'Authenticate asks questions from US public and credit records on its own page. Your name, email and date of birth go to Authenticate with your consent. Inkwell keeps only references and results, never your date of birth, questions or answers. Two failed attempts lock this invitation and notify the sender.' : `Twilio calls ${phone} with a code. Inkwell keeps the provider reference and result, never the code.`}</p>
    {knowledge && <label>Date of birth<input type="date" required value={dob} onChange={e=>setDob(e.target.value)} disabled={action.busy}/></label>}
    <label className="iw-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={action.busy}/>I agree to {identity ? 'Stripe Identity verifying my ID and selfie for this signing request' : knowledge ? 'Authenticate using my identity details for knowledge questions for this signing request' : 'a Twilio verification call to this number'}.</label>
    <button type="button" className="iw-primary iw-fit" disabled={action.busy || !consent || knowledge && !dob} onClick={() => void action.run(async () => {
      const result = await request<{url?: string}>(`${base}/provider/start`, {consent,...(knowledge?{dateOfBirth:dob}:{})}); setDob(''); setStarted(true); setUrl(result.url); setPending(false); setCode('')
    })}>{started ? 'Start a new verification' : identity ? 'Start identity verification' : knowledge ? 'Start knowledge questions' : 'Call me with a code'}</button>
    {url && <a className="iw-button iw-fit" href={url} target="_blank" rel="noreferrer">{identity?'Open Stripe verification':'Open Authenticate questions'}</a>}
    <form className="iw-stack" onSubmit={e => { e.preventDefault(); void action.run(async () => {
      try { const result = await request<{pending?: boolean}>(`${base}/provider/check`, hosted ? {} : {code}); setPending(result.pending === true) } finally { setCode(''); await onVerified() }
    }) }}>
      {!hosted && <label>Voice-call code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,10}" maxLength={10} value={code} onChange={e => setCode(e.target.value)}/></label>}
      <button className="iw-fit" disabled={action.busy}>{hosted ? 'Check verification result' : 'Verify voice-call code'}</button>
    </form>
    {pending && <p role="status">Verification is still waiting for the provider. Complete its steps, then check again.</p>}
    <ErrorNotice error={action.error}/>
  </section>
}
