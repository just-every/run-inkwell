import { operatorMail } from '../mail.server.mjs'
import { htmlBody } from './mail'
import { canonical, id, insist, now, object, randomCode, Refusal, secret, sha256, text, type Actor, type Env } from './model'
import { atomic, commandWrite, memberRoleSql, previousCommand, roleGuard, type Guard } from './storage'
import { loadTemplate } from './templates'
import { visibleSql } from './template-shares'
import type { CommandContext } from './envelopes'

const minute=60_000, hour=60*minute, day=24*hour
interface FormDefinition { title:string; publicRole:number; fixedRecipients:({name:string;email:string}|null)[]; totalLimit:number; dailyLimit:number; expiresAt:string }
interface FormRow { id:string; owner_id:string; owner_version:number; owner_role:Actor['role']; template_id:string; template_version:number; template_hash:string; data:string; created_at:string; disabled_at:string|null; suspended_at:string|null }
interface Permission {member_id:string;enabled:number;version:number;actor:string;at:string}
const permissionView=(row:Permission)=>({memberId:row.member_id,enabled:Boolean(row.enabled),version:row.version,actor:row.actor,at:row.at})
const address=(value:unknown)=>{const email=text(value,'an email address',254).toLowerCase();insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter a valid email address.');return email}
/** Native sessions alone manage forms. A grant never lends record access or sending authority. */
async function publisherGuard(env:Env,actor:Actor) {
 insist(actor.sessionId&&!actor.agentId&&!actor.apiKeyId&&['owner','admin','sender'].includes(actor.role),'Use a native owner, admin or permitted sender session to manage web forms.',403)
 if(actor.role!=='sender')return [] as Guard[]
 const permission=await env.DB.prepare('SELECT version FROM iw_form_permissions WHERE member_id=? AND enabled=1').bind(actor.id).first<{version:number}>()
 insist(permission,'Your administrator has not granted permission to manage web forms.',403)
 return [{sql:'EXISTS(SELECT 1 FROM iw_form_permissions WHERE member_id=? AND enabled=1 AND version=?)',values:[actor.id,permission.version]}]
}
export async function formPermissions(env:Env){return {permissions:(await env.DB.prepare('SELECT * FROM iw_form_permissions ORDER BY member_id').all<Permission>()).results.map(permissionView)}}
export async function setFormPermission(env:Env,context:CommandContext,input:Record<string,unknown>){
 const {actor}=context;insist(actor.sessionId&&!actor.agentId&&!actor.apiKeyId&&['owner','admin'].includes(actor.role),'Only a signed-in owner or admin grants web-form management.',403)
 const previous=await previousCommand(env.DB,actor.id,context.commandId,context.fingerprint);if(previous)return previous
 const member=text(input.memberId,'a member ID',100);insist(typeof input.enabled==='boolean','Choose whether this sender can manage web forms.')
 const before=await env.DB.prepare('SELECT * FROM iw_form_permissions WHERE member_id=?').bind(member).first<Permission>()
 insist(input.expectedVersion===(before?.version??0),'This permission changed. Refresh before saving.',409)
 const after:Permission={member_id:member,enabled:input.enabled?1:0,version:(before?.version??0)+1,actor:actor.id,at:now()},result=permissionView(after)
 await atomic(env.DB,[roleGuard(actor,['owner','admin']),{sql:`EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=? AND o.status='active' AND o.role='member' AND ${memberRoleSql('o.id')}='sender')`,values:[member]},{sql:'COALESCE((SELECT version FROM iw_form_permissions WHERE member_id=?),0)=?',values:[member,before?.version??0]}],[env.DB.prepare('INSERT INTO iw_form_permissions(member_id,enabled,version,actor,at) VALUES(?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET enabled=excluded.enabled,version=excluded.version,actor=excluded.actor,at=excluded.at').bind(member,after.enabled,after.version,after.actor,after.at),env.DB.prepare('INSERT INTO iw_form_permission_versions(member_id,version,actor,at,before_value,after_value) VALUES(?,?,?,?,?,?)').bind(member,after.version,after.actor,after.at,JSON.stringify(before?permissionView(before):null),JSON.stringify(result)),commandWrite(env.DB,actor.id,context.commandId,context.fingerprint,result)])
 return result
}
const templateGuard=(owner:Actor,template:{id:string})=>{
 const visible=visibleSql(owner),copies=visible.sql.match(/\?1/g)?.length??0
 return {sql:`EXISTS(SELECT 1 FROM iw_templates t WHERE t.id=? AND t.data=? AND ${visible.sql.replaceAll('?1','?')})`,values:[template.id,JSON.stringify(template),...(copies?Array.from({length:copies},()=>owner.id):visible.values)]} as Guard
}
const metadata=(row:FormRow)=>({id:row.id,ownerId:row.owner_id,templateId:row.template_id,templateVersion:row.template_version,...JSON.parse(row.data) as FormDefinition,createdAt:row.created_at,disabledAt:row.disabled_at,suspendedAt:row.suspended_at,admissionOnly:true})
export async function listForms(env:Env,actor:Actor){
 await publisherGuard(env,actor)
 const rows=(await env.DB.prepare(`SELECT * FROM iw_forms ${actor.role==='sender'?'WHERE owner_id=?':''} ORDER BY created_at,id`).bind(...(actor.role==='sender'?[actor.id]:[])).all<FormRow>()).results
 return {forms:rows.map(metadata)}
}
/** A publication is an immutable pinned definition. Republish creates a new ID and never transfers ownership. */
export async function publishForm(env:Env,context:CommandContext,input:Record<string,unknown>){
 const {actor}=context,permissions=await publisherGuard(env,actor)
 const previous=await previousCommand(env.DB,actor.id,context.commandId,context.fingerprint);if(previous)return previous
 const {template}=await loadTemplate(env,actor,text(input.templateId,'a template ID',100),'use')
 insist(input.templateVersion===(template.version??1),'Choose the current pinned template version.',409)
 insist(Number.isInteger(input.publicRole)&&Number(input.publicRole)>=0&&Number(input.publicRole)<template.roles.length,'Choose one public template role.')
 const publicRole=Number(input.publicRole),role=template.roles[publicRole]
 insist(!role.action&&!role.sms&&!role.accessCode&&!role.witnesses&&!role.unresolvedIdentity&&!role.delegates&&!role.includeWhen,'The public role must be a named email-verified signer without delegated actions or conditional routing.')
 insist(Array.isArray(input.fixedRecipients)&&input.fixedRecipients.length===template.roles.length,'Fix every other template role to one recipient.')
 const fixedRecipients=input.fixedRecipients.map((value,i)=>{
  if(i===publicRole){insist(value===null,'The public role is filled only by the verified submitter.');return null}
  const person=object(value);insist(Object.keys(person).every(k=>['name','email'].includes(k)),'Fixed recipients contain only name and email.')
  return {name:text(person.name,'a fixed recipient name',200),email:address(person.email)}
 })
 const limit=(value:unknown,fallback:number,max:number,label:string)=>{const n=value??fallback;insist(Number.isInteger(n)&&Number(n)>=1&&Number(n)<=max,`${label} must be 1–${max}.`);return Number(n)}
 const totalLimit=limit(input.totalLimit,100,10_000,'Total submissions'),dailyLimit=limit(input.dailyLimit,50,10_000,'Daily submissions'),expiryDays=limit(input.expiryDays,90,365,'Expiry days')
 const definition:FormDefinition={title:text(input.title??template.title,'a form title',200),publicRole,fixedRecipients,totalLimit,dailyLimit,expiresAt:new Date(Date.now()+expiryDays*day).toISOString()}
 const formId=id(),at=now(),hash=await sha256(canonical(template)),result={form:{id:formId,ownerId:actor.id,templateId:template.id,templateVersion:template.version??1,...definition,createdAt:at,disabledAt:null,suspendedAt:null,admissionOnly:true}}
 await atomic(env.DB,[roleGuard(actor),...permissions,templateGuard(actor,template)],[env.DB.prepare('INSERT INTO iw_forms(id,owner_id,owner_version,owner_role,template_id,template_version,template_hash,data,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(formId,actor.id,actor.version,actor.role,template.id,template.version??1,hash,JSON.stringify(definition),at),env.DB.prepare('INSERT INTO iw_form_versions(id,actor,at,data) VALUES(?,?,?,?)').bind(formId,actor.id,at,JSON.stringify(result.form)),commandWrite(env.DB,actor.id,context.commandId,context.fingerprint,result)])
 return result
}
export async function disableForm(env:Env,context:CommandContext,formId:string){
 const {actor}=context;await publisherGuard(env,actor)
 const row=await env.DB.prepare('SELECT * FROM iw_forms WHERE id=?').bind(formId).first<FormRow>()
 insist(row&&(row.owner_id===actor.id||['owner','admin'].includes(actor.role)),'Web form not found.',404)
 await atomic(env.DB,[roleGuard(actor)],[env.DB.prepare('UPDATE iw_forms SET disabled_at=COALESCE(disabled_at,?) WHERE id=?').bind(now(),formId)])
 return {disabled:formId}
}
/** Recheck owner, permission, template version and use access; no public door exposes fixed recipients. */
async function liveForm(env:Env,formId:string){
 const row=await env.DB.prepare('SELECT * FROM iw_forms WHERE id=?').bind(formId).first<FormRow>()
 insist(row&&!row.disabled_at&&!row.suspended_at,'This web form is unavailable.',404)
 const definition=JSON.parse(row.data) as FormDefinition
 insist(definition.expiresAt>now(),'This web form expired.',410)
 const owner=await env.DB.prepare(`SELECT o.id,o.display_name AS name,o.email,o.version,CASE WHEN o.role='member' THEN ${memberRoleSql('o.id')} ELSE o.role END AS role FROM oa_operators o WHERE o.id=? AND o.version=? AND o.status='active'`).bind(row.owner_id,row.owner_version).first<Actor>()
 insist(owner&&owner.role===row.owner_role&&['owner','admin','sender'].includes(owner.role),'This web form owner no longer qualifies.',403)
 const guards:Guard[]=[roleGuard(owner),{sql:"EXISTS(SELECT 1 FROM iw_forms WHERE id=? AND disabled_at IS NULL AND suspended_at IS NULL AND data=? AND json_extract(data,'$.expiresAt')>max(?,strftime('%Y-%m-%dT%H:%M:%fZ','now')))",values:[row.id,row.data,now()]}]
 if(owner.role==='sender')guards.push({sql:'EXISTS(SELECT 1 FROM iw_form_permissions WHERE member_id=? AND enabled=1)',values:[owner.id]})
 for(const guard of guards)insist(await env.DB.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first(),'This web form owner no longer qualifies.',403)
 const {template}=await loadTemplate(env,owner,row.template_id,'use')
 insist((template.version??1)===row.template_version&&await sha256(canonical(template))===row.template_hash,'This web form template changed. Its owner must republish it.',409)
 guards.push(templateGuard(owner,template))
 return {row,definition,template,guards}
}
export async function publicForm(env:Env,formId:string){const {definition,template}=await liveForm(env,formId);return {title:definition.title,role:template.roles[definition.publicRole].role,expiresAt:definition.expiresAt,admissionOnly:true}}
async function turnstile(env:Env,request:Request,token:unknown,action:string){
 insist(typeof token==='string'&&token.length>0&&token.length<=2048,'Complete the bot check.',403)
 insist(env.TURNSTILE_SECRET_KEY,'Web-form bot protection is not configured.',503)
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token,...(request.headers.get('cf-connecting-ip')?{remoteip:request.headers.get('cf-connecting-ip')!}:{})})})
 insist(response.ok,'The bot check is unavailable. Try again.',503)
 const verified=await response.json() as {success?:boolean;hostname?:string;action?:string}
 insist(verified.success===true&&verified.hostname===new URL(env.AUTH_ORIGIN).hostname&&verified.action===action,'The bot check was refused.',403)
}
export async function purgeFormAttempts(env:Env,at:number){await env.DB.prepare('DELETE FROM iw_form_challenges WHERE created_at<=?').bind(at-day).run()}
/** A code request never creates an envelope and is counted even if mail delivery fails or becomes uncertain. */
export async function requestFormCode(env:Env,request:Request,formId:string,input:Record<string,unknown>){
 const form=await liveForm(env,formId),email=address(input.email)
 await turnstile(env,request,input.turnstileToken,'inkwell_form_code')
 const sender=operatorMail(env);insist(sender&&env.MAIL_FROM,'Web-form verification mail is not configured.',503)
 const at=Date.now();await purgeFormAttempts(env,at)
 const emailHash=await sha256(`${env.SESSION_SECRET}:${formId}:${email}`),challenge=id(),code=randomCode(),hash=await sha256(`${env.SESSION_SECRET}:${challenge}:${code}`)
 const quota:Guard={sql:'(SELECT COUNT(*) FROM iw_form_challenges WHERE form_id=? AND email_hash=? AND created_at>?)<3',values:[formId,emailHash,at-hour]}
 if(!await env.DB.prepare(`SELECT 1 WHERE ${quota.sql}`).bind(...quota.values).first())throw new Refusal('This email has reached the three-code hourly limit.',429,'form_code_limit')
 await atomic(env.DB,[...form.guards,quota],[env.DB.prepare('INSERT INTO iw_form_challenges(id,form_id,email,email_hash,code_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(challenge,formId,email,emailHash,hash,at,at+10*minute)])
 let state='uncertain'
 try{const body=`Your Inkwell web-form verification code is ${code}.\nIt expires in 10 minutes.\nForm: ${form.definition.title}`;const result=await sender.send({deliveryId:challenge,from:env.MAIL_FROM,to:[email],subject:'Your Inkwell web-form verification code',text:body,html:htmlBody(body,'Verify your email'),headers:{'Auto-Submitted':'auto-generated'}});state=['accepted','development'].includes(result.status)?'sent':result.status}catch{state='uncertain'}
 await env.DB.prepare('UPDATE iw_form_challenges SET mail_state=? WHERE id=?').bind(state,challenge).run()
 return {challengeId:challenge,expiresInSeconds:600}
}
/** Verified admission is a short-lived, once-visible token. It grants no signing or send authority on its own. */
export async function verifyFormEmail(env:Env,request:Request,formId:string,input:Record<string,unknown>){
 const form=await liveForm(env,formId);await turnstile(env,request,input.turnstileToken,'inkwell_form_verify')
 insist(Object.keys(input).every(k=>['challengeId','code','turnstileToken'].includes(k)),'Email verification cannot change recipients, fields or the form definition.')
 const challenge=text(input.challengeId,'a verification challenge',100),code=text(input.code,'the six-digit email code',6)
 insist(/^\d{6}$/.test(code),'Enter the six-digit email code.')
 const row=await env.DB.prepare('SELECT * FROM iw_form_challenges WHERE id=? AND form_id=?').bind(challenge,formId).first<{code_hash:string|null;expires_at:number;attempts:number;verified_at:number|null}>(),at=Date.now()
 insist(row&&row.code_hash&&row.expires_at>at&&row.attempts<5&&!row.verified_at,'This email code expired, was used, or reached its attempt limit.',401)
 const correct=await sha256(`${env.SESSION_SECRET}:${challenge}:${code}`)===row.code_hash,token=correct?secret():null
 const guard:Guard={sql:'EXISTS(SELECT 1 FROM iw_form_challenges WHERE id=? AND form_id=? AND attempts=? AND attempts<5 AND code_hash=? AND expires_at>? AND verified_at IS NULL)',values:[challenge,formId,row.attempts,row.code_hash,at]}
 await atomic(env.DB,[...form.guards,guard],[correct?env.DB.prepare('UPDATE iw_form_challenges SET attempts=attempts+1,verified_at=?,code_hash=NULL,grant_hash=?,grant_expires=? WHERE id=?').bind(at,await sha256(token!),at+10*minute,challenge):env.DB.prepare('UPDATE iw_form_challenges SET attempts=attempts+1 WHERE id=?').bind(challenge)])
 insist(correct,'The email verification code is incorrect.',401)
 return {verified:true,admissionToken:token,expiresInSeconds:600,admissionOnly:true}
}
