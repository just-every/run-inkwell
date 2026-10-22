import { canSeeDocument, recipientPages } from './document-visibility'
import { active, appendEvent, canonical, id, insist, now, sha256, text, type Actor, type Envelope, type Env } from './model'
import { commandWrite, commitEnvelope, previousCommand } from './storage'
import { accessGate, disclosureGate, liveGuard, notGroupSigner, recipientOf, sessionGuard, type SigningContext } from './signing'
import { commentEpoch, validCommentRecords } from './comment-record.mjs'
import { insistAccess } from './members'

type Identity = { kind:'sender'; id:string } | { kind:'recipient'; signer:number; member?:number; email:string; epoch:string }
type Message = { author:Identity; name:string; at:string; text:string }
type Thread = { id:string; envelopeId:string; document:number; page:number; author:Identity; audience:Identity[]; messages:Message[] }
type Participant = { identity:Identity; name:string; actor?:Actor; signing?:SigningContext }
const equal=(a:Identity,b:Identity)=>canonical(a)===canonical(b)
export function commentParties(e:Envelope) {
 return [{key:'sender',name:'Sender',identity:{kind:'sender',id:e.createdBy} as Identity},...e.signers.flatMap((s,i)=>s.removedAt||s.routeResult?.state==='skipped'?[]:(s.group?s.group.members:[s]).map((p,m)=>({key:`recipient:${i}${s.group?`:${m}`:''}`,name:p.name,identity:{kind:'recipient',signer:i,...(s.group?{member:m}:{}),email:p.email.toLowerCase(),epoch:commentEpoch(e,i)} as Identity}))) ]
}
export async function memberCommentParticipant(env:Env,e:Envelope,actor:Actor):Promise<Participant|null> {
 await insistAccess(env,actor,e,'view')
 return e.createdBy===actor.id?{identity:{kind:'sender',id:actor.id},name:actor.name,actor}:null
}
export function signerCommentParticipant(c:SigningContext):Participant {
 insist(c.verified,'Verify your identity before opening comments.',401);accessGate(c);notGroupSigner(c)
 const s=recipientOf(c);disclosureGate(s,'opening comments')
 insist(!c.envelope.imported,'Imported envelopes have no signing comment session.',403)
 return {identity:{kind:'recipient',signer:c.recipient.signer,...(c.recipient.member===undefined?{}:{member:c.recipient.member}),email:s.email.toLowerCase(),epoch:commentEpoch(c.envelope,c.recipient.signer)},name:s.name,signing:c}
}
export async function commentRows(env:Env,e:Envelope) {
 return (await env.DB.prepare('SELECT id,data FROM iw_comment_threads WHERE envelope_id=? ORDER BY rowid').bind(e.id).all<{id:string;data:string}>()).results
}
export async function commentView(env:Env,e:Envelope,p:Participant|null) {
 const rows=await commentRows(env,e)
 insist(await validCommentRecords(e,rows,canonical,sha256),'The stored comment transcript failed its integrity check.',503)
 const threads=p?rows.map(row=>JSON.parse(row.data) as Thread).filter(t=>t.audience.some(a=>equal(a,p.identity))&&(!p.signing||!e.documents||canSeeDocument(e,t.document,p.signing.recipient.signer))).map(t=>({...t,...(p.signing?{page:recipientPages(e,p.signing.recipient.signer).indexOf(t.page)}:{}),canShare:equal(t.author,p.identity)})):[]
 return {threads,parties:p?commentParties(e).map(({key,name,identity})=>({key,name,self:equal(identity,p.identity)})):[],canWrite:Boolean(p&&e.status==='awaiting_signature'&&!e.scheduled&&Date.parse(e.expiresAt)>Date.now()),pages:p?.signing?recipientPages(e,p.signing.recipient.signer).length:e.pageSizes.length}
}
/** Public comment reads always enforce the chosen audience. Raw transcripts are confined to explicit record custody. */
export async function commentCustody(env:Env,e:Envelope) {
 const rows=await commentRows(env,e);insist(await validCommentRecords(e,rows,canonical,sha256),'Comment custody failed its integrity check.',503)
 return rows.map(row=>JSON.parse(row.data) as Thread)
}
export async function writeComment(env:Env,e:Envelope,p:Participant|null,input:Record<string,unknown>) {
 insist(p,'Only the sender or a verified recipient can write comments.',403);active(e)
 insist(!p.actor||['owner','admin','sender'].includes(p.actor.role),'Your role cannot write sender comments.',403)
 const action=input.action,commandId=text(input.commandId,'a comment request ID',100),fingerprint=await sha256(canonical(input)),key=`comment:${e.id}:${await sha256(canonical(p.identity))}`
 const previous=await previousCommand(env.DB,key,commandId,fingerprint);if(previous)return previous
 insist(['create','reply','audience'].includes(String(action)),'Choose create, reply or audience.')
 let thread:Thread
 if(action==='create'&&p.signing){const pages=recipientPages(e,p.signing.recipient.signer);insist(Number.isInteger(input.page)&&pages[Number(input.page)]!==undefined,'Choose a visible document page.');input={...input,page:pages[Number(input.page)]}}
 if(action==='create') {
  insist(Number.isInteger(input.page)&&Number(input.page)>=0&&Number(input.page)<e.pageSizes.length,'Choose a page in this document.')
  const documentIndex=e.documents?.findIndex(d=>Number(input.page)>=d.pageStart&&Number(input.page)<d.pageStart+d.pages)??0
  insist(input.document===undefined||input.document===documentIndex,'Choose the document containing this page.')
  thread={id:id(),envelopeId:e.id,document:documentIndex,page:Number(input.page),author:p.identity,audience:[],messages:[]}
 }else{
  const row=await env.DB.prepare('SELECT data FROM iw_comment_threads WHERE envelope_id=? AND id=?').bind(e.id,text(input.thread,'a thread ID')).first<{data:string}>()
  insist(row,'Comment thread not found.',404);thread=JSON.parse(row.data)
  insist(thread.audience.some(a=>equal(a,p.identity)),'Comment thread not found.',404)
 }
 if(p.signing&&e.documents)insist(canSeeDocument(e,thread.document,p.signing.recipient.signer),'Comment thread not found.',404)
 if(action==='create'||action==='audience') {
  insist(equal(thread.author,p.identity),'Only the thread author can change its audience.',403)
  const parties=commentParties(e)
  insist(Array.isArray(input.audience)&&input.audience.length>0&&new Set(input.audience).size===input.audience.length,'Explicitly select the parties who may read this thread.')
  thread.audience=input.audience.map(k=>{const party=parties.find(a=>a.key===k);insist(party,'Choose a current sender or recipient identity.');insist(party.identity.kind==='sender'||!e.documents||canSeeDocument(e,thread.document,party.identity.signer),'A thread can be shared only with recipients who can see its document.');return party.identity})
 }else insist(input.audience===undefined,'Replies inherit the thread audience.')
 if(action!=='audience') thread.messages.push({author:p.identity,name:p.name,at:now(),text:text(input.text,'a comment',4000)})
 const rows=await commentRows(env,e)
 insist(await validCommentRecords(e,rows,canonical,sha256),'The stored transcript failed its integrity check.',503)
 const after=structuredClone(e)
 await appendEvent(after,action==='create'?'comment.created':action==='reply'?'comment.replied':'comment.audience_changed',p.actor?.id??`recipient:${p.signing!.recipient.row}`,{thread:thread.id,document:thread.document,page:thread.page,recipients:thread.audience.flatMap(a=>a.kind==='recipient'?[{signer:a.signer,...(a.member===undefined?{}:{member:a.member})}]:[]),sender:thread.audience.some(a=>a.kind==='sender'),transcriptSha256:await sha256(canonical(thread))})
 if(action==='audience') await appendEvent(after,'comment.shared',p.actor?.id??`recipient:${p.signing!.recipient.row}`,{...after.events.at(-1)!.detail})
 const result={id:e.id,thread:thread.id}
 await commitEnvelope(env,e,after,p.actor??null,[env.DB.prepare('INSERT INTO iw_comment_threads(id,envelope_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(thread.id,e.id,JSON.stringify(thread)),commandWrite(env.DB,key,commandId,fingerprint,result)],p.signing?[liveGuard(p.signing),sessionGuard(p.signing)]:[])
 return result
}
