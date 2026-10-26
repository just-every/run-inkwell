import { ApiRateLimit } from './api-limits'
import { sha256, type Env } from './model'

export async function embedLimit(env:Env,stage:'issue'|'redeem'|'request',subject:string){
 const at=Date.now(),cutoff=at-60_000,individual=stage==='request'?600:60,total=stage==='request'?null:300
 await env.DB.prepare('DELETE FROM iw_embed_rates WHERE at<=?').bind(cutoff).run()
 const admitted=await env.DB.prepare(`INSERT INTO iw_embed_rates(id,stage,subject,at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM iw_embed_rates WHERE stage=? AND subject=? AND at>?)<?${total===null?'':' AND (SELECT COUNT(*) FROM iw_embed_rates WHERE stage=? AND at>?)<?'} RETURNING id`).bind(crypto.randomUUID(),stage,subject,at,stage,subject,cutoff,individual,...(total===null?[]:[stage,cutoff,total])).first()
 if(!admitted){
  const first=await env.DB.prepare('SELECT MIN(at) AS at FROM iw_embed_rates WHERE stage=? AND (subject=? OR ?) AND at>?').bind(stage,subject,total===null?0:1,cutoff).first<{at:number}>()
  await env.DB.prepare('INSERT INTO iw_embed_audit(id,actor,action,origin,at,detail) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),'opaque:'+await sha256(subject),'limit.refused','',new Date(at).toISOString(),JSON.stringify({purpose:stage,outcome:'refused'})).run()
  throw new ApiRateLimit(Math.max(1,Math.ceil(((first?.at??at)+60_000-at)/1000)))
 }
}
