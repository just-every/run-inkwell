import { useEffect, useState } from 'react'
import { command, dateTime, request, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'

type Grant = { version: number; state: 'active' | 'revoked' | 'suspended' | 'ended'; memberId: string; maxContacts: number; days: number[]; startHour: number; endHour: number; escalationOwner: string; channels: ['email']; at: string }
type RecipientState = { signer: number; cause: string; paused: boolean; waitUntil?: string; contacts: number; proposal?: { email: string; source: string } }
type Reply = { id: string; signer: number; from: string; subject: string; text: string; at: string; verified: boolean; tooLarge?: boolean; attachments: { name: string; type: string; size: number; sha256: string }[] }
type Followup = { defaultEscalationOwner?: string; grant: Grant | null; states: RecipientState[]; replies?: Reply[]; people: { id: string; name: string; email: string }[]; readiness: { inbound: boolean } }
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const causes: Record<string, string> = { 'bad address': 'Bad address', unavailable: 'Unavailable', 'substantive reply': 'Substantive reply (possible objection)', 'not opened': 'Not opened', 'opened and left': 'Opened and left', 'repeated views': 'Repeated views', 'contact limit': 'Contact limit reached' }
const hour = (value: number) => `${String(value).padStart(2, '0')}:00`

/** Per-envelope authorization and reply custody; all authority comes from the member-session server door. */
export function EnvelopeFollowup({ envelope, editable, refresh }: { envelope: Envelope; editable: boolean; refresh: () => Promise<void> }) {
  const action = useAction()
  const [data, setData] = useState<Followup>()
  const [maxContacts, setMaxContacts] = useState(3)
  const [days, setDays] = useState([1, 2, 3, 4, 5])
  const [startHour, setStartHour] = useState(9)
  const [endHour, setEndHour] = useState(17)
  const [escalationOwner, setEscalationOwner] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const base = `/api/inkwell/envelopes/${encodeURIComponent(envelope.id)}/followup`
  useEffect(() => {
    let current = true
    setData(undefined)
    action.setError('')
    void request<Followup>(base).then(result => { if (current) setData(result) }).catch(error => { if (current) action.setError(error instanceof Error ? error.message : 'Could not load follow-up.') })
    return () => { current = false }
  }, [base, envelope.events.length, envelope.status, editable])
  useEffect(() => {
    if (!data) return
    const grant = data.grant
    setMaxContacts(grant?.maxContacts ?? 3); setDays(grant?.days ?? [1, 2, 3, 4, 5])
    setStartHour(grant?.startHour ?? 9); setEndHour(grant?.endHour ?? 17)
    setEscalationOwner(data.people.some(person => person.id === grant?.escalationOwner) ? grant!.escalationOwner : data.defaultEscalationOwner ?? '')
    setConfirmed(false)
  }, [data?.grant?.version, data?.grant?.state, data?.defaultEscalationOwner])
  const grant = data?.grant
  const open = envelope.status === 'awaiting_signature' && Date.parse(envelope.expiresAt) > Date.now()
  const active = grant?.state === 'active'
  const signerName = (index: number) => envelope.signers[index]?.name ?? `Recipient ${index + 1}`
  async function act(name: string, input: object) {
    await command(name, { id: envelope.id, ...input })
    await refresh()
    setData(await request<Followup>(base))
  }
  return <section className="iw-stack" aria-label="Signer follow-up"><h3>Signer follow-up</h3>
    <p className="iw-muted">Deterministic v1, model/provider: none. Email only · SMS not available.</p>
    <ErrorNotice error={action.error} />
    {!data ? !action.error && <p role="status">Loading follow-up…</p> : <>
      <p role="status">{grant ? `Grant version ${grant.version} · ${grant.state} · ${dateTime(grant.at)}` : 'Follow-up has not been turned on for this envelope.'}</p>
      {grant && <p>Up to {grant.maxContacts} contacts per recipient, including ordinary reminders while active. {grant.days.map(day => weekdays[day - 1]).join(', ')}, {hour(grant.startHour)}–{hour(grant.endHour)} ({envelope.timeZone ?? 'America/New_York'}). Escalation owner: {data.people.find(person => person.id === grant.escalationOwner)?.name ?? 'Recorded member'}.</p>}
      {grant?.state === 'suspended' && <p>The granting member lost authority. This grant stays suspended; an eligible editor must give a fresh grant to continue.</p>}
      <p>Replies to messages sent before follow-up was turned on are not read.</p>
      {!data.readiness.inbound && <p className="iw-muted" role="status">Inbound email is not ready. Replies cannot be read until the installation’s inbound mail is configured.</p>}
      {editable && open && <details className="iw-stack"><summary>{active ? 'Change follow-up settings' : 'Turn on follow-up'}</summary>
        <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void action.run(() => act('envelope.followup', { enabled: true, maxContacts, days, startHour, endHour, escalationOwner })) }}>
          <p>Authorize Inkwell to read this envelope’s delivery and signing events and authenticated replies, send fixed email follow-ups during each recipient’s turn, and propose actions for a person. Each save creates a new grant version.</p>
          <label>Maximum contacts per recipient<input type="number" required min={1} max={10} step={1} value={maxContacts} onChange={event => setMaxContacts(Number(event.target.value))} /></label>
          <fieldset className="iw-stack"><legend>Allowed days</legend>{weekdays.map((day, index) => <label className="iw-check" key={day}><input type="checkbox" checked={days.includes(index + 1)} onChange={event => { const checked = event.target.checked; setDays(current => checked ? [...current, index + 1].sort() : current.filter(value => value !== index + 1)) }} />{day}</label>)}</fieldset>
          <p className="iw-muted">Hours use {envelope.timeZone ?? 'America/New_York'}. Contacts are checked hourly, at most once per recipient per business day.</p>
          <div className="iw-two"><label>Start hour<select value={startHour} onChange={event => setStartHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, value) => <option key={value} value={value}>{hour(value)}</option>)}</select></label><label>End hour<select value={endHour} onChange={event => setEndHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{hour(value)}</option>)}</select></label></div>
          <label>Escalation owner<select required value={escalationOwner} onChange={event => setEscalationOwner(event.target.value)}><option value="">Choose an eligible member</option>{data.people.map(person => <option key={person.id} value={person.id}>{person.name} ({person.email})</option>)}</select></label>
          {endHour <= startHour && <p className="iw-error">End hour must be after start hour.</p>}
          {!days.length && <p className="iw-error">Choose at least one allowed day.</p>}
          <label className="iw-check"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I authorize follow-up for this envelope under these settings.</label>
          <button className="iw-primary iw-fit" disabled={action.busy || !confirmed || !days.length || endHour <= startHour || !escalationOwner}>{active ? 'Save new grant version' : 'Turn on follow-up'}</button>
        </form>
      </details>}
      {active && <p className="iw-muted">Revocation cancels pending follow-up immediately. A message already handed to the mail provider keeps its recorded outcome.</p>}
      {editable && active && <button className="iw-fit" disabled={action.busy} onClick={() => void action.run(() => act('envelope.followup', { enabled: false }))}>Revoke follow-up</button>}
      {data.states.length > 0 && <ul className="iw-signers">{data.states.map(state => <li key={state.signer}><span className="iw-order" aria-hidden="true">{state.signer + 1}</span><div><strong>{signerName(state.signer)}</strong><p>{causes[state.cause] ?? state.cause?.replaceAll('_', ' ') ?? 'No cause recorded'} · {state.paused ? 'Paused' : 'Not paused'} · {state.contacts} contact(s){grant ? ` of ${grant.maxContacts}` : ''}</p>
        {state.waitUntil && <p>No contact before {dateTime(state.waitUntil)}; then the next allowed window.</p>}
        {state.proposal && <p>Proposed corrected address: {state.proposal.email}. Source: {state.proposal.source}. Nothing is sent to this address until a person applies the correction. {editable && envelope.recipients?.find(recipient => recipient.signer === state.signer)?.bounced ? <a href={`#corrected-email-${envelope.id}-${state.signer}`}>Use the Corrected email control above</a> : 'An editor must use the envelope’s correction controls.'}</p>}
        {editable && active && open && state.paused && <button className="iw-fit" disabled={action.busy} onClick={() => void action.run(() => act('envelope.followup_resume', { signer: state.signer }))}>Resume follow-up for {signerName(state.signer)}</button>}
      </div></li>)}</ul>}
      {data.replies !== undefined && <div className="iw-stack"><h4>Signer replies</h4>{data.replies.length === 0 && <p className="iw-muted">No replies received.</p>}{data.replies.map(reply => <details key={reply.id} className="iw-stack"><summary>{signerName(reply.signer)} · {reply.verified ? 'Authenticated reply' : 'Unverified sender, provider-reported'} · {dateTime(reply.at)}</summary>
        <p>From: {reply.from}</p><p>Subject: {reply.subject}</p>
        {!reply.verified && <p>Not classified or acted on automatically.</p>}
        {reply.tooLarge ? <p>Reply too large to keep.</p> : <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{reply.text}</pre>}
        {reply.attachments.map((attachment, index) => <div key={index}><p>{attachment.name} · {attachment.type} · {attachment.size} bytes · not kept by Inkwell</p><p style={{ overflowWrap: 'anywhere' }}>SHA-256: {attachment.sha256}</p></div>)}
      </details>)}</div>}
    </>}
  </section>
}
