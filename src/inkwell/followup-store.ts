import { crmEscalationOwner } from './agents'
import { smsReady } from './sms'
import { followupRecipient, followupRecipients, currentFollowupRecipients, followupPlace } from './followup-recipients'
import { active, appendEvent, currentSigners, id, identityEvents, insist, now, secret, sha256, text, type Actor, type Envelope, type Env } from './model'
import { commandWrite, commitEnvelope, getEnvelope, memberRoleSql, roleGuard, type Guard } from './storage'
import { envelopeAccess, insistAccess, listPeople } from './members'
import type { CommandContext } from './envelopes'
import type { FollowupGrant, FollowupState } from './followup-types'
import type { FollowupReply } from './followup-inbound'
import { localDate, addBusinessDays } from './followup-time'
export type { FollowupState } from './followup-types'
export async function followupGrant(env:Env, envelopeId:string):Promise<FollowupGrant|null> {
 const row=await env.DB.prepare('SELECT data,state FROM iw_followup_grants WHERE envelope_id=? ORDER BY version DESC LIMIT 1').bind(envelopeId).first<{data:string;state:FollowupGrant['state']}>()
 return row?{...JSON.parse(row.data),state:row.state}:null
}
export const grantActor=(g:FollowupGrant):Actor=>({id:g.memberId,version:g.memberVersion,role:g.memberRole,name:'',email:''})
export function grantGuard(envelope:Envelope,g:FollowupGrant):Guard {
 const role=roleGuard(grantActor(g))
 return {sql:`${role.sql} AND EXISTS(SELECT 1 FROM iw_followup_grants WHERE envelope_id=? AND version=? AND state='active') AND (? IN ('owner','admin') OR EXISTS(SELECT 1 FROM iw_envelopes WHERE id=? AND (json_extract(data,'$.createdBy')=? OR EXISTS(SELECT 1 FROM iw_effective_shares WHERE envelope_id=? AND operator_id=? AND access='edit'))))`,values:[...role.values,envelope.id,g.version,g.memberRole,envelope.id,g.memberId,envelope.id,g.memberId]}
}
export async function liveGrant(env:Env,e:Envelope,g:FollowupGrant) {
 const guard=grantGuard(e,g)
 return Boolean(await env.DB.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.values).first())
}
export const identity=(e:Envelope,i:number)=>followupRecipient(e,i).email+(e.signers[followupPlace(i)]?.phone?':'+e.signers[followupPlace(i)].phone:'')+':'+(e.events.findLast(event=>['signer.corrected','signer.reassigned'].includes(event.action)&&event.detail.signer===followupPlace(i))?.hash??'original')
export async function followupState(env:Env,e:Envelope,i:number):Promise<FollowupState> {
 const key=identity(e,i),row=await env.DB.prepare('SELECT identity,data FROM iw_followup_states WHERE envelope_id=? AND signer=?').bind(e.id,i).first<{identity:string;data:string}>()
 return row?.identity===key?JSON.parse(row.data):{signer:i,identity:key,paused:false,contacts:0}
}
export const stateWrite=(env:Env,e:Envelope,s:FollowupState)=>env.DB.prepare('INSERT INTO iw_followup_states(envelope_id,signer,identity,data) VALUES(?,?,?,?) ON CONFLICT(envelope_id,signer) DO UPDATE SET identity=excluded.identity,data=excluded.data').bind(e.id,s.signer,s.identity,JSON.stringify(s))
export async function setFollowup(env:Env,c:CommandContext,input:Record<string,unknown>) {
 insist(!c.actor.agentId&&!c.actor.apiKeyId,'A person must manage follow-up.',403)
 const before=await getEnvelope(env.DB,text(input.id,'an envelope ID'));await insistAccess(env,c.actor,before,'edit')
 const old=await followupGrant(env,before.id),after=structuredClone(before),at=now(),writes:D1PreparedStatement[]=[]
 if(input.enabled===false){
  insist(old,'No follow-up grant exists.',409)
  writes.push(env.DB.prepare("UPDATE iw_followup_grants SET state='revoked' WHERE envelope_id=? AND state='active'").bind(before.id),env.DB.prepare("UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=? AND followup_version IS NOT NULL AND state='pending'").bind(before.id),env.DB.prepare('DELETE FROM iw_followup_capabilities WHERE envelope_id=?').bind(before.id))
  await appendEvent(after,'followup.revoked',c.actor.id,{version:old.version})
 }else{
  insist(input.enabled===true,'Explicitly enable follow-up.');active(before)
  const maxContacts=input.maxContacts??3,days=input.days??[1,2,3,4,5],startHour=input.startHour??9,endHour=input.endHour??17,escalationOwner=typeof input.escalationOwner==='string'?input.escalationOwner:(await crmEscalationOwner(env,before)??before.createdBy)
  insist(Number.isInteger(maxContacts)&&Number(maxContacts)>=1&&Number(maxContacts)<=10,'Choose 1–10 contacts per recipient.')
  insist(Array.isArray(days)&&days.length>0&&days.length<=5&&days.every(d=>Number.isInteger(d)&&d>=1&&d<=5)&&new Set(days).size===days.length,'Choose allowed business days.')
  insist(Number.isInteger(startHour)&&Number.isInteger(endHour)&&Number(startHour)>=0&&Number(endHour)<=24&&Number(startHour)<Number(endHour),'Choose whole allowed hours between 0 and 24.')
  const channels = input.channels ?? ['email']
  insist(Array.isArray(channels) && channels.length >= 1 && channels.length <= 2 && new Set(channels).size === channels.length && channels.every(c => c === 'email' || c === 'sms'), 'Choose email, SMS, or both follow-up channels.')
  if (channels.includes('sms')) {
   insist(smsReady(env), 'Configure Twilio before granting SMS follow-up.', 409)
   insist(before.signers.filter(s => !s.removedAt && !s.inPerson).every(s => !s.group && s.phone), 'Add a US mobile number for every remote recipient before granting SMS follow-up.', 409)
  }
  const people=await listPeople(env),p=people.find(p=>p.id===escalationOwner);insist(p,'Choose an active escalation owner.')
  const member=await env.DB.prepare('SELECT version FROM oa_operators WHERE id=?').bind(p.id).first<{version:number}>()
  await insistAccess(env,{...p,role:p.role as Actor['role'],version:member!.version},before,'view')
  const grant:FollowupGrant={version:(old?.version??0)+1,state:'active',memberId:c.actor.id,memberVersion:c.actor.version,memberRole:c.actor.role,maxContacts:Number(maxContacts),days,startHour:Number(startHour),endHour:Number(endHour),escalationOwner,channels,...(channels.includes('sms')?{smsRecipients:Object.fromEntries(before.signers.flatMap((s,i)=>s.phone&&!s.removedAt?[[String(i),s.phone]]:[]))}:{}),at,startedAt:old?.state==='active'?(old.startedAt??old.at):at}
  writes.push(env.DB.prepare("UPDATE iw_followup_grants SET state='revoked' WHERE envelope_id=? AND state='active'").bind(before.id),env.DB.prepare('INSERT INTO iw_followup_grants(envelope_id,version,state,member_id,member_version,member_role,data) VALUES(?,?,?,?,?,?,?)').bind(before.id,grant.version,'active',c.actor.id,c.actor.version,c.actor.role,JSON.stringify(grant)))
  await appendEvent(after,'followup.granted',c.actor.id,{version:grant.version,agent:'deterministic v1',member:c.actor.id})
 }
 const result={id:before.id};await commitEnvelope(env,before,after,c.actor,[...writes,commandWrite(env.DB,c.actor.id,c.commandId,c.fingerprint,result)]);return result
}
export async function resumeFollowup(env:Env,c:CommandContext,input:Record<string,unknown>) {
 const before=await getEnvelope(env.DB,text(input.id,'an envelope ID'));active(before);await insistAccess(env,c.actor,before,'edit')
 const g=await followupGrant(env,before.id);insist(g?.state==='active'&&await liveGrant(env,before,g),'Follow-up is not active.',409)
 const i=Number(input.signer);insist(currentFollowupRecipients(before).some(p=>p.row===i),'Choose a current recipient.',409)
 const state=await followupState(env,before,i);insist(state.paused&&state.cause==='substantive reply','Only a paused substantive reply can be resumed.',409);state.paused=false;delete state.waitUntil;delete state.cause
 const after=structuredClone(before);await appendEvent(after,'followup.resumed',c.actor.id,{signer:i,version:g.version})
 const result={id:before.id};await commitEnvelope(env,before,after,c.actor,[stateWrite(env,before,state),commandWrite(env.DB,c.actor.id,c.commandId,c.fingerprint,result)],[grantGuard(before,g)]);return result
}
export async function followupView(env:Env,actor:Actor,e:Envelope) {
 insist(!actor.agentId&&!actor.apiKeyId,'Use a member session.',403);const access=await insistAccess(env,actor,e,'view');let g=await followupGrant(env,e.id)
 if(g?.state==='active'&&(e.status!=='awaiting_signature'||Date.parse(e.expiresAt)<=Date.now()||!await liveGrant(env,e,g))){const state=e.status!=='awaiting_signature'||Date.parse(e.expiresAt)<=Date.now()?'ended':'suspended';await env.DB.prepare("UPDATE iw_followup_grants SET state=? WHERE envelope_id=? AND version=? AND state='active'").bind(state,e.id,g.version).run();g={...g,state}}
 await recordGrantState(env,e,g)
 const canRead=access==='edit'||actor.id===e.createdBy||actor.id===g?.escalationOwner
 const {contactsSinceGrant}=await import('./followup-engine')
 const states=await Promise.all(followupRecipients(e).map(async p=>({...await followupState(env,e,p.row),...(g?{contacts:contactsSinceGrant(e,g,p.row).length}:{}),recipientName:p.name})))
 const replies=canRead?(await env.DB.prepare('SELECT signer,data FROM iw_followup_replies WHERE envelope_id=? ORDER BY rowid').bind(e.id).all<{signer:number;data:string}>()).results.map(r=>{const p:FollowupReply=JSON.parse(r.data);return{id:p.id,signer:r.signer,from:p.headers.from,subject:p.headers.subject,text:p.body,at:p.receivedAt,verified:p.verified,tooLarge:p.bodyStatus!=='kept',attachments:p.attachments}}):undefined
 return {grant:g,states:canRead?states:states.map(({signer,cause,paused,waitUntil,contacts,recipientName})=>({signer,cause,paused,waitUntil,contacts,recipientName})),replies,people:access==='edit'?await listPeople(env):[],defaultEscalationOwner:await crmEscalationOwner(env,e)??e.createdBy,readiness:{sms:smsReady(env),inbound:Boolean(env.MAIL_INBOUND_DOMAIN&&env.MAIL_INBOUND_SECRET&&env.MAIL_INBOUND_API_KEY)}}
}
export async function replyTo(env:Env,e:Envelope,i:number) {
 const g=await followupGrant(env,e.id);if(!g||g.state!=='active'||!env.MAIL_INBOUND_DOMAIN||!await liveGrant(env,e,g))return undefined
 const row=await env.DB.prepare('SELECT token_hash FROM iw_signers WHERE envelope_id=? AND signer=?').bind(e.id,i).first<{token_hash:string}>();if(!row)return undefined
 // Domain-separated HMAC of the cryptographically random invitation identity gives a stable
 // 256-bit reply capability. Only its hash is stored; no recoverable reply secret is needed.
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`inkwell:followup-reply:v1:${e.id}:${i}:${row.token_hash}:${g.version}`)))
 const token=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
 await env.DB.prepare('INSERT INTO iw_followup_capabilities(cap_hash,envelope_id,signer,token_hash,grant_version) VALUES(?,?,?,?,?) ON CONFLICT(cap_hash) DO NOTHING').bind(await sha256(token),e.id,i,row.token_hash,g.version).run()
 return `reply+${token}@${env.MAIL_INBOUND_DOMAIN}`
}
export async function resolveReplyCapability(env:Env,token:string) {
 const cap=await env.DB.prepare('SELECT envelope_id,signer,token_hash,grant_version FROM iw_followup_capabilities WHERE cap_hash=?').bind(await sha256(token)).first<{envelope_id:string;signer:number;token_hash:string;grant_version:number}>();if(!cap)return null
 const e=await getEnvelope(env.DB,cap.envelope_id),g=await followupGrant(env,e.id)
 if(e.status!=='awaiting_signature'||Date.parse(e.expiresAt)<=Date.now()||!g||g.state!=='active'||!await liveGrant(env,e,g))return null
 const signer=await env.DB.prepare('SELECT token_hash FROM iw_signers WHERE envelope_id=? AND signer=?').bind(e.id,cap.signer).first<{token_hash:string}>()
 if(signer?.token_hash!==cap.token_hash||!currentFollowupRecipients(e).some(p=>p.row===cap.signer))return null
 return {envelope:e,signer:cap.signer,state:await followupState(env,e,cap.signer)}
}
export async function storeReply(env:Env,before:Envelope,i:number,reply:FollowupReply,eventId:string) {
 const g=await followupGrant(env,before.id);insist(g&&await liveGrant(env,before,g),'Follow-up is no longer active.',409)
 const after=structuredClone(before),s=await followupState(env,before,i)
 if(reply.verified){
  const addresses=[...new Set(reply.body?.match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)??[])].filter(email=>email.toLowerCase()!==followupRecipient(before,i).email.toLowerCase())
  if(addresses.length===1)s.proposal={email:addresses[0].toLowerCase(),source:'Recipient’s authenticated reply '+reply.id}

  const auto=reply.automatic===true||reply.headers.autoSubmitted?.toLowerCase()==='auto-replied'
  if(auto&&!s.paused){s.cause='unavailable';const date=reply.body?.match(/\b(20\d{2}-\d{2}-\d{2})\b/g);const unambiguous=date&&new Set(date).size===1&&Number.isFinite(Date.parse(date[0]+'T12:00:00Z'))&&new Date(date[0]+'T12:00:00Z').toISOString().slice(0,10)===date[0];s.waitUntil=unambiguous?date![0]:addBusinessDays(localDate(Date.parse(reply.receivedAt)),before.reminders?.everyDays??3);s.paused=false}
  else if(!auto){s.cause='substantive reply';s.paused=true}
 }
 await appendEvent(after,'followup.reply_received','inkwell-followup',{signer:i,version:g.version,cause:reply.verified?s.cause:'unverified sender',reply:reply.id,member:g.memberId})
 const { followupAttentionWrites }=await import('./followup-engine')
 const writes=[env.DB.prepare('INSERT INTO iw_followup_receipts(event_id,received_at) VALUES(?,?)').bind(eventId,reply.receivedAt),env.DB.prepare('INSERT INTO iw_followup_replies(id,envelope_id,signer,data) VALUES(?,?,?,?)').bind(reply.id,before.id,i,JSON.stringify(reply)),stateWrite(env,before,s),...await followupAttentionWrites(env,before,g,i,'a signer replied')]
 await commitEnvelope(env,before,after,null,writes,[grantGuard(before,g),{sql:'EXISTS(SELECT 1 FROM iw_signers WHERE envelope_id=? AND signer=? AND token_hash IN (SELECT token_hash FROM iw_followup_capabilities WHERE envelope_id=? AND signer=?))',values:[before.id,i,before.id,i]}])
 const {dispatchMail}=await import('./mail');await dispatchMail(env,before.id)
}

/** SQL fences suspend immediately; this records that durable transition without any private text. */
export async function recordGrantState(env:Env,e:Envelope,g:FollowupGrant|null){
 if(!g||g.state==='active'||e.events.some(event=>event.action===`followup.${g.state}`&&event.detail.version===g.version))return
 const after=structuredClone(e);await appendEvent(after,`followup.${g.state}`,'inkwell-followup',{version:g.version,member:g.memberId})
 await commitEnvelope(env,e,after,null)
}
