import { useEffect, useState } from 'react'
import { request, dateTime } from './types'
import { ErrorNotice, useAction } from './feedback'

type Provider = 'box' | 'dropbox' | 'google'
type Rule = { template_id:string; provider:Provider; folder:string; enabled:number; version:number; at:string }
type Job = { envelope_id:string; title:string; provider:Provider; folder:string; kind:string; state:string; remote_id:string|null; filed_at:string|null }
type View = { providers:Record<Provider,boolean>; rules:Rule[]; jobs:Job[]; consent:string }
const providerName = (provider:Provider) => provider === 'google' ? 'Google Drive' : provider === 'box' ? 'Box' : 'Dropbox'

export function FilingSettings({ templates }: { templates:{id:string;title:string}[] }) {
 const [view,setView] = useState<View>(), [templateId,setTemplateId] = useState(''), [provider,setProvider] = useState<Provider>('box')
 const [folder,setFolder] = useState(''), [enabled,setEnabled] = useState(false), [consent,setConsent] = useState(false), [saved,setSaved] = useState(false)
 const action = useAction()
 const load = async () => { setView(await request<View>('/api/inkwell/filing')) }
 useEffect(()=>{ void action.run(load) },[])
 const rule = view?.rules.find(row=>row.template_id===templateId && row.provider===provider)
 useEffect(()=>{ setFolder(rule?.folder??'');setEnabled(Boolean(rule?.enabled));setConsent(false) },[templateId,provider,rule?.version])
 return <section className="iw-panel iw-stack" aria-label="Automatic filing">
  <h2>Automatic filing</h2>
  <p>File completed PDFs and certificates to a provider folder for each template. Provider folders must already exist. Existing remote files are verified before a retry is accepted.</p>
  <ErrorNotice error={action.error}/>
  {view && <form className="iw-stack" onSubmit={event=>{event.preventDefault();void action.run(async()=>{
   await request('/api/inkwell/filing',{commandId:crypto.randomUUID(),templateId,provider,folder,enabled,consent,expectedVersion:rule?.version??0})
   await load();setSaved(true)
  })}}>
   <label>Filing template<select aria-label="Filing template" required value={templateId} onChange={event=>{setTemplateId(event.target.value);setSaved(false)}}><option value="">Choose a template</option>{templates.map(template=><option key={template.id} value={template.id}>{template.title}</option>)}</select></label>
   <label>Filing provider<select aria-label="Filing provider" value={provider} onChange={event=>{setProvider(event.target.value as Provider);setSaved(false)}}><option value="box">Box</option><option value="dropbox">Dropbox</option><option value="google">Google Drive</option></select></label>
   <p role="status">{providerName(provider)} credential {view.providers[provider]?'configured':'not configured; ask your installation administrator to connect this provider'}.</p>
   <label>{provider==='google'?'Google Drive folder ID':provider==='box'?'Box folder ID':'Dropbox folder path'}<input required={provider!=='dropbox'} value={folder} onChange={event=>setFolder(event.target.value)} maxLength={1000} placeholder={provider==='google'?'Drive folder ID':provider==='box'?'123456789':'/Completed agreements'}/></label>
   <label className="iw-check"><input type="checkbox" checked={enabled} onChange={event=>{setEnabled(event.target.checked);setConsent(false)}}/>Enable automatic filing for this template and provider</label>
   {enabled && <label className="iw-check"><input type="checkbox" required checked={consent} onChange={event=>setConsent(event.target.checked)}/>{view.consent}</label>}
   <button className="iw-fit" type="submit" disabled={action.busy || !templateId || enabled && (!consent || !view.providers[provider])}>Save filing rule</button>
  </form>}
  {saved && <p role="status">Filing rule saved.</p>}
  {view && <><h3>Saved filing rules</h3>{view.rules.length?<ul className="iw-contact-results">{view.rules.map(row=><li key={row.template_id+row.provider}><span><strong>{templates.find(t=>t.id===row.template_id)?.title??'Removed template'}</strong><small style={{fontSize:13}}>{providerName(row.provider)} · {row.folder||'Root folder'} · {row.enabled?'Enabled':'Disabled'}</small></span></li>)}</ul>:<p>No filing rules yet.</p>}
   <h3>Recent filing</h3>{view.jobs.length?<ul className="iw-contact-results" aria-label="Filing receipts">{view.jobs.map(job=><li key={JSON.stringify([job.envelope_id,job.provider,job.folder,job.kind])} style={{flexWrap:'wrap'}}><span style={{minWidth:0,overflowWrap:'anywhere'}}><strong>{job.title}</strong><small style={{fontSize:13}}>{providerName(job.provider)} · {job.kind==='signed'?'Completed PDF':'Certificate'} · {job.folder||'Root folder'}</small><small style={{fontSize:13}}>{job.state==='filed'?`Filed · ${dateTime(job.filed_at!)} · reference ${job.remote_id}`:job.state==='uncertain'?'Unconfirmed; retry verifies the existing remote file before accepting it.':job.state==='sending'?'Filing in progress. A retry becomes available if this attempt is interrupted.':job.state==='cancelled'?'Cancelled because the filing rule was disabled.':'Waiting to file'}</small></span>{['uncertain','sending','pending'].includes(job.state)&&<button type="button" disabled={action.busy} onClick={()=>void action.run(async()=>{await request('/api/inkwell/filing/retry',{id:job.envelope_id});await load()})}>Retry filing</button>}</li>)}</ul>:<p>No completed envelopes have been filed yet.</p>}
   <button type="button" className="iw-fit" disabled={action.busy} onClick={()=>void action.run(load)}>Refresh filing status</button>
  </>}
 </section>
}
