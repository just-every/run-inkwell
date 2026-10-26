import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const digest = (algorithm,bytes) => createHash(algorithm).update(bytes).digest('hex')
function contentHash(bytes) {
 const blocks=[]
 for(let offset=0;offset<bytes.length;offset+=4*1024*1024)blocks.push(createHash('sha256').update(bytes.subarray(offset,offset+4*1024*1024)).digest())
 return digest('sha256',Buffer.concat(blocks))
}
/** Official provider request and response shapes, faked only at the network boundary. */
export function filingEdge() {
 const files=new Map(),attempts=[],failures=new Map(),corrupted=new Set()
 const metadata=file=>file.provider==='box'?{type:'file',id:file.id,name:file.name,size:file.bytes.length,sha1:corrupted.has(file.id)?'0'.repeat(40):digest('sha1',file.bytes),parent:{type:'folder',id:file.folder}}:{'.tag':'file',id:file.id,name:file.name,path_lower:(file.folder+'/'+file.name).toLowerCase(),size:file.bytes.length,content_hash:corrupted.has(file.id)?'0'.repeat(64):contentHash(file.bytes)}
 const networkEdge=async request=>{
  const url=new URL(request.url),provider=url.hostname.endsWith('.box.com')?'box':url.hostname.endsWith('.dropboxapi.com')?'dropbox':undefined
  if(!provider)return
  assert.equal(request.headers.get('authorization'),`Bearer synthetic-inkwell-${provider==='box'?1:2}`)
  if(url.hostname==='api.box.com'){
   assert.equal(request.method,'GET');const file=[...files.values()].find(file=>file.id===url.pathname.split('/').at(-1));assert.ok(file);return Response.json(metadata(file))
  }
  if(url.hostname==='api.dropboxapi.com'){
   assert.equal(url.pathname,'/2/files/get_metadata');const {path}=await request.json(),file=[...files.values()].find(file=>file.provider==='dropbox'&&(file.folder+'/'+file.name).toLowerCase()===path.toLowerCase());assert.ok(file);return Response.json(metadata(file))
  }
  assert.equal(request.method,'POST')
  let folder,name,bytes
  if(provider==='box'){
   assert.equal(url.pathname,'/api/2.0/files/content');const form=await request.formData();assert.deepEqual([...form.keys()],['attributes','file'])
   const attributes=JSON.parse(form.get('attributes'));folder=attributes.parent.id;name=attributes.name;assert.equal(form.get('file').name,name);bytes=Buffer.from(await form.get('file').arrayBuffer());assert.equal(request.headers.get('content-md5'),digest('sha1',bytes))
  }else{
   assert.equal(url.pathname,'/2/files/upload');const args=JSON.parse(request.headers.get('dropbox-api-arg'));assert.equal(args.mode,'add');assert.equal(args.autorename,false);assert.equal(args.strict_conflict,true)
   const cut=args.path.lastIndexOf('/');folder=args.path.slice(0,cut);name=args.path.slice(cut+1);bytes=Buffer.from(await request.arrayBuffer());assert.equal(args.content_hash,contentHash(bytes))
  }
  assert.ok(bytes.subarray(0,5).equals(Buffer.from('%PDF-')),'a genuine completed PDF is uploaded')
  attempts.push({provider,folder,name});const key=JSON.stringify([provider,folder,name]),existing=files.get(key)
  if(existing)return provider==='box'?Response.json({type:'error',status:409,code:'item_name_in_use',context_info:{conflicts:{type:'file',id:existing.id,name}}},{status:409}):Response.json({error:{'.tag':'path',path:{reason:{'.tag':'conflict',conflict:{'.tag':'file'}}}}},{status:409})
  const failure=failures.get(provider);failures.delete(provider)
  if(failure==='before')return Response.json({error:'synthetic failure'},{status:503})
  const file={provider,folder,name,bytes,id:provider==='box'?String(files.size+100):`id:synthetic-inkwell-${files.size+100}`};files.set(key,file)
  if(failure==='after')return Response.json({error:'synthetic response lost'},{status:503})
  return provider==='box'?Response.json({total_count:1,entries:[metadata(file)]},{status:201}):Response.json(metadata(file))
 }
 return {networkEdge,files:()=>[...files.values()],attempts:()=>[...attempts],failNext:(provider,when)=>failures.set(provider,when),corrupt:id=>corrupted.add(id),repair:id=>corrupted.delete(id)}
}
