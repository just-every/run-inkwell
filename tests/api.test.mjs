import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { harness } from './harness.mjs'

let h, member, envelopeId, original, fullArchive, laterArchive, importedId
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const pdfText = async bytes => { const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'); const pdf = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise; let text = ''; for (let n = 1; n <= pdf.numPages; n++) text += (await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str).join('\n') + '\n'; return text }
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
test('RECORD-004: a signed-out visitor verifies a genuine executed PDF; altered and unrelated PDFs reveal nothing',async()=>{
 const e=(await snapshot()).envelopes.find(e=>e.id===envelopeId),base='/api/inkwell/envelopes/'+envelopeId
 const check=async bytes=>{const r=await h.mf.dispatchFetch(h.origin+'/api/verify',{method:'POST',headers:{'content-type':'application/pdf'},body:bytes});assert.equal(r.status,200);return r.json()}
 const executed=(await h.send(base+'/artifacts/signed',undefined,h.owner)).bytes,certificate=(await h.send(base+'/artifacts/certificate',undefined,h.owner)).bytes
 const genuine=await check(executed)
 assert.equal(genuine.match,true);assert.equal(genuine.document,'executed');assert.equal(genuine.envelope.id,envelopeId);assert.equal(genuine.envelope.title,e.title);assert.equal(genuine.sha256,e.signedSha256)
 assert.equal((await check(certificate)).document,'certificate')
 const altered=executed.slice();altered[Math.floor(altered.length/2)]^=1
 for(const bytes of [altered,original,await (await PDFDocument.create()).save()]) assert.deepEqual(Object.keys(await check(bytes)).sort(),['match','sha256'],'a file that matches nothing reveals nothing else')
 assert.equal((await check(altered)).match,false)
})
test('PREP-010: copying a completed envelope makes an unsigned draft that names its source',async()=>{
 const casey={name:'Casey Rivera',email:'casey@harbour.example'},sourceId=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio renewal',signers:[casey],fields:[fields[0]]})).result.id
 await h.command('envelope.approve',{id:sourceId,eligible:true})
 const signer=await verified(casey.email)
 await h.post(signer.path+'/sign',{values:{'signature-0':'Casey Rivera'},consent:true,commandId:crypto.randomUUID()},signer.cookie)
 const source=(await snapshot()).envelopes.find(e=>e.id===sourceId)
 assert.equal(source.status,'completed')
 await h.command('envelope.copy',{id:sourceId},member,403)
 const copy=(await h.command('envelope.copy',{id:sourceId})).result
 const draft=(await snapshot()).envelopes.find(e=>e.id===copy.id)
 assert.notEqual(copy.id,sourceId);assert.equal(draft.status,'prepared');assert.equal(draft.copiedFrom,sourceId)
 assert.deepEqual(draft.signers,source.signers.map(({name,email})=>({name,email})),'same recipients, no signatures or entered values')
 assert.deepEqual(draft.fields,source.fields);assert.equal(draft.signedSha256,undefined)
 assert.equal(digest((await h.send('/api/inkwell/envelopes/'+copy.id+'/artifacts/original',undefined,h.owner)).bytes),source.originalSha256,'the original, unsigned bytes')
 await h.command('envelope.copy',{id:copy.id},h.owner,409)
 await h.command('envelope.approve',{id:copy.id,eligible:true})
 const sent=(await snapshot()).envelopes.find(e=>e.id===copy.id)
 assert.equal(sent.status,'awaiting_signature');assert.equal(sent.events[0].detail.copiedFrom,sourceId)
 assert.equal(JSON.parse(new TextDecoder().decode((await h.send('/api/inkwell/envelopes/'+copy.id+'/artifacts/audit',undefined,h.owner)).bytes)).envelope.copiedFrom,sourceId)
 await h.command('envelope.void',{id:copy.id,reason:'Copy checked; not needed'})
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
test('SIGNX-004: the second signer declines with a reason; the third is never invited, the sender and first signer are told, and the certificate records it',async()=>{
 const trio=[{name:'Dana Cole',email:'dana@harbour.example'},{name:'Eli Park',email:'eli@harbour.example'},{name:'Fran Wu',email:'fran@harbour.example'}]
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio supplier NDA',signers:trio,fields:trio.map((_,signer)=>({...fields[0],id:`signature-${signer}`,signer,y:.4+signer*.12}))})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const first=await verified(trio[0].email)
 await h.post(first.path+'/sign',{values:{'signature-0':'Dana Cole'},consent:true,commandId:crypto.randomUUID()},first.cookie)
 await h.post(first.path+'/decline',{reason:'Changed my mind',commandId:crypto.randomUUID()},first.cookie,409)
 const second=await verified(trio[1].email),reason='Clause 4 names the wrong supplier entity'
 await h.post(second.path+'/decline',{reason:' ',commandId:crypto.randomUUID()},second.cookie,400)
 assert.equal((await h.post(second.path+'/decline',{reason,commandId:crypto.randomUUID()},second.cookie)).value.result.status,'declined')
 await h.post(second.path+'/sign',{values:{'signature-1':'Eli Park'},consent:true,commandId:crypto.randomUUID()},second.cookie,409)
 assert.equal(await h.mail(trio[2].email),undefined,'the third signer is never invited')
 for(const email of ['owner@harbour.example',trio[0].email]) assert.ok((await h.mail(email,'Declined:'))?.text.includes(reason),`${email} receives the decline notice with its reason`)
 assert.equal((await h.send(second.path,undefined,second.cookie)).value.status,'declined')
 const e=(await snapshot()).envelopes.find(e=>e.id===id)
 assert.equal(e.status,'declined');assert.equal(e.signers[1].declineReason,reason);assert.equal(e.signers[2].signedAt,undefined)
 assert.ok(e.events.some(event=>event.action==='signer.declined'&&event.detail.reason===reason))
 const certificate=await h.send('/api/inkwell/envelopes/'+id+'/artifacts/certificate',undefined,h.owner)
 assert.equal(certificate.status,200);assert.equal(digest(certificate.bytes),e.certificateSha256)
 const text=await pdfText(certificate.bytes)
 assert.ok(text.includes('Inkwell decline certificate')&&text.includes('Decline reason: '+reason)&&text.includes('by Eli Park'),'the certificate records the decline')
 assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true)
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
