// COMPLY-002: uses the existing Settings panel and member-list presentation.
import { useState } from 'react'
import { command, dateTime, request } from './types'
import { ErrorNotice, useAction } from './feedback'

type Review = { generatedAt: string; enabled: boolean; members: { id: string; name: string; email: string; status: string; role: string; lastAccessAt: string | null }[] }
export function Healthcare({ enabled, refresh }: { enabled: boolean; refresh: () => Promise<void> }) {
  const action = useAction(), [review, setReview] = useState<Review>()
  return <section className="iw-panel iw-stack" aria-label="Healthcare profile"><h2>Healthcare profile</h2>
    <p className="iw-muted">Content-free operational logs and a member access review. Signed documents, field values and their audit evidence remain intact. This profile does not certify compliance or verify your providers.</p>
    <label className="iw-check"><input type="checkbox" checked={enabled} disabled={action.busy} onChange={event => { const enabled = event.target.checked; void action.run(async () => { await command('account.healthcare', { enabled }); await refresh() }) }} />Enable healthcare profile</label>
    <a href="/docs/healthcare">Healthcare shared-responsibility guide</a>
    <ErrorNotice error={action.error} />
    <button className="iw-fit" disabled={action.busy} onClick={() => void action.run(async () => setReview(await request<Review>('/api/inkwell/compliance/access-review')))}>Review member access</button>
    {review && <section className="iw-stack" aria-label="Member access review"><h3>Member access review</h3><p>Generated {dateTime(review.generatedAt)}. Last successful authenticated request, in your local time. No recorded access is shown explicitly; anonymous signer and agent requests do not count as member access.</p>
      <dl className="iw-account">{review.members.map(member => <div key={member.id} style={{ display: 'contents' }}><dt>{member.name}<br /><small className="iw-muted">{member.email}</small></dt><dd>{member.role} · {member.status}<br />{member.lastAccessAt ? <time dateTime={member.lastAccessAt}>{dateTime(member.lastAccessAt)}</time> : 'No recorded access'}</dd></div>)}</dl>
    </section>}
  </section>
}
