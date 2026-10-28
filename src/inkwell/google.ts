import { insist, Refusal, sha256, text, type Env } from './model'
import { readBytes } from './body'
const toBase64 = (bytes: Uint8Array) => { let value=''; for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(value) }
import { parsePdf } from './pdf'

type Json = Record<string, any>
const googleId = (value: unknown, maximum=200) => { const valueId=text(value,'a Google identifier',maximum); insist(/^[A-Za-z0-9_-]+$/.test(valueId),'Invalid Google identifier.'); return valueId }
/** Installation credentials never leave the Worker. Requests use fixed official hosts without redirects. */
export async function googleRequest(env: Env, url: string, init: RequestInit = {}) {
 insist(env.GOOGLE_ACCESS_TOKEN,'Configure the Google connection in this installation first.',409)
 try {
  const response=await fetch(url,{...init,headers:{authorization:`Bearer ${env.GOOGLE_ACCESS_TOKEN}`,...init.headers},redirect:'manual',signal:AbortSignal.timeout(30_000)})
  insist(response.ok,'Google could not complete this request. Reconnect or retry manually.',502)
  return response
 } catch(error) { if(error instanceof Refusal)throw error;throw new Refusal('Google could not complete this request. Reconnect or retry manually.',502) }
}
async function json(env:Env,url:string,max=1024*1024):Promise<Json> {
 const response=await googleRequest(env,url),bytes=await readBytes(response as unknown as Request,max)
 try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new Refusal('Google returned invalid metadata.',502)}
}
async function pdf(env:Env,url:string,filename:string) {
 const bytes=await readBytes(await googleRequest(env,url) as unknown as Request,2*1024*1024)
 await parsePdf(bytes)
 return {filename:filename.replace(/\.pdf$/i,'')+'.pdf',pdfBase64:toBase64(bytes),sha256:await sha256(bytes)}
}
export async function googleDrive(env:Env,value:unknown) {
 const fileId=googleId(value),base=`https://www.googleapis.com/drive/v3/files/${fileId}`
 const file=await json(env,base+'?fields=id,name,mimeType,trashed')
 insist(file.id===fileId&&!file.trashed&&typeof file.name==='string','Google file is unavailable.',502)
 insist(['application/pdf','application/vnd.google-apps.document'].includes(file.mimeType),'Choose a PDF or Google Doc.')
 const converted=file.mimeType==='application/vnd.google-apps.document'
 return {...await pdf(env,base+(converted?'/export?mimeType=application%2Fpdf':'?alt=media'),file.name),sourceId:fileId,converted}
}
function participants(headers:Json[],ownEmail:string) {
 const result=new Map<string,{name:string;email:string}>()
 for(const header of headers.filter(h=>['from','to','cc'].includes(String(h.name).toLowerCase()))) {
  // Split only outside a quoted display name; refuse ambiguous or malformed mailboxes.
  const values=String(header.value).match(/(?:[^,"]|"[^"]*")+/g)??[]
  for(const value of values) {
   const match=value.trim().match(/^(?:"?([^<>]*?)"?\s*<)?([^\s<>@,]+@[^\s<>@,]+)>?$/)
   insist(match,'Google returned an ambiguous participant. Choose recipients manually.',502)
   const email=match[2].toLowerCase();if(email!==ownEmail.toLowerCase())result.set(email,{name:match[1]?.replace(/^"|"$/g,'').trim()||email,email})
  }
 }
 return [...result.values()]
}
async function messageParts(env:Env,value:unknown,ownEmail:string) {
 const messageId=googleId(value),message=await json(env,`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,3*1024*1024)
 insist(message.id===messageId&&message.payload,'Google message is unavailable.',502)
 const attachments:{id:string;filename:string;bytes:number}[]=[],inline=new Map<string,string>()
 function visit(part:Json,path='0') {
  if(part.mimeType==='application/pdf'&&part.filename&&(part.body?.attachmentId||typeof part.body?.data==='string')){
   const id=part.body.attachmentId?googleId(part.body.attachmentId,2048):'inline-'+path
   insist(!attachments.some(a=>a.id===id),'Google returned ambiguous attachments.',502)
   attachments.push({id,filename:part.filename,bytes:part.body.size});if(!part.body.attachmentId)inline.set(id,part.body.data)
  }
  for(const [index,child] of (part.parts??[]).entries())visit(child,path+'-'+index)
 }
 visit(message.payload)
 return {messageId,attachments,participants:participants(message.payload.headers??[],ownEmail),inline}
}
export async function googleMessage(env:Env,value:unknown,ownEmail:string) {const {inline,...message}=await messageParts(env,value,ownEmail);return message}
export async function googleAttachment(env:Env,messageValue:unknown,attachmentValue:unknown,ownEmail:string) {
 const message=await messageParts(env,messageValue,ownEmail),attachment=message.attachments.find(a=>a.id===googleId(attachmentValue,2048))
 insist(attachment,'Choose an attached PDF from this message.',404)
 const body=message.inline.has(attachment.id)?{size:attachment.bytes,data:message.inline.get(attachment.id)}:await json(env,`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.messageId}/attachments/${attachment.id}`,3*1024*1024)
 insist(typeof body.data==='string'&&body.data.length<=2_800_000,'The attachment is unavailable or too large.',413)
 let bytes:Uint8Array
 try{bytes=Uint8Array.from(atob(body.data.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}catch{throw new Refusal('Google returned an invalid attachment.',502)}
 insist(bytes.length===attachment.bytes&&bytes.length===body.size,'The attachment size did not verify.',502)
 await parsePdf(bytes)
 return {filename:attachment.filename,pdfBase64:toBase64(bytes),sha256:await sha256(bytes),participants:message.participants}
}
/** Deterministic file identity makes manual retries update one artifact, rather than create duplicates. */
export async function fileGoogle(env:Env,folder:string,name:string,bytes:Uint8Array) {
 googleId(folder)
 const digest=await sha256(bytes),fileId='inkwell'+(await sha256(folder+'\n'+name)).slice(0,32)
 // Drive IDs are allocated by Google; find by a private app property before creating.
 const query=`'${folder}' in parents and trashed = false and appProperties has { key='inkwellArtifact' and value='${fileId}' }`
 const found=await json(env,'https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(query)+'&fields=files(id,name,size,sha256Checksum,parents)&spaces=drive')
 insist(Array.isArray(found.files)&&found.files.length<=1,'Google filing identity is ambiguous.',409)
 const verify=(file:Json)=>{insist(file.id&&file.name===name&&Number(file.size)===bytes.length&&file.sha256Checksum===digest&&file.parents?.includes(folder),'The Google filing destination contains different bytes.',409);return{id:String(file.id)}}
 if(found.files.length)return verify(found.files[0])
 const boundary='inkwell-'+crypto.randomUUID(),metadata={name,parents:[folder],appProperties:{inkwellArtifact:fileId}},prefix=new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),suffix=new TextEncoder().encode(`\r\n--${boundary}--\r\n`)
 const body=new Uint8Array(prefix.length+bytes.length+suffix.length);body.set(prefix);body.set(bytes,prefix.length);body.set(suffix,prefix.length+bytes.length)
 const response=await googleRequest(env,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,sha256Checksum,parents',{method:'POST',headers:{'content-type':`multipart/related; boundary=${boundary}`},body:body.buffer})
 return verify(await response.json())
}
