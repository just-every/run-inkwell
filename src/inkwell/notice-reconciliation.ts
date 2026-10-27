import { canonical, id, insist, now, sha256, type Actor, type Env } from './model'
import { atomic, roleGuard } from './storage'
import { dispatchNotices } from './notices'

function owner(actor:Actor){insist(actor.role==='owner'&&actor.sessionId&&!actor.agentId&&!actor.apiKeyId,'Only the signed-in owner may approve connector repairs.',403)}
type Row={cursor:number;id:string;operator_id:string;channel:string;state:string;result:string;attempts:number;connection:string|null;repairable:number;sealed:string|null;masked:string|null}
const sql="SELECT p.rowid AS cursor,p.id,p.operator_id,p.channel,p.state,p.result,p.attempts,p.connection,p.repairable,c.sealed,c.masked FROM iw_notice_posts p LEFT JOIN iw_notice_channels c ON c.operator_id=p.operator_id AND c.channel=p.channel"
const rows=async(env:Env,before:number)=>(await env.DB.prepare(sql+" WHERE p.state IN ('held','uncertain','sending') AND (?=0 OR p.rowid<?) ORDER BY p.rowid DESC LIMIT 101").bind(before,before).all<Row>()).results
const proposal=async(row:Row)=>sha256(canonical(row))
const canReplay=async(row:Row)=>row.state==='held'&&row.repairable===1&&row.attempts<3&&Boolean(row.sealed)&&row.connection!==await sha256(row.sealed!)
export async function noticeReconciliation(env:Env,actor:Actor,params=new URLSearchParams()){
 owner(actor)
 const before=Number(params.get('before')??0)
 insist(Number.isSafeInteger(before)&&before>=0,'Provide a valid repair cursor.',400)
 const page=await rows(env,before),visible=page.slice(0,100)
 return {nextCursor:page.length>100?String(visible[visible.length-1].cursor):null,jobs:await Promise.all(visible.map(async row=>({id:row.id,channel:row.channel,state:row.state,result:row.result,attempts:row.attempts,destination:row.masked,canReplay:await canReplay(row),proposal:await proposal(row)})))}
}
export async function repairNoticeConnection(env:Env,actor:Actor,input:Record<string,unknown>){
 owner(actor)
 insist(input.approve===true&&typeof input.id==='string','Review and explicitly approve the replacement connection.',400)
 const row=await env.DB.prepare(sql+' WHERE p.id=?').bind(input.id).first<Row>()
 insist(row&&await canReplay(row),'This post cannot be replayed safely. Unconfirmed effects remain unresolved.',409)
 insist(input.proposal===await proposal(row),'The connection or post changed. Review it again.',409)
 await atomic(env.DB,[roleGuard(actor,['owner']),{sql:"EXISTS(SELECT 1 FROM iw_notice_posts WHERE id=? AND state='held' AND repairable=1 AND attempts=? AND connection IS ?)",values:[row.id,row.attempts,row.connection]},{sql:'EXISTS(SELECT 1 FROM iw_notice_channels WHERE operator_id=? AND channel=? AND sealed=?)',values:[row.operator_id,row.channel,row.sealed]}],[
  env.DB.prepare("UPDATE iw_notice_posts SET state='pending',connection=?,repairable=0,result='Owner approved replacement connection.' WHERE id=?").bind(await sha256(row.sealed!),row.id),
  env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,NULL,?)').bind(id().replaceAll('-',''),now(),actor.id,'notice.reconciliation.approved',row.id,canonical({channel:row.channel,proposal:input.proposal}))
 ])
 await dispatchNotices(env)
 return noticeReconciliation(env,actor)
}
