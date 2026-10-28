import { useEffect, useRef, useState } from 'react'
import { request } from './types'
import { ErrorNotice, useAction } from './feedback'
interface Preview { previewId:string;fingerprint:string;counts:{agreements:number;templates:number};items:{id:string;title:string;kind:string;owner:string}[];unmapped:{sourceId:string;reason:string}[];next:{cursor?:string|null;templateCursor?:string|null;page?:number|null} }
interface ImportJob {id:string;provider:string;region:string;fallbackAdmin:string;state:string;pages:number;applied:number;agreements:number;templates:number;states?:Record<string,number>;senders:Record<string,{agreements:number;templates:number}>;fingerprint?:string;reason?:string;nextAt:number;unmapped?:{sourceId:string;reason:string}[];estimatedFinishAt?:string}
export function ApiMoveIn() {
 const [provider,setProvider]=useState('acrobat'),[region,setRegion]=useState('na1'),[credential,setCredential]=useState(''),[fallbackAdmin,setFallback]=useState(''),[preview,setPreview]=useState<Preview>(),[approved,setApproved]=useState(false),[complete,setComplete]=useState(false)
 const [continuation,setContinuation]=useState<Record<string,unknown>>({})
 const [job,setJob]=useState<ImportJob>(),[jobs,setJobs]=useState<ImportJob[]>([]),[accountApproved,setAccountApproved]=useState(false)
 const action=useAction()
 const collecting=useRef(false),[collectingPages,setCollectingPages]=useState(false)
 useEffect(()=>()=>{collecting.current=false},[])
 async function collectPages() {
  if(!job||collecting.current)return
  const jobId=job.id,key=credential
  collecting.current=true;setCollectingPages(true);setCredential('');setAccountApproved(false);action.setError('')
  try {
   let current=job
   while(collecting.current&&current.state==='reviewing') {
    try {current=await request<ImportJob>('/api/inkwell/remote-import/jobs/review',{jobId,credential:key});setJob(current)}
    catch(error) {
     current=await request<ImportJob>('/api/inkwell/remote-import/jobs/status',{jobId});setJob(current)
     if(!(error instanceof Error)||!error.message.includes('rate limit')||current.nextAt<=Date.now())throw error
     while(collecting.current&&Date.now()<current.nextAt)await new Promise(resolve=>setTimeout(resolve,1000))
    }
   }
  }catch(error){action.setError(error instanceof Error?error.message:'Account review interrupted. Open the saved review to continue.')}
  finally{collecting.current=false;setCollectingPages(false)}
 }

 useEffect(()=>{void request<{jobs:ImportJob[]}>('/api/inkwell/remote-import/jobs/jobs',{}).then(r=>setJobs(r.jobs)).catch(()=>{})},[])
 const jobAction=async(actionName:string,extra:Record<string,unknown>={})=>{if(['pause','cancel'].includes(actionName))collecting.current=false;if(['start','review','resume','status'].includes(actionName))setAccountApproved(false);setJob(await request<ImportJob>('/api/inkwell/remote-import/jobs/'+actionName,{jobId:job?.id,...extra}))}
 const reset=()=>{setPreview(undefined);setApproved(false);setComplete(false)}
 return <section className="iw-stack" aria-label="API move-in"><h2>Move in from a signing provider</h2><p>Review a batch of up to 20 agreements and 20 templates. Source owners match active members by email. Unmatched owners use the administrator you name. Importing sends no signing invitations.</p>
 <label>Signing provider<select value={provider} disabled={action.busy||collectingPages} onChange={e=>{setProvider(e.target.value);setCredential('');setJob(undefined);setAccountApproved(false);setContinuation({});reset()}}><option value="acrobat">Adobe Acrobat Sign</option><option value="dropbox">Dropbox Sign</option></select></label>
 {provider==='acrobat'&&<label>Acrobat API region<select value={region} disabled={collectingPages} onChange={e=>{setRegion(e.target.value);setCredential('');setJob(undefined);setAccountApproved(false);setContinuation({});reset()}}>{['na1','na2','na3','na4','eu1','eu2','au1','jp1','in1','sg1'].map(v=><option key={v}>{v}</option>)}</select></label>}
 <label>{provider==='acrobat'?'Acrobat access token':'Dropbox Sign API key'}<input type="password" autoComplete="off" value={credential} onChange={e=>{setCredential(e.target.value);reset()}} /></label>
 <label>Fallback administrator email<input type="email" autoComplete="off" value={fallbackAdmin} disabled={collectingPages} onChange={e=>{setFallback(e.target.value);reset()}} /></label>
 <p>The credential is used for this preview and is not saved. The reviewed batch expires after 30 minutes. Signed PDFs and provider audit evidence become private records under their mapped owners.</p>
 <button className="iw-fit" disabled={action.busy||collectingPages||!credential||!fallbackAdmin} onClick={()=>void action.run(async()=>{setApproved(false);setComplete(false);setPreview(await request<Preview>('/api/inkwell/remote-import/preview',{provider,region,credential,fallbackAdmin,...continuation}));setCredential('')})}>Preview provider import</button>
 {preview&&<div className="iw-callout iw-stack"><h4>Provider import preview</h4><p>{preview.counts.agreements} agreements · {preview.counts.templates} templates</p><ul>{preview.items.map(item=><li key={item.id}>{item.title} · {item.kind} · Owner: {item.owner}</li>)}</ul>
 {!!preview.unmapped.length&&<div><h4>Unmapped or skipped items</h4><ul>{preview.unmapped.map((item,i)=><li key={i}>{item.sourceId}: {item.reason}</li>)}</ul></div>}
 <dl className="iw-hashes"><dt>Reviewed batch fingerprint</dt><dd>{preview.fingerprint}</dd></dl>
 {Object.values(preview.next).some(Boolean)&&<p>More source pages remain. This preview covers only the batch listed above.</p>}
 {!complete&&<><label className="iw-check"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} />I reviewed the source owners, skipped items and batch fingerprint.</label><button className="iw-primary iw-fit" disabled={!approved||action.busy} onClick={()=>void action.run(async()=>{await request('/api/inkwell/remote-import/apply',{previewId:preview.previewId,fingerprint:preview.fingerprint});setComplete(true);setApproved(false)})}>Import reviewed batch</button></>}
 {complete&&<><p role="status">Import complete. Open Envelopes for the imported records, or Templates to prepare a new send.</p>{Object.values(preview.next).some(Boolean)&&<button className="iw-fit" onClick={()=>{setContinuation({...preview.next,continuation:true});reset()}}>Review next source page</button>}</>}</div>}
 <div className="iw-callout iw-stack"><h3>Account review</h3><p>Collect all source pages before approving the account. Keep this page open during collection; the credential stays only in memory. Reopening a saved review or replacing an expired grant continues the same source account. Approved pages import in the background, one batch per minute. Cancellation keeps records already imported.</p>
 <button className="iw-fit" disabled={action.busy||collectingPages||!fallbackAdmin} onClick={()=>void action.run(()=>jobAction('start',{provider,region,fallbackAdmin}))}>Start account review</button>
 {jobs.filter(j=>!['complete','cancelled'].includes(j.state)).map(j=><button className="iw-fit" key={j.id} disabled={action.busy||collectingPages} onClick={()=>void action.run(async()=>{const saved=await request<ImportJob>('/api/inkwell/remote-import/jobs/status',{jobId:j.id});setJob(saved);setProvider(saved.provider);setRegion(saved.region);setFallback(saved.fallbackAdmin);setCredential('');setAccountApproved(false)})}>Open saved review {j.id.slice(0,8)}</button>)}
 {job&&<><p role="status">Account review: {job.state}. {job.pages} pages reviewed · {job.applied} pages imported. {job.agreements} agreements · {job.templates} templates.</p>
 {Object.entries(job.states??{}).map(([state,count])=><p key={'state:'+state}>{state}: {count} {count===1?'record':'records'}</p>)}
 {Object.entries(job.senders).map(([owner,counts])=><p key={owner}>{owner}: {counts.agreements} agreements · {counts.templates} templates</p>)}
 {job.unmapped?.map((item,i)=><p key={i}>{item.sourceId}: {item.reason}</p>)}
 {job.reason&&<p>{job.reason}</p>}{job.nextAt>Date.now()&&<p>Next provider attempt after {new Date(job.nextAt).toISOString()}.</p>}
 {job.estimatedFinishAt&&<p>Estimated finish: {job.estimatedFinishAt}. Scheduled work may take longer.</p>}
 {job.state==='reviewing'&&<button className="iw-fit" disabled={action.busy||collectingPages||!credential} onClick={()=>void collectPages()}>{collectingPages?'Collecting account pages…':'Review account pages'}</button>}
 {job.state==='ready'&&<><dl className="iw-hashes"><dt>Account fingerprint</dt><dd>{job.fingerprint}</dd></dl><label className="iw-check"><input type="checkbox" checked={accountApproved} onChange={e=>setAccountApproved(e.target.checked)}/>I reviewed all account counts, owners and skipped items.</label><button className="iw-primary iw-fit" disabled={action.busy||!accountApproved} onClick={()=>void action.run(async()=>{await jobAction('approve',{fingerprint:job.fingerprint,approved:true});setAccountApproved(false)})}>Approve account import</button></>}
 {['reviewing','ready','importing'].includes(job.state)&&<button className="iw-fit" disabled={action.busy} onClick={()=>void action.run(()=>jobAction('pause'))}>Pause account job</button>}
 {job.state==='paused'&&<button className="iw-fit" disabled={action.busy} onClick={()=>void action.run(()=>jobAction('resume'))}>Resume account job</button>}
 {!['complete','cancelled'].includes(job.state)&&<button className="iw-fit" disabled={action.busy} onClick={()=>void action.run(()=>jobAction('cancel'))}>Cancel account job</button>}
 <button className="iw-fit" disabled={action.busy} onClick={()=>void action.run(()=>jobAction('status'))}>Refresh account progress</button></>}
 </div>
 <ErrorNotice error={action.error}/></section>
}
