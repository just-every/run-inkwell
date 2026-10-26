import { openLink } from './links'
import { operatorAuth } from '../auth.server'
import { insist, secret, sha256, text, Refusal, type Actor, type Env } from './model'
import { seal } from './seal'

export type Launch = {token_hash:string; origin:string; mode:'sign'|'prepare'; sealed:string; expires_at:number; envelope_id:string|null;actor:string}
const originOf = (env:Env,value:unknown) => {
 const valueText=text(value,'an exact parent origin',300)
 let url:URL;try{url=new URL(valueText)}catch{throw new Refusal('Provide an exact parent origin.')}
 insist(!url.hostname.includes('*') && url.origin===valueText && (url.protocol==='https:' || (env.AUTH_LOCAL==='true' && url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))),'Use an exact HTTPS origin, without a path or wildcard.')
 return url.origin
}
export async function embedOrigins(env:Env){return {origins:(await env.DB.prepare('SELECT origin FROM iw_embed_origins ORDER BY origin').all<{origin:string}>()).results.map(r=>r.origin)}}
export async function changeEmbedOrigin(env:Env,actor:Actor,input:Record<string,unknown>){
 const origin=originOf(env,input.origin),at=new Date().toISOString()
 insist(typeof input.enabled==='boolean','Choose whether the origin is allowed.')
 insist(input.enabled===false || input.consent===true,'Explicitly authorize this origin before allowing embedded access.')
 await env.DB.batch([input.enabled?env.DB.prepare('INSERT INTO iw_embed_origins(origin,actor,at) VALUES(?,?,?) ON CONFLICT(origin) DO UPDATE SET actor=excluded.actor,at=excluded.at').bind(origin,actor.id,at):env.DB.prepare('DELETE FROM iw_embed_origins WHERE origin=?').bind(origin),env.DB.prepare('INSERT INTO iw_embed_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,input.enabled?'origin.allowed':'origin.removed',origin,at),...(!input.enabled?[env.DB.prepare('DELETE FROM iw_embed_launches WHERE origin=?').bind(origin)]:[])])
 return embedOrigins(env)
}
export async function createEmbed(env:Env,actor:Actor,request:Request,input:Record<string,unknown>){
 const origin=originOf(env,input.origin)
 insist(await env.DB.prepare('SELECT 1 FROM iw_embed_origins WHERE origin=?').bind(origin).first(),'This parent origin is not allowed.',403)
 insist(input.consent===true,'Explicitly authorize this embedded session.')
 insist(input.mode==='sign'||input.mode==='prepare','Choose signing or preparation.')
 let credential:string
 if(input.mode==='sign'){
  let invitation=input.token
  if(invitation===undefined){const id=text(input.envelopeId,'an envelope ID');insist(Number.isInteger(input.signer),'Choose a recipient place.');const row=await env.DB.prepare('SELECT link_sealed FROM iw_signers WHERE envelope_id=? AND signer=?').bind(id,input.signer).first<{link_sealed:string|null}>();invitation=row?await openLink(env,id,input.signer as number,row.link_sealed):undefined}
  const token=text(invitation,'a current recipient invitation',64)
  insist(/^[a-f0-9]{64}$/.test(token)&&await env.DB.prepare('SELECT 1 FROM iw_signers WHERE token_hash=?').bind(await sha256(token)).first(),'Signing invitation not found.',404)
  credential=token
 }else{
  const session=await operatorAuth(env).getSession(request)
  insist(session&&Date.now()-session.createdAt<=15*60_000,'Sign in again before authorizing embedded preparation.',403)
  credential=(request.headers.get('cookie')??'').split(';').map(c=>c.trim()).filter(c=>c.startsWith('__Host-operator_session=')||/^operator_session_local_\d+=/.test(c)).join('; ')
 }
 const token=secret(),hash=await sha256(token),at=new Date().toISOString(),expiresAt=Date.now()+15*60_000
 await env.DB.batch([env.DB.prepare('DELETE FROM iw_embed_launches WHERE expires_at<=?').bind(Date.now()),env.DB.prepare('INSERT INTO iw_embed_launches(token_hash,origin,mode,sealed,expires_at,actor,at) VALUES(?,?,?,?,?,?,?)').bind(hash,origin,input.mode,await seal(env,'embed-launch',hash,credential),expiresAt,actor.id,at),env.DB.prepare('INSERT INTO iw_embed_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,'launch.'+input.mode,origin,at)])
 return {url:new URL('/embed/'+token,env.AUTH_ORIGIN).href,expiresAt}
}
export const embedCookie=(_env:Env,id:string)=>`inkwell_embed_${id.slice(0,16)}=${id}; Path=/api/embed/${id}; HttpOnly; Max-Age=900; SameSite=None; Secure; Partitioned`
export async function embedLaunch(env:Env,id:string):Promise<Launch>{
 insist(/^[a-f0-9]{64}$/.test(id),'Embedded session not found.',404)
 const row=await env.DB.prepare('SELECT l.* FROM iw_embed_launches l JOIN iw_embed_origins o ON o.origin=l.origin WHERE token_hash=? AND expires_at>?').bind(await sha256(id),Date.now()).first<Launch>()
 insist(row,'Embedded session expired or its origin is no longer allowed.',403)
 return row
}
