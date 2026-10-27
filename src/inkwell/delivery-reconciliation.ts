import { canonical, id, insist, now, sha256, type Actor, type Env } from './model'
import { atomic, commandWrite, getEnvelope, previousCommand, roleGuard, type Guard } from './storage'
import type { CommandContext } from './envelopes'
import type { DeliveryEvent } from '../mail-events.server.mjs'

type State={provider:string;provider_message_id:string;recipient:string;status:string;occurred_at:number;event_id:string;terminal:number}
type Mail={id:string;provider:string|null;provider_message_id:string|null;recipient:string;state:string}
const terminal=new Set(['delivered','bounced','failed','rejected','complained'])
function owner(actor:Actor){insist(actor.role==='owner'&&actor.sessionId&&!actor.agentId&&!actor.apiKeyId,'Only the signed-in owner may reconcile delivery records.',403)}
// Only normalized receipts already authenticated by the native webhook intake are evidence.
// No provider send, unsigned input or uncertain message can establish a delivery result.
const mailSql="SELECT COALESCE(json_group_array(json_object('id',id,'provider',provider,'provider_message_id',provider_message_id,'recipient',recipient,'state',state)),'[]') AS snapshot FROM (SELECT * FROM iw_mail WHERE envelope_id=? ORDER BY id)"
const receiptSql="SELECT COALESCE(json_group_array(json_object('provider',provider,'event_id',event_id,'event_json',event_json,'fingerprint',fingerprint)),'[]') AS snapshot FROM (SELECT * FROM rer_mail_event_receipts r WHERE tenant_id='inkwell' AND event_namespace=provider||'-webhook' AND EXISTS(SELECT 1 FROM iw_mail m WHERE m.envelope_id=? AND m.state='sent' AND m.provider=r.provider AND (m.provider_message_id=json_extract(r.event_json,'$.providerMessageId') OR m.id=json_extract(r.event_json,'$.deliveryId'))) ORDER BY rowid LIMIT 1001)"
const stateSql="SELECT COALESCE(json_group_array(json_object('provider',provider,'provider_message_id',provider_message_id,'recipient',recipient,'status',status,'occurred_at',occurred_at,'event_id',event_id,'terminal',terminal)),'[]') AS snapshot FROM (SELECT * FROM rer_mail_event_states s WHERE tenant_id='inkwell' AND event_namespace=provider||'-webhook' AND EXISTS(SELECT 1 FROM iw_mail m WHERE m.envelope_id=? AND m.provider=s.provider AND (m.provider_message_id=s.provider_message_id OR EXISTS(SELECT 1 FROM rer_mail_event_receipts r WHERE r.tenant_id=s.tenant_id AND r.event_namespace=s.event_namespace AND r.provider=s.provider AND json_extract(r.event_json,'$.providerMessageId')=s.provider_message_id AND json_extract(r.event_json,'$.deliveryId')=m.id))) ORDER BY provider,provider_message_id,recipient LIMIT 1001)"
const snapshot=async(env:Env,sql:string,envelopeId:string)=>(await env.DB.prepare(sql).bind(envelopeId).first<{snapshot:string}>())!.snapshot
const key=(state:Pick<State,'provider'|'provider_message_id'|'recipient'>)=>canonical([state.provider,state.provider_message_id,state.recipient])
async function inspect(env:Env,envelopeId:string){
 const envelope=await getEnvelope(env.DB,envelopeId)
 const snapshots=await Promise.all([mailSql,receiptSql,stateSql].map(sql=>snapshot(env,sql,envelopeId)))
 const mail=JSON.parse(snapshots[0]) as Mail[],receipts=JSON.parse(snapshots[1]) as {provider:string;event_id:string;event_json:string}[],states=JSON.parse(snapshots[2]) as State[]
 insist(receipts.length<=1000&&states.length<=1000,'This delivery history needs a bounded reconciliation before continuing.',409)
 const expected=new Map<string,State>(),confirmed=new Set<string>()
 for(const receipt of receipts){
  const event=JSON.parse(receipt.event_json) as DeliveryEvent
  insist(['resend','sendgrid'].includes(receipt.provider)&&event.provider===receipt.provider&&event.eventId===receipt.event_id&&event.tenantId==='inkwell'&&event.eventNamespace===event.provider+'-webhook'&&Number.isSafeInteger(event.occurredAt)&&Array.isArray(event.recipients),'A delivery receipt cannot be reconciled safely.',409)
  for(const recipient of event.recipients){
   const message=mail.find(m=>m.state==='sent'&&m.provider===event.provider&&(m.provider_message_id===event.providerMessageId||m.id===event.deliveryId)&&m.recipient.toLowerCase()===recipient.toLowerCase())
   if(!message)continue
   confirmed.add(message.id)
   if(event.status===null)continue
   insist(['accepted','deferred',...terminal].includes(event.status),'A delivery receipt has an unsupported outcome.',409)
   const candidate:State={provider:event.provider,provider_message_id:event.providerMessageId,recipient,status:event.status,occurred_at:event.occurredAt,event_id:event.eventId,terminal:terminal.has(event.status)?1:0},identity=key(candidate),prior=expected.get(identity)
   if(!prior||candidate.terminal>prior.terminal||candidate.terminal===prior.terminal&&(candidate.occurred_at>prior.occurred_at))expected.set(identity,candidate)
  }
 }
 insist(states.every(state=>expected.has(key(state))),'Delivery state has no matching verified outcome. Leave it unresolved until provider evidence is confirmed.',409)
 const repairs=[...expected.values()].filter(wanted=>{const current=states.find(s=>key(s)===key(wanted));return !current||canonical(current)!==canonical(wanted)})
 const changes=repairs.map(wanted=>({messageId:mail.find(m=>m.provider===wanted.provider&&m.recipient.toLowerCase()===wanted.recipient.toLowerCase()&&(m.provider_message_id===wanted.provider_message_id||receipts.some(r=>{const e=JSON.parse(r.event_json) as DeliveryEvent;return e.providerMessageId===wanted.provider_message_id&&e.deliveryId===m.id})))!.id,provider:wanted.provider,before:states.find(s=>key(s)===key(wanted))?.status??null,after:wanted.status}))
 const guards:Guard[]=[{sql:'EXISTS(SELECT 1 FROM iw_envelopes WHERE id=? AND version=?)',values:[envelopeId,envelope.version]},...[mailSql,receiptSql,stateSql].map((sql,index)=>({sql:`(${sql.replace(' AS snapshot','')})=?`,values:[envelopeId,snapshots[index]]}))]
 return {repairs,guards,view:{id:envelopeId,proposal:await sha256(canonical({version:envelope.version,snapshots})),changes,verifiedReceipts:receipts.length,unresolvedMessages:mail.filter(m=>m.state==='uncertain'||m.state==='sent'&&!confirmed.has(m.id)).length}}
}
export async function deliveryReconciliation(env:Env,actor:Actor,envelopeId:string){owner(actor);return (await inspect(env,envelopeId)).view}
export async function repairDeliveryRecords(env:Env,context:CommandContext,input:Record<string,unknown>){
 owner(context.actor)
 const previous=await previousCommand(env.DB,context.actor.id,context.commandId,context.fingerprint);if(previous)return previous
 insist(typeof input.id==='string'&&input.approve===true,'Review and explicitly approve a delivery repair.',400)
 const plan=await inspect(env,input.id)
 insist(input.proposal===plan.view.proposal&&plan.repairs.length>0,'Delivery evidence changed or no repair is needed. Review it again.',409)
 const result={...plan.view,repaired:plan.repairs.length}
 await atomic(env.DB,[roleGuard(context.actor,['owner']),...plan.guards],[...plan.repairs.map(s=>env.DB.prepare("INSERT INTO rer_mail_event_states(provider,tenant_id,event_namespace,provider_message_id,recipient,status,occurred_at,event_id,terminal) VALUES(?,'inkwell',?,?,?,?,?,?,?) ON CONFLICT(provider,tenant_id,event_namespace,provider_message_id,recipient) DO UPDATE SET status=excluded.status,occurred_at=excluded.occurred_at,event_id=excluded.event_id,terminal=excluded.terminal").bind(s.provider,s.provider+'-webhook',s.provider_message_id,s.recipient,s.status,s.occurred_at,s.event_id,s.terminal)),env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,NULL,?)').bind(id().replaceAll('-',''),now(),context.actor.id,'delivery.reconciliation.approved',input.id,canonical({proposal:plan.view.proposal,repaired:plan.repairs.length})),commandWrite(env.DB,context.actor.id,context.commandId,context.fingerprint,result)])
 return result
}
