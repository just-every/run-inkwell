import { ApiRateLimit } from './api-limits'
import { insist, object, text, Refusal } from './model'
import { readBytes } from './body'

export type Provider = 'acrobat' | 'dropbox'
export interface RemoteItem { kind:'envelope'|'template'; sourceId:string; title:string; ownerEmail:string; status:string; terminalAt?:string; signers:{name:string;email:string}[]; pdf:string; audit:string; roles?:{role:string;order:number}[]; fields?:Record<string,unknown>[] }
const encode=(value:string)=>encodeURIComponent(value)
const base64=(bytes:Uint8Array)=>{let result='';for(let at=0;at<bytes.length;at+=16384)result+=String.fromCharCode(...bytes.slice(at,at+16384));return btoa(result)}
const email=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase():''
const instant=(value:unknown)=>typeof value==='number'&&value>0?new Date(value*1000).toISOString():typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():undefined
/** Only fixed provider hosts are reachable; credentials and raw errors never enter a receipt. */
export interface RemoteReadControl { account?:string; before?:()=>Promise<void>; response?:(response:Response)=>Promise<void> }
export async function readRemoteBatch(input:Record<string,unknown>,control:RemoteReadControl={}) {
 const provider=input.provider as Provider;insist(['acrobat','dropbox'].includes(provider),'Choose an import provider.')
 const credential=text(input.credential,'the provider credential',4096);insist(!/[\r\n]/.test(credential),'Invalid credential.')
 const region=input.region??'na1';insist(['na1','na2','na3','na4','eu1','eu2','au1','jp1','in1','sg1'].includes(String(region)),'Choose an Acrobat region.')
 const origin=provider==='acrobat'?`https://api.${region}.adobesign.com/api/rest/v6`:'https://api.hellosign.com/v3'
 const headers={authorization:provider==='acrobat'?`Bearer ${credential}`:`Basic ${btoa(credential+':')}`}
 async function get(path:string,pdf=false) {
  await control.before?.()
  const response=await fetch(origin+path,{headers,redirect:'manual',signal:AbortSignal.timeout(20000)})
  await control.response?.(response)
  insist(![401,403].includes(response.status),'The provider grant expired or was refused. Replace it to continue the saved page.',409)
  if(response.status===429){const header=response.headers.get('retry-after'),seconds=Number(header);throw new ApiRateLimit(header&&Number.isFinite(seconds)&&seconds>0?Math.ceil(seconds):3600)}
  insist(response.ok,'The provider refused this batch. Check the grant and retry; no success was recorded.',502)
  const bytes=await readBytes(new Request('https://import.invalid',{method:'POST',body:response.body,duplex:'half'} as RequestInit),pdf?2*1024*1024:1024*1024)
  if(pdf)return base64(bytes)
  try{return object(JSON.parse(new TextDecoder().decode(bytes)))}catch{throw new Refusal('The provider returned an invalid response.',502)}
 }
 const items:RemoteItem[]=[],unmapped:{sourceId:string;reason:string}[]=[]
 const page=Number(input.page??1);insist(Number.isSafeInteger(page)&&page>=1&&page<=100000,'Choose a valid source page.')
 if(provider==='acrobat') {
  const identity=await get('/users/me') as any,account=text(identity.accountId??identity.userId,'the source account ID')
  insist(!control.account||control.account===account,'The replacement grant belongs to another source account.',409)
  const cursor=input.cursor===undefined||input.cursor===null?'':text(input.cursor,'the source cursor',1000)
  const list=input.continuation&&input.cursor===null?{userAgreementList:[],page:{}}:await get('/agreements?pageSize=20'+(cursor?'&cursor='+encode(cursor):'')) as any
  const templates=input.continuation&&input.templateCursor===null?{libraryDocumentList:[],page:{}}:await get('/libraryDocuments?pageSize=20'+(input.templateCursor?'&cursor='+encode(text(input.templateCursor,'a template cursor',1000)):'')) as any
  insist(Array.isArray(list.userAgreementList)&&list.userAgreementList.length<=20&&Array.isArray(templates.libraryDocumentList)&&templates.libraryDocumentList.length<=20,'Invalid provider batch.',502)
  for(const entry of list.userAgreementList) {
   const sourceId=text(entry.id,'an agreement ID'),path='/agreements/'+encode(sourceId),detail=await get(path) as any
   if(!['SIGNED','CANCELLED','EXPIRED'].includes(detail.status)){unmapped.push({sourceId,reason:'Agreement is not terminal; no invitation was sent.'});continue}
   const members=await get(path+'/members') as any,events=await get(path+'/events') as any
   const terminalTypes=detail.status==='SIGNED'
    ? ['ACTION_COMPLETED','ACTION_COMPLETED_HOSTED','ACTION_COMPLETED_OFFLINE','ACTION_COMPLETED_OFFLINE_HOSTED','ACTION_COMPLETED_WIDGET_VERIFIED','ACTION_COMPLETED_WIDGET_VERIFIED_API_TOKEN','ACTION_COMPLETED_WIDGET_VERIFICATION_WAIVED','SIGNED','WRITTEN_SIGNED','DIGSIGNED']
    : detail.status==='EXPIRED' ? ['EXPIRED','EXPIRED_AUTOMATICALLY']
    : ['RECALLED','REJECTED','RECALLED_MAX_SIGNING_KBA_ATTEMPTS','RECALLED_MAX_SIGNING_PASSWORD_ATTEMPTS','RECALLED_MAX_SIGNING_PHONE_ATTEMPTS','RECALLED_MAX_SIGNING_WHATSAPP_ATTEMPTS','RECALLED_MAX_SIGNING_EMAIL_OTP_ATTEMPTS']
   const end=(events.events??[]).filter((e:any)=>terminalTypes.includes(e.type)).map((e:any)=>instant(e.date)).filter(Boolean).sort().at(-1)
   const signers=(members.participantSets??members.participantSetsInfo??[]).flatMap((s:any)=>(s.memberInfos??[]).map((m:any)=>({name:String(m.name??m.email),email:email(m.email)})))
   items.push({kind:'envelope',sourceId,title:text(detail.name,'an agreement name'),ownerEmail:email(detail.senderEmail),status:detail.status,terminalAt:end,signers,pdf:await get(path+'/combinedDocument',true) as string,audit:await get(path+'/auditTrail',true) as string})
  }
  for(const entry of templates.libraryDocumentList) {
   const sourceId=text(entry.id,'a library template ID'),path='/libraryDocuments/'+encode(sourceId),detail=await get(path) as any,documents=await get(path+'/documents') as any,form=await get(path+'/formFields') as any
   if(documents.documents?.length!==1){unmapped.push({sourceId,reason:'Template needs exactly one PDF; review its document mapping.'});continue}
   // Library documents expose field assignees, not agreement participant sets.
   const assignees=[...new Set<string>((form.fields??[]).map((f:any)=>f.assignee??'1'))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
   const roles=assignees.map((_,i)=>({role:`Signer ${i+1}`,order:i+1}))
   const fields=(form.fields??[]).map((f:any)=>{const p=f.locations?.[0];return {id:String(f.name),label:String(f.name),type:f.inputType==='SIGNATURE'?'signature':f.inputType==='TEXT_FIELD'?'text':'unsupported',signer:assignees.indexOf(f.assignee??'1'),page:Number(p?.pageNumber)-1,x:p?.left,y:p?.top,width:p?.width,height:p?.height,absolute:true,fromBottom:true,required:f.required!==false}})
   if(!roles.length||assignees.some(a=>['PREFILL','NOBODY','EVERYONE'].includes(a))||fields.some((f:any)=>f.type==='unsupported')){unmapped.push({sourceId,reason:'Template role or field type could not be mapped; template was skipped.'});continue}
   items.push({kind:'template',sourceId,title:text(detail.name,'a template name'),ownerEmail:email(detail.ownerEmail??detail.creatorEmail),status:'template',signers:[],roles,fields,pdf:await get(path+'/documents/'+encode(documents.documents[0].id),true) as string,audit:''})
  }
  return {provider,account,items,unmapped,next:{cursor:list.page?.nextCursor??null,templateCursor:templates.page?.nextCursor??null}}
 }
 const identity=await get('/account') as any,account=text(identity.account?.account_id,'the source account ID')
 insist(!control.account||control.account===account,'The replacement grant belongs to another source account.',409)
 const list=await get(`/signature_request/list?page=${page}&page_size=20`) as any,templates=await get(`/template/list?page=${page}&page_size=20`) as any
 insist(Array.isArray(list.signature_requests)&&list.signature_requests.length<=20&&Array.isArray(templates.templates)&&templates.templates.length<=20,'Invalid provider batch.',502)
 for(const entry of list.signature_requests) {
  const sourceId=text(entry.signature_request_id,'a request ID'),detail=(await get('/signature_request/'+encode(sourceId)) as any).signature_request
  if(!detail?.is_complete&&!detail?.is_declined){unmapped.push({sourceId,reason:'Request is not terminal; no invitation was sent.'});continue}
  const pdf=await get('/signature_request/files/'+encode(sourceId)+'?file_type=pdf',true) as string
  items.push({kind:'envelope',sourceId,title:text(detail.title,'a request title'),ownerEmail:email(detail.requester_email_address),status:detail.is_complete?'completed':'declined',terminalAt:instant(detail.is_complete?Math.max(0,...(detail.signatures??[]).map((s:any)=>Number(s.signed_at??0))):detail.last_declined_at),signers:(detail.signatures??[]).map((s:any)=>({name:String(s.signer_name??s.signer_email_address),email:email(s.signer_email_address)})),pdf,audit:pdf})
 }
 for(const entry of templates.templates) {
  const sourceId=text(entry.template_id,'a template ID'),detail=(await get('/template/'+encode(sourceId)) as any).template
  insist(detail,'Invalid template response.',502)
  const roles=(detail.signer_roles??[]).map((r:any,i:number)=>({role:String(r.name),order:Number(r.order??i)+1}))
  if(detail.documents?.length!==1){unmapped.push({sourceId,reason:'Template needs exactly one PDF; review its document mapping.'});continue}
  const fields=(detail.documents[0].form_fields??[]).map((f:any)=>({id:String(f.api_id??f.name),label:String(f.name??f.api_id),type:f.type==='signature'?'signature':f.type==='text'?'text':'unsupported',signer:/^\d+$/.test(String(f.signer))?Number(f.signer)-1:roles.findIndex((r:any)=>r.role===f.signer),page:0,x:f.x,y:f.y,width:f.width,height:f.height,absolute:true,required:f.required!==false}))
  if(!roles.length||fields.some((f:any)=>f.type==='unsupported')){unmapped.push({sourceId,reason:'Template role or field type could not be mapped; template was skipped.'});continue}
  items.push({kind:'template',sourceId,title:text(detail.title,'a template title'),ownerEmail:detail.is_creator===true?email(identity.account?.email_address):'',status:'template',signers:[],roles,fields,pdf:await get('/template/files/'+encode(sourceId)+'?file_type=pdf',true) as string,audit:''})
 }
 return {provider,account,items,unmapped,next:{page:(Number(list.list_info?.num_pages??1)>page||Number(templates.list_info?.num_pages??1)>page)?page+1:null}}
}
