import { useEffect, useRef, useState } from 'react'
import { ErrorNotice, useAction } from './feedback'
import { request, type Envelope } from './types'
const base='/api/inkwell/archive/transfers'
type Status={id:string;phase:string;completed:number;total:number|null;bytes?:number}
/** Read one bounded record at a time; no whole-file text()/arrayBuffer() on the large-archive path. */
async function* records(file:File):AsyncGenerator<any>{
 const reader=file.stream().getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let parts:Uint8Array[]=[],size=0
 const line=(last:Uint8Array)=>{parts.push(last);size+=last.length;if(size>24*1024*1024)throw new Error('An archive record exceeds 24 MiB.');const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length}parts=[];size=0;return JSON.parse(decoder.decode(bytes))}
 try{for(;;){const next=await reader.read();if(next.done)break;let start=0;for(let i=0;i<next.value.length;i++)if(next.value[i]===10){if(size+i-start>0)yield line(next.value.subarray(start,i));start=i+1}const tail=next.value.subarray(start);if(tail.length){parts.push(tail);size+=tail.length;if(size>24*1024*1024)throw new Error('An archive record exceeds 24 MiB.')}}if(size)yield line(new Uint8Array())}finally{await reader.cancel();reader.releaseLock()}
}
export function ArchiveTransfers({actorId,empty,refresh}:{actorId:string;empty:boolean;refresh:()=>Promise<void>}) {
 const [fileFocus,setFileFocus]=useState('')
 const action=useAction(),stop=useRef(false),[job,setJob]=useState<Status>(),[file,setFile]=useState<File>(),[later,setLater]=useState<File>(),[confirmed,setConfirmed]=useState(false),[imported,setImported]=useState(false),[restore,setRestore]=useState<Status>(),key=`inkwell-archive-export:${actorId}`,restoreKey=`inkwell-archive-import:${actorId}`
 useEffect(()=>{const saved=localStorage.getItem(key);if(saved)void action.run(async()=>setJob(await request<Status>(`${base}/exports/${saved}`)));return()=>{stop.current=true}},[key])
 const save=(status:Status)=>{setJob(status);localStorage.setItem(key,status.id)}
 const build=async()=>{stop.current=false;let current=job;if(!current){const created=await request<{id:string}>(`${base}/exports`,{});current=await request<Status>(`${base}/exports/${created.id}`);save(current)}while(current.phase==='building'&&!stop.current){current=await request<Status>(`${base}/exports/${current.id}/advance`,{expectedPart:current.completed,maxParts:1});save(current)}}
 const restoreFile=async()=>{
  if(!file||!confirmed)throw new Error('Choose the intended archive and confirm restoration.')
  stop.current=false;setImported(false);const iterator=records(file),first=await iterator.next(),manifest=first.value
  if(manifest?.kind!=='manifest'||manifest.format!=='runeditrun-portability')throw new Error('Choose an Inkwell NDJSON archive, or use the legacy JSON restore below.')
  const signature=`${file.name}:${file.size}:${file.lastModified}:${manifest.sourceIdentity}:${manifest.exportedAt}:${manifest.schema}`
  let saved:{id:string;signature:string}|undefined;try{saved=JSON.parse(localStorage.getItem(restoreKey)??'null')??undefined}catch{}
  let current:Status
  if(saved){if(saved.signature!==signature)throw new Error('A different restore is paused. Discard it before choosing another archive.');current=await request<Status>(`${base}/imports/${saved.id}`)}
  else{const created=await request<{id:string}>(`${base}/imports`,{manifest,confirmed:true});current=await request<Status>(`${base}/imports/${created.id}`);localStorage.setItem(restoreKey,JSON.stringify({id:created.id,signature}))}
  setRestore(current);let closing:any
  try{for await(const record of { [Symbol.asyncIterator]:()=>iterator }){
   if(stop.current)return
   if(record.kind==='closing'){closing=record;continue}
   if(record.kind!=='part')throw new Error('Unexpected archive record.')
   if(record.index<current.completed)continue
   const response=await fetch(`${base}/imports/${current.id}/parts/${record.index}`,{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(record)})
   const value=await response.json() as Status&{error?:string};if(!response.ok)throw new Error(value.error??'Archive part upload failed. Resume with this same file.');current=value;setRestore(value)
  }}finally{await iterator.return(undefined)}
  if(stop.current)return
  if(!closing)throw new Error('The archive has no closing checksum record.')
  let laterJournal:unknown
  if(later){const source=records(later);try{const record=(await source.next()).value;if(record?.kind!=='manifest')throw new Error('Choose the later NDJSON archive.');laterJournal={sourceIdentity:record.sourceIdentity,epoch:record.epoch,journal:record.journal}}finally{await source.return(undefined)}}
  current=await request<Status>(`${base}/imports/${current.id}/finalize`,{contentHash:closing.contentHash,archiveHash:closing.archiveHash,...(laterJournal?{laterJournal}:{})});setRestore(current);localStorage.removeItem(restoreKey);setImported(true);await refresh()
 }
 return <><section className="iw-panel iw-stack" aria-label="Whole installation archive"><h2>Whole installation archive</h2><p>Build a resumable archive of all document custody, templates, audit history and erasure journals. The browser streams the download directly to disk.</p>
 {job&&<p role="status">Archive {job.phase==='complete'?'ready':job.phase} · {job.completed} chunks{job.bytes?` · ${(job.bytes/1024/1024).toFixed(1)} MiB`:''}</p>}
 {job?.phase==='complete'?<a className="iw-button iw-primary iw-fit" href={`${base}/exports/${job.id}/download`} download>Download installation archive</a>:<button className="iw-primary iw-fit" disabled={action.busy} onClick={()=>void action.run(build)}>{job?'Resume building archive':'Build installation archive'}</button>}
 {action.busy&&<button className="iw-fit" onClick={()=>{stop.current=true}}>Pause transfer</button>}
 {job&&<button className="iw-fit" disabled={action.busy} onClick={()=>void action.run(async()=>{await request(`${base}/exports/${job.id}/abort`,{});localStorage.removeItem(key);setJob(undefined)})}>Discard archive job</button>}
 <p className="iw-muted">An interrupted download can resume by byte range. A permanent erasure invalidates older transfer jobs; keep a new archive after erasure.</p></section>
 <section className="iw-panel iw-stack" aria-label="Resumable archive restore"><h2>Restore a large archive</h2><p>Choose the same file again to resume an interrupted restore. Every part and stored document fingerprint is verified before the empty destination becomes visible.</p>{!empty&&<p>This store has records. Restore needs an empty destination.</p>}
 <label>Installation archive (NDJSON)<input type="file" accept=".ndjson,application/x-ndjson" onFocus={()=>setFileFocus('archive')} onBlur={()=>setFileFocus('')} style={fileFocus==='archive'?{outline:'2px solid var(--rer-focus)',outlineOffset:2}:undefined} disabled={action.busy} onChange={e=>{setFile(e.target.files?.[0]);setConfirmed(false)}}/></label>
 <label>Later erasure archive (NDJSON, optional)<input type="file" accept=".ndjson,application/x-ndjson" onFocus={()=>setFileFocus('later')} onBlur={()=>setFileFocus('')} style={fileFocus==='later'?{outline:'2px solid var(--rer-focus)',outlineOffset:2}:undefined} disabled={action.busy} onChange={e=>setLater(e.target.files?.[0])}/></label>
 <label className="iw-check"><input type="checkbox" checked={confirmed} disabled={action.busy} onChange={e=>setConfirmed(e.target.checked)}/>I selected the intended archive and included any newer erasure journal.</label>
 <button className="iw-primary iw-fit" disabled={action.busy||!empty||!file||!confirmed} onClick={()=>void action.run(restoreFile)}>Restore or resume archive</button>
 {restore&&<p role="status">Restore {restore.phase} · {restore.completed} of {restore.total??'?'} chunks</p>}{imported&&<p role="status">Archive restored; every stored fingerprint passed.</p>}
 <button className="iw-fit" disabled={action.busy} onClick={()=>void action.run(async()=>{const saved=JSON.parse(localStorage.getItem(restoreKey)??'null');if(saved?.id)await request(`${base}/imports/${saved.id}/abort`,{});localStorage.removeItem(restoreKey);setRestore(undefined)})}>Discard paused restore</button><ErrorNotice error={action.error}/></section></>
}
export function DocumentExport({actorId,owner}:{actorId:string;owner:boolean}){
 const [scope,setScope]=useState('all'),[q,setQ]=useState(''),[options,setOptions]=useState<{id:string;title:string}[]>([]),[selected,setSelected]=useState<Record<string,string>>({}),[job,setJob]=useState<string>(),[count,setCount]=useState<number>(),action=useAction(),key=`inkwell-document-export:${actorId}`
 useEffect(()=>{const saved=localStorage.getItem(key);if(saved)void action.run(async()=>{const value=await request<{records:number}>(`/api/inkwell/exports/${saved}`);setJob(saved);setCount(value.records)})},[key])
 useEffect(()=>{if(scope!=='selected')return;let live=true;const timer=setTimeout(()=>{void request<{envelopes:Envelope[]}>(`/api/inkwell/envelopes?limit=50&q=${encodeURIComponent(q)}`).then(v=>{if(live)setOptions(v.envelopes.map(e=>({id:e.id,title:e.title})))}).catch(()=>{})},150);return()=>{live=false;clearTimeout(timer)}},[q,scope])
 return <section className="iw-panel iw-stack" aria-label="Document export"><h2>Export document records</h2><p>Download PDFs, certificates, audit and custody JSON, a CSV index and file fingerprints in one TAR file. An export keeps a stable snapshot while live records change.</p><label>Records to export<select aria-label="Records to export" value={scope} disabled={action.busy} onChange={e=>setScope(e.target.value)}><option value="all">All records I may export</option><option value="selected">Selected envelopes</option></select></label>
 {scope==='selected'&&<><label>Find envelopes for export<input value={q} onChange={e=>setQ(e.target.value)}/></label><fieldset className="iw-stack"><legend>Select envelopes</legend>{options.map(o=><label className="iw-check" key={o.id}><input type="checkbox" checked={Boolean(selected[o.id])} onChange={e=>setSelected(current=>{const next={...current};if(e.target.checked)next[o.id]=o.title;else delete next[o.id];return next})}/>{o.title}</label>)}</fieldset><p>{Object.keys(selected).length} selected</p></>}
 {!owner&&<p>Imported archives retain their existing owner-only access. A whole-installation archive is managed by the owner.</p>}
 <button className="iw-primary iw-fit" disabled={action.busy||scope==='selected'&&!Object.keys(selected).length} onClick={()=>void action.run(async()=>{const value=await request<{id:string}>('/api/inkwell/exports',{scope,...(scope==='selected'?{ids:Object.keys(selected)}:{})});const status=await request<{records:number}>(`/api/inkwell/exports/${value.id}`);setJob(value.id);setCount(status.records);localStorage.setItem(key,value.id)})}>Prepare document export</button>
 {job&&<><p role="status">Document export ready · {count} record(s)</p><a className="iw-button iw-primary iw-fit" href={`/api/inkwell/exports/${job}/download`} download>Download document export</a><button className="iw-fit" disabled={action.busy} onClick={()=>void action.run(async()=>{await request(`/api/inkwell/exports/${job}/discard`,{});localStorage.removeItem(key);setJob(undefined)})}>Discard document export</button></>}<ErrorNotice error={action.error}/></section>
}
