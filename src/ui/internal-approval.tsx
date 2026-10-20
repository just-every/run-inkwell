// ROUTE-004: internal approval before sending. The account rule (owners and admins) and a template's rule name one
// approver by email, for every envelope or only above a USD amount; the named approver approves or rejects a waiting
// draft from its panel, and its sender sees who it waits for or why it was rejected.
import { useState } from 'react'
import { command, dateTime, type ApprovalRule, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'

export type RuleDraft = { on: boolean; approverEmail: string; limited: boolean; field: string; above: string }
export const ruleDraft = (rule?: ApprovalRule | null): RuleDraft => ({ on: Boolean(rule), approverEmail: rule?.email ?? '', limited: Boolean(rule?.threshold), field: rule?.threshold?.field ?? '', above: rule?.threshold?.above ?? '' })
/** The rule as the commands take it, or null for no rule. */
export const ruleInput = (draft: RuleDraft) => draft.on ? { approverEmail: draft.approverEmail.trim(), ...(draft.limited ? { threshold: { field: draft.field.trim(), above: draft.above.trim() } } : {}) } : null
export const ruleText = (rule: ApprovalRule) => `${rule.name ?? rule.email ?? 'The named approver'} approves ${rule.threshold ? `envelopes whose ${rule.threshold.field} is above ${rule.threshold.above} USD or not a locked sender value` : 'every envelope'} before it is sent`

export function RuleFields({ value, onChange, legend }: { value: RuleDraft; onChange: (next: RuleDraft) => void; legend: string }) {
  const set = (patch: Partial<RuleDraft>) => onChange({ ...value, ...patch })
  return <fieldset className="iw-stack"><legend>{legend}</legend>
    <label className="iw-check"><input type="checkbox" checked={value.on} onChange={event => set({ on: event.target.checked })} />Require an internal approval before it is sent</label>
    {value.on && <>
      <label>Approver email<input type="email" required placeholder="An owner, admin or sender in this workspace" value={value.approverEmail} onChange={event => set({ approverEmail: event.target.value })} /></label>
      <label className="iw-check"><input type="checkbox" checked={value.limited} onChange={event => set({ limited: event.target.checked })} />Only when a USD amount is above a threshold</label>
      {value.limited && <div className="iw-two"><label>Number field label<input required maxLength={80} placeholder="Contract value" value={value.field} onChange={event => set({ field: event.target.value })} /></label><label>Above (USD)<input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" title="A USD amount with at most two decimal places" placeholder="10000.00" value={value.above} onChange={event => set({ above: event.target.value })} /></label></div>}
      {value.limited && <p className="iw-muted">Covers an envelope with a number field of that label whose locked sender value is above the amount, or that has no locked sender value. Envelopes without that field are not covered.</p>}
    </>}
  </fieldset>
}

export function AccountApprovalRule({ rule, refresh }: { rule: ApprovalRule | null; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState(ruleDraft(rule))
  const action = useAction()
  return <section className="iw-panel iw-stack"><h2>Internal approval</h2>
    <p className="iw-muted">{rule ? `${ruleText(rule)}. Set ${dateTime(rule.updatedAt!)}.` : 'No account rule: a person’s eligibility approval sends an envelope.'} A template can add its own rule; both apply.</p>
    <form className="iw-stack" onSubmit={event => { event.preventDefault(); void action.run(async () => { await command('account.internal_approval', { rule: ruleInput(draft) }); await refresh() }) }}>
      <RuleFields legend="Account rule" value={draft} onChange={setDraft} />
      <ErrorNotice error={action.error} /><button className="iw-fit" disabled={action.busy}>{action.busy ? 'Saving…' : 'Save'}</button>
    </form>
  </section>
}

/** Who the draft waits for, or why it was rejected; the named approver's approve and reject. */
export function InternalApprovalStatus({ envelope, refresh }: { envelope: Envelope; refresh: () => Promise<void> }) {
  const [rejecting, setRejecting] = useState(false), [reason, setReason] = useState('')
  const action = useAction(), request = envelope.internalApproval
  if (!request || envelope.status !== 'prepared') return null
  const waiting = request.steps.filter(step => !step.decision), rejected = request.steps.find(step => step.decision === 'rejected')
  const decide = (input: Record<string, unknown>) => action.run(async () => { await command('envelope.internal_decide', { id: envelope.id, ...input }); setRejecting(false); setReason(''); await refresh() })
  return <div className="iw-decision iw-stack">
    {request.state === 'pending' && <div className="iw-alert iw-alert-turn"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>{envelope.approvalAvailable ? 'Waiting for your approval.' : `Waiting for internal approval from ${waiting.map(step => step.name).join(' and ')}.`}</strong><p>{request.requestedBy.name} approved sending it {dateTime(request.requestedAt)}. Nothing is sent until every named approver approves.</p></div></div>}
    {request.state === 'rejected' && rejected && <div className="iw-alert"><span className="iw-alert-mark" aria-hidden="true">!</span><div><strong>Rejected by {rejected.name} {dateTime(rejected.decidedAt!)}.</strong><p>{rejected.reason}</p></div></div>}
    <h3>Internal approval</h3>
    <ul className="iw-signers">{request.steps.map(step => <li key={step.approver}><span className="iw-order" aria-hidden="true">·</span><div><strong>{step.name}</strong><span className="iw-signer-email">{step.email}</span><small>{step.decision === 'approved' ? `Approved ${dateTime(step.decidedAt!)}${step.bySender ? ' by sending it' : ''}` : step.decision === 'rejected' ? `Rejected ${dateTime(step.decidedAt!)}` : 'Waiting'} · {step.why.join('; ')}</small></div></li>)}</ul>
    {envelope.approvalAvailable && <>
      <ErrorNotice error={action.error} />
      {rejecting ? <form className="iw-stack iw-callout" onSubmit={event => { event.preventDefault(); void decide({ decision: 'reject', reason }) }}><label>Reason for rejecting<textarea required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><p>The draft goes back to {request.requestedBy.name} with your reason.</p><div className="iw-actions"><button disabled={action.busy || reason.trim().length < 3}>{action.busy ? 'Rejecting…' : 'Confirm rejection'}</button><button type="button" onClick={() => setRejecting(false)}>Cancel</button></div></form>
        : <div className="iw-actions"><button className="iw-primary" disabled={action.busy} onClick={() => void decide({ decision: 'approve' })}>{action.busy ? 'Approving…' : waiting.length > 1 ? 'Approve' : 'Approve and send'}</button><button disabled={action.busy} onClick={() => setRejecting(true)}>Reject…</button></div>}
    </>}
  </div>
}
