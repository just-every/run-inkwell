import {useEffect,useRef,useState} from 'react'
import {request} from './types'
import {ErrorNotice,useAction} from './feedback'
import type {Template} from './templates'
interface Row {number:number;cells:Record<string,string>;valid:boolean;status:string;error?:string;envelopeId?:string}
interface Batch {id:string;name:string;state:string;approvedAt:string|null;rows:Row[]}
interface Index {batches:{id:string;name:string;state:string}[];lists:{id:string;name:string}[]}
export function BulkSend({templates,onOpen}:{templates:Template[];onOpen:(id:string)=>void}){
 const [index,setIndex]=useState<Index>({batches:[],lists:[]}),[batch,setBatch]=useState<Batch>(),[template,setTemplate]=useState(''),[name,setName]=useState(''),[list,setList]=useState(''),[listName,setListName]=useState(''),[eligible,setEligible]=useState(false),file=useRef<HTMLInputElement>(null),action=useAction()
 const refresh=async()=>setIndex(await request<Index>('/api/inkwell/bulk'))
 useEffect(()=>{void action.run(refresh)},[])
 const send=(path:string,body:unknown)=>request<Batch>(path,body)
 async function preview(){const q=new URLSearchParams({templateId:template,name,...(list?{listId:list}:{})}),upload=file.current?.files?.[0];if(!list&&!upload)throw Error('Choose a CSV or XLSX spreadsheet.');const response=await fetch('/api/inkwell/bulk?'+q,{method:'POST',body:list?'':upload});const result=await response.json() as Batch & {error?:string};if(!response.ok)throw Error(result.error??'Preview failed.');setBatch(result);setEligible(false);await refresh()}
 async function process(current:Batch){setBatch(current);while(current.state==='approved'&&current.rows.some(r=>r.valid&&r.status==='ready')){current=await send(`/api/inkwell/bulk/${current.id}/process`,{});setBatch(current)}await refresh()}
 const selected=templates.find(t=>t.id===template)
 return <section className="iw-panel iw-stack" aria-label="Bulk send"><h2>Bulk send</h2><p>One envelope per spreadsheet row. Preview every row, then approve the batch once.</p>
 <form className="iw-stack" onSubmit={e=>{e.preventDefault();void action.run(preview)}}><label>Batch name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Bulk template<select aria-label="Bulk template" required value={template} onChange={e=>setTemplate(e.target.value)}><option value="">Choose a template</option>{templates.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
 {selected&&<p>Columns: {selected.roles.flatMap(r=>{const p=selected.roles.length===1?'':r.role+'.';return [p+'name',p+'email',...(r.accessCode?[p+'accessCode']:[]),...(r.sms||r.providerAuth==='voice'?[p+'phone']:[])]}).join(', ')}. Add business field IDs for prefill values.</p>}
 <label>Saved recipient list<select aria-label="Saved recipient list" value={list} onChange={e=>setList(e.target.value)}><option value="">Upload a new spreadsheet</option>{index.lists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>{!list&&<label>Bulk spreadsheet<input ref={file} type="file" accept=".csv,.xlsx" /></label>}<button className="iw-primary iw-fit" disabled={action.busy}>Preview batch</button></form>
 <ErrorNotice error={action.error}/>{action.busy&&<p role="status">Processing batch…</p>}
 {batch&&<section className="iw-stack" aria-label="Batch preview"><h3>{batch.name}</h3><p role="status">{batch.rows.length} rows · {batch.rows.filter(r=>!r.valid).length} invalid · {batch.rows.filter(r=>r.envelopeId).length} prepared · {batch.state}</p>
 <div className="iw-actions"><label>Recipient list name<input maxLength={100} value={listName} onChange={e=>setListName(e.target.value)}/></label><button disabled={action.busy||!listName.trim()} onClick={()=>void action.run(async()=>{await send(`/api/inkwell/bulk/${batch.id}/save-list`,{name:listName});await refresh()})}>Save recipient list</button></div>
 {batch.state==='preview'&&<><label className="iw-check"><input type="checkbox" checked={eligible} onChange={e=>setEligible(e.target.checked)}/>I confirm eligibility and authorize every valid row in this batch.</label><button className="iw-primary iw-fit" disabled={action.busy||!eligible||!batch.rows.some(r=>r.valid)} onClick={()=>void action.run(async()=>process(await send(`/api/inkwell/bulk/${batch.id}/approve`,{eligible:true})))}>Approve batch once</button></>}
 {batch.state==='approved'&&batch.rows.some(r=>r.valid&&r.status==='ready')&&<button disabled={action.busy} onClick={()=>void action.run(()=>process(batch))}>Resume approved batch</button>}
 <button disabled={action.busy} className="iw-fit" onClick={()=>void action.run(async()=>setBatch(await request<Batch>(`/api/inkwell/bulk/${batch.id}`)))}>Refresh row statuses</button>
 <ul className="iw-contact-results" aria-label="Batch rows">{batch.rows.map(row=><li key={row.number} style={{flexWrap:'wrap',overflowWrap:'anywhere'}}><span><strong>Row {row.number}</strong><small>{Object.values(row.cells).slice(0,2).join(' · ')}</small><small>{row.error??row.status}</small></span>{row.envelopeId&&<button onClick={()=>onOpen(row.envelopeId!)}>Open row {row.number}</button>}</li>)}</ul></section>}
 {index.batches.length>0&&<label>Earlier batches<select aria-label="Earlier batches" value={batch?.id??''} onChange={e=>{const key=e.target.value;if(key)void action.run(async()=>setBatch(await request<Batch>(`/api/inkwell/bulk/${key}`)))}}><option value="">Choose a batch</option>{index.batches.map(b=><option key={b.id} value={b.id}>{b.name} · {b.state}</option>)}</select></label>}
 </section>
}
