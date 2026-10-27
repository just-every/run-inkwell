import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
export async function microsoftEdge(){
 async function pdf(two=false,label='Source PDF'){const doc=await PDFDocument.create(),page=doc.addPage([612,792]);page.drawText(label,{x:50,y:740,size:16});page.drawText('{{signature:1}}',{x:50,y:300,size:16});if(two)page.drawText('{{signature:2}}',{x:50,y:200,size:16});return new Uint8Array(await doc.save())}
 const original=await pdf(),outlook=await pdf(true,'Outlook agreement'),converted=await pdf(false,'Word converted agreement'),files=new Map(),messages=new Map(),requests=[]
 const person=(name,address)=>({emailAddress:{name,address}})
 messages.set('outlook-send',{id:'outlook-send',from:person('Mara Quinn','mara@clients.example'),toRecipients:[person('Harbour Owner','owner@harbour.example')],ccRecipients:[person('Alex Morgan','alex@clients.example')]})
 messages.set('outlook-self',{id:'outlook-self',from:person('Mara Quinn','mara@clients.example'),toRecipients:[person('Harbour Owner','owner@harbour.example')],ccRecipients:[]})
 const networkEdge=async request=>{
  const url=new URL(request.url);if(url.hostname!=='graph.microsoft.com')return
  assert.equal(request.headers.get('authorization'),'Bearer synthetic-inkwell-1');requests.push({method:request.method,path:url.pathname,query:url.search})
  const path=decodeURIComponent(url.pathname.replace('/v1.0',''))
  if(path.startsWith('/me/messages/')){const id=path.split('/')[3],message=messages.get(id);if(!message)return new Response(null,{status:404});if(path.endsWith('/attachments')){const bytes=id==='outlook-self'?original:outlook;return Response.json({value:[{'@odata.type':'#microsoft.graph.fileAttachment',id:'pdf-attachment',name:'outlook-agreement.pdf',contentType:'application/pdf',contentBytes:Buffer.from(bytes).toString('base64'),isInline:false}]})}return Response.json(message)}
  if(request.method==='PUT'){
   const name=path.split(':/')[1]?.split(':/')[0]?.replace(/:.*$/,'');assert.ok(name);assert.equal(url.searchParams.get('@microsoft.graph.conflictBehavior'),'fail')
   if(files.has(name))return Response.json({error:'conflict'},{status:409})
   const bytes=new Uint8Array(await request.arrayBuffer()),file={id:'file-'+files.size,name,size:bytes.length,parentReference:{driveId:'share-drive',id:'completed'},bytes};files.set(name,file);return Response.json({...file,bytes:undefined},{status:201})
  }
  if(path.includes(':/')){const name=path.split(':/')[1].replace(/:$/,'');return files.has(name)?Response.json({...files.get(name),bytes:undefined}):new Response(null,{status:404})}
  const id=path.split('/')[4]
  if(id?.startsWith('file-')){const file=[...files.values()].find(f=>f.id===id);return file?new Response(file.bytes,{headers:{'content-type':'application/pdf'}}):new Response(null,{status:404})}
  if(!['document','word'].includes(id))return new Response(null,{status:404})
  if(path.endsWith('/content')){assert.equal(url.searchParams.get('format'),id==='word'?'pdf':null);return new Response(id==='word'?converted:original,{headers:{'content-type':'application/pdf'}})}
  return Response.json({id,name:id==='word'?'open-document.docx':'onedrive-agreement.pdf',file:{mimeType:id==='word'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/pdf'}})
 }
 return{original,outlook,converted,files,messages,requests,person,networkEdge}
}
