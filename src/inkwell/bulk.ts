import {seal,unseal} from './seal'
import { appendEvent,canonical,id,insist,now,sha256,text,type Actor,type Envelope,type Env } from './model'
import { atomic,roleGuard,previousCommand,type Guard } from './storage'
import { loadTemplate,useTemplate,type Template } from './templates'
import { evaluateSendPolicy,insistAllowed } from './send-policies'
import { readBulkSheet } from './bulk-sheet'
import { dispatchMail } from './mail'
import { mailSuppressed } from './manual-invitations'

type Cells=Record<string,string>
const codeColumn=(key:string)=>/(^|\.)accessCode$/.test(key)
/** A preview validates a frozen definition. Reuse identical reads within this request so large
 * lists do not spend one database round trip per shared setting per row. Release never uses this cache. */
function validationEnv(env:Env):Env {
 const cache=new Map<string,Promise<unknown>>()
 const statement=(prepared:D1PreparedStatement,sql:string,values:unknown[]):D1PreparedStatement=>new Proxy(prepared,{
  get(target,property) {
   if(property==='bind')return(...parameters:unknown[])=>statement(target.bind(...parameters),sql,parameters)
   if(property==='first'||property==='all')return(...options:unknown[])=>{
    const key=canonical([sql,values,property,options])
    if(!cache.has(key))cache.set(key,Promise.resolve(Reflect.apply(Reflect.get(target,property),target,options)))
    return cache.get(key)!.then(value=>structuredClone(value))
   }
   const value=Reflect.get(target,property)
   return typeof value==='function'?value.bind(target):value
  }
 })
 return {...env,DB:new Proxy(env.DB,{get(target,property){
  if(property==='prepare')return(sql:string)=>statement(target.prepare(sql),sql,[])
  const value=Reflect.get(target,property)
  return typeof value==='function'?value.bind(target):value
 }})}
}
async function protectRows(env:Env,binding:string,rows:Cells[]) {
 const result:Cells[]=[]
 for(const [index,row] of rows.entries()) {
  const copy={...row}
  for(const [key,value] of Object.entries(row)) if(codeColumn(key)&&value) copy[key]=await seal(env,'bulk-access-code',`${binding}:${index}:${key}`,value)
  result.push(copy)
 }
 return result
}
async function openRows(env:Env,binding:string,source:string):Promise<Cells[]> {
 const rows=JSON.parse(source) as Cells[]
 for(const [index,row] of rows.entries()) for(const [key,value] of Object.entries(row)) if(codeColumn(key)&&value) {
  const code=await unseal(env,'bulk-access-code',`${binding}:${index}:${key}`,value)
  insist(code,'The stored access code cannot be opened. Upload the recipient list again.',409)
  row[key]=code
 }
 return rows
}
const shownCells=(row:Cells)=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,codeColumn(key)&&value?'••••':value]))
interface Batch {id:string;owner:string;name:string;template_id:string;template_data:string;rows_json:string;validation_json:string;state:'preview'|'approved'|'held';approved_at:string|null;policy_fingerprint:string|null}
function rowInput(template:Template,row:Cells){const recipients=template.roles.map(role=>{const prefix=template.roles.length===1?'':role.role+'.',name=text(row[prefix+'name'],`the ${role.role} name`,100),email=text(row[prefix+'email'],`the ${role.role} email`,254).toLowerCase();insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),`Invalid email for ${role.role}.`);return {name,email,...(role.accessCode?{accessCode:text(row[prefix+'accessCode'],'an access code',32)}:{}),...((role.sms||role.providerAuth==='voice')?{phone:text(row[prefix+'phone'],'a phone number',40)}:{})}});const prefill=Object.fromEntries(template.fields.filter(f=>row[f.id]!==undefined&&row[f.id]!=='').map(f=>[f.id,{value:row[f.id],source:'bulk spreadsheet'}]));return {recipients,prefill}}
const model=(batch:Batch)=>({template:{id:batch.template_id},bulkBatch:{id:batch.id,name:batch.name,row:0,approvedAt:batch.approved_at}} as Envelope)
async function batchFor(env:Env,actor:Actor,key:string){const row=await env.DB.prepare('SELECT * FROM iw_bulk_batches WHERE id=? AND owner=?').bind(key,actor.id).first<Batch>();insist(row,'Batch not found.',404);return row}
export async function bulkIndex(env:Env,actor:Actor){return {batches:(await env.DB.prepare('SELECT id,name,state FROM iw_bulk_batches WHERE owner=? ORDER BY rowid DESC').bind(actor.id).all()).results,lists:(await env.DB.prepare('SELECT id,name FROM iw_bulk_lists WHERE owner=? ORDER BY rowid DESC').bind(actor.id).all()).results}}
export async function previewBulk(env:Env,actor:Actor,templateId:string,name:string,request:Request,listId?:string){const {template}=await loadTemplate(env,actor,templateId,'use');let rows:Cells[];if(listId){const saved=await env.DB.prepare('SELECT rows_json FROM iw_bulk_lists WHERE id=? AND owner=?').bind(listId,actor.id).first<{rows_json:string}>();insist(saved,'Saved list not found.',404);rows=await openRows(env,listId,saved.rows_json)}else rows=await readBulkSheet(request);const batch:Batch={id:id(),owner:actor.id,name:text(name,'a batch name',100),template_id:template.id,template_data:JSON.stringify(template),rows_json:JSON.stringify(rows),validation_json:'[]',state:'preview',approved_at:null,policy_fingerprint:null};const validating=validationEnv(env),validation:(string|null)[]=[];for(const row of rows){try{const input=rowInput(template,row);await useTemplate(validating,{actor,commandId:'preview',fingerprint:''},{id:template.id,...input},false,true);validation.push(null)}catch(error){validation.push(error instanceof Error?error.message:'Invalid row.')}}batch.validation_json=JSON.stringify(validation);batch.rows_json=JSON.stringify(await protectRows(env,batch.id,rows));await atomic(env.DB,[roleGuard(actor)],[env.DB.prepare('INSERT INTO iw_bulk_batches VALUES(?,?,?,?,?,?,?,?,?,?)').bind(...Object.values(batch))]);return bulkView(env,actor,batch.id)}
export async function bulkView(env:Env,actor:Actor,key:string){const batch=await batchFor(env,actor,key),template=JSON.parse(batch.template_data) as Template,records=(await env.DB.prepare("SELECT r.row_number,e.id,e.data FROM iw_bulk_rows r LEFT JOIN iw_envelopes e ON e.id=r.envelope_id WHERE r.batch_id=?").bind(key).all<{row_number:number;id:string|null;data:string|null}>()).results,mapped=new Map(records.map(r=>[r.row_number,r]));return {id:batch.id,name:batch.name,state:batch.state,approvedAt:batch.approved_at,rows:(await openRows(env,batch.id,batch.rows_json)).map((cells,index)=>{const record=mapped.get(index);try{const error=JSON.parse(batch.validation_json)[index];insist(!error,error??'Invalid row.');rowInput(template,cells);const e=record?.data?JSON.parse(record.data) as Envelope:undefined;return {number:index+1,cells:shownCells(cells),valid:true,...(record?{envelopeId:record.id??undefined,status:e?(e.status==='awaiting_signature'&&Date.parse(e.expiresAt)<=Date.now()?'expired':e.internalApproval?.state==='pending'?'internal approval':e.status):'erased'}:{status:'ready'})}}catch(error){return {number:index+1,cells:shownCells(cells),valid:false,status:'invalid',error:error instanceof Error?error.message:'Invalid row.'}}})}}
export async function approveBulk(env:Env,actor:Actor,key:string,eligible:unknown){insist(eligible===true,'Confirm eligibility and approve this entire batch.');insist(!mailSuppressed(env),'Configure email before sending a bulk batch.',409);const batch=await batchFor(env,actor,key);insist(batch.state==='preview','Only a preview can be approved.',409);const {template}=await loadTemplate(env,actor,batch.template_id,'use');insist(JSON.stringify(template)===batch.template_data,'The template changed. Create a new preview.',409);const decision=await evaluateSendPolicy(env,model(batch),actor.id,{deferred:false,approved:false,stage:'request'});insistAllowed(decision);await atomic(env.DB,[roleGuard(actor),decision.fence,{sql:"EXISTS(SELECT 1 FROM iw_bulk_batches WHERE id=? AND state='preview')",values:[key]}],[env.DB.prepare("UPDATE iw_bulk_batches SET state='approved',approved_at=?,policy_fingerprint=? WHERE id=?").bind(now(),decision.record.fingerprint,key)]);return bulkView(env,actor,key)}
export async function processBulk(env:Env,actor:Actor,key:string){const batch=await batchFor(env,actor,key);insist(batch.state==='approved','Approve the preview before processing; a held batch needs a new preview.',409);const rows=await openRows(env,batch.id,batch.rows_json),template=JSON.parse(batch.template_data) as Template;const done=new Set((await env.DB.prepare("SELECT row_number FROM iw_bulk_rows WHERE batch_id=?").bind(key).all<{row_number:number}>()).results.map(r=>r.row_number));let processed=0
 for(let index=0;index<rows.length&&processed<5;index++){if(done.has(index))continue;const commandId=`bulk:${key}:${index}`,fingerprint=await sha256(canonical({batch:key,row:index})),previous=await previousCommand(env.DB,actor.id,commandId,fingerprint);if(previous){await dispatchMail(env,previous.id);continue}if(JSON.parse(batch.validation_json)[index])continue;let input:ReturnType<typeof rowInput>;try{input=rowInput(template,rows[index])}catch{continue}
 const current=await env.DB.prepare('SELECT data FROM iw_templates WHERE id=?').bind(batch.template_id).first<{data:string}>(),decision=await evaluateSendPolicy(env,model(batch),actor.id,{deferred:false,approved:false,stage:'request'});if(current?.data!==batch.template_data||!decision.allowed||decision.record.fingerprint!==batch.policy_fingerprint){await atomic(env.DB,[roleGuard(actor)],[env.DB.prepare("UPDATE iw_bulk_batches SET state='held' WHERE id=?").bind(key)]);break}
 const guard:Guard={sql:"EXISTS(SELECT 1 FROM iw_bulk_batches WHERE id=? AND owner=? AND state='approved' AND policy_fingerprint=?) AND EXISTS(SELECT 1 FROM iw_templates WHERE id=? AND data=?)",values:[key,actor.id,batch.policy_fingerprint,batch.template_id,batch.template_data]}
 const result=await useTemplate(env,{actor,commandId,fingerprint,guards:[guard,decision.fence],bulk:{id:key,name:batch.name,row:index+1,approvedAt:batch.approved_at!,writes:e=>[env.DB.prepare('INSERT INTO iw_bulk_rows VALUES(?,?,?)').bind(key,index,e.id)]}},{id:batch.template_id,...input,eligible:true},true);await dispatchMail(env,result.id);processed++
 }return bulkView(env,actor,key)
}
export async function saveBulkList(env:Env,actor:Actor,key:string,name:unknown){const batch=await batchFor(env,actor,key),listId=id(),rows=JSON.stringify(await protectRows(env,listId,await openRows(env,batch.id,batch.rows_json)));await atomic(env.DB,[roleGuard(actor)],[env.DB.prepare('INSERT INTO iw_bulk_lists VALUES(?,?,?,?)').bind(listId,actor.id,text(name,'a list name',100),rows)]);return {id:listId}}
