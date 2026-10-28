import { appendEvent, canonical, id, insist, now, object, sha256, text, type Envelope, type Env } from './model'
import { useTemplate, loadTemplate } from './templates'
import { salesforceCredential, salesforceRequest, type SalesforceCredential } from './salesforce-provider'
import { salesforceNativeAdministrator, salesforcePreparationGuard } from './salesforce-envelope-authority'
import { hubspotEscalationOwner } from './hubspot-envelope-authority'
import { atomic, roleGuard, type Guard } from './storage'
import type { CommandContext } from './envelopes'
export const salesforceRecordId=(value:unknown)=>{const result=text(value,'a Salesforce record ID',100);insist(/^[A-Za-z0-9_-]+$/.test(result),'Invalid Salesforce record ID.');return result}
export const salesforceField=(value:unknown)=>{const result=text(value,'a Salesforce field',100);insist(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(result),'Invalid Salesforce field.');return result}
export const recordPath=(type:string,record:string)=>`/services/data/v64.0/sobjects/${type}/${encodeURIComponent(record)}`
export const salesforceConsent='I authorize Inkwell to read this selected Salesforce record, merge the listed fields into this template, and return completion status, executed fields and one executed PDF to the same record. This grants no additional envelope access, sending consent or follow-up authority.'
function property(row:Record<string,unknown>,path:string):unknown{let value:unknown=row;for(const key of path.split('.'))value=value&&typeof value==='object'?object(value)[key]:undefined;return value}
async function nativeRecord(env:Env,c:SalesforceCredential,type:string,record:string,fields:string[]){
 const row=await salesforceRequest(env,c,recordPath(type,record)+'?'+new URLSearchParams({fields:[...new Set(['Id',...fields])].join(',')}))
 insist(row.Id===record&&row.IsDeleted!==true,'Salesforce returned a different or deleted record.',502);return row
}
export async function prepareSalesforceEnvelope(env:Env,context:CommandContext,input:Record<string,unknown>){
 const actor=context.actor;salesforceNativeAdministrator(actor)
 const requestKey=await sha256(actor.id+'\n'+context.commandId)
 insist(!await env.DB.prepare('SELECT 1 FROM iw_salesforce_replay_fences WHERE request_key=?').bind(requestKey).first(),'This preparation was erased. A replay cannot restore it.',410)
 insist(input.consent===true,'Explicitly authorize this selected Salesforce record.',403)
 insist(input.send===undefined||typeof input.send==='boolean','Choose whether to request an integration send.')
 insist(['Opportunity','Account','Contact'].includes(String(input.recordType)),'Choose an Opportunity, Account or Contact.')
 const type=String(input.recordType),record=salesforceRecordId(input.recordId),templateId=text(input.templateId,'a template ID'),{template}=await loadTemplate(env,actor,templateId,'use')
 insist(Array.isArray(input.mappings)&&input.mappings.length<=100,'List up to 100 Salesforce field mappings.')
 const mappings=input.mappings.map(raw=>{const m=object(raw),field=text(m.field,'a template field ID',100);insist(template.fields.some(f=>f.id===field||f.name===field),'Map a field in this template.');insist(m.readOnly===undefined||typeof m.readOnly==='boolean','Choose whether the value is read-only.');return {field,property:salesforceField(m.property),readOnly:m.readOnly===true}})
 insist(new Set(mappings.map(m=>m.field)).size===mappings.length,'Map each template field once.')
 const c=await salesforceCredential(env),selected=await nativeRecord(env,c,type,record,[...mappings.map(m=>m.property),'OwnerId',...(type==='Contact'?['Name','Email']:[])]),prefill:Record<string,unknown>={}
 for(const m of mappings){const value=property(selected,m.property),field=template.fields.find(f=>f.id===m.field||f.name===m.field)!;insist(typeof value==='string'||typeof value==='number'||(field.type==='checkbox'&&typeof value==='boolean'),'A selected Salesforce field is empty or invalid.',422);insist(String(value).trim(),'A selected Salesforce field is empty.',422);prefill[m.field]={value:String(value),source:`Salesforce ${c.accountId} ${type} ${record}.${m.property}`,readOnly:Boolean(field.readOnly||m.readOnly)}}
 let ownerId:string|undefined
 if(typeof selected.OwnerId==='string'){const owner=await nativeRecord(env,c,'User',salesforceRecordId(selected.OwnerId),['Email','IsActive']);if(owner.IsActive===true&&typeof owner.Email==='string')ownerId=(await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=lower(?) AND status='active'").bind(owner.Email).first<{id:string}>())?.id}
 const at=now(),binding=id(),scope={version:1,accountId:c.accountId,recordType:type,recordId:record,templateId,mappings,writeback:{fields:['Inkwell_Status__c','Inkwell_Envelope_Id__c','Inkwell_Completed_At__c','Inkwell_Signed_SHA256__c','Inkwell_Key_Fields__c'],executedPdf:true}}
 const guards:Guard[]=[{sql:'NOT EXISTS(SELECT 1 FROM iw_salesforce_replay_fences WHERE request_key=?)',values:[requestKey]},...(context.guards??[]),roleGuard(actor,['owner','admin']),await salesforcePreparationGuard(env,c)]
 if(input.send)await atomic(env.DB,guards,[env.DB.prepare('INSERT INTO iw_salesforce_send_bindings(id,credential_version,account_id,principal,member_version,member_role) VALUES(?,?,?,?,?,?)').bind(binding,c.version,c.accountId,actor.id,actor.version,actor.role)])
 return useTemplate(env,{...context,guards,crm:{
  ...(input.send?{origin:{source:'salesforce' as const,principal:actor.id,credential:{kind:'salesforce' as const,id:binding}}}:{}),
  prepare:async e=>{
   if(ownerId){ownerId=await hubspotEscalationOwner(env,{...e,events:[...e.events,{action:'salesforce.record_prepared',detail:{escalationOwner:ownerId}}]} as Envelope)}
   await appendEvent(e,'salesforce.record_prepared',actor.id,{authorization:{...scope,actor:actor.id,at,statement:salesforceConsent},...(ownerId?{escalationOwner:ownerId}:{}),noAccessGranted:true,followupGranted:false})
  },
  writes:async e=>{await salesforcePreparationGuard(env,c);return[
   env.DB.prepare('INSERT INTO iw_salesforce_envelopes(envelope_id,account_id,record_type,record_id,credential_version,principal,member_version,authorized_at,scope,request_key) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(e.id,c.accountId,type,record,c.version,actor.id,actor.version,at,canonical(scope),requestKey),
   env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,NULL,?)').bind(id().replaceAll('-',''),at,actor.id,'salesforce.record.authorized',e.id,canonical({consent:true,statement:salesforceConsent,scope,outcome:'prepared'}))
  ]},
 }},{id:templateId,recipients:input.recipients??(type==='Contact'?[{name:selected.Name,email:selected.Email}]:undefined),prefill,customFields:input.customFields,sendAt:input.sendAt},input.send===true)
}
