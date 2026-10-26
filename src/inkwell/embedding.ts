import { openLink } from './links'
import { operatorAuth } from '../auth.server'
import { insist, secret, sha256, text, Refusal, id, type Actor, type Env } from './model'
import { seal } from './seal'
import { atomic, roleGuard, type Guard } from './storage'
import { embedLimit } from './embed-limits'

export type Launch = {token_hash:string;origin:string;mode:'sign'|'prepare';sealed:string;expires_at:number;envelope_id:string|null;actor:string;grant_version:number;member_version:number;native_session:string;recipient_hash:string|null;session_id:string|null;session_hash:string|null;redeemed_at:number|null;allocation:string}
export function originOf(env:Env,value:unknown){
 const raw=text(value,'an exact parent origin',300)
 let url:URL;try{url=new URL(raw)}catch{throw new Refusal('Provide an exact parent origin.')}
 insist(!url.hostname.includes('*')&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash&&raw!=='null'&&(url.protocol==='https:'||(env.AUTH_LOCAL==='true'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))),'Use an exact HTTPS origin, without credentials, a path or wildcard.')
 return url.origin
}
export function embedAudit(env:Env,actor:string,action:string,origin:string,detail:Record<string,unknown>,envelope?:string|null){
 return env.DB.prepare('INSERT INTO iw_embed_audit(id,actor,action,origin,at,envelope_id,detail) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,origin,new Date().toISOString(),envelope??null,JSON.stringify(detail))
}
const consentVersion='embedding-2026-10-26'
async function fresh(env:Env,request:Request){const session=await operatorAuth(env).getSession(request);insist(session&&Date.now()-session.createdAt<=15*60_000,'Sign in again before authorizing embedding.',403);return session}
export async function embedOrigins(env:Env){return{origins:(await env.DB.prepare('SELECT origin FROM iw_embed_origins WHERE enabled=1 ORDER BY origin').all<{origin:string}>()).results.map(r=>r.origin)}}
export async function changeEmbedOrigin(env:Env,actor:Actor,request:Request,input:Record<string,unknown>){
 const origin=originOf(env,input.origin),at=new Date().toISOString()
 insist(typeof input.enabled==='boolean','Choose whether the origin is allowed.')
 insist(!input.enabled||input.consent===true,'Explicitly authorize this origin before allowing embedded access.')
 if(input.enabled)await fresh(env,request)
 const before=await env.DB.prepare('SELECT version,enabled FROM iw_embed_origins WHERE origin=?').bind(origin).first<{version:number;enabled:number}>(),version=(before?.version??0)+1
 await atomic(env.DB,[roleGuard(actor,['owner','admin']),{sql:'COALESCE((SELECT version FROM iw_embed_origins WHERE origin=?),0)=?',values:[origin,before?.version??0]}],[
  env.DB.prepare('INSERT INTO iw_embed_origins(origin,actor,at,version,enabled) VALUES(?,?,?,?,?) ON CONFLICT(origin) DO UPDATE SET actor=excluded.actor,at=excluded.at,version=excluded.version,enabled=excluded.enabled').bind(origin,actor.id,at,version,input.enabled?1:0),
  env.DB.prepare('DELETE FROM iw_embed_launches WHERE origin=?').bind(origin),
  embedAudit(env,actor.id,'origin.changed',origin,{outcome:'allowed',consentVersion,consent:input.enabled,purpose:'grant',version,before:before?.enabled?origin:null,after:input.enabled?origin:null})
 ])
 return embedOrigins(env)
}
export async function createEmbed(env:Env,actor:Actor,request:Request,input:Record<string,unknown>){
 await embedLimit(env,'issue',actor.id)
 const origin=originOf(env,input.origin),grant=await env.DB.prepare('SELECT version FROM iw_embed_origins WHERE origin=? AND enabled=1').bind(origin).first<{version:number}>()
 insist(grant,'This parent origin is not allowed.',403)
 insist(input.consent===true,'Explicitly authorize this embedded session.')
 insist(input.mode==='sign'||input.mode==='prepare','Choose signing or preparation.')
 const native=await fresh(env,request)
 let credential:string,envelope:string|null=null,recipientHash:string|null=null,recipientExpiry=Infinity
 if(input.mode==='sign'){
  let invitation=input.token
  if(invitation===undefined){const envelopeId=text(input.envelopeId,'an envelope ID');insist(Number.isInteger(input.signer),'Choose a recipient place.');const row=await env.DB.prepare('SELECT link_sealed FROM iw_signers WHERE envelope_id=? AND signer=?').bind(envelopeId,input.signer).first<{link_sealed:string|null}>();invitation=row?await openLink(env,envelopeId,input.signer as number,row.link_sealed):undefined}
  credential=text(invitation,'a current recipient invitation',64)
  insist(/^[a-f0-9]{64}$/.test(credential),'Signing invitation not found.',404)
  recipientHash=await sha256(credential)
  const row=await env.DB.prepare("SELECT s.envelope_id,json_extract(e.data,'$.expiresAt') AS expires_at FROM iw_signers s JOIN iw_envelopes e ON e.id=s.envelope_id WHERE s.token_hash=?").bind(recipientHash).first<{envelope_id:string;expires_at:string}>()
  insist(row,'Signing invitation not found.',404);envelope=row.envelope_id;recipientExpiry=Date.parse(row.expires_at)
 }else credential=(request.headers.get('cookie')??'').split(';').map(c=>c.trim()).filter(c=>c.startsWith('__Host-operator_session=')||/^operator_session_local_\d+=/.test(c)).join('; ')
 const token=secret(),hash=await sha256(token),at=new Date().toISOString(),expiresAt=Math.min(Date.now()+15*60_000,native.expiresAt,recipientExpiry),allocation=id()
 await atomic(env.DB,[roleGuard(actor,['owner','admin']),{sql:'EXISTS(SELECT 1 FROM iw_embed_origins WHERE origin=? AND version=? AND enabled=1)',values:[origin,grant.version]}],[
  env.DB.prepare('INSERT INTO iw_embed_launches(token_hash,origin,mode,sealed,expires_at,actor,at,envelope_id,grant_version,member_version,native_session,recipient_hash,allocation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(hash,origin,input.mode,await seal(env,'embed-launch',hash,credential),expiresAt,actor.id,at,envelope,grant.version,actor.version,native.id,recipientHash,allocation),
  embedAudit(env,actor.id,'launch.authorized',origin,{consentVersion,consent:true,purpose:input.mode,grantVersion:grant.version,launch:hash,expiresAt,recipient:recipientHash?await sha256(recipientHash):null,allocation,outcome:'allowed'},envelope)
 ])
 return{url:new URL('/embed/'+token,env.AUTH_ORIGIN).href,expiresAt}
}
export const embedCookie=(id:string,value:string,expires:number)=>`inkwell_embed_${id.slice(0,16)}=${value}; Path=/api/embed/${id}; HttpOnly; Max-Age=${Math.max(0,Math.floor((expires-Date.now())/1000))}; SameSite=None; Secure; Partitioned`
export function embedGuard(launch:Launch):Guard{
 return{sql:`EXISTS(SELECT 1 FROM iw_embed_launches l JOIN iw_embed_origins o ON o.origin=l.origin JOIN oa_operators m ON m.id=l.actor JOIN oa_sessions n ON n.id=l.native_session WHERE l.token_hash=? AND l.session_id IS ? AND l.session_hash IS ? AND l.expires_at>? AND o.enabled=1 AND o.version=l.grant_version AND m.version=l.member_version AND m.status='active' AND m.role IN ('owner','admin') AND n.operator_id=m.id AND n.operator_version=m.version AND n.revoked_at IS NULL AND n.expires_at>? AND (l.mode='prepare' OR EXISTS(SELECT 1 FROM iw_signers s WHERE s.envelope_id=l.envelope_id AND s.token_hash=l.recipient_hash)))`,values:[launch.token_hash,launch.session_id,launch.session_hash,Date.now(),Date.now()]}
}
export async function checkEmbed(env:Env,launch:Launch){
 const guard=embedGuard(launch),valid=await env.DB.prepare('SELECT '+guard.sql+' AS valid').bind(...guard.values).first<{valid:number}>()
 if(!valid?.valid){await env.DB.batch([embedAudit(env,launch.actor,launch.expires_at<=Date.now()?'launch.expired':'authority.refused',launch.origin,{purpose:launch.mode,grantVersion:launch.grant_version,launch:launch.token_hash,outcome:'refused'},launch.envelope_id),env.DB.prepare('DELETE FROM iw_embed_launches WHERE token_hash=?').bind(launch.token_hash)]);throw new Refusal('This embedded authorization ended. Continue in Inkwell or ask for a fresh launch.',403)}
}
export async function embedLaunch(env:Env,id:string,session=false):Promise<Launch>{
 insist(/^[a-f0-9]{64}$/.test(id),'Embedded session not found.',404)
 const row=await env.DB.prepare('SELECT * FROM iw_embed_launches WHERE '+(session?'session_id=?':'token_hash=?')).bind(session?id:await sha256(id)).first<Launch>()
 insist(row,'This embedded authorization ended. Continue in Inkwell or ask for a fresh launch.',403)
 await checkEmbed(env,row);return row
}
