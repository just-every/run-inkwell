import { canonical, id, insist, now, sha256, object, type Actor, type Envelope, type Env } from './model'
import { atomic, getEnvelope, roleGuard, type Guard } from './storage'
import { readBlob } from './blobs'
import { salesforceCredential, salesforceCredentialGuard, salesforceRequest, salesforceResponse, assertSalesforceCredential, type SalesforceCredential } from './salesforce-provider'
import { salesforceNativeAdministrator } from './salesforce-envelope-authority'
import { recordPath } from './salesforce'
type Link={envelope_id:string;account_id:string;record_type:string;record_id:string;credential_version:number;principal:string;member_version:number;status:string;properties_done:number;file_id:string|null;uncertain:string|null;lease:string|null;lease_at:number|null;attempts:number;error:string|null;completed_at:string|null}
const linkOf=(env:Env,key:string)=>env.DB.prepare('SELECT * FROM iw_salesforce_envelopes WHERE envelope_id=?').bind(key).first<Link>()
const view=(r:Link)=>({id:r.envelope_id,recordId:r.record_id,recordType:r.record_type,status:r.status,propertiesUpdated:Boolean(r.properties_done),fileId:r.file_id,uncertain:r.uncertain,attempts:r.attempts,error:r.error,completedAt:r.completed_at})
const authority=(r:Link,c:SalesforceCredential):Guard=>({sql:"EXISTS(SELECT 1 FROM oa_operators o JOIN iw_salesforce_envelopes s ON s.principal=o.id WHERE s.envelope_id=? AND o.version=s.member_version AND o.status='active' AND o.role IN('owner','admin') AND s.status<>'retired' AND s.account_id=? AND s.credential_version=?)",values:[r.envelope_id,c.accountId,c.version]})
async function current(env:Env,r:Link,c:SalesforceCredential){await assertSalesforceCredential(env,c);const g=authority(r,c);insist(await env.DB.prepare('SELECT 1 WHERE '+g.sql).bind(...g.values).first(),'Salesforce completion authority was retired.',403)}
async function save(env:Env,r:Link,c:SalesforceCredential,fields:Partial<Link>,extra:D1PreparedStatement[]=[]){
 await current(env,r,c);const entries=Object.entries(fields)
 await atomic(env.DB,[authority(r,c),salesforceCredentialGuard(c),{sql:'EXISTS(SELECT 1 FROM iw_salesforce_envelopes WHERE envelope_id=? AND lease=?)',values:[r.envelope_id,r.lease]}],[env.DB.prepare(`UPDATE iw_salesforce_envelopes SET ${entries.map(([k])=>k+'=?').join(',')} WHERE envelope_id=?`).bind(...entries.map(([,v])=>v),r.envelope_id),...extra]);Object.assign(r,fields)
}
function fieldsOf(e:Envelope){return {Inkwell_Status__c:'completed',Inkwell_Envelope_Id__c:e.id,Inkwell_Completed_At__c:e.events.findLast(event=>event.action==='envelope.completed')?.at??'',Inkwell_Signed_SHA256__c:e.signedSha256!,Inkwell_Key_Fields__c:JSON.stringify(Object.fromEntries(e.fields.filter(f=>!['signature','initials','date_signed'].includes(f.type)).map(f=>[f.id,e.signers[f.signer]?.values?.[f.id]??f.prefill?.value??''])))}}
/** Salesforce Files are created with FirstPublishLocationId, binding upload and attachment in one operation. */
async function reconcileFile(env:Env,c:SalesforceCredential,r:Link,e:Envelope){
 const title=e.id+'-'+e.signedSha256,path='/services/data/v64.0/query?'+new URLSearchParams({q:`SELECT Id,ContentDocumentId,Title,FirstPublishLocationId FROM ContentVersion WHERE Title = '${title}' AND FirstPublishLocationId = '${r.record_id}'`})
 const result=await salesforceRequest(env,c,path);insist(result.done===true&&Array.isArray(result.records)&&result.records.length<=1,'Salesforce file reconciliation is incomplete or ambiguous.',502)
 if(!result.records.length)return undefined
 const file=object(result.records[0]);insist(file.Title===title&&file.FirstPublishLocationId===r.record_id&&typeof file.Id==='string'&&/^[A-Za-z0-9_-]+$/.test(file.Id),'Salesforce returned an unrelated file.',502)
 const response=await salesforceResponse(env,c,`/services/data/v64.0/sobjects/ContentVersion/${file.Id}/VersionData`),bytes=new Uint8Array(await response.arrayBuffer())
 insist(await sha256(bytes)===e.signedSha256,'Salesforce file bytes differ from the executed PDF.',409)
 const links=await salesforceRequest(env,c,'/services/data/v64.0/query?'+new URLSearchParams({q:`SELECT Id FROM ContentDocumentLink WHERE ContentDocumentId = '${String(file.ContentDocumentId).replace(/[^A-Za-z0-9_-]/g,'')}' AND LinkedEntityId = '${r.record_id}'`}))
 insist(links.done===true&&Array.isArray(links.records)&&links.records.length===1,'Salesforce has not confirmed the record file attachment.',409)
 return file.Id
}
async function deliver(env:Env,r:Link,e:Envelope){
 try{
  const c=await salesforceCredential(env);await current(env,r,c)
  if(!r.properties_done){const expected=fieldsOf(e),actual=await salesforceRequest(env,c,recordPath(r.record_type,r.record_id)+'?'+new URLSearchParams({fields:['Id',...Object.keys(expected)].join(',')}));insist(actual.Id===r.record_id,'Salesforce returned a different record.',502)
   if(!Object.entries(expected).every(([k,v])=>actual[k]===v)){await save(env,r,c,{uncertain:'properties'});await current(env,r,c);await salesforceRequest(env,c,recordPath(r.record_type,r.record_id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(expected)})}
   await save(env,r,c,{properties_done:1,uncertain:null})
  }
  if(!r.file_id){let file=await reconcileFile(env,c,r,e)
   if(!file){insist(r.uncertain!=='file','An uncertain Salesforce upload must be reconciled; no duplicate upload was attempted.',409);const bytes=await readBlob(env.DB,e.id,'signed',e.signedSha256!);await save(env,r,c,{uncertain:'file'});await current(env,r,c)
    const result=await salesforceRequest(env,c,'/services/data/v64.0/sobjects/ContentVersion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Title:e.id+'-'+e.signedSha256,PathOnClient:e.id+'.pdf',VersionData:btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join('')),FirstPublishLocationId:r.record_id,SharingPrivacy:'P',SharingOption:'R'})});insist(result.success===true&&typeof result.id==='string','Salesforce did not confirm the executed PDF.',502)
    file=await reconcileFile(env,c,r,e);insist(file===result.id,'Salesforce has not confirmed the uploaded file.',502)
   }
   await save(env,r,c,{file_id:file,uncertain:null})
  }
  const at=now();await save(env,r,c,{status:'completed',error:null,completed_at:at},[env.DB.prepare('INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(?,?,?,?,?,NULL,?)').bind(id().replaceAll('-',''),at,r.principal,'salesforce.writeback.completed',e.id,canonical({recordId:r.record_id,recordType:r.record_type,fieldsUpdated:true,pdfAttached:true}))])
 }catch{await env.DB.prepare("UPDATE iw_salesforce_envelopes SET status=CASE WHEN status='retired' THEN status ELSE 'held' END,error='Completion is held. Check connector authority and reconcile the provider result.' WHERE envelope_id=? AND lease=?").bind(r.envelope_id,r.lease).run()}
 finally{await env.DB.prepare('UPDATE iw_salesforce_envelopes SET lease=NULL,lease_at=NULL WHERE envelope_id=? AND lease=?').bind(r.envelope_id,r.lease).run()}
}
async function claim(env:Env,key:string){const lease=id(),at=Date.now();return env.DB.prepare("UPDATE iw_salesforce_envelopes SET status='working',lease=?,lease_at=?,attempts=attempts+1 WHERE envelope_id=? AND status IN('waiting','held','working') AND (lease IS NULL OR lease_at<?) RETURNING *").bind(lease,at,key,at-300_000).first<Link>()}
export async function getSalesforceWriteback(env:Env,actor:Actor,key:string){salesforceNativeAdministrator(actor);const r=await linkOf(env,key);insist(r,'No Salesforce completion authorization exists.',404);return view(r)}
export async function retrySalesforceWriteback(env:Env,actor:Actor,key:string){salesforceNativeAdministrator(actor);const initial=await linkOf(env,key);insist(initial,'No Salesforce completion authorization exists.',404);const e=await getEnvelope(env.DB,key);insist(e.status==='completed'&&e.signedSha256,'Complete the envelope before writing back.',409);await atomic(env.DB,[roleGuard(actor,['owner','admin'])],[]);const r=await claim(env,key);if(r)await deliver(env,r,e);return view((await linkOf(env,key))!)}
export async function dispatchSalesforceWriteback(env:Env,key:string){const initial=await linkOf(env,key);if(!initial||!['waiting','working'].includes(initial.status))return;const e=await getEnvelope(env.DB,key);if(e.status!=='completed'||!e.signedSha256)return;const r=await claim(env,key);if(r)await deliver(env,r,e)}
export async function dispatchSalesforceWritebacks(env:Env){const rows=(await env.DB.prepare("SELECT s.envelope_id FROM iw_salesforce_envelopes s JOIN iw_envelopes e ON e.id=s.envelope_id WHERE s.status IN('waiting','working') AND json_extract(e.data,'$.status')='completed' LIMIT 10").all<{envelope_id:string}>()).results;for(const row of rows)await dispatchSalesforceWriteback(env,row.envelope_id)}
