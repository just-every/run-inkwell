import { mailbox, htmlText, authFailed } from './inbound-content'
import { normalizeInbound, createResendAttachmentFetcher } from '../mail-inbound.server.mjs'
import { operatorMail } from '../mail.server.mjs'
import { appendEvent, id, insist, now, sha256, text, type Actor, type Env, type Envelope } from './model'
import { atomic, commitEnvelope, getEnvelope, roleGuard, type Guard } from './storage'
import { insistAccess } from './members'
import { blobWrites, readBlob, download } from './blobs'
import { parsePdf } from './pdf'
import { prepareEnvelope } from './envelopes'
import { draftDetail } from './drafts'
import { dispatchMail, noticeWrite, htmlBody } from './mail'

type Data = Record<string, any>
type Capability = {id:string;envelope_id:string|null;kind:string;data:string;state:string}
async function capability(env:Env, key:string) {
 const secret=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',secret,new TextEncoder().encode('inkwell-agent-workflow:'+key))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}
const address = async(env:Env,key:string)=>`agent+${await capability(env,key)}@${env.MAIL_INBOUND_DOMAIN}`
function configured(env:Env) { insist(env.MAIL_INBOUND_DOMAIN&&env.MAIL_INBOUND_SECRET&&env.MAIL_INBOUND_API_KEY&&operatorMail(env)&&env.MAIL_FROM,'Configure authenticated inbound and outbound email first.',409) }
function person(actor:Actor) { insist(!actor.agentId&&!actor.apiKeyId&&['owner','admin','sender'].includes(actor.role),'A current member must authorize this action.',403) }
async function attachmentRows(env:Env,eid:string) { return(await env.DB.prepare('SELECT data FROM iw_agent_attachments WHERE envelope_id=? ORDER BY rowid').bind(eid).all<{data:string}>()).results.map(r=>JSON.parse(r.data)) }
function draft(e:Envelope) { insist(!e.testMode&&!e.imported&&e.status==='prepared'&&e.internalApproval?.state!=='pending'&&Date.parse(e.expiresAt)>Date.now(),'Use an unlocked, unexpired native draft.',409) }
function email(value:unknown) { const result=text(value,'an email address',254).toLowerCase();insist(/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(result),'Use one email address.');return result }
function authority(actor:Actor,e:Envelope):Guard[] { return [roleGuard(actor),{sql:"EXISTS(SELECT 1 FROM iw_envelopes WHERE id=? AND (? IN ('owner','admin') OR json_extract(data,'$.createdBy')=? OR EXISTS(SELECT 1 FROM iw_effective_shares WHERE envelope_id=? AND operator_id=? AND access='edit')))",values:[e.id,actor.role,actor.id,e.id,actor.id]}] }
async function stored(env:Env,eid:string) { return(await env.DB.prepare('SELECT id,data,state FROM iw_agent_requests WHERE envelope_id=? ORDER BY rowid').bind(eid).all<{id:string;data:string;state:string}>()).results.map(r=>({id:r.id,...JSON.parse(r.data),state:r.state})) }
export async function informationView(env:Env,actor:Actor,e:Envelope) {
 person(actor);await insistAccess(env,actor,e,'edit')
 const attachments=await attachmentRows(env,e.id)
 return {attachments,missing:[...e.fields.filter(f=>f.type==='title'&&!f.prefill).map(f=>({kind:'title',fieldId:f.id,signer:f.signer})),...(!attachments.some(s=>s.label==='W-9')?[{kind:'w9'}]:[])],requests:await stored(env,e.id),replies:(await env.DB.prepare('SELECT data FROM iw_followup_replies WHERE envelope_id=? ORDER BY rowid').bind(e.id).all<{data:string}>()).results.map(r=>JSON.parse(r.data))}
}
export async function requestInformation(env:Env,actor:Actor,input:Data) {
 person(actor);configured(env);insist(input.approveContact===true,'Explicitly approve the person to contact.')
 const before=await getEnvelope(env.DB,text(input.id,'an envelope ID'));await insistAccess(env,actor,before,'edit');draft(before)
 const recipient=email(input.email),kind=input.kind;insist(kind==='title'||kind==='w9','Choose a missing signer title or W-9.')
 const field=kind==='title'?before.fields.find(f=>f.id===input.fieldId&&f.type==='title'&&!f.prefill):undefined
 if(kind==='title')insist(field&&before.signers[field.signer].email===recipient,'Ask the current client signer for their missing title.')
 else insist(!(await attachmentRows(env,before.id)).some(s=>s.label==='W-9'),'The W-9 is already attached.',409)
 insist(!(await stored(env,before.id)).some(r=>r.kind===kind&&r.fieldId===field?.id&&['pending','sending','sent','uncertain'].includes(r.state)),'This question is already outstanding.',409)
 const key=id(),at=now(),question=kind==='title'?'What is your signing title? Reply with only your title.':'Please reply with the missing W-9 as one PDF attachment.',data={kind,recipient,fieldId:field?.id,originalSha256:before.originalSha256,actor:{...actor,sessionId:undefined},at,question},after=structuredClone(before)
 await appendEvent(after,'agent.information_requested',actor.id,{request:key,kind,agent:'deterministic v1'})
 await commitEnvelope(env,before,after,actor,[env.DB.prepare('INSERT INTO iw_agent_requests VALUES(?,?,?,?)').bind(key,before.id,JSON.stringify({...data,actor:undefined}),'pending'),env.DB.prepare('INSERT INTO iw_agent_work_caps(id,token_hash,envelope_id,kind,data) VALUES(?,?,?,?,?)').bind(key,await sha256(await capability(env,key)),before.id,'information',JSON.stringify(data))])
 // Durable claim precedes the sole outbound attempt. Uncertain delivery is never retried automatically.
 await atomic(env.DB,[...authority(data.actor,after),{sql:"EXISTS(SELECT 1 FROM iw_agent_work_caps WHERE id=? AND state='active')",values:[key]}],[env.DB.prepare("UPDATE iw_agent_requests SET state='sending' WHERE id=?").bind(key)])
 let state='uncertain'
 try { const result=await operatorMail(env)!.send({deliveryId:key,from:env.MAIL_FROM!,to:[recipient],subject:'Information needed: '+before.title,text:question,html:htmlBody(question,'Reply with information'),...{replyTo:await address(env,key)},headers:{}});if(['accepted','development'].includes(result.status))state='sent' }catch{}
 await env.DB.prepare('UPDATE iw_agent_requests SET state=? WHERE id=?').bind(state,key).run()
 return {id:before.id,requestId:key,state}
}
export async function configureInbound(env:Env,actor:Actor,input:Data) {
 person(actor);insist(actor.role==='owner','Only the owner grants inbound agreement handling.',403);configured(env)
 if(input.revoke){await atomic(env.DB,[roleGuard(actor,['owner'])],[env.DB.prepare("UPDATE iw_agent_work_caps SET state='revoked' WHERE kind='inbound'")]);return{revoked:true}}
 insist(input.approve===true,'Explicitly grant inbound preparation.');const role=text(input.role,'a business signing role',100),memberId=text(input.memberId,'an internal signer'),forwarder=email(input.forwarder),returnTo=email(input.returnTo)
 const member=await env.DB.prepare("SELECT id,display_name,email,version FROM oa_operators o WHERE id=? AND status='active' AND (role IN ('owner','admin') OR (role='member' AND COALESCE((SELECT role FROM iw_member_roles WHERE operator_id=o.id),'viewer')='sender'))").bind(memberId).first<Data>();insist(member,'Choose an active internal signer with sender authority.')
 const key=id(),data={actor:{...actor,sessionId:undefined},role,member,forwarder,returnTo,allowReturn:input.allowReturn===true,at:now()}
 await atomic(env.DB,[roleGuard(actor,['owner'])],[env.DB.prepare("UPDATE iw_agent_work_caps SET state='revoked' WHERE kind='inbound'"),env.DB.prepare('INSERT INTO iw_agent_work_caps(id,token_hash,kind,data) VALUES(?,?,?,?)').bind(key,await sha256(await capability(env,key)),'inbound',JSON.stringify(data))])
 return {grantId:key,address:await address(env,key),role,memberId,allowReturn:data.allowReturn}
}
export async function receiveAgentMessage(env:Env,eventId:string,emailId:string,message:Data):Promise<boolean> {
 const addresses=(message.to??[]) as string[],tokens=addresses.map(a=>mailbox(a,true)?.match(/^agent\+([A-Za-z0-9_-]{43})@(.+)$/)).filter(Boolean)
 if(!tokens.length)return false
 insist(tokens.length===1&&tokens[0]![2].toLowerCase()===env.MAIL_INBOUND_DOMAIN?.toLowerCase(),'No unique inbound agent address.',403)
 const cap=await env.DB.prepare("SELECT * FROM iw_agent_work_caps WHERE token_hash=? AND state='active'").bind(await sha256(tokens[0]![1])).first<Capability>();insist(cap,'This inbound grant is unknown or revoked.',403)
 insist(!await env.DB.prepare('SELECT 1 FROM iw_agent_work_receipts WHERE provider_message_id=?').bind(emailId).first(),'This provider message was already received.',409)
 const data:Data=JSON.parse(cap.data),actor:Actor=data.actor
 const sender=mailbox(typeof message.from==='string'?message.from:''),headers=Object.fromEntries(Object.entries(message.headers??{}).map(([k,v])=>[k.toLowerCase(),String(v)]))
 const verified=sender===(cap.kind==='information'?data.recipient:data.forwarder)&&(!headers.from||mailbox(headers.from)===sender)&&!authFailed(message,new Map(Object.entries(headers)))
 insist(verified,'The inbound sender is unverified; no action was taken.',403)
 const normalized=await normalizeInbound({provider:'resend',signedEmailId:emailId,email:message,fetchAttachment:createResendAttachmentFetcher({apiKey:env.MAIL_INBOUND_API_KEY!,maxAttachmentBytes:10*1024*1024})},{maxRawBytes:16*1024*1024,maxBodyBytes:500_000,maxAttachments:2,maxAttachmentBytes:10*1024*1024,maxTotalAttachmentBytes:10*1024*1024})
 const scrub=(value:string)=>value.replace(new RegExp(tokens[0]![1],'gi'),'[capability omitted]')
 const body=scrub(normalized.text??htmlText(normalized.html??'')),at=now(),replyId=id(),attachments=await Promise.all(normalized.attachments.map(async a=>({name:scrub(a.filename),type:a.contentType,size:a.content.length,sha256:await sha256(a.content)})))
 const reply={id:replyId,receivedAt:at,provider:'resend',providerMessageId:emailId,verified:true,senderLabel:'provider-reported sender',headers:{from:sender,to:[],date:'',subject:scrub(String(message.subject??'').slice(0,8192)),messageId:scrub(String(message.message_id??'').slice(0,8192)),inReplyTo:'',autoSubmitted:''},body,bodyBytes:new TextEncoder().encode(body).length,bodyStatus:'kept',attachments}
 const receipt=env.DB.prepare('INSERT INTO iw_followup_receipts VALUES(?,?)').bind(eventId,at),messageReceipt=env.DB.prepare('INSERT INTO iw_agent_work_receipts VALUES(?,?,?)').bind(emailId,eventId,at),capGuard:Guard={sql:"EXISTS(SELECT 1 FROM iw_agent_work_caps WHERE id=? AND state='active')",values:[cap.id]}
 if(cap.kind==='information'){
  const before=await getEnvelope(env.DB,cap.envelope_id!);draft(before);insist(before.originalSha256===data.originalSha256,'The source draft changed; request the information again.',409)
  const after=structuredClone(before),writes:D1PreparedStatement[]=[receipt,messageReceipt],source=`Authenticated email ${emailId} from ${sender}`
  // Only a tightly bounded title-only answer is applied. Any material-term language is escalated.
  const material=/\b(price|cost|fee|payment|discount|amount|rate|consideration|compensation|term|liability|indemn|change|instead|lower|reduce|increase|replace|amend|revise)\b|[$€£]/.test(body.toLowerCase())
  let outcome='flagged'
  if(!material&&data.kind==='title'){
   const field=after.fields.find(f=>f.id===data.fieldId&&f.type==='title'&&!f.prefill)
   insist(field&&after.signers[field.signer].email===sender,'The signer or title field changed.',409)
   if(body.trim().length>0&&body.trim().length<=100&&!/[\r\n\x00-\x1f\d]/.test(body.trim())&&attachments.length===0){field.prefill={value:body.trim(),source};outcome='merged'}
  }else if(!material&&data.kind==='w9'&&attachments.length===1&&attachments[0].type==='application/pdf'){
   const attachment=normalized.attachments[0],parsed=await parsePdf(attachment.content)
   insist(!(await attachmentRows(env,before.id)).some(a=>a.label==='W-9'),'The W-9 was already received.',409)
   const metadata={id:cap.id,label:'W-9',filename:'w9.pdf',sha256:attachments[0].sha256,bytes:attachment.content.length,pages:parsed.pageSizes.length,source:{replyId,providerMessageId:emailId,from:sender,at}}
   writes.push(...blobWrites(env.DB,after.id,`agent-${cap.id}`,attachment.content),env.DB.prepare('INSERT INTO iw_agent_attachments VALUES(?,?,?)').bind(cap.id,after.id,JSON.stringify(metadata)));outcome='merged'
  }
  const request=JSON.parse((await env.DB.prepare('SELECT data FROM iw_agent_requests WHERE id=?').bind(cap.id).first<{data:string}>())!.data)
  writes.push(env.DB.prepare('UPDATE iw_agent_requests SET state=?,data=? WHERE id=?').bind(outcome,JSON.stringify({...request,answer:{replyId,providerMessageId:emailId,from:sender,at,attachments}}),cap.id),env.DB.prepare("UPDATE iw_agent_work_caps SET state='used' WHERE id=?").bind(cap.id),env.DB.prepare('INSERT INTO iw_followup_replies VALUES(?,?,?,?)').bind(replyId,before.id,0,JSON.stringify(reply)))
  if(outcome==='merged'&&data.kind==='title')await appendEvent(after,'envelope.updated','agent:information',draftDetail(after))
  await appendEvent(after,outcome==='merged'?'agent.information_merged':'agent.material_change_flagged','agent:information',{request:cap.id,reply:replyId,kind:data.kind,agent:'deterministic v1'})
  await commitEnvelope(env,before,after,null,writes,[...authority(actor,before),capGuard])
 }else{
  const guard=roleGuard(actor,['owner']);insist(await env.DB.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first(),'The inbound owner no longer has authority.',403)
  insist(attachments.length===1&&attachments[0].type==='application/pdf','Forward one PDF agreement.',400)
  const member=data.member,live=await env.DB.prepare("SELECT 1 FROM oa_operators o WHERE id=? AND version=? AND status='active' AND (role IN ('owner','admin') OR (role='member' AND COALESCE((SELECT role FROM iw_member_roles WHERE operator_id=o.id),'viewer')='sender'))").bind(member.id,member.version).first();insist(live,'The configured business-role signer is no longer eligible.',403)
  // A separate human reviews placement and eligibility through the ordinary native send door.
  const result=await prepareEnvelope(env,{actor,commandId:'inbound:'+eventId,fingerprint:await sha256(emailId),guards:[capGuard,{sql:"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active')",values:[member.id,member.version]}],preparedWrites:async envelope=>{
   await appendEvent(envelope,'agent.inbound_prepared','agent:inbound',{role:data.role,signer:member.id,source:replyId,originalSha256:envelope.originalSha256})
   return [receipt,messageReceipt,env.DB.prepare('INSERT INTO iw_followup_replies VALUES(?,?,?,?)').bind(replyId,envelope.id,0,JSON.stringify(reply)),env.DB.prepare('INSERT INTO iw_agent_inbound VALUES(?,?)').bind(envelope.id,JSON.stringify({grant:cap.id,role:data.role,source:replyId,providerMessageId:emailId,returnTo:data.returnTo,allowReturn:data.allowReturn})),env.DB.prepare('INSERT INTO iw_shares(envelope_id,operator_id,access,granted_by,granted_at) VALUES(?,?,?,?,?)').bind(envelope.id,member.id,'edit',actor.id,at),noticeWrite(env.DB,envelope,0,member.email,'Inbound agreement prepared','An agreement is ready for human review in Inkwell. No invitation has been sent.')]
  }}, {title:scrub(String(message.subject??'Inbound agreement').slice(0,100))||'Inbound agreement',filename:'inbound-agreement.pdf',pdfBase64:btoa(Array.from(normalized.attachments[0].content,b=>String.fromCharCode(b)).join('')),signers:[{name:member.display_name,email:member.email}],fields:[{id:'internal-signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.8,width:.4,height:.06}]})
  await dispatchMail(env,result.id)
 }
 return true
}

/** Explicit owner action under a still-live grant; claim once before contacting the provider. */
export async function returnInbound(env:Env,actor:Actor,input:Data) {
 person(actor);insist(actor.role==='owner','Only the owner may return an inbound executed record.',403)
 configured(env);const before=await getEnvelope(env.DB,text(input.id,'an envelope ID'));insist(before.status==='completed','Complete the agreement before returning it.',409)
 const row=await env.DB.prepare('SELECT data FROM iw_agent_inbound WHERE envelope_id=?').bind(before.id).first<{data:string}>();insist(row,'This is not an inbound agreement.',404)
 const record:Data=JSON.parse(row.data);insist(record.allowReturn===true,'The grant does not allow returning an executed copy.',403);insist(!record.returned,'The return was already claimed; inspect delivery before taking further action.',409)
 const cap=await env.DB.prepare("SELECT data FROM iw_agent_work_caps WHERE id=? AND state='active'").bind(record.grant).first<{data:string}>();insist(cap,'The return grant is revoked or was not restored.',403)
 const grant=JSON.parse(cap.data),after=structuredClone(before);insist(grant.allowReturn===true&&grant.returnTo===record.returnTo,'The return grant changed.',403)
 const signed=await readBlob(env,before.id,'signed',before.signedSha256),certificate=await readBlob(env,before.id,'certificate',before.certificateSha256),deliveryId=id()
 await appendEvent(after,'agent.inbound_return_claimed',actor.id,{grant:record.grant,delivery:deliveryId,agent:'deterministic v1'})
 await commitEnvelope(env,before,after,actor,[env.DB.prepare('UPDATE iw_agent_inbound SET data=? WHERE envelope_id=?').bind(JSON.stringify({...record,returned:'sending',deliveryId}),before.id)],[roleGuard(grant.actor,['owner']),{sql:"EXISTS(SELECT 1 FROM iw_agent_work_caps WHERE id=? AND state='active')",values:[record.grant]}])
 let outcome='uncertain';try{const result=await operatorMail(env)!.send({deliveryId,from:env.MAIL_FROM!,to:[record.returnTo],subject:'Executed agreement: '+before.title,text:'The executed agreement and certificate are attached.',html:'<p>The executed agreement and certificate are attached.</p>',headers:{},...{attachments:[{filename:'executed-agreement.pdf',contentType:'application/pdf',content:signed},{filename:'certificate.pdf',contentType:'application/pdf',content:certificate}]}});if(['accepted','development'].includes(result.status))outcome='sent'}catch{}
 await env.DB.prepare('UPDATE iw_agent_inbound SET data=? WHERE envelope_id=?').bind(JSON.stringify({...record,returned:outcome,deliveryId}),before.id).run()
 return{id:before.id,outcome}
}

export async function informationArtifact(env:Env,actor:Actor,envelopeId:string,attachmentId:string) {
 person(actor);const e=await getEnvelope(env.DB,envelopeId);await insistAccess(env,actor,e,'edit')
 const attachment=(await attachmentRows(env,e.id)).find(a=>a.id===attachmentId);insist(attachment,'Private source attachment not found.',404)
 return download(await readBlob(env,e.id,`agent-${attachment.id}`,attachment.sha256),attachment.filename)
}
