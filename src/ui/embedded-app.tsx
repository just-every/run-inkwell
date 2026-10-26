import { useEffect, useState } from 'react'
import { request, command, type Envelope } from './types'
import { PrepareEnvelope } from './prepare-envelope'
import { SignerApp } from './signer-app'
import { ErrorNotice, useAction } from './feedback'
import { embedEvent } from './embed-client'

type Launch={mode:'sign'|'prepare';origin:string;token?:string;envelopeId?:string}
export function EmbeddedApp(){
 const [launch,setLaunch]=useState<Launch>(),[envelope,setEnvelope]=useState<Envelope>(),[eligible,setEligible]=useState(false),[closed,setClosed]=useState(false)
 const action=useAction()
 useEffect(()=>{const id=window.location.pathname.split('/').at(-1);void action.run(async()=>{const opened=await request<Launch>('/api/embed/'+id+'/meta');setLaunch(opened);if(opened.envelopeId)await refresh(opened.envelopeId)})},[])
 const close=()=>void action.run(async()=>{const id=window.location.pathname.split('/').at(-1);await request('/api/embed/'+id+'/close',{});embedEvent(launch!.origin,'closed');setClosed(true)})
 const refresh=async(id:string)=>setEnvelope((await request<{envelope:Envelope}>('/api/inkwell/envelopes/'+id)).envelope)
 if(!launch)return <main className="iw-app iw-main"><h1>Embedded session</h1><ErrorNotice error={action.error}/><p role="status">{action.error?'This embedded session is unavailable.':'Opening embedded session…'}</p></main>
 return <><div className="iw-app iw-main"><button type="button" onClick={close}>Close embedded session</button></div>{closed?<main className="iw-app iw-main"><h1>Session closed</h1></main>:launch.mode==='sign'?<SignerApp token={launch.token!} parentOrigin={launch.origin}/>:<main className="iw-app iw-main">{envelope&&<h1>Prepare and send</h1>}<ErrorNotice error={action.error}/>{!envelope?<PrepareEnvelope onSaved={refresh} onCancel={close}/>:<section className="iw-panel iw-stack"><h2>{envelope.title}</h2><p>Status: {envelope.status}</p>{envelope.signers.map((signer,i)=><p key={i}>{signer.name} · {signer.email}</p>)}{envelope.status==='prepared'?<><label><input type="checkbox" checked={eligible} onChange={e=>setEligible(e.target.checked)}/>I reviewed this envelope and authorize sending it to these recipients.</label><button className="iw-primary" disabled={!eligible||action.busy} onClick={()=>void action.run(async()=>{await command('envelope.approve',{id:envelope.id,eligible});await refresh(envelope.id);embedEvent(launch.origin,'sent',envelope.id)})}>Approve and send</button></>:<p role="status">The envelope has been submitted. Its current status is {envelope.status}.</p>}</section>}</main>}</>
}
