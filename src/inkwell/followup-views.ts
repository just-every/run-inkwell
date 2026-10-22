import { appendEvent, now, Refusal, type Env } from './model'
import { followupGrant, followupState, grantGuard, liveGrant, stateWrite } from './followup-store'
import { commitEnvelope, getEnvelope } from './storage'
import { sessionGuard, type SigningContext } from './signing'
import { localDate } from './followup-time'
/** The original timeline keeps its first view. Chasing also needs the last business date viewed,
 * including a later browser session, without retaining any session credential in custody. */
export async function recordFollowupView(env:Env,context:SigningContext){
 const before=await getEnvelope(env.DB,context.envelope.id),g=await followupGrant(env,before.id)
 if(!g||g.state!=='active'||!await liveGrant(env,before,g))return
 const r=context.recipient,s=await followupState(env,before,r.row),at=now()
 const verified=before.events.findLast(event=>['signer.sms_verified','signer.email_verified','signer.session_verified','signer.link_opened'].includes(event.action)&&event.detail.signer===r.signer&&event.detail.member===r.member)
 if(s.viewSession===verified?.hash&&s.lastViewedAt&&localDate(Date.parse(s.lastViewedAt))===localDate(Date.parse(at)))return
 s.viewSession=verified?.hash;s.lastViewedAt=at
 const after=structuredClone(before);await appendEvent(after,'followup.viewed','inkwell-followup',{signer:r.row,version:g.version,member:g.memberId})
 try{await commitEnvelope(env,before,after,null,[stateWrite(env,before,s)],[grantGuard(before,g),sessionGuard(context)])}catch(error){if(!(error instanceof Refusal)||error.status!==409)throw error}
}
