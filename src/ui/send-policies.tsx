import { useState } from 'react'
import { command, dateTime, type SendPolicy, type SendPolicyVersion } from './types'
import { ErrorNotice, useAction } from './feedback'

const names: Record<SendPolicy['source'], string> = { ad_hoc: 'Ad hoc sends', template: 'Template sends', bulk: 'Bulk sends', web_form: 'Web form sends', api: 'API sends' }
const modes: Record<SendPolicy['mode'], string> = { off: 'Off', person: 'A person confirms each send', autonomous: 'Sends with no per-envelope approval' }

/** ADMIN-004 / SEND-001: the owner/admin's account-wide send policy for each source, saved as a new immutable version. */
export function SendPolicies({ policies, history, refresh }: { policies: SendPolicy[]; history: SendPolicyVersion[]; refresh: () => Promise<void> }) {
  return <section className="iw-panel iw-stack" aria-label="Send policies">
    <h2>Send policies</h2>
    <p>Choose, for each source, whether it may send. Every save is a new version; each sent envelope records the source, the policy versions that allowed it and a fingerprint of them.</p>
    <p className="iw-muted">If a policy turns off or changes before a deferred send is released, the send goes back to a held draft and an editor must confirm it again, even if the policy is turned back on. Envelopes already sent are never recalled. Only the account policy exists today; group and profile policies narrow it when they ship. Template lists are set through the command, not this screen.</p>
    {policies.map(policy => <PolicyRow key={`${policy.source}-${policy.version}`} policy={policy} refresh={refresh} />)}
    {history.length > 0 && <details><summary>Policy history ({history.length})</summary>
      <ol>{history.map(v => <li key={`${v.source}-${v.version}`}>{names[v.source]} · version {v.version} · {modes[v.before.mode]} → {modes[v.mode]} · {v.actor} · <time dateTime={v.at ?? ''}>{dateTime(v.at ?? '')}</time></li>)}</ol>
    </details>}
  </section>
}
function PolicyRow({ policy, refresh }: { policy: SendPolicy; refresh: () => Promise<void> }) {
  const [mode, setMode] = useState(policy.mode), [approval, setApproval] = useState(policy.requireInternalApproval), [deferred, setDeferred] = useState(policy.deferredRelease)
  const action = useAction(), name = names[policy.source], changed = mode !== policy.mode || approval !== policy.requireInternalApproval || deferred !== policy.deferredRelease
  return <form className="iw-stack" aria-label={name} onSubmit={event => { event.preventDefault(); void action.run(async () => {
    await command('account.send_policy', { source: policy.source, mode, requireInternalApproval: approval, deferredRelease: deferred, expectedVersion: policy.version }); await refresh()
  }) }}>
    <h3>{name}</h3>
    <label>Mode <select value={mode} disabled={action.busy} onChange={event => { setMode(event.target.value as SendPolicy['mode'])}}>
      {(Object.keys(modes) as SendPolicy['mode'][]).filter(m => policy.source !== 'ad_hoc' || m !== 'autonomous').map(m => <option key={m} value={m}>{modes[m]}</option>)}
    </select></label>
    <label className="iw-check"><input type="checkbox" checked={approval} disabled={action.busy} onChange={event => { setApproval(event.target.checked)}} />Require an internal approval first</label>
    <label className="iw-check"><input type="checkbox" checked={deferred} disabled={action.busy} onChange={event => { setDeferred(event.target.checked)}} />Allow scheduled release</label>
    <ErrorNotice error={action.error} />
    <button className="iw-fit" disabled={action.busy || !changed}>{action.busy ? 'Saving…' : `Save ${name} policy`}</button>
    <p role="status">{modes[policy.mode]} · version {policy.version}{policy.templates ? ` · ${policy.templates.length} template(s)` : ''}</p>
  </form>
}
