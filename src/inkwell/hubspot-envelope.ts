import { appendEvent, canonical, id, insist, now, object, text, type Envelope, type Env } from './model'
import { useTemplate, loadTemplate } from './templates'
import { hubspotCredential, hubspotRequest, type HubspotCredential } from './hubspot-provider'
import { hubspotEscalationOwner, hubspotNativeAdministrator, hubspotPreparationGuard } from './hubspot-envelope-authority'
import { atomic, previousCommand, roleGuard, type Guard } from './storage'
import type { CommandContext } from './envelopes'

export interface HubspotMapping { field:string; object:'deals'|'contacts'; property:string; readOnly?:boolean }
const recordId=(value:unknown)=>{const result=text(value,'a HubSpot record ID',100);insist(/^[A-Za-z0-9_-]+$/.test(result),'Invalid HubSpot record ID.');return result}
function mappingsOf(value:unknown):HubspotMapping[] {
  insist(Array.isArray(value)&&value.length<=100,'List up to 100 HubSpot field mappings.')
  const mappings=value.map(raw=>{const m=object(raw);insist(m.object==='deals'||m.object==='contacts','Map deal or contact properties.');const property=text(m.property,'a HubSpot property',100);insist(/^[a-zA-Z][a-zA-Z0-9_]*$/.test(property),'Invalid HubSpot property.');insist(m.readOnly===undefined||typeof m.readOnly==='boolean','Choose whether the mapped field is read-only.');return {field:text(m.field,'a template field ID',100),object:m.object,property,...(m.readOnly===undefined?{}:{readOnly:m.readOnly})} as HubspotMapping})
  insist(new Set(mappings.map(m=>m.field)).size===mappings.length,'Map each template field once.');return mappings
}
async function nativeRecord(env:Env,c:HubspotCredential,type:'deals'|'contacts',record:string,properties:string[]) {
  const result=await hubspotRequest(env,c,`/crm/v3/objects/${type}/${encodeURIComponent(record)}?properties=${encodeURIComponent([...new Set(properties)].join(','))}`)
  insist(result.id===record&&!result.archived,'HubSpot returned a different or archived record.',502)
  return object(result.properties)
}
const consentStatement='I authorize Inkwell to read these selected HubSpot records, merge the listed properties into this template, and write completion status, executed key fields, custom metadata and one private executed PDF with one timeline note back to this record. This grants no additional envelope access, sending consent or follow-up authority.'

/** A native selected-record read is separate from the source policy governing a requested autonomous send. */
export async function prepareHubspotEnvelope(env:Env,context:CommandContext,input:Record<string,unknown>) {
  const actor=context.actor;hubspotNativeAdministrator(actor)
  insist(input.consent===true,'Explicitly authorize this selected HubSpot record preparation.',403)
  insist(input.send===undefined||typeof input.send==='boolean','Choose whether to request an integration send.')
  const previous=await previousCommand(env.DB,actor.id,context.commandId,context.fingerprint);if(previous)return previous
  insist(input.recordType==='deals'||input.recordType==='contacts','Choose a deal or contact.')
  const type=input.recordType,record=recordId(input.recordId),templateId=text(input.templateId,'a template ID'),mappings=mappingsOf(input.mappings??[])
  const {template}=await loadTemplate(env,actor,templateId,'use')
  for(const mapping of mappings)insist(template.fields.some(f=>f.id===mapping.field||f.name===mapping.field),'Map only fields belonging to the selected template.')
  const contactId=type==='contacts'?record:input.contactId===undefined?undefined:recordId(input.contactId)
  insist(!mappings.some(m=>m.object==='deals')||type==='deals','Choose a deal for deal property mappings.')
  insist(!mappings.some(m=>m.object==='contacts')||contactId,'Select the contact for contact property mappings.')
  const credential=await hubspotCredential(env),authorizedAt=now(),binding=id()
  const selected=await nativeRecord(env,credential,type,record,[...mappings.filter(m=>m.object===type).map(m=>m.property),'hubspot_owner_id',...(type==='contacts'?['email','firstname','lastname']:[])])
  const contact=type==='contacts'?selected:contactId?await nativeRecord(env,credential,'contacts',contactId,[...mappings.filter(m=>m.object==='contacts').map(m=>m.property),'email','firstname','lastname']):undefined
  let ownerId:string|undefined
  const crmOwner=selected.hubspot_owner_id
  if(typeof crmOwner==='string'&&crmOwner){const owner=await hubspotRequest(env,credential,`/crm/v3/owners/${encodeURIComponent(recordId(crmOwner))}`);if(typeof owner.email==='string'&&!owner.archived){const member=await env.DB.prepare("SELECT id FROM oa_operators WHERE lower(email)=lower(?) AND status='active'").bind(owner.email).first<{id:string}>();ownerId=member?.id}}
  const recipients=input.recipients??(contact?[{name:[contact.firstname,contact.lastname].filter(v=>typeof v==='string'&&v).join(' ')||contact.email,email:contact.email}]:undefined)
  const prefill:Record<string,unknown>={}
  for(const mapping of mappings){const properties=mapping.object==='contacts'?contact:selected,value=properties?.[mapping.property];insist(typeof value==='string'&&value.trim().length>0,'A selected HubSpot property is empty or invalid.',422);const field=template.fields.find(f=>f.id===mapping.field||f.name===mapping.field)!;prefill[mapping.field]={value,source:`HubSpot ${credential.accountId} ${mapping.object} ${mapping.object==='contacts'?contactId:record}.${mapping.property}`,readOnly:Boolean(field.readOnly||mapping.readOnly)}}
  const scope={version:1,accountId:credential.accountId,recordType:type,recordId:record,...(contactId?{contactId}:{}),templateId,mappings,writeback:{properties:['inkwell_status','inkwell_envelope_id','inkwell_completed_at','inkwell_signed_sha256','inkwell_key_fields','inkwell_custom_fields'],timelineNote:true,executedPdf:true}}
  const guards:Guard[]=[...(context.guards??[]),roleGuard(actor,['owner','admin']),await hubspotPreparationGuard(env,credential)]
  if(input.send)await atomic(env.DB,guards,[env.DB.prepare('INSERT INTO iw_hubspot_send_bindings(id,credential_version,account_id,principal,member_version,member_role) VALUES(?,?,?,?,?,?)').bind(binding,credential.version,credential.accountId,actor.id,actor.version,actor.role)])
  return useTemplate(env,{...context,guards,crm:{
    ...(input.send?{origin:{source:'integration' as const,principal:actor.id,credential:{kind:'hubspot' as const,id:binding}}}:{}),
    prepare:async e=>{
      if(ownerId){const provisional={action:'hubspot.record_prepared',detail:{escalationOwner:ownerId}};const probe={...e,events:[...e.events,provisional]} as Envelope;ownerId=await hubspotEscalationOwner(env,probe)}
      await appendEvent(e,'hubspot.record_prepared',actor.id,{authorization:{...scope,actor:actor.id,at:authorizedAt,statement:consentStatement},...(ownerId?{escalationOwner:ownerId}:{}),noAccessGranted:true,followupGranted:false})
    },
    writes:async e=>{
      await hubspotPreparationGuard(env,credential)
      return [env.DB.prepare('INSERT INTO iw_hubspot_envelopes(envelope_id,account_id,record_type,record_id,credential_version,principal,member_version,authorized_at,scope) VALUES(?,?,?,?,?,?,?,?,?)').bind(e.id,credential.accountId,type,record,credential.version,actor.id,actor.version,authorizedAt,canonical(scope)),
        env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,NULL,?)').bind(id().replaceAll('-',''),authorizedAt,actor.id,'hubspot.record.authorized',e.id,canonical({consent:true,statement:consentStatement,scope,outcome:'prepared'}))]
    },
  }},{id:templateId,recipients,prefill,customFields:input.customFields,sendAt:input.sendAt},input.send===true)
}
