import { insist, object, sha256, type Envelope, type Env } from './model'
import { assertHubspotCredential, hubspotRequest, type HubspotCredential } from './hubspot-provider'

export interface HubspotDestination {record_type:string;record_id:string}
export const completedNote=(e:Envelope)=>`Inkwell envelope ${e.id} completed. SHA-256 ${e.signedSha256}.`
export const completedFilename=(e:Envelope)=>`${e.id}-${e.signedSha256}.pdf`
export function completionProperties(e:Envelope):Record<string,string> {
  const values=Object.fromEntries(e.fields.filter(f=>!['signature','initials','date_signed'].includes(f.type)).map(f=>[f.id,e.signers[f.signer]?.values?.[f.id]??f.prefill?.value??'']))
  return {inkwell_status:'completed',inkwell_envelope_id:e.id,inkwell_completed_at:e.events.findLast(event=>event.action==='envelope.completed')?.at??e.signers.map(s=>s.signedAt??s.completedAt??'').sort().at(-1)??'',inkwell_signed_sha256:e.signedSha256!,inkwell_key_fields:JSON.stringify(values),inkwell_custom_fields:JSON.stringify(e.customFields??[])}
}
const pathOf=(destination:HubspotDestination)=>`/crm/v3/objects/${destination.record_type}/${encodeURIComponent(destination.record_id)}`
export async function reconcileProperties(env:Env,c:HubspotCredential,destination:HubspotDestination,e:Envelope) {
  const properties=completionProperties(e),record=await hubspotRequest(env,c,`${pathOf(destination)}?properties=${encodeURIComponent(Object.keys(properties).join(','))}`)
  insist(record.id===destination.record_id&&!record.archived,'HubSpot returned a different completion record.',502)
  const actual=object(record.properties)
  return Object.entries(properties).every(([key,value])=>actual[key]===value)
}
export async function writeProperties(env:Env,c:HubspotCredential,destination:HubspotDestination,e:Envelope) {
  await hubspotRequest(env,c,pathOf(destination),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({properties:completionProperties(e)})})
}
export async function reconcileFile(env:Env,c:HubspotCredential,e:Envelope):Promise<string|undefined> {
  const path=`/inkwell/${completedFilename(e)}`,result=await hubspotRequest(env,c,`/files/v3/files/search?path=${encodeURIComponent(path)}&limit=2`)
  insist(Array.isArray(result.results)&&!result.paging,'HubSpot file reconciliation is incomplete.',502)
  const found=result.results.filter(raw=>object(raw).path===path)
  insist(found.length<=1,'HubSpot has conflicting executed files. Resolve the conflict before continuing.',409)
  if(!found.length)return undefined
  const file=object(found[0]);insist(typeof file.id==='string'&&file.access==='PRIVATE','HubSpot did not identify one private executed file.',502)
  await verifyFile(env,c,e,file.id)
  return file.id
}
async function verifyFile(env:Env,c:HubspotCredential,e:Envelope,fileId:string) {
  const signed=await hubspotRequest(env,c,`/files/v3/files/${encodeURIComponent(fileId)}/signed-url`)
  insist(typeof signed.url==='string','HubSpot did not return a private file download.',502)
  const url=new URL(signed.url)
  insist(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&(url.hostname==='api.hubapi.com'||/^(?:[a-z0-9-]+\.)+hubspotusercontent(?:-[a-z0-9]+|[0-9]+)?\.net$/.test(url.hostname)),'HubSpot returned an unsupported file host.',502)
  const {readBlob}=await import('./blobs'),expected=await readBlob(env.DB,e.id,'signed',e.signedSha256!)
  await assertHubspotCredential(env,c)
  let response:Response
  try{response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(30_000)})}catch{insist(false,'The executed file could not be verified.',502)}
  insist(response.ok&&response.body,'The executed file could not be verified.',502)
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;insist(length<=expected.length,'The recovered executed file has different bytes.',409);chunks.push(part.value)}}finally{await reader.cancel()}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  insist(length===expected.length&&await sha256(bytes)===e.signedSha256,'The recovered executed file has different bytes.',409)
  await assertHubspotCredential(env,c)
}
export async function uploadFile(env:Env,c:HubspotCredential,e:Envelope,bytes:Uint8Array) {
  const form=new FormData(),filename=completedFilename(e)
  form.set('file',new Blob([bytes as BlobPart],{type:'application/pdf'}),filename);form.set('fileName',filename);form.set('folderPath','/inkwell')
  form.set('options',JSON.stringify({access:'PRIVATE',duplicateValidationStrategy:'REJECT',duplicateValidationScope:'EXACT_FOLDER'}))
  const file=await hubspotRequest(env,c,'/files/v3/files',{method:'POST',body:form})
  insist(typeof file.id==='string'&&file.id.length>0,'HubSpot did not return an executed file ID.',502)
  return file.id
}
/** Walk the record's own association list with GET, avoiding eventually indexed full-text search on uncertain writes. */
export async function reconcileNote(env:Env,c:HubspotCredential,destination:HubspotDestination,e:Envelope,fileId:string):Promise<string|undefined> {
  let after:string|undefined,matched:string|undefined
  for(let page=0;page<20;page++){
    const result=await hubspotRequest(env,c,`/crm/v4/objects/${destination.record_type}/${encodeURIComponent(destination.record_id)}/associations/notes?limit=100${after?`&after=${encodeURIComponent(after)}`:''}`)
    insist(Array.isArray(result.results),'HubSpot returned an invalid note association page.',502)
    for(const raw of result.results){const association=object(raw),id=String(association.toObjectId??'');insist(/^[A-Za-z0-9_-]+$/.test(id),'Invalid HubSpot note identity.',502)
      const note=await hubspotRequest(env,c,`/crm/v3/objects/notes/${encodeURIComponent(id)}?properties=hs_note_body,hs_attachment_ids`),properties=object(note.properties)
      if(properties.hs_note_body===completedNote(e)){insist(properties.hs_attachment_ids===fileId,'The HubSpot completion note has a conflicting attachment.',409);insist(!matched,'HubSpot has duplicate completion notes. Resolve the conflict before continuing.',409);matched=id}
    }
    const paging=result.paging===undefined?undefined:object(result.paging),next=paging?.next===undefined?undefined:object(paging.next)
    if(!next)return matched
    after=String(next.after??'');insist(/^[A-Za-z0-9_-]+$/.test(after),'Invalid HubSpot note continuation.',502)
  }
  insist(false,'The note reconciliation limit was reached. Resolve this record before continuing.',409)
}
export async function createNote(env:Env,c:HubspotCredential,destination:HubspotDestination,e:Envelope,fileId:string) {
  const note=await hubspotRequest(env,c,'/crm/v3/objects/notes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({properties:{hs_timestamp:completionProperties(e).inkwell_completed_at,hs_note_body:completedNote(e),hs_attachment_ids:fileId},associations:[{to:{id:destination.record_id},types:[{associationCategory:'HUBSPOT_DEFINED',associationTypeId:destination.record_type==='deals'?214:202}]}]})})
  insist(typeof note.id==='string'&&note.id.length>0,'HubSpot did not return a completion note ID.',502);return note.id
}
