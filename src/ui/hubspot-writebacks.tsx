import { useEffect, useState } from 'react'
import { request, dateTime } from './types'
import { ErrorNotice, useAction } from './feedback'
type Job={id:string;title:string;recordId:string;status:string;propertiesUpdated:boolean;fileId:string|null;noteId:string|null;uncertain:string|null;attempts:number;error:string|null;completedAt:string|null;repair:{mapping:Record<string,string>;changes:{from:string;to:string;label:string}[]}|null}
export function HubspotWritebacks(){
 const [jobs,setJobs]=useState<Job[]>([]),action=useAction()
 const load=async()=>setJobs((await request<{jobs:Job[]}>('/api/inkwell/hubspot/writebacks')).jobs)
 useEffect(()=>{void action.run(load)},[])
 return <section className="iw-stack" aria-label="HubSpot completion progress"><h3>Completion write-back</h3><ErrorNotice error={action.error}/>
  {jobs.length?<ul className="iw-contact-results" aria-label="HubSpot completion jobs">{jobs.map(job=><li key={job.id} style={{flexWrap:'wrap'}}><div style={{minWidth:0,overflowWrap:'anywhere'}}><strong>{job.title}</strong><p>Record {job.recordId} · {job.status} · {job.attempts} attempts</p><p>{job.propertiesUpdated?'Properties updated':'Properties pending'} · {job.fileId?'Executed PDF uploaded':'Executed PDF pending'} · {job.noteId?'Timeline note attached':'Timeline note pending'}</p>{job.uncertain&&<p>Unconfirmed {job.uncertain} result. A retry checks the provider before any further write.</p>}{job.error&&<p>{job.error}</p>}{job.repair&&<div><p>Proposed CRM mapping repair. Owner approval is required.</p><ul>{job.repair.changes.map(change=><li key={change.from}>{change.label}: {change.from} → {change.to}</li>)}</ul><button disabled={action.busy} onClick={()=>void action.run(async()=>{await request(`/api/inkwell/hubspot/envelopes/${encodeURIComponent(job.id)}/writeback`,{approveRepair:true,proposal:job.repair});await load()})}>Approve mapping repair and replay</button></div>}{job.completedAt&&<p>Completed {dateTime(job.completedAt)}</p>}</div>{job.status==='held'&&<button disabled={action.busy} onClick={()=>void action.run(async()=>{await request(`/api/inkwell/hubspot/envelopes/${encodeURIComponent(job.id)}/writeback`,{});await load()})}>Reconcile completion</button>}</li>)}</ul>:<p>No CRM agreements prepared yet.</p>}
  <button className="iw-fit" disabled={action.busy} onClick={()=>void action.run(load)}>Refresh completion progress</button>
 </section>
}
