import assert from 'node:assert/strict'
export const salesforceBindings={SALESFORCE_ACCESS_TOKEN:'synthetic-inkwell-1',SALESFORCE_ACCOUNT_ID:'synthetic-inkwell-2',SALESFORCE_INSTANCE_URL:'https://synthetic-inkwell.my.salesforce.com'}
export const salesforceAddress=n=>['synthetic-inkwell-'+n,'example.test'].join('@')
export function salesforceEdge(){
 const records=new Map([
  ['Opportunity:synthetic-inkwell-3',{Id:'synthetic-inkwell-3',Name:'Synthetic agreement',Amount:48600,OwnerId:'synthetic-inkwell-4'}],
  ['Account:synthetic-inkwell-5',{Id:'synthetic-inkwell-5',Name:'Synthetic company',AnnualRevenue:48600,OwnerId:'synthetic-inkwell-4'}],
  ['Contact:synthetic-inkwell-6',{Id:'synthetic-inkwell-6',Name:'Synthetic signer',FirstName:'Synthetic',LastName:'Signer',Email:salesforceAddress(6),Phone:null,Account:{Name:'Synthetic company'},OwnerId:'synthetic-inkwell-4'}],
  ['Contact:synthetic-inkwell-7',{Id:'synthetic-inkwell-7',Name:'Another contact',FirstName:'Another',LastName:'Contact',Email:salesforceAddress(7),Phone:null,Account:{Name:'Another company'},OwnerId:'synthetic-inkwell-4'}],
  ['User:synthetic-inkwell-4',{Id:'synthetic-inkwell-4',Email:['owner','harbour.example'].join('@'),IsActive:true}],
 ])
 const calls=[],files=[],patches=[];let failStage,interceptor
 const page=(rows,next)=>Response.json({records:rows,done:!next,...(next?{nextRecordsUrl:'/services/data/v64.0/query/'+next}:{})})
 const networkEdge=async request=>{
  const url=new URL(request.url);if(url.hostname!=='synthetic-inkwell.my.salesforce.com')return
  assert.equal(request.headers.get('authorization'),'Bearer '+salesforceBindings.SALESFORCE_ACCESS_TOKEN)
  calls.push({method:request.method,path:url.pathname,query:url.searchParams.get('q')})
  const intercepted=await interceptor?.(request);if(intercepted)return intercepted
  const path=url.pathname.replace('/services/data/v64.0/',''),query=url.searchParams.get('q')??''
  if(path==='query'&&query.includes('FROM Contact')){
   let rows=[...records.entries()].filter(([key])=>key.startsWith('Contact:')).map(([,value])=>value)
   const selected=query.match(/WHERE Id IN \(([^)]+)\)/);if(selected){const ids=selected[1].split(',').map(v=>v.replaceAll("'",''));rows=rows.filter(r=>ids.includes(r.Id));return page(rows)}
   return page(rows.slice(0,1),rows.length>1?'synthetic-inkwell-page':undefined)
  }
  if(path==='query/synthetic-inkwell-page')return page([...records.entries()].filter(([key])=>key.startsWith('Contact:')).map(([,value])=>value).slice(1))
  if(path==='query'&&query.includes('FROM ContentVersion'))return page(files.filter(f=>query.includes("Title = '"+f.Title+"'")&&query.includes("FirstPublishLocationId = '"+f.FirstPublishLocationId+"'")).map(({bytes,...metadata})=>metadata))
  if(path==='query'&&query.includes('FROM ContentDocumentLink'))return page(files.filter(f=>query.includes("ContentDocumentId = '"+f.ContentDocumentId+"'")&&query.includes("LinkedEntityId = '"+f.FirstPublishLocationId+"'")).map(f=>({Id:'link-'+f.Id})))
  const parts=path.split('/')
  if(parts[0]==='sobjects'&&parts[1]==='ContentVersion'){
   if(request.method==='GET'&&parts[3]==='VersionData'){const file=files.find(f=>f.Id===parts[2]);return new Response(file?.bytes??null,{status:file?200:404})}
   if(request.method==='POST'){const body=await request.json();assert.equal(body.SharingPrivacy,'P');assert.equal(body.SharingOption,'R');const file={Id:'synthetic-inkwell-file-'+files.length,ContentDocumentId:'synthetic-inkwell-document-'+files.length,...body,bytes:Buffer.from(body.VersionData,'base64')};delete file.VersionData;files.push(file);if(failStage==='file'){failStage=undefined;return Response.json({}, {status:503})}return Response.json({id:file.Id,success:true})}
  }
  if(parts[0]==='sobjects'){
   const key=parts[1]+':'+parts[2],row=records.get(key)
   if(!row)return Response.json({}, {status:404})
   if(request.method==='GET')return Response.json(row)
   if(request.method==='PATCH'){const fields=await request.json();Object.assign(row,fields);patches.push({record:key,fields});if(failStage==='properties'){failStage=undefined;return Response.json({}, {status:503})}return new Response(null,{status:204})}
  }
  throw Error('Unexpected Salesforce edge request: '+request.method+' '+path)
 }
 return {networkEdge,records,files,patches,calls,failNext:stage=>{failStage=stage},intercept:fn=>{interceptor=fn}}
}
