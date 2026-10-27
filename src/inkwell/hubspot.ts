import { appendEvent, insist, object, text, type Env, type Actor, type Envelope } from './model'
import { atomic, commandWrite, roleGuard } from './storage'
import { contact, contactWrite } from './contacts'
import { loadTemplate, useTemplate } from './templates'
import type { CommandContext } from './envelopes'
import { eligibleCrmOwner } from './agents'

export const hubspotConsent = 'I authorize reading the selected HubSpot record into this draft. Sending and follow-up require separate human approval.'
function administrator(actor: Actor) {
 insist(['owner','admin'].includes(actor.role) && actor.sessionId && !actor.agentId && !actor.apiKeyId, 'Only a signed-in owner or admin can use HubSpot.',403)
}
const identifier = (value: unknown) => { const result=text(value,'a HubSpot record ID',100);insist(/^\d+$/.test(result),'Use a numeric HubSpot record ID.');return result }
const property = (value: unknown) => { const result=text(value,'a HubSpot property',100);insist(/^[a-z][a-z0-9_]*$/.test(result),'Use a HubSpot internal property name.');return result }
async function request(env: Env, path: string) {
 insist(env.HUBSPOT_ACCESS_TOKEN,'Configure the HubSpot credential in this installation first.',409)
 try {
  const response=await fetch('https://api.hubapi.com'+path,{headers:{Authorization:`Bearer ${env.HUBSPOT_ACCESS_TOKEN}`},redirect:'manual',signal:AbortSignal.timeout(15_000)})
  if(!response.ok){await response.body?.cancel();throw new Error()}
  return object(await response.json())
 } catch { insist(false,'HubSpot could not supply a verified record. No draft or contacts were changed.',502) }
}
/** Fixed official host; no caller URL, credential or raw provider response is persisted. */
export async function prepareHubspot(env:Env,context:CommandContext,input:Record<string,unknown>) {
 administrator(context.actor)
 insist(input.consent===true,'Explicitly authorize reading the selected CRM record.')
 const kind=input.objectType;insist(kind==='deals'||kind==='contacts','Choose a HubSpot deal or contact.')
 const recordId=identifier(input.recordId),templateId=text(input.templateId,'a template ID',100)
 const {template}=await loadTemplate(env,context.actor,templateId,'use')
 const mappings=object(input.fields)
 insist(Object.keys(mappings).length>0&&Object.keys(mappings).length<=50,'Map 1–50 template fields.')
 const requested=new Set<string>(['hubspot_owner_id']),map=new Map<string,{property:string;readOnly:boolean}>()
 for(const [fieldId,raw] of Object.entries(mappings)) {
  insist(template.fields.some(f=>f.id===fieldId),'Map only fields in the selected template.')
  const entry=object(raw);insist(typeof entry.readOnly==='boolean','Choose whether every mapped field is read-only.')
  const name=property(entry.property);requested.add(name);map.set(fieldId,{property:name,readOnly:entry.readOnly})
 }
 const record=await request(env,`/crm/v3/objects/${kind}/${recordId}?properties=${[...requested].join(',')}`)
 insist(record.id===recordId&&record.archived===false,'HubSpot returned a different or archived record.',502)
 const properties=object(record.properties),prefill:Record<string,unknown>={}
 for(const [fieldId,mapping] of map) {
  const value=properties[mapping.property]
  insist(typeof value==='string'&&value.trim().length>0,'A mapped HubSpot property is blank. Resolve it in the CRM first.')
  prefill[fieldId]={value,source:`HubSpot ${kind} ${recordId} property ${mapping.property}`,readOnly:mapping.readOnly}
 }
 // Owner resolution is a suggestion only; it neither grants access nor enables follow-up.
 let ownerEmail:string|undefined
 if(typeof properties.hubspot_owner_id==='string'&&/^\d+$/.test(properties.hubspot_owner_id)) {
  const owner=await request(env,`/crm/v3/owners/${properties.hubspot_owner_id}`)
  if(owner.id===properties.hubspot_owner_id&&owner.archived===false&&typeof owner.email==='string')ownerEmail=owner.email
 }
 return useTemplate(env,{...context,crm:{kind,recordId,ownerEmail,consent:hubspotConsent}}, {id:templateId,recipients:input.recipients,prefill,customFields:input.customFields})
}
/** This callback runs inside native template preparation, in its envelope transaction. */
export async function hubspotPreparationWrites(env:Env,envelope:Envelope,context:CommandContext) {
 const crm=context.crm!;const owner=crm.ownerEmail?await eligibleCrmOwner(env,envelope,crm.ownerEmail):undefined
 await appendEvent(envelope,'hubspot.prepared',context.actor.id,{objectType:crm.kind,recordId:crm.recordId,consent:crm.consent,escalationOwner:owner??null})
 return [env.DB.prepare('INSERT INTO iw_hubspot_drafts(envelope_id,object_type,record_id,escalation_owner) VALUES(?,?,?,?)').bind(envelope.id,crm.kind,crm.recordId,owner??null)]
}
/** Bounded provider cursor; each page validates completely before the contact-book transaction. */
export async function syncHubspotContacts(env:Env,context:CommandContext,input:Record<string,unknown>) {
 administrator(context.actor);insist(input.consent===true,'Explicitly authorize importing HubSpot contacts into the shared contact book.')
 const after=input.after===undefined?undefined:identifier(input.after)
 const page=await request(env,'/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,phone,company'+(after?'&after='+after:''))
 insist(Array.isArray(page.results)&&page.results.length<=100,'HubSpot returned an invalid contact page.',502)
 const contacts=page.results.map(raw=>{const row=object(raw);identifier(row.id);insist(row.archived===false,'Archived contacts cannot be imported.',502);const p=object(row.properties);return contact({name:[p.firstname,p.lastname].filter(v=>typeof v==='string'&&v.trim()).join(' '),email:p.email,phone:p.phone,company:p.company})})
 const paging=page.paging===undefined?undefined:object(page.paging),next=paging?.next===undefined?undefined:identifier(object(paging.next).after)
 const result={synced:contacts.length,...(next?{next}:{})}
 await atomic(env.DB,[roleGuard(context.actor,['owner','admin'])],[...contacts.map(c=>contactWrite(env,context.actor,c,new Date().toISOString())),env.DB.prepare('INSERT INTO iw_hubspot_syncs(actor,at,consent,count) VALUES(?,?,?,?)').bind(context.actor.id,new Date().toISOString(),'I authorize importing HubSpot contacts into the shared contact book.',contacts.length),commandWrite(env.DB,context.actor.id,context.commandId,context.fingerprint,result)])
 return result
}
