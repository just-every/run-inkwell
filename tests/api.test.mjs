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
async function verified(email,{agree=true}={}) {
 const token=await signingToken(email),path='/api/sign/'+token
 await h.post(path+'/code',{},'')
 const mail=await h.mail(email,'verification code'),code=mail.text.match(/\b\d{6}\b/)?.[0]
 assert.ok(code,'email code delivered')
 const r=await h.post(path+'/verify',{code},'')
 if(agree) await h.agree(path,r.cookie)
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
 await h.agree(path,first.cookie)
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
test('SIGNX-005: a new signer reads and accepts the versioned disclosure before the document; the next withdraws consent and the envelope stops on record',async()=>{
 const pair=[{name:'Ivy Brooks',email:'ivy@harbour.example'},{name:'Jon Reyes',email:'jon@harbour.example'},{name:'Kit Moss',email:'kit@harbour.example'}]
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio mooring licence',signers:pair,fields:pair.map((_,signer)=>({...fields[0],id:`signature-${signer}`,signer,y:.4+signer*.12}))})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const first=await verified(pair[0].email,{agree:false}),view=(await h.send(first.path,undefined,first.cookie)).value.disclosure
 assert.equal(view.acceptedAt,undefined);assert.ok(view.version)
 for(const topic of ['Withdrawing your consent','Getting a paper copy','Keeping your contact details current','Hardware and software you need']) assert.ok(view.sections.some(s=>s.heading===topic),`the disclosure covers ${topic}`)
 assert.equal((await h.send(first.path+'/document',undefined,first.cookie)).status,403,'the document waits for the disclosure')
 await h.post(first.path+'/sign',{values:{'signature-0':'Ivy Brooks'},consent:true,commandId:crypto.randomUUID()},first.cookie,403)
 await h.post(first.path+'/withdraw',{commandId:crypto.randomUUID()},first.cookie,409)
 await h.post(first.path+'/disclosure',{version:'an-older-version',agree:true},first.cookie,409)
 await h.post(first.path+'/disclosure',{version:view.version,agree:false},first.cookie,400)
 const accepted=await h.agree(first.path,first.cookie)
 assert.equal(accepted.version,view.version);assert.equal((await h.send(first.path,undefined,first.cookie)).value.disclosure.acceptedAt,accepted.acceptedAt)
 assert.equal((await h.send(first.path+'/document',undefined,first.cookie)).status,200)
 await h.post(first.path+'/sign',{values:{'signature-0':'Ivy Brooks'},consent:true,commandId:crypto.randomUUID()},first.cookie)
 const second=await verified(pair[1].email)
 assert.equal((await h.post(second.path+'/withdraw',{commandId:crypto.randomUUID()},second.cookie)).value.result.status,'declined')
 await h.post(second.path+'/sign',{values:{'signature-1':'Jon Reyes'},consent:true,commandId:crypto.randomUUID()},second.cookie,409)
 assert.equal((await h.send(second.path,undefined,second.cookie)).value.declined.withdrawn,true)
 assert.ok((await h.mail('owner@harbour.example','Consent withdrawn:'))?.text.includes('Jon Reyes withdrew consent'),'the sender is notified')
 assert.equal(await h.mail(pair[2].email),undefined,'nobody later is invited')
 const e=(await snapshot()).envelopes.find(e=>e.id===id)
 assert.equal(e.status,'declined');assert.equal(e.signers[1].consentWithdrawn,true)
 assert.deepEqual(e.signers.slice(0,2).map(s=>s.disclosure?.version),[view.version,view.version])
 const recorded=e.events.filter(event=>event.action==='signer.disclosure_accepted')
 assert.deepEqual(recorded.map(event=>[event.detail.signer,event.detail.version]),[[0,view.version],[1,view.version]]);assert.equal(recorded[0].at,accepted.acceptedAt)
 assert.ok(e.events.some(event=>event.action==='signer.consent_withdrawn'&&event.detail.signer===1&&event.detail.disclosureVersion===view.version))
 const certificate=await h.send('/api/inkwell/envelopes/'+id+'/artifacts/certificate',undefined,h.owner),text=await pdfText(certificate.bytes)
 assert.equal(digest(certificate.bytes),e.certificateSha256)
 assert.ok(text.includes('Inkwell consent withdrawal certificate')&&text.includes(`Electronic record and signature disclosure: version ${view.version}`)&&text.includes(`Disclosure ${view.version} accepted at: ${accepted.acceptedAt}`),'the certificate quotes the disclosure version')
})
test('DELIV-004: an envelope set to expire in 10 days warns on day 7, is extended by 14 days, and an expired one is extended and signed without re-preparing',async()=>{
 const day=86_400_000,start=Date.now(),soon=[{name:'Lou Hart',email:'lou@harbour.example'}],field=[{...fields[0],signer:0}]
 const standard=(await snapshot()).envelopes.find(e=>e.id===envelopeId);assert.equal(Date.parse(standard.expiresAt)-Date.parse(standard.createdAt),120*day,'120 days by default')
 for(const expiresAt of [new Date(start-1000).toISOString(),new Date(start+400*day).toISOString(),'next week']) await h.command('envelope.prepare',{...preparation(),signers:soon,fields:field,expiresAt},h.owner,400)
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio slip rental',signers:soon,fields:field,expiresAt:new Date(start+10*day).toISOString()})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const warnings=async()=>(await snapshot()).envelopes.find(e=>e.id===id).events.filter(e=>e.action==='envelope.expiry_warned')
 await h.scheduled(start+6*day)
 assert.equal((await warnings()).length,0,'no warning on day 6');assert.equal(await h.mail(soon[0].email,'Expires soon:'),undefined)
 await h.scheduled(start+7*day);await h.scheduled(start+7*day+3600_000)
 assert.equal((await warnings()).length,1,'one warning on day 7')
 for(const email of [soon[0].email,'owner@harbour.example']) assert.ok((await h.mail(email,'Expires soon:'))?.text.includes('Harbour Studio slip rental'),`${email} is warned`)
 await h.command('envelope.extend',{id,days:14},member,403)
 await h.command('envelope.extend',{id,days:0},h.owner,400)
 const extended=(await h.command('envelope.extend',{id,days:14})).result
 assert.equal(Date.parse(extended.expiresAt),start+24*day,'extended by 14 days from the old expiry')
 await h.scheduled(start+12*day);assert.equal((await warnings()).length,1,'no warning on day 12 once extended')
 const signer=await verified(soon[0].email)
 assert.equal((await h.post(signer.path+'/sign',{values:{'signature-0':'Lou Hart'},consent:true,commandId:crypto.randomUUID()},signer.cookie)).value.result.status,'completed')
 const lapsed=[{name:'Max Dunn',email:'max@harbour.example'}]
 const late=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio dry dock booking',signers:lapsed,fields:field,expiresAt:new Date(Date.now()+2500).toISOString()})).result.id
 await h.command('envelope.approve',{id:late,eligible:true})
 const path='/api/sign/'+await signingToken(lapsed[0].email)
 const lapse=Date.parse((await snapshot()).envelopes.find(e=>e.id===late).expiresAt)-Date.now()+50
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,lapse)))
 assert.equal((await snapshot()).envelopes.find(e=>e.id===late).status,'expired')
 assert.equal((await h.send(path)).value.status,'expired');await h.post(path+'/code',{},'',410)
 const reopened=(await h.command('envelope.extend',{id:late,days:14})).result
 assert.ok(Math.abs(Date.parse(reopened.expiresAt)-(Date.now()+14*day))<60_000,'an expired envelope reopens for 14 days from now')
 const e=(await snapshot()).envelopes.find(e=>e.id===late)
 assert.equal(e.status,'awaiting_signature');assert.ok(e.events.some(event=>event.action==='envelope.extended'&&event.detail.afterExpiry===true))
 const second=await verified(lapsed[0].email)
 assert.equal((await h.post(second.path+'/sign',{values:{'signature-0':'Max Dunn'},consent:true,commandId:crypto.randomUUID()},second.cookie)).value.result.status,'completed')
})
test('SIGNX-008: a signer downloads the document before signing; a three-page paper scan is accepted as a wet-ink signature, and envelopes that do not allow paper refuse it',async()=>{
 const pair=[{name:'Nia Cole',email:'nia@harbour.example'},{name:'Oto Grant',email:'oto@harbour.example'}]
 const scan=async pages=>{const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);for(let n=1;n<=pages;n++)pdf.addPage([595,842]).drawText(`Scanned page ${n} - signed by hand: Nia Cole`,{x:60,y:700,size:14,font});return pdf.save()}
 const upload=(path,bytes,cookie,status=200,type='application/pdf')=>h.mf.dispatchFetch(h.origin+path+'/paper',{method:'POST',headers:{origin:h.origin,'content-type':type,cookie},body:bytes}).then(async r=>{assert.equal(r.status,status,await r.clone().text());return r.json()})
 const plain=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio electronic-only notice',signers:[pair[0]],fields:[{...fields[0],signer:0}]})).result.id
 await h.command('envelope.approve',{id:plain,eligible:true})
 const only=await verified(pair[0].email)
 assert.equal((await h.send(only.path,undefined,only.cookie)).value.allowPaper,false,'no paper option')
 await upload(only.path,await scan(3),only.cookie,403)
 await h.command('envelope.prepare',{...preparation(),signers:pair,allowPaperSigning:'yes'},h.owner,400)
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio pontoon works order',signers:pair,allowPaperSigning:true})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const first=await verified(pair[0].email,{agree:false})
 await upload(first.path,await scan(3),first.cookie,403)
 await h.agree(first.path,first.cookie)
 assert.equal((await h.send(first.path,undefined,first.cookie)).value.allowPaper,true)
 const before=await h.send(first.path+'/document',undefined,first.cookie)
 assert.equal(before.status,200);assert.equal(digest(before.bytes),digest(original),'the signer downloads the exact document before signing')
 await upload(first.path,new TextEncoder().encode('not a scan'),first.cookie,415,'text/plain')
 const blurred=await scan(1),rejectedUpload=await upload(first.path,blurred,first.cookie)
 assert.equal(rejectedUpload.result.status,'pending');assert.equal(rejectedUpload.result.pages,1)
 await upload(first.path,blurred,first.cookie,409)
 await h.post(first.path+'/sign',{values:{'signature-0':'Nia Cole'},consent:true,commandId:crypto.randomUUID()},first.cookie,409)
 assert.ok(await h.mail('owner@harbour.example','Paper signature to review:'))
 await h.command('envelope.paper_review',{id,accept:true},member,403)
 await h.command('envelope.paper_review',{id,accept:false,reason:'Page 2 and 3 are missing'})
 assert.ok((await h.mail(pair[0].email,'Paper signature not accepted:'))?.text.includes('Page 2 and 3 are missing'))
 const signedScan=await scan(3),uploaded=await upload(first.path,signedScan,first.cookie)
 assert.equal(uploaded.result.sha256,digest(signedScan));assert.equal(uploaded.result.pages,3)
 const review=await h.send('/api/inkwell/envelopes/'+id+'/artifacts/paper-0',undefined,h.owner)
 assert.equal(review.status,200);assert.equal(digest(review.bytes),digest(signedScan),'the sender reviews the exact upload')
 await h.command('envelope.paper_review',{id,accept:true})
 assert.equal((await h.send(first.path+'/document',undefined,first.cookie)).status,200,'the document stays downloadable after signing')
 const second=await verified(pair[1].email)
 await h.post(second.path+'/sign',{values:{'signature-1':'Oto Grant'},consent:true,commandId:crypto.randomUUID()},second.cookie)
 const e=(await snapshot()).envelopes.find(e=>e.id===id)
 assert.equal(e.status,'completed');assert.equal(e.signers[0].paper.status,'accepted');assert.equal(e.signers[0].paper.sha256,digest(signedScan))
 assert.ok(e.events.some(event=>event.action==='signer.signed_on_paper'&&event.detail.wetInk===true&&event.detail.sha256===digest(signedScan)))
 const executed=(await h.send('/api/inkwell/envelopes/'+id+'/artifacts/signed',undefined,h.owner)).bytes
 assert.equal(digest(executed),e.signedSha256);assert.equal((await PDFDocument.load(executed)).getPageCount(),4,'the scan pages follow the document')
 assert.ok((await pdfText(executed)).includes('Scanned page 3'))
 const text=await pdfText((await h.send('/api/inkwell/envelopes/'+id+'/artifacts/certificate',undefined,h.owner)).bytes)
 assert.ok(text.includes('Signed on paper (wet ink)')&&text.includes('Scan SHA-256: '+digest(signedScan)),'the certificate marks the wet-ink signature with the scan fingerprint')
 assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true)
})
test('IDV-003: a recipient must enter the sender-set access code before the document; wrong codes are refused and five lock the invitation',async()=>{
 const pair=[{name:'Gia Lane',email:'gia@harbour.example',accessCode:'HARBOUR-7731'},{name:'Hal Ortiz',email:'hal@harbour.example',accessCode:'tide-2209'}]
 await h.command('envelope.prepare',{...preparation(),signers:[{...pair[0],accessCode:'a b'},pair[1]]},h.owner,400)
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio berth lease',signers:pair})).result.id
 const e=(await snapshot()).envelopes.find(e=>e.id===id)
 assert.deepEqual(e.signers.map(s=>s.accessCode),[true,true]);assert.ok(!JSON.stringify(e).includes('HARBOUR-7731'),'the code itself is never in the envelope')
 await h.command('envelope.approve',{id,eligible:true})
 const path='/api/sign/'+await signingToken(pair[0].email)
 assert.deepEqual((await h.send(path)).value.access,{required:true,passed:false,locked:false})
 await h.post(path+'/code',{},'',403)
 await h.post(path+'/verify',{code:'123456'},'',403)
 assert.equal((await h.send(path+'/document')).status,401)
 await h.post(path+'/access',{accessCode:'harbour-7731'},'',401)
 await h.post(path+'/access',{accessCode:pair[0].accessCode},'')
 assert.equal((await h.send(path)).value.access.passed,true)
 const first=await verified(pair[0].email)
 assert.equal((await h.send(first.path+'/document',undefined,first.cookie)).status,200,'admitted with the right code')
 await h.post(first.path+'/sign',{values:{'signature-0':'Gia Lane'},consent:true,commandId:crypto.randomUUID()},first.cookie)
 const second='/api/sign/'+await signingToken(pair[1].email)
 for(let attempt=1;attempt<=4;attempt++) assert.match((await h.post(second+'/access',{accessCode:'wrong-'+attempt},'',401)).value.error,new RegExp(`${5-attempt} attempts? remains?`))
 await h.post(second+'/access',{accessCode:'wrong-5'},'',423)
 await h.post(second+'/access',{accessCode:pair[1].accessCode},'',423)
 assert.deepEqual((await h.send(second)).value.access,{required:true,passed:false,locked:true})
 await h.post(second+'/code',{},'',423)
 const after=(await snapshot()).envelopes.find(e=>e.id===id)
 assert.equal(after.events.filter(e=>e.action==='signer.access_code_rejected').length,6);assert.ok(after.events.some(e=>e.action==='signer.access_locked'&&e.detail.signer===1))
 assert.ok(after.events.some(e=>e.action==='signer.access_code_verified'&&e.detail.signer===0))
})
test('MANAGE-001: with 5,000 envelopes, search by recipient email answers in under a second and each status filter shows the right count',async()=>{
 const day=86_400_000,now=Date.now(),kinds=['prepared','awaiting_signature','completed','declined','voided','expired','mine'],expected={draft:0,waiting_for_me:0,waiting_for_others:0,completed:0,declined:0,voided:0,expired:0,imported:0}
 const rows=Array.from({length:5000},(_,i)=>{const kind=kinds[i%kinds.length],createdAt=new Date(now-(i+1)*60_000).toISOString(),id=`bulk-${String(i).padStart(4,'0')}`
  const status=kind==='expired'?'awaiting_signature':kind==='mine'?'awaiting_signature':kind
  const signers=[{name:`Client ${i}`,email:kind==='mine'?'owner@harbour.example':`client${i}@harbour.example`,...(['completed'].includes(kind)?{signedAt:createdAt}:{})},{name:'Harbour Counsel',email:'counsel@harbour.example',...(kind==='completed'?{signedAt:createdAt}:{})}]
  expected[{prepared:'draft',awaiting_signature:'waiting_for_others',mine:'waiting_for_me'}[kind]??kind]++
  return {id,version:1,title:`Bulk fixture ${i} · Mooring renewal`,filename:'renewal.pdf',status,createdAt,createdBy:i%2?'sender-a':'sender-b',expiresAt:new Date(kind==='expired'?now-day:now+30*day).toISOString(),signers,fields:[],pageSizes:[{width:595,height:842}],originalSha256:'0'.repeat(64),events:[{action:'envelope.prepared',at:createdAt,actor:'sender',detail:{},previousHash:'',hash:'1'.repeat(64)}]}})
 for(let i=0;i<rows.length;i+=250) await h.db.batch(rows.slice(i,i+250).map(e=>h.db.prepare('INSERT INTO iw_envelopes(id,version,data) VALUES(?,?,?)').bind(e.id,1,JSON.stringify(e))))
 const search=async query=>{const started=performance.now(),r=await h.send('/api/inkwell/envelopes?'+new URLSearchParams(query),undefined,h.owner);assert.equal(r.status,200,JSON.stringify(r.value));return {...r.value,ms:performance.now()-started}}
 const found=await search({q:'client4321@harbour.example'})
 assert.ok(found.ms<1000,`search by recipient email took ${Math.round(found.ms)} ms`)
 assert.deepEqual(found.envelopes.map(e=>e.id),['bulk-4321']);assert.equal(found.total,1)
 const all=await search({q:'bulk fixture'})
 assert.deepEqual(all.counts,expected);assert.equal(all.total,5000)
 for(const [status,count] of Object.entries(expected)) { const page=await search({q:'bulk fixture',status,limit:'100'}); assert.equal(page.envelopes.length,Math.min(100,count),status); assert.ok(page.envelopes.every(e=>e.bucket===status),status); assert.equal(Boolean(page.next),count>100,status) }
 const first=await search({q:'bulk fixture',limit:'100'}),second=await search({q:'bulk fixture',limit:'100',cursor:first.next})
 assert.equal(first.envelopes[0].id,'bulk-0000');assert.equal(second.envelopes[0].id,'bulk-0100','pages follow on without gaps')
 assert.equal((await search({q:'bulk fixture',sender:'sender-a'})).total,2500)
 assert.equal((await search({q:'bulk fixture',from:new Date(now-10.5*60_000).toISOString(),to:new Date(now).toISOString()})).total,10,'filter by date')
 assert.equal((await search({q:'counsel@harbour'})).total,5000,'any recipient email matches')
 assert.equal((await h.send('/api/inkwell/envelopes?status=unknown',undefined,h.owner)).status,400)
 assert.equal((await h.send('/api/inkwell/envelopes')).status,401)
 await h.db.batch(['iw_envelopes'].map(()=>h.db.prepare("DELETE FROM iw_envelopes WHERE id LIKE 'bulk-%'")))
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
