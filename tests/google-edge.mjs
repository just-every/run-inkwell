import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
export async function googleEdge() {
 const doc=await PDFDocument.create();doc.addPage([612,792]).drawText('Harbour service agreement')
 const bytes=Buffer.from(await doc.save()),files=[],requests=[]
 let failure=false,corrupt=false,lost=false
 const file={id:'drive-pdf',name:'agreement.pdf',mimeType:'application/pdf',trashed:false}
 const message={id:'gmail-message',payload:{mimeType:'multipart/mixed',headers:[{name:'From',value:'Mara Quinn <mara@client.example>'},{name:'To',value:'Harbour Owner <owner@harbour.example>'},{name:'Cc',value:'Lee Chen <lee@client.example>'}],parts:[{mimeType:'application/pdf',filename:'client-agreement.pdf',body:{attachmentId:'attachment-pdf',size:bytes.length}}]}}
 const hash=()=>createHash('sha256').update(bytes).digest('hex')
 const networkEdge=async request=>{
  const url=new URL(request.url)
  if(!['www.googleapis.com','gmail.googleapis.com'].includes(url.hostname))return
  requests.push({method:request.method,path:url.pathname,query:url.search})
  assert.equal(request.headers.get('authorization'),'Bearer synthetic-inkwell-1')
  if(failure){failure=false;return Response.json({error:'synthetic provider failure'},{status:503})}
  if(url.pathname==='/drive/v3/files')return Response.json({files:files.filter(f=>decodeURIComponent(url.search).includes(f.appProperties.inkwellArtifact)).map(({data,...metadata})=>({...metadata,...(corrupt?{sha256Checksum:'0'.repeat(64)}:{})}))})
  if(url.pathname==='/upload/drive/v3/files'){
   assert.equal(request.method,'POST');assert.equal(url.searchParams.get('uploadType'),'multipart')
   const content=Buffer.from(await request.arrayBuffer()),boundary=request.headers.get('content-type').split('boundary=')[1],headerEnd=content.indexOf('\r\n\r\n'),metadataEnd=content.indexOf('\r\n--'+boundary,headerEnd),metadata=JSON.parse(content.subarray(headerEnd+4,metadataEnd)),dataStart=content.indexOf('\r\n\r\n',metadataEnd)+4,dataEnd=content.indexOf('\r\n--'+boundary+'--',dataStart),data=content.subarray(dataStart,dataEnd)
   assert.equal(metadata.parents[0],'completed-folder');assert.equal(data.subarray(0,5).toString(),'%PDF-')
   const uploaded={...metadata,id:'file-'+files.length,size:String(data.length),sha256Checksum:createHash('sha256').update(data).digest('hex'),data};files.push(uploaded)
   const {data:_,...response}=uploaded;if(lost){lost=false;return Response.json({error:'synthetic lost response'},{status:503})}return Response.json(response)
  }
  if(url.pathname==='/drive/v3/files/drive-pdf')return url.searchParams.get('alt')==='media'?new Response(bytes):Response.json(file)
  if(url.pathname==='/drive/v3/files/google-doc')return Response.json({...file,id:'google-doc',name:'Client proposal',mimeType:'application/vnd.google-apps.document'})
  if(url.pathname==='/drive/v3/files/google-doc/export'){assert.equal(url.searchParams.get('mimeType'),'application/pdf');return new Response(bytes)}
  if(url.pathname===`/gmail/v1/users/me/messages/${message.id}`)return Response.json(message)
  if(url.pathname===`/gmail/v1/users/me/messages/${message.id}/attachments/attachment-pdf`)return Response.json({size:bytes.length,data:bytes.toString('base64url')})
  return Response.json({error:'not found'},{status:404})
 }
 return {networkEdge,bytes,hash,files,requests,message,fail:()=>failure=true,corrupt:()=>corrupt=true,repair:()=>corrupt=false,loseUpload:()=>lost=true}
}
