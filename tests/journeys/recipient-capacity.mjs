// Exact-candidate scale proof, intentionally outside push Verify.
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from '../harness.mjs'
const h=await harness({mailProvider:null})
try {
 const pdf=await PDFDocument.create();for(let i=0;i<5;i++)pdf.addPage([612,792]).drawText(`Harbour Studio approval packet - page ${i+1}`,{x:45,y:750})
 const signers=Array.from({length:100},(_,i)=>({name:`Party ${i+1}`,email:`party-${i+1}@harbour.example`,order:1})),fields=signers.map((_,i)=>({id:`sig-${i}`,label:`Signature ${i+1}`,type:'signature',signer:i,page:Math.floor(i/20),x:.08,y:.06+(i%20)*.043,width:.55,height:.032})),base={title:'Harbour Studio 100-party agreement',filename:'100-party.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers,fields}
 await h.command('envelope.prepare',{...base,signers:[...signers,{name:'Party 101',email:'party-101@harbour.example'}]},h.owner,400)
 await h.command('envelope.prepare',{...base,copies:[{name:'Extra copy',email:'extra-copy@harbour.example'}]},h.owner,400)
 const id=(await h.command('envelope.prepare',base)).result.id,approved=(await h.command('envelope.approve',{id,eligible:true})).result
 assert.equal(approved.invitations.length,100)
 for(const [i,invitation] of approved.invitations.entries()){
  const path='/api'+new URL(invitation.url).pathname,cookie=(await h.post(path+'/verify',{code:invitation.code},'')).cookie
  await h.agree(path,cookie)
  const view=(await h.send(path,undefined,cookie)).value;assert.deepEqual(view.fields.map(f=>f.id),[`sig-${i}`]);assert.equal(view.canSign,true)
  await h.post(path+'/sign',{values:{[`sig-${i}`]:signers[i].name},consent:true,commandId:crypto.randomUUID()},cookie)
 }
 const e=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
 assert.equal(e.status,'completed');assert.equal(e.signers.filter(s=>s.signedAt).length,100);assert.equal(h.sent(),0);const verification=(await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value;if(!verification.auditChain.ok){
  const custody=(await h.send('/api/inkwell/envelopes/'+id+'/artifacts/audit',undefined,h.owner)).value.envelope
  const ledger=(await h.db.prepare('SELECT data FROM iw_events WHERE envelope_id=? ORDER BY sequence').bind(id).all()).results.map(r=>JSON.parse(r.data))
  const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value)
  let previous='';for(const [i,{hash,...body}] of custody.events.entries()){const actual=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(body)))).toString('hex');if(body.previousHash!==previous||actual!==hash){console.log('AUDIT_FAILURE',i,body.action,body.previousHash===previous,actual===hash);break}previous=hash}
  console.log('LEDGER_COMPARISON',ledger.length,custody.events.length,ledger.findIndex((e,i)=>JSON.stringify(e)!==JSON.stringify(custody.events[i])))
 }
 assert.equal(verification.ok,true,JSON.stringify(verification))
 const executed=await h.send('/api/inkwell/envelopes/'+id+'/artifacts/signed',undefined,h.owner);assert.equal(executed.status,200);assert.equal((await PDFDocument.load(executed.bytes)).getPageCount(),5)
 console.log('PASS: 100 recipients completed through authenticated HTTP doors, exactly 100 own-field sessions; 101st recipient and over-cap copy refused; executed five-page PDF and custody verified.')
}finally{await h.close()}
