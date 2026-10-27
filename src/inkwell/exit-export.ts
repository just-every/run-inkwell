import { cleanupSupersededObjects } from './object-artifacts'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { operatorAuth, type Bindings } from '../auth.server'
import { active, canonical, id, insist, now, Refusal, sha256, type Actor, type Envelope } from './model'
import { atomic, roleGuard } from './storage'
import { readBytes } from './body'

type Job={id:string;actor:string;state:string;created_at:string;owner_scope:number}
type Entry={name:string;size:number;sha256:string;record:string;title:string;status:string;open:(offset:number,length:number)=>AsyncGenerator<Uint8Array>}
const encode=(s:string)=>new TextEncoder().encode(s)
const sum=(parts:Uint8Array[])=>parts.reduce((n,p)=>n+p.length,0)
const names=(job:string)=>{insist(/^[a-f0-9-]{36}$/.test(job),'Export job not found.',404);const prefix='iw_exit_'+job.replaceAll('-','');return{envelopes:prefix+'_e',blobs:prefix+'_b',threads:prefix+'_t',imports:prefix+'_i',objects:prefix+'_o'}}
const quote=(value:string)=>'"'+value+'"'
export async function exportActor(request:Request,env:Bindings):Promise<Actor>{
 insist(!request.headers.has('authorization'),'Use a member session for document exports.',403)
 const session=await operatorAuth(env).getSession(request);insist(session,'Sign in to export documents.',401);insist(['owner','admin'].includes(session.operator.role),'Only an owner or admin exports documents.',403)
 if(request.method!=='GET')insist(request.headers.get('origin')===env.AUTH_ORIGIN,'The request origin was refused.',403)
 return{id:session.operator.id,name:session.operator.displayName,email:session.operator.email,role:session.operator.role as 'owner'|'admin',version:session.operator.version,sessionId:session.id}
}
async function* rows(db:D1Database,table:string){for(let offset=0;;offset+=32){const batch=(await db.prepare(`SELECT * FROM ${quote(table)} ORDER BY id LIMIT 32 OFFSET ?`).bind(offset).all<any>()).results;if(!batch.length)break;yield* batch}}
export function discardExitQueries(job:string){return[...Object.values(names(job)).map(table=>({sql:`DROP TABLE IF EXISTS ${quote(table)}`,params:[] as string[]})),{sql:'DELETE FROM iw_exit_members WHERE job=?',params:[job]},{sql:"UPDATE iw_exit_exports SET state='discarded' WHERE id=?",params:[job]}]}
export function discardExitStatements(db:D1Database,job:string){return discardExitQueries(job).map(q=>db.prepare(q.sql).bind(...q.params))}
/** Erasure and imported-custody retirement invalidate every live snapshot containing the record. */
export async function invalidateExitQueries(db:D1Database,record:string){const jobs=(await db.prepare('SELECT job FROM iw_exit_members WHERE record_id=?').bind(record).all<{job:string}>()).results;return jobs.flatMap(j=>discardExitQueries(j.job))}
export async function invalidateExitStatements(db:D1Database,record:string){return(await invalidateExitQueries(db,record)).map(q=>db.prepare(q.sql).bind(...q.params))}
async function create(env:Bindings,actor:Actor,input:Record<string,unknown>){
 const all=input.scope==='all',selected=Array.isArray(input.ids)?input.ids:[]
 insist(all||input.scope==='selected'&&selected.length>0,'Choose all envelopes or select at least one.')
 insist(selected.every(v=>typeof v==='string'&&(/^[a-f0-9-]{36}$/.test(v)||/^import:[a-f0-9]{64}$/.test(v)))&&new Set(selected).size===selected.length,'Choose distinct existing records.')
 insist(actor.role==='owner'||!selected.some(v=>String(v).startsWith('import:')),'Imported archives keep their existing owner-only access.',403)
 const job=id(),tables=names(job),values=JSON.stringify(selected),where=all?'1':'id IN (SELECT value FROM json_each(?))',params=all?[]:[values]
 const importWhere=actor.role!=='owner'?'0':all?'1':"'import:'||id IN (SELECT value FROM json_each(?))",importParams=actor.role!=='owner'||all?[]:[values]
 const guards=[roleGuard(actor,['owner','admin'])]
 if(!all)guards.push({sql:`(SELECT COUNT(*) FROM iw_envelopes WHERE ${where})+(SELECT COUNT(*) FROM iw_imported_archives WHERE ${importWhere})=?`,values:[...params,...importParams,selected.length]})
 await atomic(env.DB,guards,[
  env.DB.prepare('INSERT INTO iw_exit_exports(id,actor,state,created_at,owner_scope) VALUES(?,?,?,?,?)').bind(job,actor.id,'ready',now(),actor.role==='owner'?1:0),
  env.DB.prepare(`CREATE TABLE ${quote(tables.envelopes)} AS SELECT * FROM iw_envelopes WHERE ${where}`).bind(...params),
  env.DB.prepare(`CREATE TABLE ${quote(tables.blobs)} AS SELECT b.* FROM iw_blobs b JOIN ${quote(tables.envelopes)} e ON e.id=b.envelope_id`),
  env.DB.prepare(`CREATE TABLE ${quote(tables.objects)} AS SELECT o.* FROM iw_object_artifacts o JOIN ${quote(tables.envelopes)} e ON e.id=o.owner_id WHERE o.owner_type='envelope'`),
  env.DB.prepare(`CREATE INDEX ${quote(tables.blobs+'_index')} ON ${quote(tables.blobs)}(envelope_id,kind,part)`),
  env.DB.prepare(`CREATE TABLE ${quote(tables.threads)} AS SELECT t.* FROM iw_comment_threads t JOIN ${quote(tables.envelopes)} e ON e.id=t.envelope_id`),
  env.DB.prepare(`CREATE INDEX ${quote(tables.threads+'_index')} ON ${quote(tables.threads)}(envelope_id,id)`),
  env.DB.prepare(`CREATE TABLE ${quote(tables.imports)} AS SELECT * FROM iw_imported_archives WHERE ${importWhere}`).bind(...importParams),
  env.DB.prepare(`INSERT INTO iw_exit_members SELECT ?,id FROM ${quote(tables.envelopes)}`).bind(job),env.DB.prepare(`INSERT INTO iw_exit_members SELECT ?,'import:'||id FROM ${quote(tables.imports)}`).bind(job),
 ])
 return{id:job,state:'ready'}
}
function expected(e:Envelope,kind:string){if(kind==='original')return e.originalSha256;if(kind==='signed')return e.signedSha256;if(kind==='certificate')return e.certificateSha256;const [type,index]=kind.split('-');if(type==='document')return e.documents?.[Number(index)]?.sha256;if(type==='executed')return e.documents?.[Number(index)]?.signedSha256;if(type==='paper')return e.signers[Number(index)]?.paper?.sha256;if(type==='mark')return e.signers[Number(index)]?.adoption?.sha256;if(type==='initials')return e.signers[Number(index)]?.initialsAdoption?.sha256;return kind.startsWith('supplement-')?e.supplements?.find(s=>kind==='supplement-'+s.id)?.sha256:undefined}
function memoryEntry(name:string,bytes:Uint8Array,metadata:{record:string;title:string;status:string}):Entry{return{name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...metadata,async*open(offset,length){yield bytes.subarray(offset,offset+length)}}}
async function* entries(env:Bindings,job:Job):AsyncGenerator<Entry>{
 const tables=names(job.id)
 for await(const row of rows(env.DB,tables.envelopes)){
  const e:Envelope=JSON.parse(row.data),metadata={record:e.id,title:e.title,status:e.status},prefix=`envelopes/${e.id}`
  const threads=(await env.DB.prepare(`SELECT data FROM ${quote(tables.threads)} WHERE envelope_id=? ORDER BY id`).bind(e.id).all<{data:string}>()).results.map(r=>JSON.parse(r.data))
  yield memoryEntry(`${prefix}/audit.json`,encode(JSON.stringify({format:'inkwell-audit/1',envelope:e})),metadata)
  yield memoryEntry(`${prefix}/custody.json`,encode(JSON.stringify({format:'inkwell-record-custody/1',envelope:e,threads})),metadata)
  const artifacts=(await env.DB.prepare(`SELECT kind,SUM(length(data)) AS bytes,COUNT(*) AS parts FROM ${quote(tables.blobs)} WHERE envelope_id=? GROUP BY kind ORDER BY kind`).bind(e.id).all<{kind:string;bytes:number;parts:number}>()).results
  const objects=(await env.DB.prepare(`SELECT kind,bytes,object_key FROM ${quote(tables.objects)} WHERE owner_id=?`).bind(e.id).all<{kind:string;bytes:number;object_key:string}>()).results
  for(const a of [...artifacts.filter(a=>!objects.some(o=>o.kind===a.kind)),...objects]){const hash=expected(e,a.kind);if(!hash||a.kind.startsWith('mark-')||a.kind.startsWith('initials-'))continue;const pdf=!a.kind.startsWith('mark-')&&!a.kind.startsWith('initials-')&&(!a.kind.startsWith('paper-')||e.signers[Number(a.kind.slice(6))]?.paper?.mediaType==='application/pdf')
   yield{name:`${prefix}/${a.kind}.${pdf?'pdf':'bin'}`,size:a.bytes,sha256:hash,...metadata,async*open(offset,length){
    if('object_key' in a){const object=await env.ARTIFACTS.get(a.object_key,{range:{offset,length}});insist(object,'Export object is unavailable.',410);const reader=object.body.getReader(),digest=offset===0&&length===a.bytes?createHash('sha256'):undefined;try{for(;;){const next=await reader.read();if(next.done)break;digest?.update(next.value);yield next.value}}finally{await reader.cancel();reader.releaseLock()}if(digest)insist(digest.digest('hex')===hash,'An exported object failed its fingerprint check.',503);return}
    let part=Math.floor(offset/65536),position=part*65536,remaining=length;const digest=offset===0&&length===a.bytes?createHash('sha256'):undefined
    while(remaining>0){const chunks=(await env.DB.prepare(`SELECT part,data FROM ${quote(tables.blobs)} WHERE envelope_id=? AND kind=? AND part>=? ORDER BY part LIMIT 32`).bind(e.id,a.kind,part).all<{part:number;data:number[]}>()).results;insist(chunks.length,'Export snapshot is no longer available.',410)
     for(const chunk of chunks){insist(chunk.part===part++,'Export artifact is incomplete.',503);const bytes=new Uint8Array(chunk.data),skip=Math.max(0,offset-position),value=bytes.subarray(skip,Math.min(bytes.length,skip+remaining));position+=bytes.length;remaining-=value.length;digest?.update(value);if(value.length)yield value;if(!remaining)break;}}
    if(digest)insist(digest.digest('hex')===hash,'An exported artifact failed its fingerprint check.',503)
   }}
  }
 }
 for await(const row of rows(env.DB,tables.imports)){
  const value=JSON.parse(row.value),metadata={record:'import:'+row.id,title:value.title,status:'imported'},prefix=`imports/${row.id}`
  yield memoryEntry(`${prefix}/audit.json`,encode(JSON.stringify({provider:value.provider,sourceId:value.sourceId,metadata:value.metadata})),metadata)
  for(const [i,file] of value.files.entries()){const bytes=new Uint8Array(Buffer.from(file.base64,'base64'));insist(bytes.length===file.size&&createHash('sha256').update(bytes).digest('hex')===file.sha256,'Imported artifact failed its fingerprint check.',503);yield memoryEntry(`${prefix}/${file.role}-${i}.pdf`,bytes,metadata)}
 }
}
const cell=(s:string)=>'"'+(/^[=+@-]/.test(s)?"'"+s:s).replaceAll('"','""')+'"'
const csv=(e:Entry)=>[e.record,e.title,e.status,e.name,String(e.size),e.sha256].map(cell).join(',')+'\r\n'
const manifest=(e:Entry)=>JSON.stringify({path:e.name,bytes:e.size,sha256:e.sha256,record:e.record})+'\n'
function header(name:string,size:number){
 const bytes=new Uint8Array(512),write=(at:number,width:number,value:string)=>bytes.set(encode(value).subarray(0,width),at),octal=(n:number,width:number)=>n.toString(8).padStart(width-1,'0')+'\0'
 insist(encode(name).length<=100&&size<8**11,'An export entry exceeds the TAR format bound.',413)
 write(0,100,name);write(100,8,octal(0o600,8));write(108,8,octal(0,8));write(116,8,octal(0,8));write(124,12,octal(size,12));write(136,12,octal(0,12));write(148,8,'        ');write(156,1,'0');write(257,6,'ustar\0');write(263,2,'00');write(148,8,bytes.reduce((n,b)=>n+b,0).toString(8).padStart(6,'0')+'\0 ');return bytes
}
const padded=(n:number)=>Math.ceil(n/512)*512
async function download(env:Bindings,job:Job,request:Request){
 let csvBytes=encode('record,title,status,path,bytes,sha256\r\n').length,manifestBytes=0,total=1024
 for await(const e of entries(env,job)){csvBytes+=encode(csv(e)).length;manifestBytes+=encode(manifest(e)).length;total+=512+padded(e.size)}
 total+=512+padded(csvBytes)+512+padded(manifestBytes)
 const match=request.headers.has('range')?/^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range')!):null;insist(!request.headers.has('range')||match,'Use one byte range.',416)
 const start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),total-1):total-1;insist(Number.isSafeInteger(start)&&start>=0&&start<total&&end>=start,'Export range is outside the file.',416)
 async function* archive(){
  let position=0
  const slice=(bytes:Uint8Array)=>{const a=Math.max(0,start-position),b=Math.min(bytes.length,end-position+1);position+=bytes.length;return a<b?bytes.subarray(a,b):undefined}
  async function* entry(e:Pick<Entry,'name'|'size'|'open'>){const h=slice(header(e.name,e.size));if(h)yield h;const a=Math.max(0,start-position),b=Math.min(e.size,end-position+1);if(a<b)yield*e.open(a,b-a);position+=e.size;const padding=slice(new Uint8Array(padded(e.size)-e.size));if(padding?.length)yield padding}
  for await(const e of entries(env,job)){yield*entry(e);if(position>end)return}
  yield*entry({name:'index.csv',size:csvBytes,async*open(offset,length){let at=0;for await(const row of (async function*(){yield encode('record,title,status,path,bytes,sha256\r\n');for await(const e of entries(env,job))yield encode(csv(e))})()){const a=Math.max(0,offset-at),b=Math.min(row.length,offset+length-at);if(a<b)yield row.subarray(a,b);at+=row.length;if(at>=offset+length)break}}})
  yield*entry({name:'fingerprints.ndjson',size:manifestBytes,async*open(offset,length){let at=0;for await(const e of entries(env,job)){const row=encode(manifest(e)),a=Math.max(0,offset-at),b=Math.min(row.length,offset+length-at);if(a<b)yield row.subarray(a,b);at+=row.length;if(at>=offset+length)break}}})
  const tail=slice(new Uint8Array(1024));if(tail)yield tail
 }
 const iterator=archive()[Symbol.asyncIterator](),stream=new ReadableStream<Uint8Array>({async pull(c){try{const item=await iterator.next();if(item.done)c.close();else c.enqueue(item.value)}catch(error){c.error(error)}},async cancel(){await iterator.return(undefined)}})
 return new Response(stream,{status:match?206:200,headers:{'content-type':'application/x-tar','content-disposition':`attachment; filename="inkwell-documents-${job.id}.tar"`,'content-length':String(end-start+1),'accept-ranges':'bytes','cache-control':'no-store','etag':`"${job.id}"`,...(match?{'content-range':`bytes ${start}-${end}/${total}`}:{})}})
}
export async function exitExportResponse(request:Request,env:Bindings):Promise<Response|null>{
 const path=new URL(request.url).pathname;if(!path.startsWith('/api/inkwell/exports'))return null
 try{const actor=await exportActor(request,env),route=path.slice('/api/inkwell/exports'.length).split('/').filter(Boolean)
  if(!route.length&&request.method==='POST'){const input=JSON.parse(new TextDecoder().decode(await readBytes(request,1024*1024)));return Response.json(await create(env,actor,input))}
  insist(route.length>=1&&route.length<=2,'Export route not found.',404)
  const job=await env.DB.prepare('SELECT * FROM iw_exit_exports WHERE id=? AND actor=?').bind(route[0],actor.id).first<Job>();insist(job,'Export job not found.',404);insist(!job.owner_scope||actor.role==='owner','This export includes owner-only imported custody.',403)
  if(route[1]==='discard'&&request.method==='POST'){await atomic(env.DB,[roleGuard(actor,['owner','admin'])],discardExitStatements(env.DB,job.id));await cleanupSupersededObjects(env);return Response.json({ok:true})}
  insist(job.state==='ready','This export was discarded or invalidated by erasure.',410)
  if(route.length===1&&request.method==='GET'){const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM iw_exit_members WHERE job=?').bind(job.id).first<{n:number}>();return Response.json({id:job.id,state:job.state,records:count!.n})}
  if(route[1]==='download'&&request.method==='GET')return download(env,job,request)
  throw new Refusal('Export route not found.',404)
 }catch(error){if(error instanceof Refusal)return Response.json({error:error.message},{status:error.status});console.error('inkwell.export.failed');return Response.json({error:'The export failed. No success was recorded.'},{status:500})}
}
