import { smsWrite, dispatchSms, smsReady } from './sms'
import { smsReplyCapability } from './sms-replies'
import { followupPlace, followupRecipient, currentFollowupRecipients } from './followup-recipients'
import { appendEvent, currentSigners, identityEvents, now, id, type Envelope, type Env } from './model'
import { commitEnvelope } from './storage'
import { followupGrant, followupState, grantGuard, liveGrant, stateWrite, recordGrantState } from './followup-store'
import type { FollowupGrant, FollowupState } from './followup-types'
import { dayOfWeek, localDate, localHour, addBusinessDays } from './followup-time'
import { envelopeMessages } from './delivery'
import { dispatchMail } from './mail'
import { openLink } from './links'
import { mailSuppressed } from './manual-invitations'
export async function followupAttentionWrites(env:Env,e:Envelope,g:FollowupGrant,i:number,label:string) {
 const people=(await env.DB.prepare("SELECT id,email FROM oa_operators WHERE status='active' AND id IN (?,?)").bind(e.createdBy,g.escalationOwner).all<{id:string;email:string}>()).results
 return people.flatMap(p=>[env.DB.prepare("INSERT INTO iw_mail(id,envelope_id,signer,kind,recipient,subject,body,created_at,followup_version,followup_envelope_version) VALUES(?,?,?,'notice',?,?,?,?,?,?)").bind(id(),e.id,i,p.email,`Follow-up: ${label}`,`A signing request needs attention.\n${new URL('/app',env.AUTH_ORIGIN).href}\n\nOpen the envelope in Inkwell to review it.`,now(),g.version,e.version+1),env.DB.prepare('INSERT INTO iw_notices(id,operator_id,envelope_id,event,at,title,recipient) VALUES(?,?,?,?,?,?,?)').bind(id(),p.id,e.id,'followup',now(),e.title,label)])
}
export const contactsSinceGrant=(e:Envelope,g:FollowupGrant,i:number)=>identityEvents(e,followupPlace(i)).filter(event=>(event.action==='followup.sent'&&event.detail.signer===i||event.action==='signer.reminded'&&event.detail.signer===followupPlace(i))&&String(event.detail.passAt??event.at)>=(g.startedAt??g.at))
export function insideWindow(g:FollowupGrant,at:number){return g.days.includes(dayOfWeek(localDate(at)))&&localHour(at)>=g.startHour&&localHour(at)<g.endHour}
export async function mayRemindUnderGrant(env:Env,e:Envelope,i:number,at:number) {
 const group=e.signers[i]?.group
 if(group){for(const person of currentFollowupRecipients(e).filter(p=>p.place===i))if(!await mayRemindUnderGrant(env,e,person.row,at))return false;return true}
 const g=await followupGrant(env,e.id);if(!g)return true
 if(!g.channels.includes('email')||g.state!=='active'||!await liveGrant(env,e,g)||!insideWindow(g,at))return false
 const s=await followupState(env,e,i),contacts=contactsSinceGrant(e,g,i)
 return !s.paused&&(!s.waitUntil||localDate(at)>=s.waitUntil)&&contacts.length<g.maxContacts&&!contacts.some(c=>localDate(Date.parse(String(c.detail.passAt??c.at)))===localDate(at))
}
/** One claim per cause/session and business day. The mail dispatcher fences the actual claim again. */
export async function chaseStalled(env:Env,at:number) {
 await env.DB.prepare("UPDATE iw_followup_grants SET state='ended' WHERE state='active' AND EXISTS(SELECT 1 FROM iw_envelopes e WHERE e.id=iw_followup_grants.envelope_id AND (json_extract(e.data,'$.status')!='awaiting_signature' OR json_extract(e.data,'$.expiresAt')<=?))").bind(new Date(at).toISOString()).run()
 await env.DB.prepare("DELETE FROM iw_followup_capabilities WHERE NOT EXISTS(SELECT 1 FROM iw_followup_grants g WHERE g.envelope_id=iw_followup_capabilities.envelope_id AND g.state='active' AND g.version=(SELECT MAX(version) FROM iw_followup_grants WHERE envelope_id=g.envelope_id))").run()
 const rows=(await env.DB.prepare("SELECT e.data FROM iw_envelopes e WHERE json_extract(e.data,'$.status')='awaiting_signature' AND json_extract(e.data,'$.scheduled') IS NULL AND json_extract(e.data,'$.expiresAt')>? AND EXISTS(SELECT 1 FROM iw_followup_grants g WHERE g.envelope_id=e.id AND g.state IN ('active','suspended'))").bind(new Date(at).toISOString()).all<{data:string}>()).results
 for(const row of rows){const e:Envelope=JSON.parse(row.data),g=await followupGrant(env,e.id);if(!g)continue;if(g.state!=='active'){await recordGrantState(env,e,g);continue}if(!await liveGrant(env,e,g)){await env.DB.prepare("UPDATE iw_followup_grants SET state='suspended' WHERE envelope_id=? AND version=? AND state='active'").bind(e.id,g.version).run();await recordGrantState(env,e,{...g,state:'suspended'});continue}await chaseEnvelope(env,e,g,at)}
}
async function chaseEnvelope(env:Env,before:Envelope,g:FollowupGrant,at:number) {
 const after=structuredClone(before),states:FollowupState[]=[],writes:D1PreparedStatement[]=[],passAt=new Date(at).toISOString(),today=localDate(at)
 const messages=await envelopeMessages(env,before.id)
 const bounced=currentFollowupRecipients(before).filter(person=>{const latest=messages.filter(m=>m.kind==='invitation'&&m.signer===person.place&&m.recipient.toLowerCase()===person.email.toLowerCase()).at(-1);return latest&&['bounced','failed'].includes(latest.status)}).map(p=>p.row)
 for(const person of currentFollowupRecipients(before)){
  const i=person.row,place=person.place;if(before.signers[place].inPerson||before.signers[place].paper?.status==='pending')continue
  const s=await followupState(env,before,i),old=JSON.stringify(s),events=identityEvents(before,place),contacts=contactsSinceGrant(before,g,i);s.contacts=contacts.length;s.notified??=[]
  const tell=async(label:string)=>{if(s.notified!.includes(label))return;s.notified!.push(label);writes.push(...await followupAttentionWrites(env,before,g,i,label));await appendEvent(after,'followup.attention','inkwell-followup',{signer:i,cause:label,version:g.version,member:g.memberId},passAt)}
  if(bounced.includes(i)){
   s.cause='bad address';s.paused=true
   const sources=(await env.DB.prepare('SELECT email FROM iw_contacts WHERE lower(name)=lower(?) AND lower(email)!=lower(?) ORDER BY email').bind(person.name,person.email).all<{email:string}>()).results
   if(sources.length===1)s.proposal={email:sources[0].email,source:'ROUTE-008 contact book: exact recipient name'}
   await tell(s.proposal?'corrected address proposed':'address needs correcting')
  }else if(contacts.length>=g.maxContacts){s.cause='contact limit';await tell('contact limit reached')}
  else if(s.paused){}
  else if(s.waitUntil&&s.waitUntil>localDate(Date.parse(before.expiresAt))){await tell('return date is after expiry')}
  else if(!s.waitUntil||s.waitUntil<=today){
   const views=events.filter(e=>e.action==='signer.viewed'&&e.detail.signer===place&&e.detail.member===person.member),verified=events.filter(e=>['signer.provider_verified','signer.sms_verified','signer.email_verified','signer.session_verified','signer.link_opened'].includes(e.action)&&e.detail.signer===place&&e.detail.member===person.member)
   const lastViewedAt=s.lastViewedAt??views.at(-1)?.at,invited=events.findLast(e=>['signer.invited','signer.resent','envelope.approved','envelope.sent_scheduled'].includes(e.action)&&(e.detail.signer===undefined||e.detail.signer===place))?.at??before.createdAt
   let cause=s.cause==='unavailable'?'unavailable':verified.length>=3?'repeated views':lastViewedAt?'opened and left':!verified.length?'not opened':undefined
   const due=cause==='unavailable'?true:cause==='repeated views'?true:cause==='opened and left'?today>=addBusinessDays(localDate(Date.parse(lastViewedAt!)),1):today>=addBusinessDays(localDate(Date.parse(invited)),before.reminders?.afterDays??2)
   if(cause){s.cause=cause;if(cause==='repeated views')await tell('repeated views')}
   const last=contacts.at(-1),lastDay=last?localDate(Date.parse(String(last.detail.passAt??last.at))):null
   const cadence=lastDay?today>=addBusinessDays(lastDay,before.reminders?.everyDays??3):true
   const mobile=before.signers[place].phone, sms=g.channels.includes('sms') && person.member===undefined && mobile && g.smsRecipients?.[String(place)]===mobile && smsReady(env), email=g.channels.includes('email')&&!mailSuppressed(env)
   if(g.channels.includes('sms')&&!sms&&!email)await tell('SMS number changed or unavailable; renew the follow-up grant')
   if(cause&&due&&cadence&&insideWindow(g,at)&&lastDay!==today&&(sms||email)){
    const signer=await env.DB.prepare('SELECT link_sealed FROM iw_signers WHERE envelope_id=? AND signer=?').bind(before.id,i).first<{link_sealed:string|null}>(),token=signer?await openLink(env,before.id,i,signer.link_sealed):undefined
    if(token){
     const owner=await env.DB.prepare('SELECT display_name,email FROM oa_operators WHERE id=?').bind(before.createdBy).first<{display_name:string;email:string}>()
     const causeText:Record<string,string>={'not opened':'Your signing request is waiting for review.','opened and left':'You opened this signing request; it is still waiting for your signature.','repeated views':'If you need help after reviewing this request, contact the sender.','unavailable':'Following up after your stated availability.'}
     const body=`${person.name},\n\n${causeText[cause]}\n${before.title}\n${new URL('/sign/'+token,env.AUTH_ORIGIN).href}\n\nSender: ${owner?.display_name??'Sender'} <${owner?.email??''}>\nThis reminder was sent automatically under ${owner?.display_name??'the sender'}'s follow-up settings.`
     if(sms){
      const capability=await smsReplyCapability(env,before,i)
      writes.push(smsWrite(env,after,i,mobile!,'followup',`Inkwell: ${causeText[cause]}\n${before.title}\n${new URL('/sign/'+token,env.AUTH_ORIGIN).href}\nSender: ${owner?.display_name??'Sender'} <${owner?.email??''}>\nAutomatic follow-up under the sender’s settings. Reply ${capability} followed by your message to contact the sender.`))
     }else writes.push(env.DB.prepare("INSERT INTO iw_mail(id,envelope_id,signer,kind,recipient,subject,body,created_at,followup_version,followup_envelope_version) VALUES(?,?,?,'notice',?,?,?,?,?,?)").bind(id(),before.id,i,person.email,`Reminder to sign: ${before.title}`,body,passAt,g.version,before.version+1))
     await appendEvent(after,'followup.sent','inkwell-followup',{signer:i,cause,version:g.version,member:g.memberId,passAt,channel:sms?'sms':'email'},passAt);s.contacts++
     if(s.contacts>=g.maxContacts)await tell('contact limit reached')
    }else await tell('invitation link unavailable')
   }
  }
  if(JSON.stringify(s)!==old){states.push(s)}
 }
 if(after.events.length===before.events.length&&!states.length)return
 await commitEnvelope(env,before,after,null,[...writes,...states.map(s=>stateWrite(env,before,s))],[grantGuard(before,g)])
 await dispatchMail(env,before.id)
 await dispatchSms(env,before.id)
}
