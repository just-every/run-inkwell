// DELIV-008: the signed-in person's activity feed (every notice about envelopes they sent or may edit) and their choice
// of where each kind of notice also goes: email, Slack, Microsoft Teams or Nook.
import { useEffect, useState, type FormEvent } from 'react'
import { dateTime, request } from './types'
import { ErrorNotice, useAction } from './feedback'

type Notice = { id: string; envelopeId: string; event: string; at: string; title: string; recipient: string; posts: { channel: string; state: string; result: string }[] }
type Settings = { events: string[]; channels: string[]; choices: Record<string, Record<string, boolean>>; connected: Record<string, string | null>; examples: Record<string, string> }
const eventNames: Record<string, string> = { viewed: 'Viewed', signed: 'Signed', declined: 'Declined', completed: 'Completed', bounced: 'Bounced', expiring: 'Expiring', retention: 'Retention', send_held: 'Sending held', approval: 'Internal approval' }
const channelNames: Record<string, string> = { email: 'Email', slack: 'Slack', teams: 'Microsoft Teams', nook: 'Nook' }
const line = (notice: Notice) => ({ viewed: `${notice.recipient} viewed it`, signed: `${notice.recipient} signed`, declined: `${notice.recipient} declined`, completed: 'Everyone has signed', bounced: `The invitation to ${notice.recipient} bounced`, expiring: 'Expires soon', retention: 'Will be purged under the retention rule', approval: notice.recipient, send_held: notice.recipient } as Record<string, string>)[notice.event] ?? notice.event

export function Activity({ onOpen, onImport }: { onOpen: (id: string) => void; onImport?: () => void }) {
  const [notices, setNotices] = useState<Notice[]>()
  const action = useAction()
  useEffect(() => { void action.run(async () => setNotices((await request<{ notices: Notice[] }>('/api/inkwell/notices')).notices)) }, [])
  return <section className="iw-panel iw-stack" aria-label="Activity feed"><ErrorNotice error={action.error} />
    {notices && !notices.length && <p className="iw-muted">Nothing yet. Views, signatures, declines, completions, bounces and expiry warnings on envelopes you send show here.</p>}
    {notices && notices.length > 0 && <ul className="iw-activity">{notices.map(notice => <li key={notice.id}>
      <div><strong>{eventNames[notice.event] ?? notice.event}</strong> · {notice.envelopeId.startsWith('import:') ? onImport ? <button type="button" className="iw-text-button" onClick={onImport}>{notice.title}</button> : <span>{notice.title} · Imported archive; the owner manages it in Move in.</span> : <button type="button" className="iw-text-button" onClick={() => onOpen(notice.envelopeId)}>{notice.title}</button>}</div>
      <p>{line(notice)} · <time dateTime={notice.at}>{dateTime(notice.at)}</time></p>
      {notice.posts.length > 0 && <p className="iw-muted">{notice.posts.map(post => `${channelNames[post.channel]}: ${post.state === 'sent' ? 'delivered' : post.result || 'sending'}`).join(' · ')}</p>}
    </li>)}</ul>}
  </section>
}

export function NoticeSettings() {
  const [settings, setSettings] = useState<Settings>()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const action = useAction()
  const save = (body: unknown) => action.run(async () => setSettings((await request<{ result: Settings }>('/api/inkwell/notices/settings', body)).result))
  useEffect(() => { void action.run(async () => setSettings(await request<Settings>('/api/inkwell/notices/settings'))) }, [])
  function connect(event: FormEvent, channel: string) { event.preventDefault(); void save({ connect: { channel, url: urls[channel] ?? '' } }).then(() => setUrls(current => ({ ...current, [channel]: '' }))) }
  return <section className="iw-panel iw-stack" aria-labelledby="iw-notices-heading"><h2 id="iw-notices-heading">Notifications</h2>
    <p className="iw-muted">Every notice shows in Activity. Choose where else each kind reaches you. You are never notified of your own action.</p>
    <ErrorNotice error={action.error} />
    {settings && <>
      <div className="iw-table" role="table" aria-label="Where notices reach you">
        <div className="iw-table-head iw-notice-row" role="row"><span role="columnheader">Notice</span>{settings.channels.map(channel => <span key={channel} role="columnheader">{channelNames[channel]}</span>)}</div>
        {settings.events.map(event => <div key={event} className="iw-notice-row" role="row"><span role="rowheader">{eventNames[event]}</span>{settings.channels.map(channel => <span key={channel} role="cell"><input type="checkbox" aria-label={`${eventNames[event]} by ${channelNames[channel]}`} disabled={action.busy || (channel !== 'email' && !settings.connected[channel])} checked={settings.choices[event][channel]} onChange={change => void save({ choices: { [event]: { [channel]: change.target.checked } } })} /></span>)}</div>)}
      </div>
      {['slack', 'teams', 'nook'].map(channel => settings.connected[channel]
        ? <div key={channel} className="iw-actions"><span>{channelNames[channel]}: connected to {settings.connected[channel]}</span><button type="button" disabled={action.busy} onClick={() => void save({ connect: { channel, url: null } })}>Disconnect {channelNames[channel]}</button></div>
        : <form key={channel} className="iw-actions" onSubmit={event => connect(event, channel)}><label>{channelNames[channel]} incoming webhook URL<input type="url" required placeholder={settings.examples[channel]} value={urls[channel] ?? ''} onChange={event => setUrls(current => ({ ...current, [channel]: event.target.value }))} /></label><button disabled={action.busy}>Connect {channelNames[channel]}</button></form>)}
    </>}
  </section>
}
