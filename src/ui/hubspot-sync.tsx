import { useEffect, useState } from 'react'
import { request, dateTime } from './types'
import { ErrorNotice, useAction } from './feedback'
import { HubspotLaunch } from './hubspot-launch'
import { HubspotWritebacks } from './hubspot-writebacks'

type Definition = { accountId:string; scope:{kind:'all'|'selected';recordIds?:string[]}; properties:string[]; mappings:{name:string;email:string;phone?:string;company?:string};destination:'shared_contacts';updateBehavior:'preserve_local_edits';cadence:'once'|'hourly'|'daily' }
type Authorization = {id:string;version:number;authorizer:string;authorizedAt:string;state:string;definition:Definition;nextRunAt?:number|null}
type Configuration = {configured:boolean;accountId:string|null;disclosure:string;authorization:Authorization|null}
type Run = {id:string;authorizationId:string;version:number;status:string;pages:number;records:number;applied:number;conflicts:number;failures:number;remaining:string;error?:string}
type Conflict = {id:string;recordId:string;status:string}
type Progress = {runs:Run[];conflicts:Conflict[]}
export function HubspotSettings({templates,onPrepared}:{templates:{id:string;title:string}[];onPrepared:(id:string)=>Promise<void>}) {
 const [config,setConfig]=useState<Configuration>(),[progress,setProgress]=useState<Progress>(),[scope,setScope]=useState<'all'|'selected'>('all'),[records,setRecords]=useState(''),[cadence,setCadence]=useState<Definition['cadence']>('once'),[consent,setConsent]=useState(false),[message,setMessage]=useState('')
 const [includePhone,setIncludePhone]=useState(true),[includeCompany,setIncludeCompany]=useState(true)
 const action=useAction()
 async function load(){const [c,p]=await Promise.all([request<Configuration>('/api/inkwell/hubspot/config'),request<Progress>('/api/inkwell/hubspot/progress')]);setConfig(c);setProgress(p)}
 useEffect(()=>{void action.run(load)},[])
 async function operate(body:unknown){await request('/api/inkwell/hubspot/sync',body);await load()}
 const authorization=config?.authorization
 const existing=progress?.runs.filter(run=>run.authorizationId===authorization?.id)??[]
 const canStart=authorization?.state==='active'&&!existing.some(run=>['ready','reading','failed'].includes(run.status))&&!(authorization.definition.cadence==='once'&&existing.length>0)
 return <section className="iw-panel iw-stack" aria-label="HubSpot connector">
  <h2>HubSpot</h2><p>Prepare agreements from a selected CRM record and import contacts into your shared contact book.</p>
  <ErrorNotice error={action.error}/>{message&&<p role="status">{message}</p>}
  {config&&<>
   <p role="status">{config.configured?`Connected account ${config.accountId}`:'Not connected. Ask your installation administrator to configure the HubSpot account ID and private app credential.'}</p>
   <h3>Contact authorization</h3>
   <form className="iw-stack" onSubmit={event=>{event.preventDefault();void action.run(async()=>{
    const definition:Definition={accountId:config.accountId!,scope:scope==='all'?{kind:'all'}:{kind:'selected',recordIds:records.split(',').map(v=>v.trim()).filter(Boolean)},properties:['firstname','lastname','email',...(includePhone?['phone']:[]),...(includeCompany?['company']:[])],mappings:{name:'full_name',email:'email',...(includePhone?{phone:'phone'}:{}),...(includeCompany?{company:'company'}:{})},destination:'shared_contacts',updateBehavior:'preserve_local_edits',cadence}
    await operate({operation:'authorize',consent,definition});setConsent(false);setMessage('Contact authorization saved.')
   })}}>
    <label>Contact record scope<select value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setConsent(false)}}><option value="all">All contacts</option><option value="selected">Selected contact IDs</option></select></label>
    {scope==='selected'&&<label>Contact IDs, separated by commas<input required value={records} onChange={e=>{setRecords(e.target.value);setConsent(false)}} maxLength={2000}/></label>}
    <p>First and last names become the contact name. Email identifies the contact. Existing local edits are kept and reported as conflicts. Missing provider records never delete local contacts.</p>
    <label className="iw-check"><input type="checkbox" checked={includePhone} onChange={e=>{setIncludePhone(e.target.checked);setConsent(false)}}/>Import phone</label>
    <label className="iw-check"><input type="checkbox" checked={includeCompany} onChange={e=>{setIncludeCompany(e.target.checked);setConsent(false)}}/>Import company</label>
    <label>Sync cadence<select value={cadence} onChange={e=>{setCadence(e.target.value as Definition['cadence']);setConsent(false)}}><option value="once">One complete import</option><option value="hourly">Recurring hourly</option><option value="daily">Recurring daily</option></select></label>
    <p>{config.disclosure}</p>
    <label className="iw-check"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/>I authorize this account, record scope, fields, mappings and cadence. This does not authorize sending or follow-up.</label>
    <button className="iw-fit" disabled={action.busy||!config.configured||!consent}>Authorize contact sync</button>
   </form>
   {authorization&&<div role="region" className="iw-stack" aria-label="Current HubSpot authorization">
    <h3>Current authorization</h3><p>Version {authorization.version} · {authorization.state} · authorized by {authorization.authorizer} at {dateTime(authorization.authorizedAt)}</p>
    <p>{authorization.definition.scope.kind==='all'?'All contacts':`Selected records: ${authorization.definition.scope.recordIds?.join(', ')}`} · {authorization.definition.cadence} · properties: {authorization.definition.properties.join(', ')} · shared contact book</p>
    {authorization.nextRunAt&&<p>Next run: {dateTime(new Date(authorization.nextRunAt).toISOString())}</p>}
    <div className="iw-actions"><button disabled={action.busy||!canStart} onClick={()=>void action.run(async()=>{await operate({operation:'start',authorizationId:authorization.id,requestId:crypto.randomUUID()});setMessage('Contact import started.')})}>Start contact import</button><button disabled={action.busy||authorization.state!=='active'} onClick={()=>void action.run(async()=>{await operate({operation:'revoke',authorizationId:authorization.id});setMessage('Authorization revoked. Restoring a role will not reactivate it.')})}>Revoke contact authorization</button></div>
   </div>}
   <h3>Import progress</h3>
   {progress?.runs.length?<ul className="iw-contact-results" aria-label="HubSpot sync runs">{progress.runs.map(run=><li key={run.id} style={{flexWrap:'wrap'}}><div style={{minWidth:0,overflowWrap:'anywhere'}}><strong>Authorization version {run.version} · {run.status}</strong><p>{run.pages} pages · {run.records} records · {run.applied} applied · {run.conflicts} conflicts · {run.failures} failures</p><p>Remaining: {run.remaining}</p>{run.error&&<p>{run.error}</p>}</div>{run.remaining==='more_pages'&&<button disabled={action.busy} onClick={()=>void action.run(()=>operate({operation:'continue',runId:run.id}))}>Continue import</button>}</li>)}</ul>:<p>No contact import runs yet.</p>}
   {progress?.conflicts.filter(c=>c.status==='open').map(conflict=><div key={conflict.id} className="iw-stack"><p>Local edit conflict for contact {conflict.recordId}. Keep your local contact or explicitly accept the current provider values.</p><div className="iw-actions"><button disabled={action.busy} onClick={()=>void action.run(()=>operate({operation:'resolve',conflictId:conflict.id,choice:'keep_local'}))}>Keep local contact</button><button disabled={action.busy} onClick={()=>void action.run(()=>operate({operation:'resolve',conflictId:conflict.id,choice:'use_provider'}))}>Use provider contact</button></div></div>)}
   <button className="iw-fit" disabled={action.busy} onClick={()=>void action.run(load)}>Refresh HubSpot progress</button>
   <HubspotWritebacks/>
   <HubspotLaunch configured={config.configured} templates={templates} onPrepared={onPrepared}/>
  </>}
 </section>
}
