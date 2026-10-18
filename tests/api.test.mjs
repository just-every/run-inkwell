import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { harness } from './harness.mjs'

let h, member, envelopeId, original, fullArchive, laterArchive, importedId
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const recipients = [{name:'Priya Shah',email:'priya@harbour.example'},{name:'Alex Morgan',email:'alex@harbour.example'}]
const fields = recipients.map((_,signer)=>({id:`signature-${signer}`,label:'Signature',type:'signature',signer,page:0,x:.1,y:.55+signer*.13,width:.4,height:.07}))
const preparation = () => ({title:'Harbour Studio — consulting agreement',filename:'consulting.pdf',pdfBase64:Buffer.from(original).toString('base64'),signers:structuredClone(recipients),fields:structuredClone(fields)})
const snapshot=async()=>{const r=await h.send('/api/inkwell',undefined,h.owner);assert.equal(r.status,200);return r.value}
const signingToken=async email=>{const mail=await h.mail(email,'Please sign:');assert.ok(mail,'ordered invitation delivered to local mail edge');return new URL(mail.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)}
async function verified(email) {
 const token=await signingToken(email),path='/api/sign/'+token
 await h.post(path+'/code',{},'')
 const mail=await h.mail(email,'verification code'),code=mail.text.match(/\b\d{6}\b/)?.[0]
 assert.ok(code,'email code delivered')
 const r=await h.post(path+'/verify',{code},'')
 return {token,path,cookie:r.cookie,code}
}
before(async()=>{
 h=await harness()
 const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica)
 page.drawText('Harbour Studio — Consulting Agreement'.replace('—','-'),{x:60,y:770,size:20,font})
 page.drawText('Scope: deliver the agreed workshop. Fee: AUD 1,500. No payment is taken here.',{x:60,y:720,size:10,font})
 page.drawText('Both parties agree to the attached scope and delivery date.',{x:60,y:690,size:12,font})
 original=await pdf.save()
 member=await h.invite('reader@harbour.example','member')
})
after(async()=>{await h?.close()})

test('native sessions and roles guard each document, import, agent and archive door',async()=>{
 for(const path of ['/api/inkwell','/api/inkwell/archive','/api/inkwell/import/jobs']) assert.equal((await h.send(path)).status,401)
 assert.equal((await h.send('/api/inkwell',undefined,member)).status,200)
 for(const [path,body] of [['/api/inkwell/commands',{command:'envelope.prepare',commandId:crypto.randomUUID(),input:preparation()}],['/api/inkwell/archive/restore',{archive:{}}],['/api/inkwell/erase',{id:'missing',confirmation:'ERASE'}],['/api/inkwell/import/preview',{archive:{}}]]) assert.equal((await h.send(path,body,member)).status,403)
 await h.command('agent.issue',{},member,403)
 assert.equal((await h.send('/api/inkwell/commands',{command:'envelope.prepare',commandId:crypto.randomUUID(),input:preparation()},h.owner,{origin:'https://outside.example'})).status,403)
})
test('a prepared fixed PDF requires explicit human approval and immutable recipient fields',async()=>{
 const prepared=await h.command('envelope.prepare',preparation());envelopeId=prepared.result.id
 assert.ok(envelopeId)
 assert.equal(await h.mail(recipients[0].email,'Please sign:'),undefined)
 const e=(await snapshot()).envelopes.find(e=>e.id===envelopeId)
 assert.equal(e.status,'prepared');assert.equal(e.originalSha256,digest(original))
 await h.command('envelope.approve',{id:envelopeId,eligible:false},h.owner,400)
 const approved=await h.command('envelope.approve',{id:envelopeId,eligible:true})
 assert.equal(approved.result.invitation,undefined,'provider-configured sends never expose the private link')
 await h.command('envelope.invite',{id:envelopeId},h.owner,409)
 assert.equal((await snapshot()).envelopes.find(e=>e.id===envelopeId).manualInvitationAvailable,false)
 assert.ok(await h.mail(recipients[0].email,'Please sign:'))
 assert.equal(await h.mail(recipients[1].email,'Please sign:'),undefined)
 await h.command('envelope.approve',{id:envelopeId,eligible:true},h.owner,409)
 const bad=preparation();bad.fields[0]={...bad.fields[0],page:5}
 await h.command('envelope.prepare',bad,h.owner,400)
})
test('signers verify a one-use email code, consent, and sign sequentially',async()=>{
 const token=await signingToken(recipients[0].email),path='/api/sign/'+token
 assert.equal((await h.send(path+'/document')).status,401)
 await h.post(path+'/code',{},'')
 const mail=await h.mail(recipients[0].email,'verification code'),code=mail.text.match(/\b\d{6}\b/)[0]
 await h.post(path+'/verify',{code:'000000'===code?'111111':'000000'},'',401)
 const first=await h.post(path+'/verify',{code},'')
 await h.post(path+'/verify',{code},'',401)
 assert.equal((await h.send(path+'/document',undefined,first.cookie)).status,200)
 await h.post(path+'/sign',{values:{'signature-0':'Priya Shah'},consent:false,commandId:crypto.randomUUID()},first.cookie,400)
 await h.post(path+'/sign',{values:{'signature-0':'Priya Shah'},consent:true,commandId:crypto.randomUUID()},first.cookie)
 assert.ok(await h.mail(recipients[1].email,'Please sign:'))
 await h.post(path+'/sign',{values:{'signature-0':'Changed'},consent:true,commandId:crypto.randomUUID()},first.cookie,409)
 const second=await verified(recipients[1].email)
 const payload={values:{'signature-1':'Alex Morgan'},consent:true,commandId:crypto.randomUUID()}
 const simultaneous=await Promise.all([h.send(second.path+'/sign',payload,second.cookie),h.send(second.path+'/sign',payload,second.cookie)])
 assert.ok(simultaneous.some(r=>r.status===200),'one execution succeeds')
 assert.ok(simultaneous.every(r=>[200,409].includes(r.status)),'concurrent replay cannot double-sign')
 const e=(await snapshot()).envelopes.find(e=>e.id===envelopeId)
 assert.equal(e.status,'completed');assert.equal(e.signers.filter(s=>s.signedAt).length,2)
 assert.equal(e.events.filter(e=>e.action==='signer.signed').length,2)
 assert.equal((await h.send(second.path+'/artifacts/signed',undefined,second.cookie)).status,200)
})
test('executed PDF, certificate, event chain and handoff agree with recomputed fingerprints',async()=>{
 const e=(await snapshot()).envelopes.find(e=>e.id===envelopeId),base='/api/inkwell/envelopes/'+envelopeId
 for(const [kind,hash] of [['original',e.originalSha256],['signed',e.signedSha256],['certificate',e.certificateSha256]]) {
  const r=await h.send(base+'/artifacts/'+kind,undefined,h.owner)
  assert.equal(r.status,200);assert.equal(digest(r.bytes),hash)
  assert.ok((await PDFDocument.load(r.bytes)).getPageCount()>0)
 }
 const audit=await h.send(base+'/artifacts/audit',undefined,h.owner);assert.equal(audit.status,200)
 const handoff=await h.send(base+'/artifacts/handoff',undefined,h.owner);assert.equal(handoff.status,200)
 const verification=await h.send(base+'/verify',undefined,h.owner);assert.equal(verification.status,200);assert.equal(verification.value.ok,true)
})
test('agent credentials can prepare but cannot approve, sign or retain authority after revocation',async()=>{
 const issued=(await h.command('agent.issue')).result
 const headers={authorization:'Bearer '+issued.token}
 const created=await h.post('/api/inkwell/agent/prepare',{...preparation(),commandId:crypto.randomUUID()},'',200,headers)
 const id=created.value.result.id
 const attempt=await h.send('/api/inkwell/commands',{command:'envelope.approve',commandId:crypto.randomUUID(),input:{id,eligible:true}},'',headers)
 assert.equal(attempt.status,401)
 await h.command('agent.revoke',{id:issued.id})
 await h.post('/api/inkwell/agent/prepare',{...preparation(),commandId:crypto.randomUUID()},'',401,headers)
 await h.command('envelope.void',{id,reason:'Agent proposal declined by owner'})
})
test('voiding revokes an invitation immediately',async()=>{
 const input={...preparation(),title:'Withdrawn agreement',signers:[{name:'Jamie Lee',email:'jamie@harbour.example'}],fields:[fields[0]]}
 const id=(await h.command('envelope.prepare',input)).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const token=await signingToken('jamie@harbour.example')
 await h.command('envelope.void',{id,reason:'Scope changed before signing'})
 const r=await h.send('/api/sign/'+token+'/code',{},'');assert.equal(r.status,409)
})
test('DocuSeal dry run, explicit fingerprint, journal, downloads and undo preserve custody',async()=>{
 const archive=await readFile('tests/fixtures/docuseal/archive.json','utf8')
 const preview=(await h.post('/api/inkwell/import/preview',{archive})).value
 assert.equal((await h.send('/api/inkwell/import/jobs',undefined,h.owner)).value.jobs.length,0)
 await h.post('/api/inkwell/import/apply',{archive,fingerprint:'changed'},h.owner,409)
 const applied=(await h.post('/api/inkwell/import/apply',{archive,fingerprint:preview.fingerprint})).value
 assert.equal(applied.job.state,'completed')
 let library=(await h.send('/api/inkwell/import/records',undefined,h.owner)).value.records
 assert.equal(library.length,1);importedId=library[0].id
 const file=library[0].artifacts[0],download=await h.send(file.url,undefined,h.owner)
 assert.equal(download.status,200);assert.equal(digest(download.bytes),file.sha256)
 const undone=(await h.post('/api/inkwell/import/undo',{id:applied.job.id})).value
 assert.equal(undone.job.state,'undone')
 assert.equal((await h.send('/api/inkwell/import/records',undefined,h.owner)).value.records.length,0)
 assert.equal((await h.send('/api/inkwell/import/jobs',undefined,h.owner)).value.jobs.length,1)
 // Import another completed upstream submission after undo so restore includes native custody.
 const another=JSON.parse(archive);another.submissions[0].id+=1
 const plan=(await h.post('/api/inkwell/import/preview',{archive:another})).value
 await h.post('/api/inkwell/import/apply',{archive:another,fingerprint:plan.fingerprint})
})
test('archive export validates contents and refuses replacing a populated installation',async()=>{
 const exported=await h.send('/api/inkwell/archive',undefined,h.owner)
 assert.equal(exported.status,200);fullArchive=exported.value
 await h.post('/api/inkwell/archive/restore',{archive:fullArchive},h.owner,409)
 const damaged=structuredClone(fullArchive);damaged.ndjson=damaged.ndjson.replace('Harbour Studio','Altered Studio')
 const rejected=await h.send('/api/inkwell/archive/restore',{archive:damaged},h.owner)
 assert.ok([400,409].includes(rejected.status))
})
test('a fresh installation restores the executed file, certificate and full import journal',async()=>{
 await h.close();h=await harness()
 await h.post('/api/inkwell/archive/restore',{archive:fullArchive})
 const e=(await snapshot()).envelopes.find(e=>e.id===envelopeId)
 assert.equal(e.status,'completed')
 for(const [kind,hash] of [['signed',e.signedSha256],['certificate',e.certificateSha256]]) {
  const artifact=await h.send('/api/inkwell/envelopes/'+envelopeId+'/artifacts/'+kind,undefined,h.owner)
  assert.equal(artifact.status,200);assert.equal(digest(artifact.bytes),hash)
 }
 const jobs=(await h.send('/api/inkwell/import/jobs',undefined,h.owner)).value.jobs
 assert.ok(jobs.some(job=>job.state==='undone'));assert.ok(jobs.some(job=>job.state==='completed'))
})
test('owner erasure removes files and identity custody and records a restore fence',async()=>{
 await h.post('/api/inkwell/erase',{id:envelopeId,confirmation:'wrong'},h.owner,400)
 await h.post('/api/inkwell/erase',{id:envelopeId,confirmation:'ERASE'})
 assert.equal((await h.send('/api/inkwell/envelopes/'+envelopeId+'/artifacts/signed',undefined,h.owner)).status,404)
 assert.ok(!(await snapshot()).envelopes.some(e=>e.id===envelopeId))
 const exported=await h.send('/api/inkwell/archive',undefined,h.owner);assert.equal(exported.status,200);laterArchive=exported.value
 assert.ok(!laterArchive.ndjson.includes(envelopeId),'erased native envelope is absent from later archive')
})
test('fresh-store restore refuses resurrection with the later journal and restores complete surviving custody',async()=>{
 await h.close();h=await harness()
 await h.post('/api/inkwell/archive/restore',{archive:fullArchive,laterJournal:laterArchive},h.owner,400)
 await h.post('/api/inkwell/archive/restore',{archive:laterArchive})
 assert.ok(!(await snapshot()).envelopes.some(e=>e.id===envelopeId))
 const library=(await h.send('/api/inkwell/import/records',undefined,h.owner)).value.records
 assert.equal(library.length,1)
 const file=library[0].artifacts[0],download=await h.send(file.url,undefined,h.owner)
 assert.equal(digest(download.bytes),file.sha256)
 const again=await h.send('/api/inkwell/archive',undefined,h.owner);assert.equal(again.status,200)
 const closing=a=>JSON.parse(a.ndjson.trim().split('\n').at(-1)).contentHash
 assert.equal(closing(again.value),closing(laterArchive),'domain archive export/restore/export round trip')
})
