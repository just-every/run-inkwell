import { canonical, id, insist, now, Refusal, type Actor, type Envelope, type Env } from './model'
import { atomic, commandWrite, getEnvelope, previousCommand, roleGuard, type Guard } from './storage'
import { readBlob } from './blobs'
import { assertHubspotCredential, hubspotCredential, hubspotCredentialGuard, type HubspotCredential } from './hubspot-provider'
import { hubspotNativeAdministrator } from './hubspot-envelope-authority'
import { inspectCompletionMapping, createNote, reconcileFile, reconcileNote, reconcileProperties, uploadFile, writeProperties } from './hubspot-writeback-provider'
import type { CommandContext } from './envelopes'

type Link={envelope_id:string;account_id:string;record_type:string;record_id:string;credential_version:number;principal:string;member_version:number;status:string;properties_done:number;file_id:string|null;note_id:string|null;uncertain:string|null;lease:string|null;lease_at:number|null;attempts:number;error:string|null;completed_at:string|null;mapping_json:string;repair_json:string|null}
const linkOf=(env:Env,id:string)=>env.DB.prepare('SELECT * FROM iw_hubspot_envelopes WHERE envelope_id=?').bind(id).first<Link>()
const visible=(row:Link)=>({id:row.envelope_id,recordType:row.record_type,recordId:row.record_id,status:row.status,propertiesUpdated:Boolean(row.properties_done),fileId:row.file_id,noteId:row.note_id,uncertain:row.uncertain,attempts:row.attempts,error:row.error,completedAt:row.completed_at,repair:row.repair_json?JSON.parse(row.repair_json):null})
export async function getHubspotWriteback(env:Env,actor:Actor,envelopeId:string) {
  hubspotNativeAdministrator(actor)
  const row=await linkOf(env,envelopeId);insist(row,'This envelope has no active HubSpot write-back authorization.',404)
  let authorizationRequired=true
  try{const c=await hubspotCredential(env),guard=authority(row,c);authorizationRequired=!await env.DB.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()}catch{/* Configuration remains outside business records. */}
  return {...visible(row),authorizationRequired}
}
const authority=(row:Link,c:HubspotCredential):Guard=>({sql:`EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role IN ('owner','admin')) AND ?=? AND ?=?`,values:[row.principal,row.member_version,c.accountId,row.account_id,c.version,row.credential_version]})
const leaseGuard=(row:Link):Guard=>({sql:'EXISTS(SELECT 1 FROM iw_hubspot_envelopes WHERE envelope_id=? AND lease=?)',values:[row.envelope_id,row.lease]})
async function current(env:Env,row:Link,c:HubspotCredential) {
  await assertHubspotCredential(env,c)
  const guard=authority(row,c)
  insist(await env.DB.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first(),'HubSpot completion authorization was retired. This write-back is held.',403)
}
async function save(env:Env,row:Link,c:HubspotCredential,fields:Partial<Link>,writes:D1PreparedStatement[]=[]) {
  await current(env,row,c)
  const entries=Object.entries(fields)
  await atomic(env.DB,[leaseGuard(row),authority(row,c),hubspotCredentialGuard(c)],[env.DB.prepare(`UPDATE iw_hubspot_envelopes SET ${entries.map(([key])=>`${key}=?`).join(',')} WHERE envelope_id=?`).bind(...entries.map(([,value])=>value),row.envelope_id),...writes])
  Object.assign(row,fields)
}
/** One leased installation-local outbox per envelope; every retry reconciles the remote stage before writing. */
async function deliver(env:Env,row:Link,e:Envelope) {
  let credential:HubspotCredential|undefined
  try {
    credential=await hubspotCredential(env);await current(env,row,credential)
    if(!row.properties_done){
      const repair=await inspectCompletionMapping(env,credential,row)
      if(repair.changes.length){
        await save(env,row,credential,{repair_json:canonical(repair)},row.repair_json===canonical(repair)?[]:[env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,NULL,?)').bind(id().replaceAll('-',''),now(),row.principal,'hubspot.mapping.proposed',row.envelope_id,canonical(repair))])
        insist(false,'Owner approval is required for the proposed CRM mapping repair.',409)
      }
      if(!await reconcileProperties(env,credential,row,e)){
        await save(env,row,credential,{uncertain:'properties'});await current(env,row,credential)
        await writeProperties(env,credential,row,e)
      }
      await save(env,row,credential,{properties_done:1,uncertain:null,repair_json:null})
    }
    if(!row.file_id){
      let file=await reconcileFile(env,credential,e)
      if(!file){
        insist(row.uncertain!=='file','The executed file result is uncertain. Reconcile again after HubSpot makes it visible; no second upload was attempted.',409)
        const bytes=await readBlob(env.DB,e.id,'signed',e.signedSha256!)
        await save(env,row,credential,{uncertain:'file'});await current(env,row,credential)
        file=await uploadFile(env,credential,e,bytes)
      }
      await save(env,row,credential,{file_id:file,uncertain:null})
    }
    if(!row.note_id){
      let note=await reconcileNote(env,credential,row,e,row.file_id!)
      if(!note){
        insist(row.uncertain!=='note','The completion note result is uncertain. Reconcile again after HubSpot makes it visible; no second note was attempted.',409)
        await save(env,row,credential,{uncertain:'note'});await current(env,row,credential)
        note=await createNote(env,credential,row,e,row.file_id!)
      }
      await save(env,row,credential,{note_id:note,uncertain:null})
    }
    const completed=now()
    await save(env,row,credential,{status:'completed',completed_at:completed,error:null},[env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,NULL,?)').bind(id().replaceAll('-',''),completed,row.principal,'hubspot.writeback.completed',row.envelope_id,canonical({recordType:row.record_type,recordId:row.record_id,propertiesUpdated:true,pdfAttached:true,timelineEvent:true}))])
  } catch(error) {
    // Provider text and business field values never enter progress or operational audit.
    await env.DB.prepare("UPDATE iw_hubspot_envelopes SET status='held',error=? WHERE envelope_id=? AND lease=?").bind(error instanceof Refusal&&error.code==='hubspot_mapping_unresolved'?'Completion write-back is held because no unique writable CRM field matches. Correct the provider fields and reconcile again.':'Completion write-back is held. Check connector authority and reconcile the provider result before retrying.',row.envelope_id,row.lease).run()
  } finally {
    await env.DB.prepare('UPDATE iw_hubspot_envelopes SET lease=NULL,lease_at=NULL WHERE envelope_id=? AND lease=?').bind(row.envelope_id,row.lease).run()
  }
}
async function claim(env:Env,envelopeId:string) {
  const lease=id(),at=Date.now()
  return env.DB.prepare("UPDATE iw_hubspot_envelopes SET lease=?,lease_at=?,attempts=attempts+1,status='working' WHERE envelope_id=? AND status<>'completed' AND (lease IS NULL OR lease_at<?) RETURNING *").bind(lease,at,envelopeId,at-5*60_000).first<Link>()
}
export async function retryHubspotWriteback(env:Env,context:CommandContext,input:Record<string,unknown>) {
  hubspotNativeAdministrator(context.actor)
  insist(typeof input.id==='string','Choose an envelope.')
  const previous=await previousCommand(env.DB,context.actor.id,context.commandId,context.fingerprint);if(previous)return previous
  const initial=await linkOf(env,input.id);insist(initial,'This envelope has no active HubSpot write-back authorization.',404)
  const e=await getEnvelope(env.DB,input.id);insist(e.status==='completed'&&e.signedSha256,'Complete the envelope before writing back.',409)
  // Check the native caller's live role before claiming; provider authority is independently checked in deliver.
  await atomic(env.DB,[roleGuard(context.actor,['owner','admin'])],[])
  if(input.renewAuthorization===true){
    insist(context.actor.role==='owner'&&input.consent===true,'Only the owner may explicitly renew this completion authorization.',403)
    insist(input.approveRepair!==true,'Review mapping approval separately after renewing authority.',409)
    insist(initial.status==='held'&&!initial.lease,'Only a held completion can be reauthorized.',409)
    const credential=await hubspotCredential(env)
    insist(credential.accountId===initial.account_id,'The configured HubSpot account changed. This completion cannot be transferred.',409)
    const at=now()
    await atomic(env.DB,[roleGuard(context.actor,['owner']),hubspotCredentialGuard(credential),{sql:"EXISTS(SELECT 1 FROM iw_hubspot_envelopes WHERE envelope_id=? AND credential_version=? AND member_version=? AND status='held' AND lease IS NULL)",values:[initial.envelope_id,initial.credential_version,initial.member_version]}],[
      env.DB.prepare('UPDATE iw_hubspot_envelopes SET credential_version=?,principal=?,member_version=? WHERE envelope_id=?').bind(credential.version,context.actor.id,context.actor.version,initial.envelope_id),
      env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,?,?)').bind(id().replaceAll('-',''),at,context.actor.id,'hubspot.completion.reauthorized',initial.envelope_id,canonical({credentialVersion:initial.credential_version,principal:initial.principal}),canonical({credentialVersion:credential.version,principal:context.actor.id,accountId:initial.account_id,recordType:initial.record_type,recordId:initial.record_id,consent:'Renew completion transfer to this same HubSpot record; preserve uncertain effects.'}))
    ])
  }
  if(input.approveRepair===true){
    insist(context.actor.role==='owner','Only the owner may approve a CRM mapping repair.',403)
    insist(initial.status==='held'&&!initial.lease&&initial.repair_json,'There is no held mapping repair to approve.',409)
    insist(canonical(input.proposal)===initial.repair_json,'The repair proposal changed. Review it again.',409)
    const credential=await hubspotCredential(env);await current(env,initial,credential)
    const repair=await inspectCompletionMapping(env,credential,initial)
    insist(canonical(repair)===initial.repair_json,'The remote schema changed. Reconcile and review a fresh proposal.',409)
    const at=now()
    await atomic(env.DB,[roleGuard(context.actor,['owner']),authority(initial,credential),hubspotCredentialGuard(credential),{sql:"EXISTS(SELECT 1 FROM iw_hubspot_envelopes WHERE envelope_id=? AND repair_json=? AND status='held' AND lease IS NULL)",values:[initial.envelope_id,initial.repair_json]}],[
      env.DB.prepare('UPDATE iw_hubspot_envelopes SET mapping_json=?,repair_json=NULL WHERE envelope_id=?').bind(canonical(repair.mapping),initial.envelope_id),
      env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,?,?)').bind(id().replaceAll('-',''),at,context.actor.id,'hubspot.mapping.approved',initial.envelope_id,initial.mapping_json,canonical(repair.mapping))
    ])
  }
  const row=await claim(env,input.id)
  if(row)await deliver(env,row,e)
  const result=visible((await linkOf(env,input.id))!)
  await atomic(env.DB,[roleGuard(context.actor,['owner','admin'])],[commandWrite(env.DB,context.actor.id,context.commandId,context.fingerprint,result)])
  return result
}
export async function dispatchHubspotWriteback(env:Env,envelopeId:string) {
  const initial=await linkOf(env,envelopeId)
  if(!initial||!['waiting','working'].includes(initial.status))return
  const e=await getEnvelope(env.DB,envelopeId)
  if(e.status!=='completed'||!e.signedSha256)return
  const row=await claim(env,envelopeId);if(row)await deliver(env,row,e)
}
export async function dispatchHubspotWritebacks(env:Env) {
  const pending=(await env.DB.prepare("SELECT h.envelope_id FROM iw_hubspot_envelopes h JOIN iw_envelopes e ON e.id=h.envelope_id WHERE h.status IN ('waiting','working') AND json_extract(e.data,'$.status')='completed' ORDER BY h.authorized_at LIMIT 10").all<{envelope_id:string}>()).results
  for(const item of pending){const row=await claim(env,item.envelope_id);if(row)await deliver(env,row,await getEnvelope(env.DB,item.envelope_id))}
}
