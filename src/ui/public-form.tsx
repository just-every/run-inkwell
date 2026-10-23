import { useEffect, useRef, useState } from 'react'
import { Brand } from './shell'
import { ErrorNotice, useAction } from './feedback'
import { request } from './types'

type Bot = { render:(element:HTMLElement,options:{sitekey:string;action:string;callback:(token:string)=>void;'expired-callback':()=>void;'error-callback':()=>void})=>string;remove:(id:string)=>void }
let botScript:Promise<void>|undefined
function BotCheck({siteKey,action,onToken}:{siteKey:string;action:string;onToken:(token:string)=>void}){
 const element=useRef<HTMLDivElement>(null),[failed,setFailed]=useState(false)
 useEffect(()=>{
  let cancelled=false,widget:string|undefined
  const api=()=> (window as unknown as {turnstile?:Bot}).turnstile
  if(!botScript)botScript=new Promise<void>((resolve,reject)=>{if(api())return resolve();const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=()=>resolve();script.onerror=()=>reject(new Error('Bot verification is unavailable.'));document.head.appendChild(script)})
  void botScript.then(()=>{if(!cancelled&&element.current)widget=api()!.render(element.current,{sitekey:siteKey,action,callback:onToken,'expired-callback':()=>onToken(''),'error-callback':()=>{onToken('');setFailed(true)}})}).catch(()=>{if(!cancelled){onToken('');setFailed(true)}})
  return()=>{cancelled=true;if(widget)api()?.remove(widget)}
 },[siteKey,action,onToken])
 return <div className="iw-stack"><div ref={element} aria-label="Bot verification" />{failed&&<p role="alert">Bot verification is unavailable. Reload this page to try again.</p>}</div>
}
/** The public entry uses the existing signing look; verified submission continues in the ordinary signer page. */
export function PublicForm({id}:{id:string}){
 const [form,setForm]=useState<{title:string;role:string;expiresAt:string;turnstileSiteKey?:string}>(),[stage,setStage]=useState<'email'|'code'|'submit'|'held'>('email')
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState(''),[grant,setGrant]=useState(''),[botToken,setBotToken]=useState(''),[message,setMessage]=useState('')
 const action=useAction(),base=`/api/forms/${id}`
 useEffect(()=>{void action.run(async()=>{setForm(await request(base))})},[base])
 const submit=async()=>{
  if(stage==='email'){const result=await request<{challengeId:string}>(base+'/code',{email,turnstileToken:botToken});setChallenge(result.challengeId);setStage('code')}
  else if(stage==='code'){const result=await request<{admissionToken:string}>(base+'/verify',{challengeId:challenge,code,turnstileToken:botToken});setGrant(result.admissionToken);setCode('');setStage('submit')}
  else if(stage==='submit'){const response=await request<{result:{status:string;signingPath?:string;message?:string}}>(base+'/submit',{name,admissionToken:grant,turnstileToken:botToken,commandId:crypto.randomUUID()});setGrant('');if(response.result.signingPath){window.location.assign(response.result.signingPath);return}setMessage(response.result.message??'Your unsigned submission is waiting for the publisher to review it.');setStage('held')}
  setBotToken('')
 }
 return <div className="iw-app iw-signer"><header className="iw-header"><Brand href="/" /><span className="iw-header-note">Secure document signing</span></header><main className="iw-main iw-stack">
  <section className="iw-page-heading"><div><p className="iw-eyebrow">Public signing form</p><h1>{form?.title??'Signing form'}</h1>{form&&<p>You sign as {form.role}. Other recipients and the document are fixed by the publisher.</p>}</div></section>
  <p><a href={`/api/forms/${id}/qr.svg`} download>Download form QR code</a></p>
  <section className="iw-panel iw-stack"><ErrorNotice error={action.error}/>
  {stage==='held'?<div role="status"><h2>Waiting for review</h2><p>{message}</p><p>No signature has been recorded. If the publisher confirms eligibility, an invitation will be sent to your verified email.</p></div>:form&&<form className="iw-stack" onSubmit={event=>{event.preventDefault();void action.run(submit)}}>
   {stage==='email'&&<><p>Verify your email before an envelope is created. You will review the disclosure and document before signing.</p><label>Your name<input required autoComplete="name" maxLength={100} value={name} disabled={action.busy} onChange={event=>setName(event.target.value)}/></label><label>Your email<input type="email" required autoComplete="email" maxLength={254} value={email} disabled={action.busy} onChange={event=>setEmail(event.target.value)}/></label></>}
   {stage==='code'&&<><p>A verification code was sent to {email}. It expires in 10 minutes and allows five attempts.</p><label>Email verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} disabled={action.busy} onChange={event=>setCode(event.target.value)}/></label></>}
   {stage==='submit'&&<p>Email verified for {name} at {email}. Continue to review and sign, or wait for the publisher’s review if its policy requires one.</p>}
   {form.turnstileSiteKey?<BotCheck key={stage} siteKey={form.turnstileSiteKey} action={`inkwell_form_${stage==='email'?'code':stage==='code'?'verify':'submit'}`} onToken={setBotToken}/>:<p role="alert">Bot verification is not configured. Contact the publisher before continuing.</p>}
   <button className="iw-primary iw-fit" disabled={action.busy||!botToken}>{action.busy?'Working…':stage==='email'?'Email me a code':stage==='code'?'Verify email':'Continue to agreement'}</button>
  </form>}
  </section></main></div>
}
