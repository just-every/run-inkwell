import { readBytes } from './body'
import { insist, Refusal, sha256, type Env } from './model'
import { keepFetchedReply } from './followup-inbound'
import { googleRequest } from './google'

type Json = Record<string, any>
const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
const parse=(value:Uint8Array):Json=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(value))
const history=(value:unknown)=>{insist(typeof value==='string'&&/^[0-9]{1,30}$/.test(value),'Invalid Google history checkpoint.',502);return value}
async function googleJson(env:Env,path:string,max=1024*1024):Promise<Json>{return parse(await readBytes(await googleRequest(env,'https://gmail.googleapis.com/gmail/v1/users/me'+path) as unknown as Request,max))}

/** Google Pubsub's signed OIDC caller, exact subscription and fresh message are all required. */
async function authenticatedPush(env:Env,request:Request) {
 insist(env.GOOGLE_PUBSUB_EMAIL&&env.GOOGLE_PUBSUB_SUBSCRIPTION&&env.GOOGLE_MAILBOX&&env.GOOGLE_HISTORY_START&&env.MAIL_INBOUND_DOMAIN,'Google reply intake is not configured.',503)
 const authorization=request.headers.get('authorization')??''
 insist(authorization.startsWith('Bearer ')&&authorization.length<=16_384,'Google push authentication is required.',401)
 const token=authorization.slice(7).split('.');insist(token.length===3,'Google push authentication failed.',401)
 let header:Json,claims:Json
 try{header=parse(decode(token[0]));claims=parse(decode(token[1]))}catch{throw new Refusal('Google push authentication failed.',401)}
 const now=Math.floor(Date.now()/1000)
 insist(header.alg==='RS256'&&typeof header.kid==='string'&&header.kid.length<=200,'Google push authentication failed.',401)
 insist(['accounts.google.com','https://accounts.google.com'].includes(claims.iss)&&claims.aud===new URL('/api/inkwell/google/replies',env.AUTH_ORIGIN).href&&claims.email===env.GOOGLE_PUBSUB_EMAIL&&claims.email_verified===true&&typeof claims.sub==='string'&&claims.sub.length>0&&Number.isInteger(claims.iat)&&Number.isInteger(claims.exp)&&claims.iat<=now+60&&claims.iat>=now-3600&&claims.exp>now&&claims.exp<=claims.iat+3600,'Google push authentication failed.',401)
 const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{redirect:'manual',signal:AbortSignal.timeout(30_000)})
 insist(response.ok,'Google push keys are unavailable.',503)
 const keys=parse(await readBytes(response as unknown as Request,256*1024)).keys
 insist(Array.isArray(keys),'Google push keys are invalid.',503)
 const matches=keys.filter((key:Json)=>key.kid===header.kid&&key.kty==='RSA'&&key.alg==='RS256'&&key.use==='sig')
 insist(matches.length===1,'Google push authentication failed.',401)
 const key=await crypto.subtle.importKey('jwk',matches[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify'])
 insist(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(token[2]),new TextEncoder().encode(token[0]+'.'+token[1])),'Google push authentication failed.',401)
 const body=parse(await readBytes(request,64*1024)),message=body.message
 insist(body.subscription===env.GOOGLE_PUBSUB_SUBSCRIPTION&&message&&typeof message.messageId==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(message.messageId)&&typeof message.data==='string'&&message.data.length<=32_000,'Invalid Google push envelope.',400)
 const published=Date.parse(message.publishTime)
 insist(Number.isFinite(published)&&Math.abs(Date.now()-published)<=300_000,'Google push is stale.',401)
 const notice=parse(decode(message.data));insist(notice.emailAddress===env.GOOGLE_MAILBOX,'Google push names another mailbox.',403)
 return {eventId:'google-push:'+message.messageId,checkpoint:history(notice.historyId)}
}

async function fetchedReply(env:Env,messageId:string,eventId:string) {
 insist(/^[A-Za-z0-9_-]{1,200}$/.test(messageId),'Invalid Google message identifier.',502)
 const message=await googleJson(env,`/messages/${messageId}?format=metadata&metadataHeaders=To`)
 insist(message.id===messageId&&message.payload,'Google returned another message.',502)
 const headers:Record<string,string>={}
 for(const header of message.payload.headers??[]){insist(typeof header.name==='string'&&typeof header.value==='string','Invalid Google message headers.',502);const name=header.name.toLowerCase();if(!['from','to','date','subject','message-id','in-reply-to','auto-submitted','authentication-results','x-autoreply','x-autorespond','x-ms-exchange-inbox-rules-loop'].includes(name))continue;insist(!Object.hasOwn(headers,name),'Ambiguous Google message headers.',502);headers[name]=header.value}
 const addresses=(headers.to??'').match(/(?:[^,"]|"[^"]*")+/g)??[]
 // Ignore unrelated mailbox traffic before fetching its body or attachments.
 if(!addresses.some(address=>/reply\+[A-Za-z0-9_-]{43}@/i.test(address)))return
 const source={id:messageId,from:headers.from??'',to:addresses,subject:headers.subject??'',message_id:headers['message-id']??'',headers}
 try{await keepFetchedReply(env,source,messageId,eventId,'gmail',async checkCurrent=>{
  await checkCurrent()
  const full=await googleJson(env,`/messages/${messageId}?format=full`,16*1024*1024)
  insist(full.id===messageId&&full.payload,'Google returned another message.',502)
  const complete:Record<string,string>={}
  for(const header of full.payload.headers??[]){insist(typeof header.name==='string'&&typeof header.value==='string','Invalid Google message headers.',502);const name=header.name.toLowerCase();if(!['from','to','date','subject','message-id','in-reply-to','auto-submitted','authentication-results','x-autoreply','x-autorespond','x-ms-exchange-inbox-rules-loop'].includes(name))continue;insist(!Object.hasOwn(complete,name),'Ambiguous Google message headers.',502);complete[name]=header.value}
  insist(complete.to===headers.to&&typeof complete.from==='string','Google message identity changed during intake.',502)
  Object.assign(headers,complete);source.from=complete.from;source.subject=complete.subject??'';source.message_id=complete['message-id']??''
  let text='',html='',total=0
  const attachments:{filename:string;contentType:string;content:Uint8Array}[]=[]
  async function visit(part:Json) {
   if(part.filename){
    insist(attachments.length<100&&Number.isSafeInteger(part.body?.size)&&part.body.size<=40*1024*1024,'Google attachment exceeds custody limits.',413)
    let data=part.body.data
    if(part.body.attachmentId){insist(/^[A-Za-z0-9_-]{1,2048}$/.test(part.body.attachmentId),'Invalid Google attachment identifier.',502);await checkCurrent();data=(await googleJson(env,`/messages/${messageId}/attachments/${part.body.attachmentId}`,56*1024*1024)).data}
    insist(typeof data==='string','Google attachment is incomplete.',502)
    const content=decode(data);total+=content.byteLength;insist(content.byteLength===part.body.size&&total<=40*1024*1024,'Google attachment exceeds custody limits.',413)
    attachments.push({filename:part.filename,contentType:part.mimeType??'application/octet-stream',content})
   } else if(['text/plain','text/html'].includes(part.mimeType)&&part.body){
    let data=part.body.data
    if(part.body.attachmentId){insist(/^[A-Za-z0-9_-]{1,2048}$/.test(part.body.attachmentId),'Invalid Google body identifier.',502);await checkCurrent();data=(await googleJson(env,`/messages/${messageId}/attachments/${part.body.attachmentId}`,24*1024*1024)).data}
    insist(typeof data==='string','Google reply body is incomplete.',502)
    const bytes=decode(data);total+=bytes.byteLength;insist(total<=40*1024*1024&&(part.body.size===undefined||bytes.byteLength===part.body.size),'Google reply body exceeds custody limits or is incomplete.',413)
    const value=new TextDecoder().decode(bytes);if(part.mimeType==='text/plain')text+=value;else html+=value
   }
   insist(Array.isArray(part.parts??[])&&(part.parts??[]).length<=100,'Invalid Google message parts.',502)
   for(const child of part.parts??[])await visit(child)
  }
  await visit(full.payload)
  return{text:text||undefined,html:html||undefined,attachments}
 })}catch(error){if(!(error instanceof Refusal&&error.status===403))throw error}
}

export async function receiveGoogleReplies(env:Env,request:Request):Promise<Response> {
 try{
  const push=await authenticatedPush(env,request)
  insist((await googleJson(env,'/profile')).emailAddress===env.GOOGLE_MAILBOX,'Google credentials belong to another mailbox.',403)
  insist(!await env.DB.prepare('SELECT 1 FROM iw_followup_receipts WHERE event_id=?').bind(push.eventId).first(),'This Google push was already received.',409)
  const mailboxHash=await sha256(env.GOOGLE_MAILBOX!.toLowerCase())
  await env.DB.prepare('INSERT OR IGNORE INTO iw_google_reply_state(singleton,mailbox_hash,history_id) VALUES(1,?,?)').bind(mailboxHash,history(env.GOOGLE_HISTORY_START)).run()
  const state=(await env.DB.prepare('SELECT mailbox_hash,history_id FROM iw_google_reply_state WHERE singleton=1').first<{mailbox_hash:string;history_id:string}>())!
  insist(state.mailbox_hash===mailboxHash,'Google mailbox changed. Reconnect with a new checkpoint.',409)
  const before=state.history_id
  insist(BigInt(push.checkpoint)>BigInt(before),'This Google history is already processed.',409)
  let pageToken='',latest=before
  const ids=new Set<string>()
  for(let page=0;page<10;page++){
   const result=await googleJson(env,`/history?startHistoryId=${before}&historyTypes=messageAdded&maxResults=100${pageToken?'&pageToken='+encodeURIComponent(pageToken):''}`)
   latest=history(result.historyId)
   insist(Array.isArray(result.history??[]),'Invalid Google message history.',502)
   for(const item of result.history??[])for(const added of item.messagesAdded??[]){insist(typeof added.message?.id==='string','Invalid Google history message.',502);ids.add(added.message.id)}
   insist(ids.size<=1000,'Google history exceeds the bounded intake. Reconcile manually.',413)
   pageToken=result.nextPageToken??'';insist(typeof pageToken==='string'&&pageToken.length<=2000,'Invalid Google history continuation.',502)
   if(!pageToken)break
  }
  insist(!pageToken&&BigInt(latest)>=BigInt(push.checkpoint),'Google history is incomplete. Retry manually.',502)
  for(const messageId of ids){const eventId='gmail:'+messageId;if(await env.DB.prepare('SELECT 1 FROM iw_followup_receipts WHERE event_id=?').bind(eventId).first())continue;await fetchedReply(env,messageId,eventId)}
  // Reply writes are idempotent independently of push delivery and checkpoint retries.
  await env.DB.batch([env.DB.prepare('INSERT INTO iw_followup_receipts(event_id,received_at) VALUES(?,?)').bind(push.eventId,new Date().toISOString()),env.DB.prepare('UPDATE iw_google_reply_state SET history_id=? WHERE singleton=1 AND CAST(history_id AS TEXT)=?').bind(latest,before)])
  return Response.json({ok:true},{headers:{'cache-control':'no-store'}})
 }catch(error){const refusal=error instanceof Refusal?error:new Refusal('Google replies could not be processed completely.',503);return Response.json({ok:false,error:refusal.message},{status:refusal.status,headers:{'cache-control':'no-store'}})}
}
