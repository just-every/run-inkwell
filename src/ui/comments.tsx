import { useEffect, useState } from 'react'
import { dateTime, request } from './types'
import { ErrorNotice, useAction } from './feedback'

type Party = {key:string;name:string;self:boolean}
type Thread = {id:string;page:number;canShare:boolean;messages:{name:string;at:string;text:string}[];audience:{kind:string;signer?:number;member?:number;email?:string}[]}
type View = {threads:Thread[];parties:Party[];canWrite:boolean;pages:number}
/** SIGNX-009 extends the existing stacked document controls; no new visual system. */
export function Comments({ base }: {base:string}) {
 const [view,setView]=useState<View>(),[body,setBody]=useState(''),[page,setPage]=useState(1),[audience,setAudience]=useState<string[]>([]),action=useAction()
 const refresh=async()=>setView(await request<View>(`${base}/comments`))
 useEffect(()=>{let live=true;void request<View>(`${base}/comments`).then(v=>{if(live)setView(v)}).catch(()=>{});return()=>{live=false}},[base])
 const post=async(input:unknown)=>{await request(`${base}/comments`,{...(input as object),commandId:crypto.randomUUID()});await refresh()}
 if(!view)return null
 return <section className="iw-stack iw-callout" aria-label="Document comments"><h2>Document comments</h2><p>Only the parties explicitly selected by a thread’s author can read it. Replies keep the same audience.</p>
 {view.threads.length===0&&<p>No comments shared with you.</p>}
 {view.threads.map(t=><CommentThread key={t.id} thread={t} parties={view.parties} canWrite={view.canWrite} post={post}/>)}
 {view.canWrite&&<form className="iw-stack" onSubmit={e=>{e.preventDefault();void action.run(async()=>{await post({action:'create',page:page-1,text:body,audience});setBody('');setAudience([])})}}><h3>Start a thread</h3><label>Comment page<input type="number" required min={1} max={view.pages} value={page} onChange={e=>setPage(Number(e.target.value))}/></label><label>New comment<textarea required maxLength={4000} value={body} onChange={e=>setBody(e.target.value)}/></label><Audience parties={view.parties} selected={audience} setSelected={setAudience}/><button className="iw-fit" disabled={action.busy||!audience.length}>Post comment</button></form>}
 {!view.canWrite&&<p>Comments are read-only for this session.</p>}<ErrorNotice error={action.error}/></section>
}
function Audience({parties,selected,setSelected}:{parties:Party[];selected:string[];setSelected:(values:string[])=>void}) {
 return <fieldset className="iw-stack"><legend>Who can read this thread?</legend>{parties.map(p=><label className="iw-check" key={p.key}><input type="checkbox" checked={selected.includes(p.key)} onChange={e=>setSelected(e.target.checked?[...selected,p.key]:selected.filter(k=>k!==p.key))}/>{p.name}{p.self?' (you)':''}</label>)}</fieldset>
}
function CommentThread({thread,parties,canWrite,post}:{thread:Thread;parties:Party[];canWrite:boolean;post:(input:unknown)=>Promise<void>}) {
 const [reply,setReply]=useState(''),[sharing,setSharing]=useState(false),[audience,setAudience]=useState<string[]>([]),action=useAction()
 return <article className="iw-stack" aria-label={`Thread on page ${thread.page+1}`}><h3>Page {thread.page+1}</h3><p>Audience: {thread.audience.map(a=>a.kind==='sender'?'Sender':a.email).join(', ')}</p>
 <ol className="iw-stack">{thread.messages.map((m,i)=><li key={i}><strong>{m.name}</strong> · <time dateTime={m.at}>{dateTime(m.at)}</time><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.text}</p></li>)}</ol>
 {canWrite&&<><form className="iw-stack" onSubmit={e=>{e.preventDefault();void action.run(async()=>{await post({action:'reply',thread:thread.id,text:reply});setReply('')})}}><label>Reply on page {thread.page+1}<textarea required maxLength={4000} value={reply} onChange={e=>setReply(e.target.value)}/></label><button className="iw-fit" disabled={action.busy}>Post reply</button></form>
 {thread.canShare&&<><button className="iw-fit" disabled={action.busy} onClick={()=>{setSharing(v=>!v);setAudience([])}}>Change thread audience</button>{sharing&&<form className="iw-stack" onSubmit={e=>{e.preventDefault();void action.run(async()=>{await post({action:'audience',thread:thread.id,audience});setSharing(false)})}}><p>Select every current identity who should read the full thread. A replacement recipient does not inherit earlier access.</p><Audience parties={parties} selected={audience} setSelected={setAudience}/><button className="iw-fit" disabled={action.busy||!audience.length}>Save thread audience</button></form>}</>}
 </>}<ErrorNotice error={action.error}/></article>
}
