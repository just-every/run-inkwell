import { htmlBody } from './mail'
import { operatorMail } from '../mail.server.mjs'
import { id, type Env } from './model'
import { memberRoleSql } from './storage'

/** API-001 B3: a key's bound active member receives 30/7-day warnings. A claimed outcome is never replayed. */
export async function warnApiKeys(env: Env, at: number) {
 const stamp=new Date(at).toISOString(),sender=operatorMail(env)
 await env.DB.prepare("UPDATE iw_api_key_warnings SET state='uncertain',finished_at=? WHERE state='sending' AND claimed_at<?").bind(stamp,new Date(at-10*60_000).toISOString()).run()
 if(!sender||!env.MAIL_FROM)return
 const rows=(await env.DB.prepare(`SELECT k.id,k.name,k.prefix,k.last_four,k.version,k.expires_at,o.email FROM iw_api_keys k JOIN oa_operators o ON o.id=k.member_id AND o.version=k.member_version
  WHERE k.revoked_at IS NULL AND k.suspended_at IS NULL AND k.expires_at>? AND k.expires_at<=? AND o.status='active'
  AND CASE WHEN o.role='member' THEN ${memberRoleSql('o.id')} ELSE o.role END=k.member_role ORDER BY k.expires_at,k.id`).bind(stamp,new Date(at+30*86400000).toISOString()).all<{id:string;name:string;prefix:string;last_four:string;version:number;expires_at:string;email:string}>()).results
 for(const key of rows){
  const days=Date.parse(key.expires_at)-at<=7*86400000?7:30,warning=id()
  const claimed=await env.DB.prepare(`INSERT OR IGNORE INTO iw_api_key_warnings(id,key_id,expires_at,days,state,claimed_at) SELECT ?,?,?,?,'sending',?
   WHERE EXISTS(SELECT 1 FROM iw_api_keys WHERE id=? AND version=? AND expires_at=? AND revoked_at IS NULL AND suspended_at IS NULL) RETURNING id`).bind(warning,key.id,key.expires_at,days,stamp,key.id,key.version,key.expires_at).first()
  if(!claimed)continue
  let state='uncertain',message:string|null=null
  try{
   const body=`Your API key “${key.name}” (${key.prefix}…${key.last_four}) expires at ${key.expires_at} (UTC).
Rotate or replace it before expiry. This is an expiry warning, not a request to reveal the secret.
${new URL('/app',env.AUTH_ORIGIN).href}`
   const result=await sender.send({deliveryId:warning,from:env.MAIL_FROM,to:[key.email],subject:`Inkwell API key expiry: ${days}-day warning`,text:body,html:htmlBody(body,'Open Inkwell'),headers:{'Auto-Submitted':'auto-generated'}})
   state=['accepted','development'].includes(result.status)?'sent':result.status;message=result.providerMessageId??null
  }catch{state='uncertain'}
  await env.DB.prepare('UPDATE iw_api_key_warnings SET state=?,finished_at=?,provider=?,provider_message_id=? WHERE id=?').bind(state,stamp,env.MAIL_PROVIDER??null,message,warning).run()
 }
}
