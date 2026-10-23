// API-001 B7: exact-candidate rolling quota proof, deliberately outside push Verify.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { PDFDocument } from 'pdf-lib'
import { harness } from '../harness.mjs'
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
execFileSync('git',['diff','--exit-code','HEAD'],{stdio:'pipe'})
const runId=`cloud-sx-inkwell-c42-api-capacity-${new Date().toISOString().replace(/[-:.]/g,'')}`
execFileSync(process.execPath,['--test','--test-name-pattern=API-001: hourly 30/7-day warnings','tests/api-keys.test.mjs'],{stdio:'inherit'})
const start=Date.now(),h=await harness({now:start})
try {
 const member=(await h.send('/api/inkwell',undefined,h.owner)).value.actor.id
 const mint=async scopes=>(await h.post('/api/inkwell/api-keys',{memberId:member,name:'synthetic-inkwell-1',scopes,commandId:crypto.randomUUID()},h.owner)).value.token
 const reads=await mint(['envelopes:read']),keys=[]
 for(let n=0;n<51;n++)keys.push(await mint(['envelopes:send','envelopes:read']))
 const call=(token,body)=>h.send('/api/v1/envelopes',body,'',{authorization:`Bearer ${token}`})
 for(let n=0;n<600;n++)assert.equal((await call(reads)).status,200)
 const overRead=await call(reads);assert.equal(overRead.status,429);assert.equal(Number(overRead.headers.get('retry-after')),60)
 h.advanceTo(start+60_001);assert.equal((await call(reads)).status,200)
 const policy=(await h.send('/api/inkwell/send-policies',undefined,h.owner)).value.policies.find(p=>p.source==='api')
 await h.command('account.send_policy',{source:'api',mode:'autonomous',expectedVersion:policy.version})
 const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('synthetic-inkwell-2')
 const definition={title:'synthetic-inkwell-2',filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),status:'sent',signers:[{name:'Mara Quinn',email:'mara.capacity@clients.example'}],fields:[{id:'sig',label:'Signature',signer:0,type:'signature',page:0,x:.1,y:.2,width:.4,height:.05}]}
 const initialMail=h.sent()
 for(let k=0;k<50;k++){
  for(let n=0;n<60;n++){
   const response=await call(keys[k],{...definition,commandId:`synthetic-inkwell-${3+k*60+n}`})
   assert.equal(response.status,200,`release ${k*60+n+1}: ${JSON.stringify(response.value)}`)
  }
  if(k===0){const overKey=await call(keys[k],{...definition,commandId:'synthetic-inkwell-3004'});assert.equal(overKey.status,429);assert.ok(Number(overKey.headers.get('retry-after'))>0)}
  if((k+1)%10===0)console.log(`quota progress ${60*(k+1)}/3000 head=${sha}`)
 }
 const before=(await call(keys[50])).value.total
 assert.equal(before,3000);assert.equal(h.sent()-initialMail,3000)
 const refused=await call(keys[50],{...definition,commandId:'synthetic-inkwell-3005'})
 assert.equal(refused.status,429);assert.equal(Number(refused.headers.get('retry-after')),3600)
 assert.equal((await call(keys[50])).value.total,before);assert.equal(h.sent()-initialMail,3000,'nothing is queued or sent over budget')
 h.advanceTo(start+60_001+3600_000)
 const admitted=await call(keys[50],{...definition,commandId:'synthetic-inkwell-3005'})
 assert.equal(admitted.status,200,JSON.stringify(admitted.value));assert.equal((await call(keys[50])).value.total,3001)
 console.log(JSON.stringify({runId,head:sha,result:'PASS',expiryWarningThresholds:[30,7],requestsPerMinute:600,sendsPerKeyPerMinute:60,policySendsPerAccountPerHour:3000,afterWindow:3001}))
}finally{await h.close()}
