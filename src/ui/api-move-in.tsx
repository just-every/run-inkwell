import { RemoteImportJob } from './remote-import-job'
import { useState } from 'react'
import { request } from './types'
import { ErrorNotice, useAction } from './feedback'
interface Preview { previewId:string;fingerprint:string;counts:{agreements:number;templates:number};items:{id:string;title:string;kind:string;owner:string}[];unmapped:{sourceId:string;reason:string}[];next:{cursor?:string|null;templateCursor?:string|null;page?:number|null} }
export function ApiMoveIn() {
 const [provider,setProvider]=useState('acrobat'),[region,setRegion]=useState('na1'),[credential,setCredential]=useState(''),[fallbackAdmin,setFallback]=useState(''),[preview,setPreview]=useState<Preview>(),[approved,setApproved]=useState(false),[complete,setComplete]=useState(false)
 const [continuation,setContinuation]=useState<Record<string,unknown>>({})
 const action=useAction()
 const reset=()=>{setPreview(undefined);setApproved(false);setComplete(false)}
 return <section className="iw-stack" aria-label="API move-in"><h2>Move in from a signing provider</h2><p>Review a batch of up to 20 agreements and 20 templates. Source owners match active members by email. Unmatched owners use the administrator you name. Importing sends no signing invitations.</p>
 <label>Signing provider<select value={provider} disabled={action.busy} onChange={e=>{setProvider(e.target.value);setCredential('');setContinuation({});reset()}}><option value="acrobat">Adobe Acrobat Sign</option><option value="dropbox">Dropbox Sign</option></select></label>
 {provider==='acrobat'&&<label>Acrobat API region<select value={region} onChange={e=>{setRegion(e.target.value);setContinuation({});reset()}}>{['na1','na2','na3','na4','eu1','eu2','au1','jp1','in1','sg1'].map(v=><option key={v}>{v}</option>)}</select></label>}
 <label>{provider==='acrobat'?'Acrobat access token':'Dropbox Sign API key'}<input type="password" autoComplete="off" value={credential} onChange={e=>{setCredential(e.target.value);reset()}} /></label>
 <label>Fallback administrator email<input type="email" autoComplete="off" value={fallbackAdmin} onChange={e=>{setFallback(e.target.value);reset()}} /></label>
 <p>A single-batch preview uses the credential only for that request. Account jobs keep it sealed until completion or cancellation. A reviewed single batch expires after 30 minutes. Signed PDFs and provider audit evidence become private records under their mapped owners.</p>
 <button className="iw-fit" disabled={action.busy||!credential||!fallbackAdmin} onClick={()=>void action.run(async()=>{setApproved(false);setComplete(false);setPreview(await request<Preview>('/api/inkwell/remote-import/preview',{provider,region,credential,fallbackAdmin,...continuation}));setCredential('')})}>Preview provider import</button>
 {preview&&<div className="iw-callout iw-stack"><h4>Provider import preview</h4><p>{preview.counts.agreements} agreements · {preview.counts.templates} templates</p><ul>{preview.items.map(item=><li key={item.id}>{item.title} · {item.kind} · Owner: {item.owner}</li>)}</ul>
 {!!preview.unmapped.length&&<div><h4>Unmapped or skipped items</h4><ul>{preview.unmapped.map((item,i)=><li key={i}>{item.sourceId}: {item.reason}</li>)}</ul></div>}
 <dl className="iw-hashes"><dt>Reviewed batch fingerprint</dt><dd>{preview.fingerprint}</dd></dl>
 {Object.values(preview.next).some(Boolean)&&<p>More source pages remain. This preview covers only the batch listed above.</p>}
 {!complete&&<><label className="iw-check"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} />I reviewed the source owners, skipped items and batch fingerprint.</label><button className="iw-primary iw-fit" disabled={!approved||action.busy} onClick={()=>void action.run(async()=>{await request('/api/inkwell/remote-import/apply',{previewId:preview.previewId,fingerprint:preview.fingerprint});setComplete(true);setApproved(false)})}>Import reviewed batch</button></>}
 {complete&&<><p role="status">Import complete. Open Envelopes for the imported records, or Templates to prepare a new send.</p>{Object.values(preview.next).some(Boolean)&&<button className="iw-fit" onClick={()=>{setContinuation({...preview.next,continuation:true});reset()}}>Review next source page</button>}</>}</div>}
 <RemoteImportJob connection={{provider,region,credential,fallbackAdmin}} onStarted={()=>setCredential('')}/><ErrorNotice error={action.error}/></section>
}
