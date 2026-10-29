import { archiveBuckets, ownedObjectKeys, removeUnreferencedObjects } from './object-artifacts'
import { createPortability, createPortabilityHandler, canonicalJson, type Manifest, type Closing } from '@runeditrun/rer/modules/portability'
import type { Bindings } from '../auth.server'
import type { Actor } from './model'
import { insist } from './model'
import policy from './archive-policy.mjs'
const encode=(value:string)=>new TextEncoder().encode(value)
/** The pinned Base service owns snapshot, checksums, erasure fences and atomic empty-store publication. */
export async function archiveTransfers(request:Request,env:Bindings,actor:Actor,db:D1Database) {
 const basePath='/api/inkwell/archive/transfers',url=new URL(request.url),route=url.pathname.slice(basePath.length).split('/').filter(Boolean)
 if(route[0]==='exports'&&route[1]&&(route[2]==='download'||route[2]==='records')) {
  insist(request.method==='GET','Use GET to download archive records.',405)
  const service=await createPortability({buckets:archiveBuckets(env),db,policy}),job=route[1]
  insist(await service.actor(job)===actor.id,'Archive job not found.',404)
  const status=await service.exports.status(job);insist(status.phase==='complete','Finish building this archive before downloading.',409)
  const row=await env.DB.prepare('SELECT metadata FROM rer_portability_jobs WHERE id=?').bind(job).first<{metadata:string}>(),metadata=JSON.parse(row!.metadata)
  const manifest=metadata.manifest as Manifest,closing:Closing={kind:'closing',partCount:status.completed,contentHash:metadata.contentHash,archiveHash:metadata.archiveHash}
  if(route[2]==='records') {
   if(route[3]==='manifest')return Response.json(manifest,{headers:{'cache-control':'no-store'}})
   if(route[3]==='closing')return Response.json(closing,{headers:{'cache-control':'no-store'}})
   const part=Number(route[3]);insist(Number.isSafeInteger(part)&&part>=0&&part<status.completed,'Archive part not found.',404)
   async function* segments(){let segment=0;for(;;){const rows=(await env.DB.prepare('SELECT segment,data FROM rer_portability_segments WHERE job=? AND part=? AND segment>=? ORDER BY segment LIMIT 16').bind(job,part,segment).all<{segment:number;data:string}>()).results;if(!rows.length)break;for(const row of rows){insist(row.segment===segment++,'Archive part is incomplete.',503);yield encode(row.data)}}insist(segment>0,'Archive part is no longer available.',410)}
   const iterator=segments()[Symbol.asyncIterator](),stream=new ReadableStream<Uint8Array>({async pull(c){try{const value=await iterator.next();if(value.done)c.close();else c.enqueue(value.value)}catch(error){c.error(error)}},async cancel(){await iterator.return(undefined)}})
   return new Response(stream,{headers:{'content-type':'application/json','cache-control':'no-store'}})
  }
  // Byte ranges resume at a stored segment, without replaying the archive prefix through JavaScript.
  const prefix=encode(canonicalJson(manifest)+'\n'),suffix=encode(canonicalJson(closing)+'\n')
  const inventory=await env.DB.prepare('SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) AS bytes FROM rer_portability_segments WHERE job=?').bind(job).first<{bytes:number}>()
  const middle=inventory!.bytes+status.completed,total=prefix.length+middle+suffix.length,range=request.headers.get('range'),match=range?/^bytes=(\d+)-(\d*)$/.exec(range):null
  insist(!range||match,'Use one byte range.',416)
  const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),total-1):total-1
  insist(Number.isSafeInteger(start)&&start>=0&&start<total&&end>=start,'Archive range is outside the file.',416)
  async function* chunks(){
   if(start<prefix.length)yield prefix.subarray(start,Math.min(prefix.length,end+1))
   const bodyStart=Math.max(0,start-prefix.length),bodyEnd=Math.min(middle-1,end-prefix.length)
   if(bodyStart<=bodyEnd){
    const location=await env.DB.prepare(`WITH sizes AS (SELECT part,SUM(length(CAST(data AS BLOB)))+1 AS n FROM rer_portability_segments WHERE job=? GROUP BY part), positions AS (SELECT part,n,COALESCE(SUM(n) OVER(ORDER BY part ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS offset FROM sizes) SELECT part,offset FROM positions WHERE offset+n>? ORDER BY part LIMIT 1`).bind(job,bodyStart).first<{part:number;offset:number}>()
    insist(location,'Archive bytes are no longer available.',410)
    let position=location.offset
    for(let part=location.part;part<status.completed&&position<=bodyEnd;part++){
     for(let segment=0;;){const rows=(await env.DB.prepare('SELECT segment,data FROM rer_portability_segments WHERE job=? AND part=? AND segment>=? ORDER BY segment LIMIT 16').bind(job,part,segment).all<{segment:number;data:string}>()).results;if(!rows.length)break;for(const row of rows){const bytes=encode(row.data),a=Math.max(0,bodyStart-position),b=Math.min(bytes.length,bodyEnd-position+1);if(a<b)yield bytes.subarray(a,b);position+=bytes.length;segment=row.segment+1;}}
     if(position>=bodyStart&&position<=bodyEnd)yield encode('\n');position++
    }
   }
   const offset=prefix.length+middle;if(end>=offset)yield suffix.subarray(Math.max(0,start-offset),Math.min(suffix.length,end-offset+1))
  }
  const iterator=chunks()[Symbol.asyncIterator](),stream=new ReadableStream<Uint8Array>({async pull(c){try{const r=await iterator.next();if(r.done)c.close();else c.enqueue(r.value)}catch(error){c.error(error)}},async cancel(){await iterator.return?.()}})
  return new Response(stream,{status:range?206:200,headers:{'content-type':'application/x-ndjson','content-disposition':`attachment; filename="inkwell-${job}.ndjson"`,'content-length':String(end-start+1),'accept-ranges':'bytes','etag':`"${metadata.archiveHash}"`,'cache-control':'no-store',...(range?{'content-range':`bytes ${start}-${end}/${total}`}:{})}})
 }
 const response=await(await createPortabilityHandler({buckets:archiveBuckets(env),db,policy,appOrigin:env.AUTH_ORIGIN,basePath,authorize:async()=>actor.id}))(request)
 if(response?.ok&&request.method==='POST'&&route[0]==='exports'&&route[2]==='advance') {
  const row=await db.prepare('SELECT metadata FROM rer_portability_jobs WHERE id=? AND actor=?').bind(route[1],actor.id).first<{metadata:string}>()
  if(row){const metadata=JSON.parse(row.metadata),table=metadata.manifest.tables[metadata.cursor?.table]?.name,copy=metadata.copies[table]
   // Base normalizes its private snapshot with CREATE TABLE AS, which drops its ordering index.
   // Restore that access path before another part reads BLOB rows; do not sort their bytes in memory.
   if(table&&metadata.normalized?.includes(table)&&/^rer_portability_snap_[a-f0-9]+_[0-9]+$/.test(copy))await db.batch([db.prepare(`CREATE INDEX IF NOT EXISTS "${copy}_meta_order" ON "${copy}_meta"(rer_portability_row_order)`)])
  }
 }
 return response
}
