import { canonical, clientEvidence, appendEvent, insist, now, secret, sha256, text, type Actor, type Env, type Envelope, type FormSubmission, type PolicySendOrigin, Refusal } from './model'
import { commitEnvelope, previousCommand, type Guard } from './storage'
import { useTemplate } from './templates'
import { evaluateSendPolicy } from './send-policies'
import { ApiRateLimit } from './api-limits'
import { liveForm, formTurnstile } from './web-forms'
import { openLink } from './links'
import { signingContext, signerCookie } from './signing'
import { dispatchMail } from './mail'

const hour=3600000,day=24*hour
/** Submission consumes the verified email grant and all form quotas in the envelope's own creation transaction. */
export async function submitForm(env:Env,request:Request,formId:string,input:Record<string,unknown>){
 insist(Object.keys(input).every(k=>['name','admissionToken','turnstileToken','commandId'].includes(k)),'A submission supplies only the verified person’s name; recipients, fields and the template stay fixed.')
 const name=text(input.name,'your name',200),token=text(input.admissionToken,'your verified-email admission token',64),commandId=text(input.commandId,'a command ID',100)
 insist(/^[a-f0-9]{64}$/.test(token),'Use the verified-email admission token.',401)
 const form=await liveForm(env,formId),at=Date.now(),hash=await sha256(token)
 const challenge=await env.DB.prepare('SELECT id,email,email_hash,verified_at,grant_expires FROM iw_form_challenges WHERE form_id=? AND grant_hash=? AND verified_at IS NOT NULL AND grant_expires>?').bind(formId,hash,at).first<{id:string;email:string;email_hash:string;verified_at:number;grant_expires:number}>()
 insist(challenge,'This verified-email admission expired or was already used.',401)
 await formTurnstile(env,request,input.turnstileToken,'inkwell_form_submit')
 const ip=request.headers.get('cf-connecting-ip');insist(ip,'The submission network address is unavailable.',503)
 const ipHash=await sha256(`${env.SESSION_SECRET}:form-ip:${ip}`),date=new Date(at).toISOString().slice(0,10)
 const quota:Guard[]=[
  {sql:'(SELECT total_count FROM iw_forms WHERE id=?)<?',values:[formId,form.definition.totalLimit]},
  {sql:'COALESCE((SELECT count FROM iw_form_daily_counts WHERE form_id=? AND day=?),0)<?',values:[formId,date,form.definition.dailyLimit]},
  {sql:'NOT EXISTS(SELECT 1 FROM iw_form_submissions WHERE form_id=? AND email_hash=? AND at>?)',values:[formId,challenge.email_hash,at-day]},
  {sql:'(SELECT COUNT(*) FROM iw_form_submissions WHERE ip_hash=? AND at>?)<10',values:[ipHash,at-hour]},
 ]
 for(const q of quota)if(!await env.DB.prepare(`SELECT 1 WHERE ${q.sql}`).bind(...q.values).first())throw new ApiRateLimit(3600)
 const owner=await env.DB.prepare(`SELECT id,display_name AS name,email,version FROM oa_operators WHERE id=?`).bind(form.row.owner_id).first<Omit<Actor,'role'>>()
 insist(owner,'The form publisher is unavailable.',403)
 const actor:Actor={...owner,role:form.row.owner_role,formId:`${formId}:${challenge.id}`},origin:PolicySendOrigin={source:'web_form',principal:actor.id,credential:{kind:'web_form',id:formId}}
 const submission:FormSubmission={id:formId,principal:actor.id,publicRole:form.definition.publicRole,verifiedAt:new Date(challenge.verified_at).toISOString(),submittedAt:now()}
 const decision=await evaluateSendPolicy(env,{template:{id:form.row.template_id},sendOrigin:origin} as Envelope,actor.id,{deferred:false,approved:false,stage:'request'})
 const autonomous=decision.allowed&&decision.record.mode==='autonomous'
 const fingerprint=await sha256(canonical({form:formId,name,challenge:challenge.id})),receiptActor=`form:${formId}:${challenge.id}`
 // The grant is single-use. Concurrent retries lose the same atomic fence and cannot create a second envelope.
 insist(!await previousCommand(env.DB,receiptActor,commandId,fingerprint),'This submission was already completed. Open its emailed signing invitation.',409)
 const context={actor,commandId,fingerprint,client:clientEvidence(request),guards:[...form.guards,decision.versionFence,...quota,{sql:'EXISTS(SELECT 1 FROM iw_form_challenges WHERE id=? AND grant_hash=? AND grant_expires>?)',values:[challenge.id,hash,at]}],form:{submission,...(autonomous?{origin}:{}),writes:async(envelope:Envelope)=>{
  await appendEvent(envelope,autonomous?'form.submitted':'form.submission_held',`form:${formId}`,{formSubmission:submission,verifiedEmail:challenge.email,sendPolicy:decision.record,...clientEvidence(request)})
  return [env.DB.prepare('INSERT INTO iw_form_submissions(challenge_id,form_id,envelope_id,at,email_hash,ip_hash) VALUES(?,?,?,?,?,?)').bind(challenge.id,formId,envelope.id,at,challenge.email_hash,ipHash),env.DB.prepare('UPDATE iw_form_challenges SET grant_hash=NULL,grant_expires=NULL WHERE id=?').bind(challenge.id),env.DB.prepare('UPDATE iw_forms SET total_count=total_count+1 WHERE id=?').bind(formId),env.DB.prepare('INSERT INTO iw_form_daily_counts(form_id,day,count) VALUES(?,?,1) ON CONFLICT(form_id,day) DO UPDATE SET count=count+1').bind(formId,date)]
 }}}
 const recipients=form.definition.fixedRecipients.map((fixed,i)=>i===form.definition.publicRole?{name,email:challenge.email}:fixed)
 let result:Awaited<ReturnType<typeof useTemplate>>
 try{result=await useTemplate(env,context,{id:form.row.template_id,recipients},autonomous)}catch(error){if(error instanceof Refusal&&error.status===409)for(const q of quota)if(!await env.DB.prepare(`SELECT 1 WHERE ${q.sql}`).bind(...q.values).first())throw new ApiRateLimit(3600);throw error}
 await dispatchMail(env,result.id)
 if(!autonomous||!('status' in result)||result.status!=='awaiting_signature')return {result:{id:result.id,status:'held',message:'The form publisher must review and confirm eligibility before an invitation can be sent.'}}
 // The admission code verified this exact recipient's mailbox before creation. Carry that evidence into the normal signer session.
 const row=await env.DB.prepare('SELECT link_sealed FROM iw_signers WHERE envelope_id=? AND signer=?').bind(result.id,submission.publicRole).first<{link_sealed:string|null}>()
 const invitation=await openLink(env,result.id,submission.publicRole,row?.link_sealed??null)
 insist(invitation,'Open the signing invitation sent to your verified email.',409)
 const signing=await signingContext(env,invitation,request),session=secret(),after=structuredClone(signing.envelope)
 await appendEvent(after,'signer.email_verified',`signer:${submission.publicRole+1}`,{signer:submission.publicRole,email:challenge.email,method:'web-form email code',form:formId,...clientEvidence(request)})
 await commitEnvelope(env,signing.envelope,after,null,[env.DB.prepare('UPDATE iw_signers SET session_hash=?,session_expires=? WHERE envelope_id=? AND signer=?').bind(await sha256(session),at+day,result.id,submission.publicRole)],[{sql:'EXISTS(SELECT 1 FROM iw_signers WHERE envelope_id=? AND signer=? AND token_hash=?)',values:[result.id,submission.publicRole,await sha256(invitation)]}])
 return {result:{id:result.id,status:'awaiting_signature',signingPath:`/sign/${invitation}`},cookie:signerCookie(env,invitation,session)}
}
