import guide from 'virtual:inkwell-healthcare-guide'
// COMPLY-002: uses the existing Settings panel and member-list presentation.
import { useState } from 'react'
import { command, dateTime, request } from './types'
import { ErrorNotice, useAction } from './feedback'

type Review = { generatedAt: string; enabled: boolean; members: { id: string; name: string; email: string; status: string; role: string; lastAccessAt: string | null }[] }
export function Healthcare({ enabled, refresh }: { enabled: boolean; refresh: () => Promise<void> }) {
  const action = useAction(), [review, setReview] = useState<Review>(), [chosen, setChosen] = useState(enabled)
  return <section className="iw-panel iw-stack" aria-label="Healthcare profile"><h2>Healthcare profile</h2>
    <p className="iw-muted">Content-free operational logs and a member access review. Signed documents, field values and their audit evidence remain intact. This profile does not certify compliance or verify your providers.</p>
    <form className="iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('account.healthcare', { enabled: chosen }); await refresh() }) }}>
      <label className="iw-check"><input type="checkbox" checked={chosen} disabled={action.busy} onChange={event => setChosen(event.target.checked)} />Enable healthcare profile</label>
      <button className="iw-fit" disabled={action.busy || chosen === enabled}>{action.busy ? 'Saving…' : 'Save healthcare profile'}</button>
    </form>
    <p role="status">Healthcare profile {enabled ? 'enabled' : 'disabled'}.</p>
    <details className="iw-stack"><summary>Healthcare shared-responsibility guide</summary><section aria-label="Healthcare shared responsibility" className="iw-stack" dangerouslySetInnerHTML={{ __html: guide }} /></details>
    <ErrorNotice error={action.error} />
    <button className="iw-fit" disabled={action.busy} onClick={() => void action.run(async () => setReview(await request<Review>('/api/inkwell/compliance/access-review')))}>Review member access</button>
    {review && <section className="iw-stack" aria-label="Member access review"><h3>Member access review</h3><p>Generated {dateTime(review.generatedAt)}. Last successful authenticated request, in your local time. No recorded access is shown explicitly; anonymous signer and agent requests do not count as member access.</p>
      <ul className="iw-signers">{review.members.map(member => <li key={member.id}><div><strong>{member.name}</strong><span className="iw-signer-email">{member.email}</span><small>{member.role} · {member.status}</small><small>{member.lastAccessAt ? <time dateTime={member.lastAccessAt}>{dateTime(member.lastAccessAt)}</time> : 'No recorded access'}</small></div></li>)}</ul>
    </section>}
  </section>
}
