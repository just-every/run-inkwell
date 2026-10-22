import { useEffect, useRef, useState } from 'react'
import { command, dateTime, type SendPolicy, type SendPolicyVersion } from './types'
import { ErrorNotice, useAction } from './feedback'

const names: Record<SendPolicy['source'], string> = { ad_hoc: 'Ad hoc sends', template: 'Template sends', bulk: 'Bulk sends', web_form: 'Web form sends', api: 'API sends' }
type TemplateChoice = { id: string; title: string }

const modes: Record<SendPolicy['mode'], string> = { off: 'Off', person: 'A person confirms each send', autonomous: 'Sends with no per-envelope approval' }

/** ADMIN-004 / SEND-001: the owner/admin's account-wide send policy for each source, saved as a new immutable version. */
export function SendPolicies({ policies, history, templates, refresh }: { policies: SendPolicy[]; history: SendPolicyVersion[]; templates: TemplateChoice[]; refresh: () => Promise<void> }) {
  return <section className="iw-panel iw-stack" aria-label="Send policies">
    <h2>Send policies</h2>
    <p>Choose, for each source, whether it may send. Every save is a new version; each sent envelope records the source, the policy versions that allowed it and a fingerprint of them.</p>
    <p className="iw-muted">If a policy turns off or changes before a deferred send is released, the send goes back to a held draft and an editor must confirm it again, even if the policy is turned back on. Envelopes already sent are never recalled. Only the account policy exists today; group and profile policies narrow it when they ship.</p>
    {policies.map(policy => <PolicyRow key={`${policy.source}-${policy.version}`} policy={policy} templates={templates} refresh={refresh} />)}
    {history.length > 0 && <details><summary>Policy history ({history.length})</summary>
      <ol>{history.map(v => <li key={`${v.source}-${v.version}`}>{names[v.source]} · version {v.version} · {modes[v.before.mode]} → {modes[v.mode]} · {v.actor} · <time dateTime={v.at ?? ''}>{dateTime(v.at ?? '')}</time>{v.reason && ` · ${v.reason}`}</li>)}</ol>
    </details>}
  </section>
}
function PolicyRow({ policy, templates, refresh }: { policy: SendPolicy; templates: TemplateChoice[]; refresh: () => Promise<void> }) {
  const [mode, setMode] = useState(policy.mode), [approval, setApproval] = useState(policy.requireInternalApproval), [deferred, setDeferred] = useState(policy.deferredRelease)
  const [allTemplates, setAllTemplates] = useState(policy.templates === null), [selected, setSelected] = useState<string[]>(policy.templates ?? []), [reason, setReason] = useState('')
  const listed = [...templates, ...(policy.templates ?? []).filter(id => !templates.some(template => template.id === id)).map(id => ({ id, title: `Unavailable template (${id})` }))]
  const templateList = allTemplates ? null : selected
  const templatesChanged = policy.source !== 'ad_hoc' && (templateList === null ? policy.templates !== null : policy.templates === null || templateList.length !== policy.templates.length || templateList.some(id => !policy.templates!.includes(id)))
  const templatesControl=useRef<HTMLInputElement>(null), [recoverTemplates,setRecoverTemplates]=useState(false)
  const action = useAction(), name = names[policy.source], changed = mode !== policy.mode || approval !== policy.requireInternalApproval || deferred !== policy.deferredRelease || templatesChanged || Boolean(reason.trim())
  useEffect(()=>{if(recoverTemplates&&!action.busy){templatesControl.current?.focus();setRecoverTemplates(false)}},[recoverTemplates,action.busy])
  return <form className="iw-stack" aria-label={name} onSubmit={event => { event.preventDefault(); void action.run(async () => {
    if (policy.source === 'web_form' && mode !== 'off' && (templateList === null || templateList.length === 0)) {
      setRecoverTemplates(true)
      throw new Error('Choose at least one selected template before enabling web form sends.')
    }
    await command('account.send_policy', { source: policy.source, mode, requireInternalApproval: approval, deferredRelease: deferred, ...(templatesChanged ? { templates: templateList } : {}), reason: reason.trim() || null, expectedVersion: policy.version }); await refresh()
  }) }}>
    <h3>{name}</h3>
    <label>Mode <select value={mode} disabled={action.busy} onChange={event => { setMode(event.target.value as SendPolicy['mode'])}}>
      {(Object.keys(modes) as SendPolicy['mode'][]).filter(m => policy.source !== 'ad_hoc' || m !== 'autonomous').map(m => <option key={m} value={m}>{modes[m]}</option>)}
    </select></label>
    {policy.source !== 'ad_hoc' && <fieldset className="iw-stack" disabled={action.busy}>
      <legend>Allowed templates</legend>
      <label className="iw-check"><input ref={templatesControl} type="checkbox" checked={allTemplates} onChange={event => setAllTemplates(event.target.checked)} />Use all templates</label>
      {policy.source === 'web_form' && <p className="iw-muted">Enabled web form sends need a selected list with at least one template.</p>}
      {!allTemplates && <>
        <p>Select the templates this source may send. An empty list allows none.</p>
        {listed.length === 0 && <p>No templates are available. Create a template before choosing one here.</p>}
        {listed.map(template => <label className="iw-check" key={template.id}><input type="checkbox" checked={selected.includes(template.id)} onChange={event => setSelected(current => event.target.checked ? [...current, template.id] : current.filter(id => id !== template.id))} /><span style={{ overflowWrap: 'anywhere' }}>{template.title}</span></label>)}
      </>}
    </fieldset>}
    <label className="iw-check"><input type="checkbox" checked={approval} disabled={action.busy} onChange={event => { setApproval(event.target.checked)}} />Require an internal approval first</label>
    <label className="iw-check"><input type="checkbox" checked={deferred} disabled={action.busy} onChange={event => { setDeferred(event.target.checked)}} />Allow scheduled release</label>
    <label>Reason (optional)<input value={reason} maxLength={500} disabled={action.busy} onChange={event => setReason(event.target.value)} /></label>
    <ErrorNotice error={action.error} />
    <button className="iw-fit" disabled={action.busy || !changed}>{action.busy ? 'Saving…' : `Save ${name} policy`}</button>
    <p role="status">{modes[policy.mode]} · version {policy.version}{policy.source !== 'ad_hoc' ? policy.templates === null ? ' · all templates' : ` · ${policy.templates.length} selected template(s)` : ''}</p>
  </form>
}
