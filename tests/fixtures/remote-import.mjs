import { readFile } from 'node:fs/promises'
const address=(name,domain='example.test')=>[name,domain].join('@')

export async function remoteImportFake(provider) {
 const archive=JSON.parse(await readFile('tests/fixtures/docuseal/archive.json','utf8')),pdf=Buffer.from(archive.files[0].base64,'base64'),auditPdf=Buffer.from(archive.files[1].base64,'base64'),calls=[]
 let fail=false,unknown=false,unsupported=false,shared=false,paginated=false,expired=false,other=false,exhausted=0,limitAfter=0
 const owners=[address('first'),address('second')]
 const edge=async request=>{
  const url=new URL(request.url),adobe=provider==='acrobat'
  if(url.hostname!==(adobe?'api.na1.adobesign.com':'api.hellosign.com'))return
  calls.push(url.pathname+url.search)
  if(limitAfter>0&&!--limitAfter)return new Response('synthetic-inkwell-limit',{status:429,headers:{'retry-after':'60'}})
  if(fail){fail=false;return new Response('synthetic-inkwell-provider-failure',{status:429,headers:{'retry-after':'120'}})}
  if(expired){expired=false;return new Response('synthetic-inkwell-expired',{status:401})}
  const path=url.pathname.replace(adobe?'/api/rest/v6':'/v3',''),json=value=>{const headers=exhausted?{'x-ratelimit-limit-remaining':'0','x-ratelimit-reset':String(exhausted)}:{};exhausted=0;return Response.json(value,{headers})}
  if(path==='/users/me')return json({accountId:'synthetic-inkwell-1'})
  if(path==='/account')return json({account:{account_id:other?'synthetic-inkwell-2':'synthetic-inkwell-1',email_address:owners[0]}})
  if(path==='/agreements')return json({userAgreementList:[{id:'first'},{id:'second'},{id:'open'}],page:{}})
  if(path==='/libraryDocuments')return json({libraryDocumentList:[{id:'template'}],page:{}})
  if(path==='/signature_request/list')return json({signature_requests:url.searchParams.get('account_id')!=='all'?[{signature_request_id:'first'}]:url.searchParams.get('page')==='2'?[{signature_request_id:'third'}]:[{signature_request_id:'first'},{signature_request_id:'second'},{signature_request_id:'open'}],list_info:{num_pages:paginated?2:1}})
  if(path==='/template/list')return json({templates:url.searchParams.get('page')==='2'?[]:[{template_id:'template'}],list_info:{num_pages:1}})
  const resource=path.split('/')[2],index=resource==='first'?0:1,owner=unknown?address('unmapped'):owners[index]
  if(adobe&&/^\/agreements\/[^/]+$/.test(path))return json({id:resource,name:`${provider} ${resource} agreement`,senderEmail:owner,status:resource==='open'?'OUT_FOR_SIGNATURE':'SIGNED'})
  if(path.endsWith('/members'))return json({participantSets:[{memberInfos:[{name:'Client signer',email:address('client')}]}]})
  if(path.endsWith('/events'))return json({events:resource==='first'?[{type:'ACTION_COMPLETED',date:'2026-01-01T00:00:00.000Z'},{type:'DOCUMENTS_VIEWED',date:'2026-05-01T00:00:00.000Z'}]:[]})
  if(adobe&&path==='/libraryDocuments/template')return json({name:`${provider} service template`,creatorEmail:owners[1],ownerEmail:owners[0],sharingMode:'USER',state:'ACTIVE',templateTypes:['DOCUMENT'],fileInfos:[{transientDocumentId:'synthetic-inkwell-2'}]})
  if(path.endsWith('/documents'))return json({documents:[{id:'pdf'}]})
  if(path.endsWith('/formFields'))return json({fields:[{name:'signature',inputType:unsupported?'CHECKBOX':'SIGNATURE',assignee:'1',required:true,locations:[{pageNumber:1,left:60,top:80,width:160,height:40}]},{name:'reference',inputType:'TEXT_FIELD',assignee:'1',required:false,locations:[{pageNumber:1,left:60,top:140,width:160,height:30}]},{name:'review',inputType:'SIGNATURE',assignee:'2',required:true,locations:[{pageNumber:1,left:260,top:80,width:160,height:40}]}]})
  if(!adobe&&/^\/signature_request\/[^/]+$/.test(path))return json({signature_request:{signature_request_id:resource,title:`${provider} ${resource} agreement`,requester_email_address:owner,is_complete:!['open','second'].includes(resource),is_declined:resource==='second',signatures:[{signer_name:'Client signer',signer_email_address:address('client'),signed_at:resource==='first'?1767225600:undefined}]}})
  if(!adobe&&path==='/template/template')return json({template:{title:`${provider} service template`,is_creator:!shared,accounts:[{account_id:'synthetic-inkwell-1',email_address:owners[0]}],signer_roles:[{name:'Client',order:0},{name:'Reviewer',order:1}],documents:[{name:'service.pdf',index:0,form_fields:[{api_id:'signature',name:'Signature',type:unsupported?'checkbox':'signature',signer:'1',x:60,y:80,width:160,height:40,required:true},{api_id:'reference',name:'Reference',type:'text',signer:'1',x:60,y:140,width:160,height:30,required:false},{api_id:'review',name:'Review',type:'signature',signer:'2',x:260,y:80,width:160,height:40,required:true}]}]}})
  if(path.endsWith('/auditTrail'))return new Response(auditPdf)
  if(path.endsWith('/combinedDocument')||path.endsWith('/auditTrail')||path.endsWith('/documents/pdf')||path.includes('/files/'))return new Response(pdf,{headers:{'content-type':'application/pdf'}})
  throw new Error('Unexpected import fake request: '+path)
 }
 return {limitAfter:value=>{limitAfter=value},unsupported:value=>{unsupported=value},shared:value=>{shared=value},paginate:()=>{paginated=true},expireOnce:()=>{expired=true},otherAccount:value=>{other=value},exhaustOnce:reset=>{exhausted=reset},edge,pdf,audit:provider==='acrobat'?auditPdf:pdf,calls,failOnce:()=>{fail=true},unmapped:()=>{unknown=true},mapped:()=>{unknown=false}}
}
