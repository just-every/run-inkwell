import { Refusal, insist, object, sha256 } from './model'
import { readBytes } from './body'

export const graphId = (value:unknown) => { insist(typeof value==='string' && /^[A-Za-z0-9!_+=-]{1,240}$/.test(value),'Provide a Microsoft resource ID.');return value }
/** Fixed Graph origin, bounded responses, no credential-bearing redirects or automatic retries. */
export async function graph(token:string|undefined,path:string,init:RequestInit={}) {
 insist(token,'Configure Microsoft Graph in this installation first.',409)
 let response:Response
 try { response=await fetch('https://graph.microsoft.com/v1.0'+path,{...init,headers:{authorization:`Bearer ${token}`,...init.headers},redirect:'manual',signal:AbortSignal.timeout(30_000)}) }
 catch { throw new Refusal('Microsoft Graph is unavailable. Try again explicitly.',502) }
 if(!response.ok){await response.body?.cancel();throw new Refusal('Microsoft Graph refused the resource or conversion. Check its access and try again.',502)}
 return new Response(await readBytes(new Request('https://graph.microsoft.com',{method:'POST',body:response.body,duplex:'half'} as RequestInit),25*1024*1024),{headers:response.headers})
}
export const graphJson=async(token:string|undefined,path:string)=>object(await (await graph(token,path)).json())
const segment=(value:unknown)=>encodeURIComponent(graphId(value))
export const itemPath=(drive:unknown,item:unknown)=>`/drives/${segment(drive)}/items/${segment(item)}`

export async function fileSharePoint(token:string,folder:string,name:string,bytes:Uint8Array) {
 insist(/^[A-Za-z0-9!_-]+:[A-Za-z0-9!_-]+$/.test(folder)&&/^inkwell-[A-Za-z0-9_-]+-(signed|certificate)\.pdf$/.test(name),'Provide a valid SharePoint destination.')
 const [drive,item]=folder.split(':'),base=itemPath(drive,item),destination=`${base}:/${encodeURIComponent(name)}:`
 // A deterministic create with fail-on-conflict must never overwrite a different business record.
 let response:Response
 try { response=await fetch('https://graph.microsoft.com/v1.0'+destination+'/content?%40microsoft.graph.conflictBehavior=fail',{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'application/pdf'},body:bytes.slice().buffer,redirect:'manual',signal:AbortSignal.timeout(30_000)}) }
 catch {throw new Refusal('The SharePoint upload is unconfirmed. Retry explicitly.',502)}
 let file:Record<string,unknown>
 if(response.status===409){await response.body?.cancel();file=await graphJson(token,destination)}
 else {insist(response.ok,'SharePoint refused the upload.',502);file=object(await response.json())}
 const parent=object(file.parentReference)
 insist(file.name===name&&file.size===bytes.length&&parent.driveId===drive&&parent.id===item&&typeof file.id==='string','SharePoint returned a different artifact.',409)
 const stored=new Uint8Array(await (await graph(token,itemPath(drive,file.id)+'/content')).arrayBuffer())
 insist(await sha256(stored)===await sha256(bytes),'The SharePoint artifact fingerprint differs.',409)
 return{id:graphId(file.id)}
}
