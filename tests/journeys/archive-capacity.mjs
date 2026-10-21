// PORT-002 exact-candidate 2 GiB proof. This committed scale journey runs outside push Verify.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { harness } from '../harness.mjs'
import { capacityFixture } from './document-capacity.mjs'
class TarVerifier {
 constructor(){this.pending=Buffer.alloc(0);this.remaining=0;this.padding=0;this.name='';this.hashes=new Map();this.contents=new Map();this.total=0}
 feed(input){let bytes=Buffer.from(input);this.total+=bytes.length
  while(bytes.length){
   if(this.remaining){const n=Math.min(this.remaining,bytes.length),chunk=bytes.subarray(0,n);this.digest.update(chunk);if(this.capture)this.capture.push(chunk);this.remaining-=n;bytes=bytes.subarray(n);if(!this.remaining){this.hashes.set(this.name,this.digest.digest('hex'));if(this.capture)this.contents.set(this.name,Buffer.concat(this.capture));}continue}
   if(this.padding){const n=Math.min(this.padding,bytes.length);this.padding-=n;bytes=bytes.subarray(n);continue}
   const n=Math.min(512-this.pending.length,bytes.length);this.pending=Buffer.concat([this.pending,bytes.subarray(0,n)]);bytes=bytes.subarray(n);if(this.pending.length<512)continue
   const header=this.pending;this.pending=Buffer.alloc(0);if(header.every(b=>b===0))continue
   this.name=header.subarray(0,100).toString().split('\0')[0];this.remaining=parseInt(header.subarray(124,136).toString().replace(/\0.*$/,''),8);assert.ok(Number.isSafeInteger(this.remaining));this.padding=(512-this.remaining%512)%512;this.digest=createHash('sha256');this.capture=['fingerprints.ndjson','index.csv'].includes(this.name)?[]:undefined
   if(!this.remaining){this.hashes.set(this.name,this.digest.digest('hex'));if(this.capture)this.contents.set(this.name,Buffer.alloc(0))}
  }
 }
 finish(){assert.equal(this.remaining,0);assert.equal(this.padding,0);assert.equal(this.pending.length,0);const manifest=this.contents.get('fingerprints.ndjson').toString().trim().split('\n').map(JSON.parse);for(const entry of manifest)assert.equal(this.hashes.get(entry.path),entry.sha256,entry.path);assert.ok(this.contents.get('index.csv').includes(Buffer.from('sha256')));return manifest.length}
}
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'','scale proof requires a clean committed candidate')
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runId='cloud-port-'+new Date().toISOString().replace(/[-:.]/g,''),h=await harness({mailProvider:null})
let destination
process.once('SIGINT',()=>void(async()=>{await destination?.close();await h.close();process.exit(130)})())
const base='/api/inkwell/archive/transfers',started=Date.now()
try{
 const source=await capacityFixture(h),invitation=(await h.command('envelope.approve',{id:source.id,eligible:true})).result.invitations[0],path='/api'+new URL(invitation.url).pathname,cookie=(await h.post(path+'/verify',{code:invitation.code},'')).cookie
 await h.agree(path,cookie);await h.post(path+'/sign',{values:{signature:'Capacity Signer'},consent:true,commandId:crypto.randomUUID()},cookie)
 const ids=[source.id]
 for(let n=0;n<20;n++){ids.push((await h.command('envelope.copy',{id:source.id})).result.id);if((n+1)%5===0)console.log(JSON.stringify({phase:'seeded',records:ids.length,rawDocumentBytes:ids.length*100*1024*1024}))}
 const rawDocumentBytes=ids.length*100*1024*1024;assert.ok(rawDocumentBytes>=2*1024**3)
 const job=(await h.post('/api/inkwell/exports',{scope:'all'})).value.id,verifier=new TarVerifier()
 const fetchExport=range=>h.mf.dispatchFetch(h.origin+`/api/inkwell/exports/${job}/download`,{headers:{cookie:h.owner,...(range?{range}:{})}})
 const first=await fetchExport(),reader=first.body.getReader();assert.equal(first.status,200)
 let received=0
 while(received<1024*1024){const value=await reader.read();assert.ok(!value.done);received+=value.value.length;verifier.feed(value.value)}
 await reader.cancel('synthetic-inkwell-2 interrupted download');reader.releaseLock()
 const resumed=await fetchExport(`bytes=${received}-`);assert.equal(resumed.status,206);assert.match(resumed.headers.get('content-range'),new RegExp(`^bytes ${received}-`))
 const resumedReader=resumed.body.getReader();for(;;){const next=await resumedReader.read();if(next.done)break;verifier.feed(next.value)}resumedReader.releaseLock()
 const files=verifier.finish();assert.ok(verifier.total>=2*1024**3);console.log(JSON.stringify({phase:'selective-export-verified',bytes:verifier.total,files,resumedAt:received}))
 await h.post(`/api/inkwell/exports/${job}/discard`,{})
 const archive=(await h.post(base+'/exports',{},h.owner,201)).value.id
 let state=(await h.post(`${base}/exports/${archive}/advance`,{maxParts:1})).value
 assert.equal((await h.send(`${base}/exports/${archive}`,undefined,h.owner)).value.completed,state.completed)
 let reported=0
 while(state.phase==='building'){state=(await h.post(`${base}/exports/${archive}/advance`,{expectedPart:state.completed,maxParts:8})).value;if(state.completed-reported>=16){reported=state.completed;console.log(JSON.stringify({phase:'building',parts:state.completed,bytes:state.bytes}))}}
 assert.equal(state.phase,'complete');assert.ok(state.bytes>=2*1024**3)
 const manifest=(await h.send(`${base}/exports/${archive}/records/manifest`,undefined,h.owner)).value,closing=(await h.send(`${base}/exports/${archive}/records/closing`,undefined,h.owner)).value
 destination=await harness({mailProvider:null})
 const restore=(await destination.post(base+'/imports',{manifest,confirmed:true},destination.owner,201)).value.id
 for(let index=0;index<manifest.partCount;index++){
  const part=(await h.send(`${base}/exports/${archive}/records/${index}`,undefined,h.owner)).value
  const put=async()=>{const response=await destination.mf.dispatchFetch(destination.origin+`${base}/imports/${restore}/parts/${index}`,{method:'PUT',headers:{origin:destination.origin,cookie:destination.owner,'content-type':'application/json'},body:JSON.stringify(part)});assert.equal(response.status,200,await response.text())}
  await put();if(index===0)await put()
  if(index===2){assert.equal((await destination.send(`${base}/imports/${restore}`,undefined,destination.owner)).value.completed,3);assert.equal((await destination.send(`/api/inkwell/envelopes/${source.id}`,undefined,destination.owner)).status,404)}
  if((index+1)%16===0)console.log(JSON.stringify({phase:'restoring',parts:index+1,total:manifest.partCount}))
 }
 const restored=(await destination.post(`${base}/imports/${restore}/finalize`,{contentHash:closing.contentHash,archiveHash:closing.archiveHash})).value;assert.equal(restored.phase,'complete')
 let fingerprints=0
 for(const id of ids){const result=(await destination.send(`/api/inkwell/envelopes/${id}/verify`,undefined,destination.owner)).value;assert.equal(result.ok,true);fingerprints+=result.fingerprints.filter(f=>f.available).length}
 console.log(JSON.stringify({runId,journey:'PORT-002 2 GiB export/resume/restore',sha,records:ids.length,rawDocumentBytes,selectiveBytes:verifier.total,archiveBytes:state.bytes,parts:manifest.partCount,verifiedFingerprints:fingerprints,downloadResumed:true,buildResumed:true,restoreResumed:true,elapsedMs:Date.now()-started,result:'PASS'}))
}finally{await destination?.close();await h.close()}
