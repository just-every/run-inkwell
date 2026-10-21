// Committed PREP-002 capacity proof, deliberately outside push Verify.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { harness } from '../harness.mjs'
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
export async function capacityFixture(h) {
 const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('synthetic-inkwell-1 capacity agreement',{x:54,y:720,size:16})
 const bytes=new Uint8Array(5*1024*1024).fill(32);bytes.set(await pdf.save())
 const upload=(await h.post('/api/inkwell/documents/uploads',{filename:'capacity.pdf',bytes:bytes.length})).value
 const part=async n=>{const response=await h.mf.dispatchFetch(h.origin+`/api/inkwell/documents/uploads/${upload.id}/parts/${n}`,{method:'PUT',headers:{origin:h.origin,cookie:h.owner,'content-type':'application/octet-stream'},body:bytes.slice(n*upload.chunkBytes,(n+1)*upload.chunkBytes)});assert.equal(response.status,200)}
 await part(0);await part(0) // A lost acknowledgment and reconnect repeat the same part safely.
 for(let n=1;n<Math.ceil(bytes.length/upload.chunkBytes);n++)await part(n)
 const documents=Array.from({length:20},(_,i)=>({uploadId:upload.id,mode:i===0?'sign':'view'}))
 const input={title:'100 MiB document custody',documents,signers:[{name:'Capacity Signer',email:'capacity@inkwell.example'}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,document:0,page:0,x:.1,y:.5,width:.5,height:.06}]}
 await h.command('envelope.prepare',{...input,documents:[...documents,documents[0]]},h.owner,400)
 const larger=(await h.post('/api/inkwell/documents/uploads',{filename:'over-limit.pdf',bytes:bytes.length+1})).value
 const over=await h.command('envelope.prepare',{...input,documents:documents.map((d,i)=>i===0?{...d,uploadId:larger.id}:d)},h.owner,400)
 assert.match(JSON.stringify(over),/100 MiB/)
 const id=(await h.command('envelope.prepare',input)).result.id,record=(await h.send(`/api/inkwell/envelopes/${id}`,undefined,h.owner)).value.envelope
 assert.equal(record.documents.length,20);assert.equal(record.documents.reduce((n,d)=>n+d.bytes,0),100*1024*1024)
 assert.ok(record.documents.every(d=>d.sha256===digest(bytes)))
 for(const index of [0,19])assert.equal(digest((await h.send(`/api/inkwell/envelopes/${id}/artifacts/document-${index}`,undefined,h.owner)).bytes),digest(bytes))
 const checked=(await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value;assert.equal(checked.ok,true);assert.equal(checked.fingerprints.filter(f=>f.available&&f.kind.startsWith('document-')).length,20)
 return{id,bytes,record}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'','capacity proof requires a clean committed candidate')
 const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),h=await harness({mailProvider:null})
 try{await capacityFixture(h);console.log(JSON.stringify({journey:'PREP-002 document capacity',sha,documents:20,bytes:100*1024*1024,resumedUpload:true,allFingerprintsVerified:true,result:'PASS'}))}finally{await h.close()}
}
