import assert from 'node:assert/strict'
/** Native HubSpot HTTP contract at the network edge; application routes and storage remain real. */
export function hubspotEdge() {
 const contacts=new Map([
  ['101',{firstname:'Nadia',lastname:'Park',email:'nadia@brightwater.example',phone:'+12025550131',company:'Brightwater Medical',hubspot_owner_id:'777'}],
  ['102',{firstname:'Ben',lastname:'Hart',email:'ben@harbour.example',phone:'+12025550132',company:'Harbour Studio',hubspot_owner_id:'777'}],
 ])
 const deals=new Map([['901',{dealname:'Brightwater service agreement',amount:'48600.00',company:'Brightwater Medical',address:'48 River Street',hubspot_owner_id:'777'}]])
 const owners=new Map([['777',{id:'777',email:'owner@harbour.example',firstName:'Harbour',lastName:'Owner',archived:false}]])
 const files=[],notes=[],calls=[],patches=[];let failure,interceptor
 const response=(value,status=200)=>Response.json(value,{status})
 function fail(stage,when){if(failure?.stage===stage&&failure.when===when){failure=undefined;return response({message:'synthetic provider interruption'},502)}}
 const networkEdge=async request=>{
  const url=new URL(request.url);if(url.hostname!=='api.hubapi.com')return
  if(!url.pathname.startsWith('/files/download/'))assert.equal(request.headers.get('authorization'),'Bearer synthetic-inkwell-1')
  calls.push({method:request.method,path:url.pathname,query:url.search})
  const overridden=await interceptor?.(request);if(overridden)return overridden
  const path=url.pathname,method=request.method
  if(method==='GET'&&path==='/crm/v3/objects/contacts'){
   const ids=[...contacts.keys()],start=url.searchParams.get('after'),index=start?ids.indexOf(start):0
   assert.ok(index>=0,'provider cursor identifies a record')
   const next=ids[index+1]
   return response({results:ids.slice(index,index+1).map(id=>({id,properties:contacts.get(id)})),...(next?{paging:{next:{after:next,link:'https://api.hubapi.com/crm/v3/objects/contacts?after='+next}}}:{})})
  }
  const record=path.match(/^\/crm\/v3\/objects\/(deals|contacts)\/([^/]+)$/)
  if(record){
   const data=(record[1]==='deals'?deals:contacts).get(decodeURIComponent(record[2]));if(!data)return response({message:'not found'},404)
   if(method==='GET')return response({id:record[2],properties:{...data}})
   if(method==='PATCH'){
    const before=fail('properties','before');if(before)return before
    const body=await request.json();Object.assign(data,body.properties);patches.push({type:record[1],id:record[2],properties:structuredClone(body.properties)})
    return fail('properties','after')??response({id:record[2],properties:{...data}})
   }
  }
  if(method==='GET'&&path.startsWith('/crm/v3/owners/'))return owners.has(path.split('/').at(-1))?response(owners.get(path.split('/').at(-1))):response({},404)
  if(method==='GET'&&path==='/files/v3/files/search')return response({results:files.filter(file=>file.path===url.searchParams.get('path')).map(({bytes,...file})=>file)})
  if(method==='POST'&&path==='/files/v3/files'){
   const before=fail('file','before');if(before)return before
   const form=await request.formData(),file=form.get('file'),options=JSON.parse(form.get('options'))
   assert.equal(options.access,'PRIVATE');assert.equal(options.duplicateValidationStrategy,'REJECT');assert.equal(options.duplicateValidationScope,'EXACT_FOLDER')
   const filename=form.get('fileName')??file.name,path=form.get('folderPath')+'/'+filename
   if(files.some(f=>f.path===path))return response({message:'duplicate'},409)
   const saved={access:'PRIVATE',id:String(5000+files.length),name:filename,path,bytes:Buffer.from(await file.arrayBuffer()),url:'https://api.hubapi.com/files/download/'+(5000+files.length)};files.push(saved)
   return fail('file','after')??response({id:saved.id,path:saved.path,url:saved.url})
  }
  if(method==='GET'&&/^\/files\/v3\/files\/[^/]+\/signed-url$/.test(path)){const file=files.find(f=>f.id===path.split('/')[4]);return file?response({url:file.url}):response({},404)}
  if(method==='GET'&&path.startsWith('/files/download/')){const file=files.find(f=>f.id===path.split('/').at(-1));return file?new Response(file.bytes):response({},404)}
  const associations=path.match(/^\/crm\/v4\/objects\/(deals|contacts)\/([^/]+)\/associations\/notes$/)
  if(method==='GET'&&associations)return response({results:notes.filter(n=>n.recordId===associations[2]&&n.recordType===associations[1]).map(n=>({toObjectId:n.id,associationTypes:[{category:'HUBSPOT_DEFINED',typeId:associations[1]==='deals'?213:201}]}))})
  if(method==='GET'&&path.startsWith('/crm/v3/objects/notes/')){const note=notes.find(n=>n.id===path.split('/').at(-1));return note?response({id:note.id,properties:note.properties}):response({},404)}
  if(method==='POST'&&path==='/crm/v3/objects/notes'){
   const before=fail('note','before');if(before)return before
   const body=await request.json(),association=body.associations[0],type=association.types[0].associationTypeId
   assert.ok([214,202].includes(type));assert.equal(association.types[0].associationCategory,'HUBSPOT_DEFINED')
   const note={id:String(7000+notes.length),recordType:type===214?'deals':'contacts',recordId:association.to.id,properties:body.properties};notes.push(note)
   return fail('note','after')??response({id:note.id,properties:note.properties})
  }
  throw new Error('Unexpected HubSpot fake request '+method+' '+path)
 }
 return {networkEdge,contacts,deals,owners,files:()=>[...files],notes:()=>[...notes],patches:()=>[...patches],calls:()=>[...calls],failNext:(stage,when='after')=>{failure={stage,when}},intercept:handler=>{interceptor=handler}}
}
