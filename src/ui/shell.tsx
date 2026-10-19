// The operator's frame: the white sidebar with the mark, the workspace navigation and the signed-in person,
// and the top bar with search, the clock and New envelope.
import { useEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { clockTime, type Actor } from './types'

export type Place = 'envelopes' | 'me' | 'reports' | 'move-in' | 'archive' | 'agents' | 'settings'
export const roleLabel = { owner: 'Owner', admin: 'Admin', sender: 'Sender', viewer: 'Viewer' } as Record<string, string>
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || '·'

export function Brand({ href = '/app' }: { href?: string }) {
  return <a className="iw-brand" href={href}><img src="/brand/mark.svg" width={36} height={36} alt="" /><span data-rer-name>Inkwell</span></a>
}

export function Sidebar({ place, actor, waiting, onGo }: { place: Place; actor?: Actor; waiting: number; onGo: (place: Place) => void }) {
  const owner = actor?.role === 'owner'
  const item = (to: Place, icon: IconName, label: string, badge?: ReactNode) => <li key={to}><button className="iw-nav-item" aria-current={place === to ? 'page' : undefined} onClick={() => onGo(to)}><Icon name={icon} /><span>{label}</span>{badge}</button></li>
  return <aside className="iw-sidebar">
    <Brand />
    <nav aria-label="Workspace"><ul>
      {item('envelopes', 'envelope', 'Envelopes')}
      {item('me', 'clock', 'Waiting for me', waiting > 0 && <span className="iw-nav-count">{waiting}</span>)}
      {item('reports', 'chart', 'Reports')}
      {owner && <>{item('move-in', 'movein', 'Move in')}{item('archive', 'archive', 'Archive')}{item('agents', 'agent', 'Agent access')}</>}
      {item('settings', 'settings', 'Settings')}
    </ul></nav>
    {actor && <div className="iw-person"><span className="iw-avatar" aria-hidden="true">{initials(actor.name || actor.email)}</span><div><strong>{actor.name || actor.email}</strong><small>{roleLabel[actor.role] ?? actor.role}</small><small className="iw-person-email">{actor.email}</small></div></div>}
  </aside>
}

/** Today in the viewer's own zone, as "Mon Oct 19, 2026 · 9:41 am ET"; refreshed each minute. */
function Today() {
  const [now, setNow] = useState<Date>()
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer) }, [])
  if (!now) return <span className="iw-today" />
  const day = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '')
  const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(now).find(part => part.type === 'timeZoneName')?.value ?? ''
  return <time className="iw-today" dateTime={now.toISOString()}>{day} · {clockTime(now)} {zone.replace(/^E[DS]T$/, 'ET').replace(/^C[DS]T$/, 'CT').replace(/^M[DS]T$/, 'MT').replace(/^P[DS]T$/, 'PT')}</time>
}

export function TopBar({ query, onQuery, onNew }: { query: string; onQuery: (value: string) => void; onNew?: () => void }) {
  return <header className="iw-topbar">
    <label className="iw-search"><Icon name="search" /><span className="iw-sr">Search envelopes</span><input type="search" value={query} placeholder="Search envelopes, signers or emails..." onChange={event => onQuery(event.target.value)} /></label>
    <Today />
    {onNew && <button className="iw-primary iw-new" onClick={onNew}><span>New envelope</span><Icon name="arrow" /></button>}
  </header>
}

/** The signed-in person in this workspace, and the way to Base's sign-in settings. */
export function AccountSettings({ actor }: { actor: Actor }) {
  return <section className="iw-panel iw-stack"><h2>Your account</h2>
    <dl className="iw-account"><dt>Name</dt><dd>{actor.name || '—'}</dd><dt>Email</dt><dd>{actor.email}</dd><dt>Role</dt><dd>{roleLabel[actor.role] ?? actor.role}</dd></dl>
    <a className="iw-button iw-fit" href="/auth/settings/identity">Sign-in settings</a>
  </section>
}
