import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
export function googleReplyEdge(source) {
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'synthetic-inkwell-1',alg:'RS256',use:'sig'}
 const messages=new Map(),attachmentBodies=new Map(),history=[],reads=[]
 let checkpoint=100,failed=false
 const b64=value=>Buffer.from(typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value)).toString('base64url')
 function add({from,to,text,headers={},attachments=[]}){
  const id='reply-'+(++checkpoint),payload={mimeType:'multipart/mixed',headers:Object.entries({from,to,subject:'Re: Signing request','message-id':`<${id}@client.example>`,...headers}).map(([name,value])=>({name,value})),parts:[{mimeType:'text/plain',body:{data:b64(text)}},...attachments.map(file=>{const attachmentId='a'.repeat(350);attachmentBodies.set(attachmentId,{size:file.bytes.length,data:b64(file.bytes)});return{mimeType:file.type,filename:file.name,body:{size:file.bytes.length,...(file.external?{attachmentId}:{data:b64(file.bytes)})}}})]}
  messages.set(id,{id,payload});history.push({id:String(checkpoint),messagesAdded:[{message:{id}}]});return id
 }
 const networkEdge=async request=>{
  const url=new URL(request.url)
  if(url.pathname==='/oauth2/v3/certs'){assert.equal(request.headers.get('authorization'),null);return Response.json({keys:[jwk]})}
  if(url.hostname==='gmail.googleapis.com'&&url.pathname==='/gmail/v1/users/me/profile')return Response.json({emailAddress:'owner@harbour.example',historyId:String(checkpoint)})
  if(url.hostname==='gmail.googleapis.com'&&url.pathname.startsWith('/gmail/v1/users/me/history')){assert.equal(request.headers.get('authorization'),'Bearer synthetic-inkwell-1');return Response.json({historyId:String(checkpoint),history:history.filter(item=>Number(item.id)>Number(url.searchParams.get('startHistoryId')))})}
  if(url.hostname==='gmail.googleapis.com'&&url.pathname.includes('/attachments/')){assert.equal(request.headers.get('authorization'),'Bearer synthetic-inkwell-1');const attachment=attachmentBodies.get(url.pathname.split('/').at(-1));return attachment?Response.json(attachment):Response.json({error:'not found'},{status:404})}
  if(url.hostname==='gmail.googleapis.com'&&url.pathname.startsWith('/gmail/v1/users/me/messages/reply-')){assert.equal(request.headers.get('authorization'),'Bearer synthetic-inkwell-1');if(failed){failed=false;return Response.json({error:'synthetic provider failure'},{status:503})}const id=url.pathname.split('/').at(-1),message=messages.get(id);reads.push({id,format:url.searchParams.get('format')});return message?Response.json(url.searchParams.get('format')==='metadata'?{id:message.id,payload:{headers:message.payload.headers.filter(header=>header.name.toLowerCase()==='to')}}:message):Response.json({error:'not found'},{status:404})}
  return source?.networkEdge(request)
 }
 function push(origin,{eventId=crypto.randomUUID(),published=new Date().toISOString(),claims={},email='owner@harbour.example',tamper=false}={}){
  const time=Math.floor(Date.now()/1000),header=b64({alg:'RS256',kid:jwk.kid}),body=b64({iss:'https://accounts.google.com',aud:origin+'/api/inkwell/google/replies',sub:'synthetic-inkwell-2',email:'synthetic-inkwell-3@service.example',email_verified:true,iat:time,exp:time+3600,...claims}),signature=sign('RSA-SHA256',Buffer.from(header+'.'+body),privateKey).toString('base64url')
  return {body:{subscription:['projects','synthetic-inkwell-4','subscriptions','synthetic-inkwell-5'].join('/'),message:{messageId:eventId,publishTime:published,data:b64({emailAddress:email,historyId:String(checkpoint)})}},headers:{authorization:`Bearer ${header}.${body}.${tamper?(signature[0]==='a'?'b':'a')+signature.slice(1):signature}`}}
 }
 return{networkEdge,add,push,reads,fail:()=>failed=true}
}
