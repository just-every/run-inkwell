import { appendEvent, insist, now, object, sha256, text, type Actor, type Env } from './model'
import { graph, graphId, graphJson, itemPath } from './microsoft-graph'
import { parsePdf } from './pdf'
import { atomic, roleGuard } from './storage'
import { uploadPdf, uploadedBytes } from './documents'
import { loadTemplate } from './templates'
import { htmlText } from './inbound-content'
import { followupRecipient } from './followup-recipients'
import { resolveReplyCapability, storeReply, followupView } from './followup-store'
import type { FollowupReply } from './followup-inbound-types'
const encode=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))
function administrator(actor:Actor){insist(['owner','admin'].includes(actor.role)&&actor.sessionId&&!actor.apiKeyId&&!actor.agentId,'Only a signed-in owner or admin can use the connected Microsoft mailbox and drive.',403)}
const address=(value:unknown)=>{const a=object(object(value).emailAddress);return{name:text(a.name||a.address,'a participant name',160),email:text(a.address,'a participant email',254).toLowerCase()}}
const list=(value:unknown)=>{insist(Array.isArray(value)&&value.length<=100,'Microsoft returned an invalid recipient list.',502);return value}

export async function microsoftSource(env:Env,actor:Actor,input:Record<string,unknown>){
 administrator(actor)
 const kind=text(input.kind,'OneDrive, SharePoint, Outlook or Word'),token=env.MICROSOFT_GRAPH_ACCESS_TOKEN
 insist(['onedrive','sharepoint','outlook','word'].includes(kind),'Choose a Microsoft source.')
 let bytes:Uint8Array,filename:string,resource:string,participants:{name:string;email:string}[]=[]
 if(kind==='outlook'){
  resource=graphId(input.messageId)
  const message=await graphJson(token,`/me/messages/${encodeURIComponent(resource)}?$select=id,subject,from,toRecipients,ccRecipients`)
  insist(message.id===resource,'Microsoft returned another message.',502)
  const attachments=await graphJson(token,`/me/messages/${encodeURIComponent(resource)}/attachments`);insist(!attachments['@odata.nextLink'],'Choose a message with a complete attachment listing.',409);const files=list(attachments.value).map(object).filter(a=>a['@odata.type']==='#microsoft.graph.fileAttachment'&&a.contentType==='application/pdf'&&!a.isInline)
  const attachment=input.attachmentId?files.find(a=>a.id===input.attachmentId):files.length===1?files[0]:undefined
  insist(attachment,'Choose one PDF attachment from this message.')
  filename=text(attachment.name,'a PDF filename',240)
  const data=text(attachment.contentBytes,'PDF attachment bytes',36_000_000)
  try{bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0))}catch{throw new Error('Invalid Microsoft attachment')}
  const proposed=[address(message.from),...list(message.toRecipients).map(address),...list(message.ccRecipients).map(address)]
  participants=[...new Map(proposed.filter(p=>p.email!==actor.email.toLowerCase()).map(p=>[p.email,p])).values()]
 }else{
  let driveId=input.driveId,itemId=input.itemId
  if(kind==='word'&&input.wordUrl){const url=new URL(text(input.wordUrl,'the open Word document URL',4096));insist(url.protocol==='https:'&&!url.username&&!url.password&&(/\.sharepoint\.com$/i.test(url.hostname)||/\.onedrive\.live\.com$/i.test(url.hostname)),'Use the open document in your connected Microsoft tenant.');const share='u!'+btoa(new TextEncoder().encode(url.href).reduce((s,b)=>s+String.fromCharCode(b),'')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');const opened=await graphJson(token,`/shares/${share}/driveItem`);driveId=object(opened.parentReference).driveId;itemId=opened.id}
  resource=graphId(itemId);const base=itemPath(driveId,resource),metadata=await graphJson(token,base)
  insist(metadata.id===resource&&metadata.file,'Choose a file in the connected drive.',502)
  const original=text(metadata.name,'a Microsoft filename',240)
  insist(kind==='word'?/\.docx?$/i.test(original):/\.(pdf|docx?)$/i.test(original),'Choose a PDF or Word document.')
  const converted=!/\.pdf$/i.test(original)
  bytes=new Uint8Array(await(await graph(token,base+'/content'+(converted?'?format=pdf':''))).arrayBuffer())
  filename=original.replace(/\.(docx?)$/i,'.pdf')
 }
 insist(filename.toLowerCase().endsWith('.pdf')&&bytes.length<=25*1024*1024,'Choose a PDF attachment no larger than 25 MiB.')
 const {document,pageSizes}=await parsePdf(bytes),hash=await sha256(bytes)
 const {documentFields}=await import('./document-fields'),fields=await documentFields(document,pageSizes,[])
 const self=input.self===true
 if(self)participants=[{name:actor.name,email:actor.email}]
 let template: {id:string;title:string;version?:number}|undefined,approvalRule:import('./model').ApprovalRule|undefined
 if(input.templateId){const loaded=(await loadTemplate(env,actor,text(input.templateId,'a filing template'),'use')).template;insist(loaded.originalSha256===hash,'The filing template must use this exact PDF.',409);template={id:loaded.id,title:loaded.title,version:loaded.version??1};approvalRule=loaded.approval}
 const upload=await uploadPdf(env,actor,new Request(env.AUTH_ORIGIN,{method:'POST',body:JSON.stringify({filename,bytes:bytes.length})}))
 for(let offset=0,part=0;offset<bytes.length;offset+=upload.chunkBytes!,part++)await uploadPdf(env,actor,new Request(env.AUTH_ORIGIN,{method:'PUT',body:bytes.slice(offset,offset+upload.chunkBytes!).buffer}),upload.id,String(part))
 const source={kind,id:resource,sha256:hash}
 await atomic(env.DB,[roleGuard(actor,['owner','admin'])],[env.DB.prepare('INSERT INTO iw_microsoft_uploads VALUES(?,?)').bind(upload.id,JSON.stringify({source,template,approvalRule}))])
 return{uploadId:upload.id,filename,pdfBase64:encode(bytes),sha256:hash,participants,fields:self?fields.filter(f=>f.signer===0):fields}
}
export async function consumeMicrosoft(env:Env,actor:Actor,value:unknown){
 administrator(actor);const uploadId=text(value,'a Microsoft upload ID'),row=await env.DB.prepare('SELECT data FROM iw_microsoft_uploads WHERE upload_id=?').bind(uploadId).first<{data:string}>();insist(row,'Load the Microsoft source again.',409)
 const data=JSON.parse(row.data) as {source:{kind:string;id:string;sha256:string};template?:{id:string;title:string;version?:number};approvalRule?:import('./model').ApprovalRule},upload=await uploadedBytes(env,actor,uploadId)
 insist(await sha256(upload.bytes)===data.source.sha256,'The Microsoft PDF fingerprint changed.',409)
 return{...data,bytes:upload.bytes,filename:upload.filename,pdfBase64:encode(upload.bytes)}
}

/** Explicit native intake fetches provider facts; it never accepts a client-supplied body or sends a reply. */
export async function microsoftReply(env:Env,actor:Actor,input:Record<string,unknown>){
 administrator(actor)
 const messageId=graphId(input.messageId),eventId='graph:'+messageId
 insist(!await env.DB.prepare('SELECT 1 FROM iw_followup_receipts WHERE event_id=?').bind(eventId).first(),'This Microsoft reply was already received.',409)
 const message=await graphJson(env.MICROSOFT_GRAPH_ACCESS_TOKEN,`/me/messages/${encodeURIComponent(messageId)}?$select=id,from,toRecipients,subject,body,receivedDateTime,internetMessageId,internetMessageHeaders,hasAttachments`)
 insist(message.id===messageId&&Math.abs(Date.now()-Date.parse(String(message.receivedDateTime)))<=300_000,'This Microsoft reply is not fresh.',403)
 const to=list(message.toRecipients).map(v=>text(object(object(v).emailAddress).address,'a reply recipient',254)),tokens=[...new Set(to.map(a=>a.match(/^reply\+([A-Za-z0-9_-]{43})@/i)?.[1]).filter((t):t is string=>Boolean(t)))]
 insist(tokens.length===1&&to.some(a=>a===`reply+${tokens[0]}@${env.MAIL_INBOUND_DOMAIN?.toLowerCase()}`),'This Microsoft message has no current reply address.',403)
 const capability=await resolveReplyCapability(env,tokens[0]);insist(capability,'This reply address is no longer current.',403)
 const view=await followupView(env,actor,capability.envelope);insist(view.replies!==undefined,'You cannot read replies for this envelope.',403)
 const headers=new Map(list(message.internetMessageHeaders).map(v=>{const h=object(v);return[String(h.name).toLowerCase(),String(h.value)]}))
 const from=address(message.from).email,verified=from===followupRecipient(capability.envelope,capability.signer).email.toLowerCase()&&!/\b(?:dkim|spf|dmarc)\s*=\s*(fail|softfail|temperror|permerror)\b/i.test(headers.get('authentication-results')??'')
 const body=object(message.body);insist(['text','html'].includes(String(body.contentType)),'Microsoft returned an unsupported reply body.',502)
 const raw=body.contentType==='html'?htmlText(String(body.content)):String(body.content),scrub=(s:string)=>s.replace(new RegExp(tokens[0],'gi'),'[capability omitted]')
 const reply:FollowupReply={id:crypto.randomUUID(),receivedAt:now(),provider:'graph',providerMessageId:messageId,verified,senderLabel:verified?'provider-reported sender':'unverified sender, provider-reported',automatic:/^(auto-replied|auto-generated)$/i.test(headers.get('auto-submitted')??'')||headers.has('x-ms-exchange-inbox-rules-loop'),headers:{from:scrub(from),to:to.map(scrub),date:String(message.receivedDateTime),subject:scrub(String(message.subject)),messageId:scrub(String(message.internetMessageId)),inReplyTo:scrub(headers.get('in-reply-to')??''),autoSubmitted:scrub(headers.get('auto-submitted')??'')},body:new TextEncoder().encode(raw).length<=500_000?scrub(raw):null,bodyBytes:new TextEncoder().encode(raw).length,bodyStatus:new TextEncoder().encode(raw).length<=500_000?'kept':'reply too large to keep',attachments:[]}
 if(message.hasAttachments){
  const attachments=await graphJson(env.MICROSOFT_GRAPH_ACCESS_TOKEN,`/me/messages/${encodeURIComponent(messageId)}/attachments`)
  insist(!attachments['@odata.nextLink'],'Microsoft reply attachment custody is incomplete.',409)
  let total=0
  reply.attachments=await Promise.all(list(attachments.value).map(async value=>{const a=object(value);insist(a['@odata.type']==='#microsoft.graph.fileAttachment'&&typeof a.contentBytes==='string','Microsoft returned an unsupported reply attachment.',502);const bytes=Uint8Array.from(atob(a.contentBytes),c=>c.charCodeAt(0));total+=bytes.length;insist(total<=25*1024*1024,'Microsoft reply attachments exceed the custody limit.',413);return{name:scrub(text(a.name,'an attachment name',240)),type:scrub(text(a.contentType,'an attachment type',240)),size:bytes.length,sha256:await sha256(bytes),status:'not kept by Inkwell' as const}}))
 }
 await storeReply(env,capability.envelope,capability.signer,reply,eventId)
 return{ok:true}
}
