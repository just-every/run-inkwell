import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import { crc32, deflateSync } from 'node:zlib'
import { harness } from './harness.mjs'

let h, member, envelopeId, original, fullArchive, laterArchive, importedId
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const pdfText = async bytes => { const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'); const pdf = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise; let text = ''; for (let n = 1; n <= pdf.numPages; n++) text += (await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str).join('\n') + '\n'; return text }
const recipients = [{name:'Priya Shah',email:'priya@harbour.example'},{name:'Alex Morgan',email:'alex@harbour.example'}]
const fields = recipients.map((_,signer)=>({id:`signature-${signer}`,label:'Signature',type:'signature',signer,page:0,x:.1,y:.55+signer*.13,width:.4,height:.07}))
const preparation = () => ({title:'Harbour Studio — consulting agreement',filename:'consulting.pdf',pdfBase64:Buffer.from(original).toString('base64'),signers:structuredClone(recipients),fields:structuredClone(fields)})
// MANAGE-001: one envelope as the signed-in person reads it.
const stored=async(id,cookie=h.owner)=>{const r=await h.send('/api/inkwell/envelopes/'+encodeURIComponent(id),undefined,cookie);assert.equal(r.status,200,JSON.stringify(r.value));return r.value.envelope}
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

// ACCESS-001: Base members are viewers until an owner or admin makes them senders; a sender sees and acts on only the
// envelopes they created; owners and admins act on all; only the owner manages archives, imports and agent tokens.
const sender=async(email,by=h.owner)=>{const cookie=await h.invite(email,'member'),me=(await h.send('/api/inkwell',undefined,cookie)).value.actor;assert.equal(me.role,'viewer','a new member is a viewer');await h.command('member.role',{operatorId:me.id,role:'sender'},by);return {cookie,id:me.id}}
test('ACCESS-001: signed-out, viewer, sender, admin and owner requests meet the role matrix at every door, and every write rechecks the current role',async()=>{
 const admin=await h.invite('ada.admin@harbour.example','admin'),sam=await sender('sam.sender@harbour.example',admin),sky=await sender('sky.sender@harbour.example')
 const ownerEnvelope=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio owner lease'})).result.id
 const samEnvelope=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio Sam proposal'},sam.cookie)).result.id
 const opens=async(cookie,id)=>(await h.send('/api/inkwell/envelopes/'+id,undefined,cookie)).status
 const search=async cookie=>(await h.send('/api/inkwell/envelopes?q=harbour%20studio&limit=100',undefined,cookie)).value.envelopes.map(e=>e.id)
 for(const path of ['/api/inkwell','/api/inkwell/envelopes',`/api/inkwell/envelopes/${ownerEnvelope}`,'/api/inkwell/archive','/api/inkwell/import/jobs',`/api/inkwell/envelopes/${ownerEnvelope}/artifacts/original`]) assert.equal((await h.send(path)).status,401,`signed out: ${path}`)
 assert.equal((await h.send('/api/inkwell/commands',{command:'envelope.prepare',commandId:crypto.randomUUID(),input:preparation()},'')).status,401)
 // viewer: reads every envelope, changes none
 for(const id of [ownerEnvelope,samEnvelope]) { assert.ok((await search(member)).includes(id));assert.equal(await opens(member,id),200); assert.equal((await h.send(`/api/inkwell/envelopes/${id}/artifacts/original`,undefined,member)).status,200) }
 for(const [command,input] of [['envelope.prepare',preparation()],['envelope.approve',{id:samEnvelope,eligible:true}],['envelope.void',{id:samEnvelope,reason:'No'}],['envelope.copy',{id:samEnvelope}],['member.role',{operatorId:sam.id,role:'viewer'}],['agent.issue',{}]]) await h.command(command,input,member,403)
 // sender: only their own, absent from list and search otherwise
 assert.equal(await opens(sam.cookie,ownerEnvelope),403);assert.equal(await opens(sam.cookie,samEnvelope),200);assert.ok(!(await search(sam.cookie)).includes(ownerEnvelope));assert.ok((await search(sam.cookie)).includes(samEnvelope))
 assert.equal(await opens(sky.cookie,samEnvelope),403,'another sender cannot open it');assert.ok(!(await search(sky.cookie)).includes(samEnvelope))
 for(const path of [`/api/inkwell/envelopes/${samEnvelope}/artifacts/original`,`/api/inkwell/envelopes/${samEnvelope}/verify`]) assert.equal((await h.send(path,undefined,sky.cookie)).status,403)
 for(const [command,input] of [['envelope.approve',{id:samEnvelope,eligible:true}],['envelope.void',{id:samEnvelope,reason:'Not mine'}],['envelope.extend',{id:samEnvelope,days:5}],['member.role',{operatorId:sky.id,role:'viewer'}],['envelope.invite',{id:samEnvelope}],['agent.issue',{}]]) await h.command(command,input,sky.cookie,403)
 await h.command('envelope.approve',{id:ownerEnvelope,eligible:true},sam.cookie,403)
 // admin and owner: every envelope; archives, imports, erasure and agent tokens are the owner's
 for(const cookie of [admin,h.owner]) for(const id of [ownerEnvelope,samEnvelope]) assert.ok((await search(cookie)).includes(id))
 for(const [path,body] of [['/api/inkwell/archive/restore',{archive:{}}],['/api/inkwell/erase',{id:'missing',confirmation:'ERASE'}],['/api/inkwell/import/preview',{archive:{}}]]) for(const cookie of [admin,sam.cookie,member]) assert.equal((await h.send(path,body,cookie)).status,403,`${path} is the owner's`)
 await h.command('agent.issue',{},admin,403)
 await h.command('envelope.void',{id:samEnvelope,reason:'Admin tidy-up'},admin)
 // the current role: a sender made a viewer loses sending on their next request
 await h.command('member.role',{operatorId:sky.id,role:'viewer'},admin)
 await h.command('envelope.prepare',preparation(),sky.cookie,403)
 await h.command('member.role',{operatorId:(await h.send('/api/inkwell',undefined,admin)).value.actor.id,role:'viewer'},h.owner,409)
 assert.equal((await h.send('/api/inkwell/commands',{command:'envelope.prepare',commandId:crypto.randomUUID(),input:preparation()},h.owner,{origin:'https://outside.example'})).status,403,'a cross-origin change is refused')
 await h.command('envelope.void',{id:ownerEnvelope,reason:'Matrix checked'})
})
test('SEND-002: a sender voids their own envelope after sending and is refused on another sender\'s; the voided link refuses and the pending message is cancelled',async()=>{
 const rio=await sender('rio.sender@harbour.example'),tess=await sender('tess.sender@harbour.example')
 const recipient={name:'Uma Patel',email:'uma@harbour.example'}
 const prepare=async(cookie,title)=>(await h.command('envelope.prepare',{...preparation(),title,signers:[recipient],fields:[fields[0]]},cookie)).result.id
 const mine=await prepare(rio.cookie,'Harbour Studio Rio quote'),theirs=await prepare(tess.cookie,'Harbour Studio Tess quote')
 await h.command('envelope.approve',{id:mine,eligible:true},rio.cookie)
 const token=await signingToken(recipient.email)
 await h.command('envelope.approve',{id:theirs,eligible:true},tess.cookie)
 await h.db.prepare("INSERT INTO iw_mail(id,envelope_id,signer,kind,recipient,subject,body,created_at) VALUES(?,?,?,?,?,?,?,?)").bind('pending-'+mine,mine,0,'notice',recipient.email,'Queued','queued body',new Date().toISOString()).run()
 await h.command('envelope.void',{id:theirs,reason:'Not my envelope'},rio.cookie,403)
 assert.equal((await h.command('envelope.void',{id:mine,reason:'Price changed before signing'},rio.cookie)).result.status,'voided')
 assert.equal((await h.send('/api/sign/'+token+'/code',{},'')).status,409,'the voided invitation link refuses')
 assert.equal((await h.db.prepare('SELECT state FROM iw_mail WHERE id=?').bind('pending-'+mine).first()).state,'cancelled','the pending message is cancelled')
 assert.equal((await stored(theirs)).status,'awaiting_signature','the other sender\'s envelope is untouched')
 await h.command('envelope.void',{id:theirs,reason:'Test done'},tess.cookie)
})
test('a prepared fixed PDF requires explicit human approval and immutable recipient fields',async()=>{
 const prepared=await h.command('envelope.prepare',preparation());envelopeId=prepared.result.id
 assert.ok(envelopeId)
 assert.equal(await h.mail(recipients[0].email,'Please sign:'),undefined)
 const e=(await stored(envelopeId))
 assert.equal(e.status,'prepared');assert.equal(e.originalSha256,digest(original))
 await h.command('envelope.approve',{id:envelopeId,eligible:false},h.owner,400)
 const approved=await h.command('envelope.approve',{id:envelopeId,eligible:true})
 assert.equal(approved.result.invitations,undefined,'provider-configured sends never expose the private link')
 await h.command('envelope.invite',{id:envelopeId},h.owner,409)
 assert.equal((await stored(envelopeId)).manualInvitationAvailable,false)
 assert.ok(await h.mail(recipients[0].email,'Please sign:'))
 assert.equal(await h.mail(recipients[1].email,'Please sign:'),undefined)
 await h.command('envelope.approve',{id:envelopeId,eligible:true},h.owner,409)
 const bad=preparation();bad.fields[0]={...bad.fields[0],page:5}
 await h.command('envelope.prepare',bad,h.owner,400)
})
// SIGN-001: two email-code signers in strict order; the link-only and parallel-order points are in the IDV-001 test.
test('SIGN-001: signers verify a one-use email code, consent, and sign sequentially; the second is invited only after the first signs',async()=>{
 const token=await signingToken(recipients[0].email),path='/api/sign/'+token
 assert.equal(await h.mail(recipients[1].email,'Please sign:'),undefined,'the second signer is not invited before the first signs')
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
 const e=(await stored(envelopeId))
 assert.equal(e.status,'completed');assert.equal(e.signers.filter(s=>s.signedAt).length,2)
 assert.equal(e.events.filter(e=>e.action==='signer.signed').length,2)
 assert.equal((await h.send(second.path+'/artifacts/signed',undefined,second.cookie)).status,200)
})
test('executed PDF, certificate, event chain and handoff agree with recomputed fingerprints',async()=>{
 const e=(await stored(envelopeId)),base='/api/inkwell/envelopes/'+envelopeId
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
 const e=(await stored(envelopeId)),base='/api/inkwell/envelopes/'+envelopeId
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
 const source=(await stored(sourceId))
 assert.equal(source.status,'completed')
 await h.command('envelope.copy',{id:sourceId},member,403)
 const copy=(await h.command('envelope.copy',{id:sourceId})).result
 const draft=(await stored(copy.id))
 assert.notEqual(copy.id,sourceId);assert.equal(draft.status,'prepared');assert.equal(draft.copiedFrom,sourceId)
 assert.deepEqual(draft.signers,source.signers.map(({name,email,order})=>({name,email,order})),'same recipients in the same routing order, no signatures or entered values')
 assert.deepEqual(draft.fields,source.fields);assert.equal(draft.signedSha256,undefined)
 assert.equal(digest((await h.send('/api/inkwell/envelopes/'+copy.id+'/artifacts/original',undefined,h.owner)).bytes),source.originalSha256,'the original, unsigned bytes')
 await h.command('envelope.copy',{id:copy.id},h.owner,409)
 await h.command('envelope.approve',{id:copy.id,eligible:true})
 const sent=(await stored(copy.id))
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
 assert.equal(attempt.status,403)
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
 const e=(await stored(id))
 assert.equal(e.status,'declined');assert.equal(e.signers[1].declineReason,reason);assert.equal(e.signers[2].signedAt,undefined)
 assert.ok(e.events.some(event=>event.action==='signer.declined'&&event.detail.reason===reason))
 const certificate=await h.send('/api/inkwell/envelopes/'+id+'/artifacts/certificate',undefined,h.owner)
 assert.equal(certificate.status,200);assert.equal(digest(certificate.bytes),e.certificateSha256)
 const text=await pdfText(certificate.bytes)
 assert.ok(text.includes('Inkwell decline certificate')&&text.includes('Decline reason: '+reason)&&text.includes('by Eli Park'),'the certificate records the decline')
 assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true)
})
test('ROUTE-002: recipients at orders 1, 2, 2 and 3; both order-2 recipients are invited together after order 1, and order 3 only after both finish',async()=>{
 const four=[{name:'Gus Hale',email:'gus@harbour.example',order:1},{name:'Hana Ito',email:'hana@harbour.example',order:2},{name:'Ivan Roe',email:'ivan@harbour.example',order:2},{name:'Jo Kim',email:'jo@harbour.example',order:3}]
 const sign=(at,signer,name)=>h.post(at.path+'/sign',{values:{[`signature-${signer}`]:name},consent:true,commandId:crypto.randomUUID()},at.cookie)
 await h.command('envelope.prepare',{...preparation(),signers:[{...four[0],order:0}],fields:[fields[0]]},h.owner,400)
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio partner agreement',signers:four,fields:four.map((_,signer)=>({...fields[0],id:`signature-${signer}`,signer,y:.3+signer*.12}))})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 for(const s of four.slice(1)) assert.equal(await h.mail(s.email),undefined,`${s.name} is not invited before order 1 signs`)
 await sign(await verified(four[0].email),0,'Gus Hale')
 assert.ok(await h.mail(four[1].email,'Please sign:')&&await h.mail(four[2].email,'Please sign:'),'both order-2 recipients are invited together')
 assert.equal(await h.mail(four[3].email),undefined,'order 3 waits for both order-2 recipients')
 const hana=await verified(four[1].email),ivan=await verified(four[2].email)
 for(const at of [hana,ivan]) assert.equal((await h.send(at.path,undefined,at.cookie)).value.canSign,true,'recipients sharing an order can both sign now')
 await sign(ivan,2,'Ivan Roe')
 assert.equal(await h.mail(four[3].email),undefined,'order 3 still waits while one order-2 recipient has not signed')
 await sign(hana,1,'Hana Ito')
 assert.ok(await h.mail(four[3].email,'Please sign:'),'order 3 is invited once both order-2 recipients finish')
 await sign(await verified(four[3].email),3,'Jo Kim')
 const e=(await stored(id))
 assert.equal(e.status,'completed');assert.deepEqual(e.signers.map(s=>s.order),[1,2,2,3])
 assert.ok(e.signers[0].signedAt<=e.signers[2].signedAt&&e.signers[2].signedAt<=e.signers[1].signedAt&&e.signers[1].signedAt<=e.signers[3].signedAt,'the later order-2 recipient signed first, and order 3 signed last')
 assert.deepEqual(e.events.find(event=>event.action==='envelope.prepared').detail.orderedSigners.map(s=>s.order),[1,2,2,3],'the routing orders are on record')
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
 const e=(await stored(id))
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
 const standard=(await stored(envelopeId));assert.equal(Date.parse(standard.expiresAt)-Date.parse(standard.createdAt),120*day,'120 days by default')
 for(const expiresAt of [new Date(start-1000).toISOString(),new Date(start+400*day).toISOString(),'next week']) await h.command('envelope.prepare',{...preparation(),signers:soon,fields:field,expiresAt},h.owner,400)
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio slip rental',signers:soon,fields:field,expiresAt:new Date(start+10*day).toISOString()})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const warnings=async()=>(await stored(id)).events.filter(e=>e.action==='envelope.expiry_warned')
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
 const lapse=Date.parse((await stored(late)).expiresAt)-Date.now()+50
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,lapse)))
 assert.equal((await stored(late)).status,'expired')
 assert.equal((await h.send(path)).value.status,'expired');await h.post(path+'/code',{},'',410)
 const reopened=(await h.command('envelope.extend',{id:late,days:14})).result
 assert.ok(Math.abs(Date.parse(reopened.expiresAt)-(Date.now()+14*day))<60_000,'an expired envelope reopens for 14 days from now')
 const e=(await stored(late))
 assert.equal(e.status,'awaiting_signature');assert.ok(e.events.some(event=>event.action==='envelope.extended'&&event.detail.afterExpiry===true))
 const second=await verified(lapsed[0].email)
 assert.equal((await h.post(second.path+'/sign',{values:{'signature-0':'Max Dunn'},consent:true,commandId:crypto.randomUUID()},second.cookie)).value.result.status,'completed')
})
test('DELIV-003: with the clock advanced, the current signer is reminded on business days 2, 4 and 6 skipping the weekend, the waiting signer never is, and reminders stop after the signature',async()=>{
 const pair=[{name:'Kai Moss',email:'kai@harbour.example'},{name:'Lena Ortiz',email:'lena@harbour.example'}]
 await h.command('envelope.prepare',{...preparation(),reminders:{afterDays:0,everyDays:2}},h.owner,400)
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio retainer',signers:pair,fields:pair.map((_,signer)=>({...fields[0],id:`signature-${signer}`,signer,y:.4+signer*.15})),reminders:{afterDays:2,everyDays:2}})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 // Eastern-time calendar arithmetic for the test clock: 14:00 local on the given local date.
 const zone='America/New_York',local=at=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at)
 const hour=at=>Number(new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',hourCycle:'h23'}).format(at))
 const at2pm=date=>[18,19].map(h=>Date.parse(`${date}T${h}:00:00Z`)).find(at=>hour(at)===14)
 const start=local(Date.now()),dateAfter=n=>new Date(Date.parse(start+'T12:00:00Z')+n*86_400_000).toISOString().slice(0,10)
 const weekend=date=>[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())
 const reminded=async signer=>(await stored(id)).events.filter(e=>e.action==='signer.reminded'&&e.detail.signer===signer)
 let businessDays=0,day=0,sawWeekend=false
 while(businessDays<7){
  day++;const date=dateAfter(day);if(weekend(date))sawWeekend=true;else businessDays++
  await h.scheduled(at2pm(date))
  const sent=await reminded(0)
  assert.equal(sent.length,Math.floor(businessDays/2),`reminders after business day ${businessDays} (${date})`)
  if(weekend(date))assert.ok(sent.every(e=>local(Date.parse(e.detail.passAt))!==date),'no reminder on a weekend')
 }
 assert.ok(sawWeekend,'the run crossed a weekend')
 const sent=await reminded(0)
 assert.deepEqual(sent.map(e=>e.detail.count),[1,2,3])
 assert.ok((await h.mail(pair[0].email,'Reminder to sign:'))?.text.includes('Harbour Studio retainer'),'the reminder reaches the current signer')
 assert.equal(await h.mail(pair[1].email),undefined,'the waiting signer receives nothing');assert.equal((await reminded(1)).length,0)
 const first=await verified(pair[0].email)
 await h.post(first.path+'/sign',{values:{'signature-0':'Kai Moss'},consent:true,commandId:crypto.randomUUID()},first.cookie)
 for(let n=1;n<=6;n++) await h.scheduled(at2pm(dateAfter(day+n)))
 assert.equal((await reminded(0)).length,3,'reminders stop after the signature')
 assert.ok((await reminded(1)).length>=1,'the next signer is reminded once it is their turn')
})
test('MANAGE-003: an admin who is the second signer of a colleague\'s envelope signs from the in-app waiting list after the first signer, with no email round trip',async()=>{
 const admin=await h.invite('ops@harbour.example','admin'),colleague={name:'Mira Chen',email:'mira@harbour.example'},self={name:'ops',email:'ops@harbour.example'}
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio venue hire',signers:[colleague,self],fields:[0,1].map(signer=>({...fields[0],id:`signature-${signer}`,signer,y:.4+signer*.15}))})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const open=(cookie,status=200)=>h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()},cookie,status)
 await open(admin,409)
 const first=await verified(colleague.email)
 await h.post(first.path+'/sign',{values:{'signature-0':'Mira Chen'},consent:true,commandId:crypto.randomUUID()},first.cookie)
 const waiting=(await h.send('/api/inkwell/envelopes?status=waiting_for_me',undefined,admin)).value
 assert.ok(waiting.envelopes.some(e=>e.id===id),'the envelope is in the admin\'s waiting-for-me list')
 assert.equal((await stored(id,admin)).ownSigningAvailable,true)
 const opened=await open(admin),path='/api'+new URL(opened.value.result.signing.url).pathname
 assert.ok(opened.cookie,'the app hands the signing page an already-verified session')
 const view=(await h.send(path,undefined,opened.cookie)).value
 assert.equal(view.verified,true);assert.equal(view.canSign,true)
 await h.agree(path,opened.cookie)
 assert.equal((await h.post(path+'/sign',{values:{'signature-1':'Ops Lead'},consent:true,commandId:crypto.randomUUID()},opened.cookie)).value.result.status,'completed')
 assert.equal(await h.mail(self.email,'verification code'),undefined,'no verification code is emailed to the in-app signer')
 const e=(await stored(id)),me=(await h.send('/api/inkwell',undefined,admin)).value.actor
 assert.ok(e.events.some(event=>event.action==='signer.session_verified'&&event.detail.signer===1&&event.detail.operator===me.id),'the record names the session member')
 // The certificate wraps long lines between words; joined, they read whole.
 const text=(await pdfText((await h.send('/api/inkwell/envelopes/'+id+'/artifacts/certificate',undefined,h.owner)).bytes)).replaceAll('\n',' ')
 assert.ok(text.includes('signed-in Inkwell session of member '+me.id)&&text.includes('emailed verification code'),'the certificate states how each signer was authenticated')
})
test('RECORD-002: the certificate lists each recipient\'s authentication, IP address, user agent, adopted signature, disclosure and times in UTC and Eastern time, matching the audit trail',async()=>{
 const phone={'cf-connecting-ip':'203.0.113.7','user-agent':'RecordPhone/2.1'},desk={'cf-connecting-ip':'198.51.100.4','user-agent':'RecordDesk/5.0'}
 const people=[{name:'Nia Ford',email:'nia@harbour.example'},{name:'Reader',email:'reader@harbour.example'}]
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio photo release',signers:people,fields:[0,1].map(signer=>({...fields[0],id:`signature-${signer}`,signer,y:.4+signer*.15}))})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const path='/api/sign/'+await signingToken(people[0].email)
 await h.post(path+'/code',{},'',200,phone)
 const code=(await h.mail(people[0].email,'verification code')).text.match(/\b\d{6}\b/)[0]
 await h.post(path+'/verify',{code:code==='000000'?'111111':'000000'},'',401,phone)
 const first=(await h.post(path+'/verify',{code},'',200,phone)).cookie
 const version=(await h.send(path,undefined,first)).value.disclosure.version
 await h.post(path+'/disclosure',{version,agree:true},first,200,phone)
 await h.post(path+'/sign',{values:{'signature-0':'Nia Ford'},consent:true,commandId:crypto.randomUUID()},first,200,phone)
 const opened=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()},member,200,desk),second='/api'+new URL(opened.value.result.signing.url).pathname
 await h.post(second+'/disclosure',{version,agree:true},opened.cookie,200,desk)
 await h.post(second+'/sign',{values:{'signature-1':'Reader'},consent:true,commandId:crypto.randomUUID()},opened.cookie,200,desk)
 const e=(await stored(id)),readerId=e.events.find(x=>x.action==='signer.session_verified').detail.operator
 assert.equal(e.status,'completed')
 // The account's US time zone is Eastern; the certificate wraps long lines between words, so read it joined.
 const eastern=at=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(new Date(at)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}`}
 const stamp=at=>`${at} UTC (${eastern(at)})`,at=action=>e.events.find(x=>x.action===action).at
 const text=(await pdfText((await h.send('/api/inkwell/envelopes/'+id+'/artifacts/certificate',undefined,h.owner)).bytes)).replaceAll('\n',' ')
 for(const line of [
  `Original SHA-256: ${e.originalSha256}`,`Signed SHA-256: ${e.signedSha256}`,
  `Authenticated at ${stamp(at('signer.email_verified'))}: emailed verification code, verified (1 incorrect code on record) · IP 203.0.113.7 · User agent: RecordPhone/2.1`,
  `Disclosure ${version} accepted at: ${stamp(e.signers[0].disclosure.acceptedAt)}`,`Adopted signature (Signature): "Nia Ford", typed name`,
  `Signed at: ${stamp(e.signers[0].signedAt)} · IP 203.0.113.7 · User agent: RecordPhone/2.1`,
  `Authenticated at ${stamp(at('signer.session_verified'))}: signed-in Inkwell session of member ${readerId} (signed in by emailed invitation link), verified · IP 198.51.100.4 · User agent: RecordDesk/5.0`,
  `Disclosure ${version} accepted at: ${stamp(e.signers[1].disclosure.acceptedAt)}`,`Adopted signature (Signature): "Reader", typed name`,
  `Signed at: ${stamp(e.signers[1].signedAt)} · IP 198.51.100.4 · User agent: RecordDesk/5.0`,
  // every event up to the one that records this certificate's own creation
  ...e.events.slice(0,e.events.findIndex(x=>x.action==='certificate.created')).map(x=>`${stamp(x.at)} ${x.action}`),
 ]) assert.ok(text.includes(line),`the certificate shows: ${line}`)
})
// SIGNX-002: a PNG drawn on the signing page, here a stroke drawn into RGB pixels (the browser journey draws one by touch).
const drawnPng=(w=300,h=90)=>{const row=w*3+1,raw=Buffer.alloc(row*h,255);for(let y=0;y<h;y++)raw[y*row]=0;for(let x=8;x<w-8;x++){const y=Math.round(h/2+Math.sin(x/16)*h/4);for(let d=-1;d<=1;d++)raw.fill(30,(y+d)*row+1+x*3,(y+d)*row+4+x*3)};const chunk=(type,data)=>{const head=Buffer.alloc(4),tail=Buffer.alloc(4),body=Buffer.concat([Buffer.from(type),data]);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc32(body));return Buffer.concat([head,body,tail])},ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])}
test('SIGNX-002: one signer draws, another types in a chosen style and a third uploads; all three marks are in the executed PDF and the certificate records each method',async()=>{
 const trio=[{name:'Dana Reyes',email:'dana@harbour.example'},{name:'Tess Okafor',email:'tess@harbour.example'},{name:'Uma Patel',email:'uma@harbour.example'}]
 const places=[...trio.map((_,signer)=>({...fields[0],id:`signature-${signer}`,signer,y:.25+signer*.15})),{...fields[0],id:'signature-1b',label:'Second signature',signer:1,y:.8}]
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio three marks',signers:trio,fields:places})).result.id
 await h.command('envelope.approve',{id,eligible:true})
 const drawn=drawnPng(),jpeg=await readFile('tests/fixtures/signature.jpg'),b64=bytes=>Buffer.from(bytes).toString('base64')
 const sign=(s,values,adoption,status=200)=>h.post(s.path+'/sign',{values,consent:true,adoption,commandId:crypto.randomUUID()},s.cookie,status)
 const dana=await verified(trio[0].email)
 // a drawn mark is a PNG, an upload a PNG or JPEG, each at most 512 KiB; anything else is refused before signing
 await sign(dana,{'signature-0':'Dana Reyes'},{method:'drawn',imageBase64:b64(jpeg)},415)
 await sign(dana,{'signature-0':'Dana Reyes'},{method:'uploaded',mediaType:'image/gif',imageBase64:b64(Buffer.from('GIF89a'))},415)
 await sign(dana,{'signature-0':'Dana Reyes'},{method:'uploaded',mediaType:'image/png',imageBase64:b64(Buffer.concat([drawn,Buffer.alloc(512*1024)]))},400)
 await sign(dana,{'signature-0':'Dana Reyes'},{method:'typed',style:'gothic'},400)
 await sign(dana,{'signature-0':'Dana Reyes'},{method:'drawn',imageBase64:b64(drawn)})
 const tess=await verified(trio[1].email)
 // the adopted mark goes on every signature field, so they all carry one name
 await sign(tess,{'signature-1':'Tess Okafor','signature-1b':'T. Okafor'},{method:'typed',style:'serif'},400)
 await sign(tess,{'signature-1':'Tess Okafor','signature-1b':'Tess Okafor'},{method:'typed',style:'serif'})
 const uma=await verified(trio[2].email)
 await sign(uma,{'signature-2':'Uma Patel'},{method:'uploaded',mediaType:'image/jpeg',imageBase64:b64(jpeg)})
 const e=await stored(id)
 assert.equal(e.status,'completed')
 assert.deepEqual(e.signers.map(s=>s.adoption.method),['drawn','typed','uploaded'],'the record keeps each adoption method')
 // the executed PDF: Dana's drawing and Uma's JPEG are images placed in their own fields, Tess's name in the serif italic font
 const signed=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,h.owner)).bytes,doc=await PDFDocument.load(signed),page=doc.getPage(0),resources=page.node.Resources()
 const xobjects=resources.lookup(PDFName.of('XObject')),images=xobjects.keys().map(k=>xobjects.lookup(k)).filter(x=>x.dict.get(PDFName.of('Subtype'))===PDFName.of('Image'))
 const sizes=images.map(x=>`${x.dict.get(PDFName.of('Width')).asNumber()}x${x.dict.get(PDFName.of('Height')).asNumber()}`).sort()
 assert.deepEqual(sizes,['240x80','300x90'],'the drawn PNG and the uploaded JPEG are both on the page')
 assert.ok(Buffer.from(signed).includes(jpeg),'the uploaded JPEG is embedded as uploaded')
 const fonts=resources.lookup(PDFName.of('Font')),baseFonts=fonts.keys().map(k=>fonts.lookup(k).get(PDFName.of('BaseFont')).decodeText?.()??fonts.lookup(k).get(PDFName.of('BaseFont')).asString())
 assert.ok(baseFonts.includes('Times-Italic'),'the typed name uses the chosen serif italic style')
 const content=(await pdfText(signed)).replaceAll('\n',' ')
 assert.equal(content.split('Tess Okafor').length-1,2,'the typed mark is applied to both of Tess\'s signature fields')
 assert.ok(!content.includes('Dana Reyes')&&!content.includes('Uma Patel'),'image marks replace the typed name on the page')
 const text=(await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes)).replaceAll('\n',' ')
 for(const line of [`Adopted signature (Signature): "Dana Reyes", drawn signature, PNG SHA-256 ${digest(drawn)}`,`Adopted signature (Signature): "Tess Okafor", typed name, Serif italic style`,`Adopted signature (Second signature): "Tess Okafor", typed name, Serif italic style`,`Adopted signature (Signature): "Uma Patel", uploaded signature image, JPEG SHA-256 ${digest(jpeg)}`]) assert.ok(text.includes(line),`the certificate shows: ${line}`)
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
 const e=(await stored(id))
 assert.equal(e.status,'completed');assert.equal(e.signers[0].paper.status,'accepted');assert.equal(e.signers[0].paper.sha256,digest(signedScan))
 assert.ok(e.events.some(event=>event.action==='signer.signed_on_paper'&&event.detail.wetInk===true&&event.detail.sha256===digest(signedScan)))
 const executed=(await h.send('/api/inkwell/envelopes/'+id+'/artifacts/signed',undefined,h.owner)).bytes
 assert.equal(digest(executed),e.signedSha256);assert.equal((await PDFDocument.load(executed)).getPageCount(),4,'the scan pages follow the document')
 assert.ok((await pdfText(executed)).includes('Scanned page 3'))
 const text=await pdfText((await h.send('/api/inkwell/envelopes/'+id+'/artifacts/certificate',undefined,h.owner)).bytes)
 assert.ok(text.includes('Signed on paper (wet ink)')&&text.includes('Scan SHA-256: '+digest(signedScan)),'the certificate marks the wet-ink signature with the scan fingerprint')
 assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true)
})
// IDV-001 / SIGN-001: each recipient passes the method the sender chose: link only, email code, access code (with the
// link alone) or access code and email code; a link-only recipient signs with no code, and the certificate lists each.
test('IDV-001 and SIGN-001: four recipients with four methods each pass their own; the two order-1 recipients sign in parallel before order 2 is invited; the link-only recipient signs with no code and the certificate lists every method',async()=>{
 const people=[{name:'Lin Link',email:'lin@idv.example',linkOnly:true},{name:'Em Code',email:'em@idv.example'},{name:'Ace Link',email:'ace@idv.example',linkOnly:true,accessCode:'ace-4411'},{name:'Abe Both',email:'abe@idv.example',accessCode:'abe-9922'}]
 const fourFields=people.map((_,signer)=>({id:`signature-${signer}`,label:'Signature',type:'signature',signer,page:0,x:.1,y:.2+signer*.15,width:.4,height:.07}))
 await h.command('envelope.prepare',{...preparation(),signers:[{...people[0],linkOnly:'yes'}],fields:[fourFields[0]]},h.owner,400)
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio four-method lease',signers:people.map((p,i)=>({...p,order:i<2?1:2})),fields:fourFields})).result.id
 assert.deepEqual((await stored(id)).signers.map(s=>[Boolean(s.linkOnly),Boolean(s.accessCode)]),[[true,false],[false,false],[true,true],[false,true]])
 await h.command('envelope.approve',{id,eligible:true})
 const tokenOf=async email=>'/api/sign/'+await signingToken(email),sign=(path,signer,cookie)=>h.post(path+'/sign',{values:{[`signature-${signer}`]:people[signer].name},consent:true,commandId:crypto.randomUUID()},cookie)
 for(const p of people.slice(2)) assert.equal(await h.mail(p.email,'Please sign:'),undefined,`${p.name} at order 2 waits`)
 // Link only: no code is sent or asked; the link opens a session. Both order-1 recipients are invited together.
 const lin=await tokenOf(people[0].email),em=await tokenOf(people[1].email)
 assert.equal((await h.send(lin)).value.linkOnly,true);assert.equal((await h.send(lin+'/document')).status,401,'not before the link is opened')
 const linCookie=(await h.post(lin+'/open',{},'')).cookie
 await h.agree(lin,linCookie)
 // Email code: the link alone is refused.
 await h.post(em+'/open',{},'',409)
 const emSession=await verified(people[1].email)
 for(const [path,cookie] of [[lin,linCookie],[emSession.path,emSession.cookie]]) assert.equal((await h.send(path,undefined,cookie)).value.canSign,true,'both order-1 recipients can sign now')
 await sign(emSession.path,1,emSession.cookie)
 assert.equal(await h.mail(people[2].email,'Please sign:'),undefined,'order 2 waits while one order-1 recipient has not signed')
 await sign(lin,0,linCookie)
 // Access code with the link alone: the code first, then the link opens.
 const ace=await tokenOf(people[2].email)
 await h.post(ace+'/open',{},'',403)
 await h.post(ace+'/access',{accessCode:'ace-4411'},'')
 const aceCookie=(await h.post(ace+'/open',{},'')).cookie
 await h.agree(ace,aceCookie);await sign(ace,2,aceCookie)
 // Access code and email code.
 const abe=await tokenOf(people[3].email)
 await h.post(abe+'/access',{accessCode:'abe-9922'},'')
 await h.post(abe+'/open',{},'',409)
 const abeSession=await verified(people[3].email);await sign(abeSession.path,3,abeSession.cookie)
 const done=await stored(id)
 assert.equal(done.status,'completed')
 assert.equal(h.attempted().filter(m=>[people[0].email,people[2].email].some(e=>m.to?.includes?.(e))&&/verification code/.test(m.subject)).length,0,'no code was ever sent to a link-only recipient')
 const certificate=(await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes)).replace(/\s+/g,' ')
 assert.equal((certificate.match(/link only, no code/g)??[]).length,2,'two link-only authentications on the certificate')
 assert.equal((certificate.match(/emailed verification code, verified/g)??[]).length,2,'two email-code authentications')
 assert.equal((certificate.match(/Access code: entered at/g)??[]).length,2,'two access codes entered')
})
test('IDV-003: a recipient must enter the sender-set access code before the document; wrong codes are refused and five lock the invitation',async()=>{
 const pair=[{name:'Gia Lane',email:'gia@harbour.example',accessCode:'HARBOUR-7731'},{name:'Hal Ortiz',email:'hal@harbour.example',accessCode:'tide-2209'}]
 await h.command('envelope.prepare',{...preparation(),signers:[{...pair[0],accessCode:'a b'},pair[1]]},h.owner,400)
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio berth lease',signers:pair})).result.id
 const e=(await stored(id))
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
 const after=(await stored(id))
 assert.equal(after.events.filter(e=>e.action==='signer.access_code_rejected').length,6);assert.ok(after.events.some(e=>e.action==='signer.access_locked'&&e.detail.signer===1))
 assert.ok(after.events.some(e=>e.action==='signer.access_code_verified'&&e.detail.signer===0))
})
// DELIV-007: on completion every signer and copy recipient gets the executed PDF and certificate, by a secure link
// opened with a code sent to their own mailbox, or attached when an owner or admin chose attachments.
test('DELIV-007: two signers and a copy recipient each receive the completed copy; secure links need their mailbox code, and the attachment setting attaches both files',async()=>{
 const viewer=await h.invite('copy.viewer@harbour.example','member')
 const complete=async title=>{
  const id=(await h.command('envelope.prepare',{...preparation(),title,copies:[{name:'Cass Copy',email:'Cass.Copy@Harbour.example'}]})).result.id
  assert.deepEqual((await stored(id)).copies,[{name:'Cass Copy',email:'cass.copy@harbour.example'}],'the copy recipient is on the envelope')
  await h.command('envelope.approve',{id,eligible:true})
  assert.equal(await h.mail('cass.copy@harbour.example','Please sign:'),undefined,'a copy recipient gets no action link')
  for(const [signer,{email,name}] of recipients.entries()){const v=await verified(email);await h.post(v.path+'/sign',{values:{[`signature-${signer}`]:name},consent:true,commandId:crypto.randomUUID()},v.cookie)}
  const e=await stored(id);assert.equal(e.status,'completed');return e
 }
 await h.command('envelope.prepare',{...preparation(),copies:[{name:'Same',email:recipients[0].email}]},h.owner,400)
 const e=await complete('Harbour Studio — completed copies by link'),signed=(await h.send(`/api/inkwell/envelopes/${e.id}/artifacts/signed`,undefined,h.owner)).bytes
 assert.deepEqual(e.events.find(x=>x.action==='envelope.copies_queued').detail.recipients.map(r=>r.role),['signer','signer','copy'])
 const links={}
 for(const email of [...recipients.map(r=>r.email),'cass.copy@harbour.example']){
  const message=await h.mail(email,'Completed: Harbour Studio — completed copies by link');assert.ok(message,`${email} receives the completed copy`)
  assert.equal(message.attachments,undefined);links[email]='/api'+new URL(message.text.match(/http:\/\/[^\s]+\/copy\/[a-f0-9]{64}/)[0]).pathname
 }
 const casey=links['cass.copy@harbour.example'],view=(await h.send(casey)).value
 assert.equal(view.recipient.role,'copy');assert.equal(view.verified,false)
 assert.equal((await h.send(casey+'/artifacts/signed')).status,401,'the link alone does not open the copy')
 await h.post(casey+'/code',{},'');await h.post(casey+'/code',{},'',429)
 const code=(await h.mail('cass.copy@harbour.example','code for a completed copy')).text.match(/\b\d{6}\b/)[0]
 await h.post(casey+'/verify',{code:code==='000000'?'111111':'000000'},'',401)
 const opened=await h.post(casey+'/verify',{code},'')
 const file=await h.send(casey+'/artifacts/signed',undefined,opened.cookie);assert.equal(file.status,200);assert.equal(digest(file.bytes),digest(signed))
 assert.equal((await h.send(casey+'/artifacts/certificate',undefined,opened.cookie)).status,200)
 assert.equal((await h.send(links[recipients[0].email]+'/artifacts/signed',undefined,opened.cookie)).status,401,'one mailbox code opens only its own link')
 assert.equal((await h.send(`/api/inkwell/envelopes/${e.id}/artifacts/certificate`,undefined,h.owner)).status,200,'the account keeps the completed files')
 assert.ok((await stored(e.id)).events.some(x=>x.action==='copy.email_verified'&&x.detail.email==='cass.copy@harbour.example'))
 // attachments, chosen by an owner or admin
 await h.command('account.completed_copies',{delivery:'attachment'},viewer,403)
 await h.command('account.completed_copies',{delivery:'attachment'})
 assert.equal((await h.send('/api/inkwell',undefined,h.owner)).value.settings.completedCopies,'attachment')
 const attached=await complete('Harbour Studio — completed copies attached')
 const executed=(await h.send(`/api/inkwell/envelopes/${attached.id}/artifacts/signed`,undefined,h.owner)).bytes,certificate=(await h.send(`/api/inkwell/envelopes/${attached.id}/artifacts/certificate`,undefined,h.owner)).bytes
 for(const email of [...recipients.map(r=>r.email),'cass.copy@harbour.example']){
  const message=await h.mail(email,'Completed: Harbour Studio — completed copies attached')
  assert.ok(!/\/copy\//.test(message.text),'no link when attached')
  assert.deepEqual(message.attachments.map(a=>digest(Buffer.from(a.content,'base64'))),[digest(executed),digest(certificate)])
 }
 await h.command('account.completed_copies',{delivery:'link'})
})
// ROUTE-009: a member signs their own document with nobody else involved; their session is the authentication.
test('ROUTE-009: a member self-signs a three-page PDF with no mail, the certificate names their session and sign-in method, the completed copy goes to two addresses, and a sender at order 1 signs in the app before order 2 is invited',async()=>{
 const me=await sender('solo.signer@harbour.example'),self={name:'Solo Signer',email:'solo.signer@harbour.example'}
 const pdf=await PDFDocument.create();for(let page=0;page<3;page++) pdf.addPage([595,842])
 const sign=async(id,values,saved)=>{const opened=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()},me.cookie),path='/api'+new URL(opened.value.result.signing.url).pathname;assert.equal((await h.send(path,undefined,opened.cookie)).value.savedSignature,saved,'the saved signature is offered');await h.agree(path,opened.cookie);return (await h.post(path+'/sign',{values,consent:true,commandId:crypto.randomUUID()},opened.cookie)).value.result.status}
const selfSign=async title=>{const id=(await h.command('envelope.prepare',{title,filename:'solo.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[self],fields:[{...fields[0],id:'signature-0',page:2}]},me.cookie)).result.id;assert.equal((await h.command('envelope.approve',{id,eligible:true},me.cookie)).result.signInApp,true);return id}
 const quiet=h.sent()
 const id=await selfSign('Solo lease renewal')
 assert.equal(await sign(id,{'signature-0':'Solo Signer'},null),'completed')
 assert.equal(h.sent(),quiet,'self-signing sends no message at all')
 const text=(await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,me.cookie)).bytes)).replaceAll('\n',' ')
 assert.ok(text.includes(`signed-in Inkwell session of member ${me.id} (signed in by emailed invitation link)`),'the certificate names session authentication and the sign-in method')
 assert.equal((await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,me.cookie)).status,200,'the member downloads the executed PDF')
 await h.command('envelope.send_copy',{id,recipients:[{name:'Lee',email:'lee@harbour.example'}]},member,403)
 await h.command('envelope.send_copy',{id,recipients:[{name:'Books',email:'books@harbour.example'},{name:'Landlord',email:'landlord@harbour.example'}]},me.cookie)
 for(const email of ['books@harbour.example','landlord@harbour.example']) assert.match((await h.mail(email,'Completed: Solo lease renewal')).text,/\/copy\/[a-f0-9]{64}/,`${email} gets the completed copy`)
 assert.ok((await stored(id,me.cookie)).events.some(e=>e.action==='envelope.copy_sent'&&e.actor===me.id))
 // a second self-signed document reuses the saved signature without adopting it again
 const again=await selfSign('Solo parking permit')
 assert.equal(await sign(again,{'signature-0':'Solo Signer'},'Solo Signer'),'completed')
 const reused=(await pdfText((await h.send(`/api/inkwell/envelopes/${again}/artifacts/certificate`,undefined,me.cookie)).bytes)).replaceAll('\n',' ')
 assert.ok(reused.includes(`"Solo Signer", typed name saved by member ${me.id} and reused`),'the certificate records the reused saved signature')
 // the sender at order 1 of their own envelope: no email to themselves, and order 2 waits for their in-app signature
 const two=(await h.command('envelope.prepare',{...preparation(),title:'Solo then Alex',signers:[self,recipients[1]]},me.cookie)).result.id,before=h.sent()
 assert.equal((await h.command('envelope.approve',{id:two,eligible:true},me.cookie)).result.signInApp,true)
 assert.equal(h.sent(),before,'approving sends nothing: the sender signs in the app and order 2 waits')
 assert.equal(await sign(two,{'signature-0':'Solo Signer'},'Solo Signer'),'awaiting_signature')
 assert.ok(await h.mail(recipients[1].email,'Please sign: Solo then Alex'),'order 2 is invited only after the sender signs')
})
// ADMIN-001: envelope shares to view or to edit; people it is shared with cannot share it on; a viewer stays a reader.
test('ADMIN-001: a sender sends, corrects and voids their own envelope and a viewer cannot send; two senders cannot see each other\'s envelopes until one shares; a view share reads but cannot void, an edit share voids, editors cannot re-share, and a viewer\'s edit share stays read-only',async()=>{
 const ana=await sender('ana.share@harbour.example'),ben=await sender('ben.share@harbour.example')
 // A sender's own envelope: sent, corrected in flight and voided by them; a viewer-role member may not prepare or send.
 const own=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio own retainer'},ana.cookie)).result.id
 await h.command('envelope.approve',{id:own,eligible:true},ana.cookie)
 await h.command('envelope.correct',{id:own,signers:[recipients[0],{...recipients[1],email:'alex.morgan@harbour.example'}].map((r,i)=>({...r,order:i+1}))},ana.cookie)
 assert.equal((await stored(own,ana.cookie)).signers[1].email,'alex.morgan@harbour.example','the sender corrects their own envelope')
 assert.equal((await h.command('envelope.void',{id:own,reason:'Superseded'},ana.cookie)).result.status,'voided','and voids it')
 await h.command('envelope.prepare',preparation(),member,403);await h.command('envelope.approve',{id:own,eligible:true},member,403)
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio shared retainer'},ana.cookie)).result.id
 await h.command('envelope.approve',{id,eligible:true},ana.cookie)
 const sees=async cookie=>(await h.send('/api/inkwell/envelopes?q=shared%20retainer',undefined,cookie)).value.envelopes.map(e=>e.id).includes(id)
 const opens=async cookie=>(await h.send('/api/inkwell/envelopes/'+id,undefined,cookie)).status
 const voidIt=(cookie,status)=>h.command('envelope.void',{id,reason:'Superseded'},cookie,status)
 assert.equal(await sees(ben.cookie),false);assert.equal(await opens(ben.cookie),403,'another sender cannot see it before a share')
 await h.command('envelope.share',{id,email:'ben.share@harbour.example',access:'view'},ben.cookie,403)
 await h.command('envelope.share',{id,email:'nobody@harbour.example',access:'view'},ana.cookie,404)
 await h.command('envelope.share',{id,email:'Ben.Share@harbour.example',access:'view'},ana.cookie)
 assert.equal(await sees(ben.cookie),true);assert.equal(await opens(ben.cookie),200,'a view share reads')
 assert.equal((await stored(id,ben.cookie)).access,'view');assert.equal((await h.send(`/api/inkwell/envelopes/${id}/artifacts/original`,undefined,ben.cookie)).status,200)
 await voidIt(ben.cookie,403);await h.command('envelope.extend',{id,days:7},ben.cookie,403)
 // a viewer-role member with an edit share still only reads
 await h.command('envelope.share',{id,email:'reader@harbour.example',access:'edit'},ana.cookie)
 assert.equal((await stored(id,member)).access,'view');await voidIt(member,403)
 // an edit share acts, but cannot share on
 await h.command('envelope.share',{id,email:'ben.share@harbour.example',access:'edit'},ana.cookie)
 assert.equal((await stored(id,ben.cookie)).access,'edit');assert.equal((await stored(id,ben.cookie)).mayShare,false)
 const owned=await stored(id,ana.cookie);assert.equal(owned.mayShare,true);assert.deepEqual(owned.shares.map(s=>[s.email,s.access]).sort(),[['ben.share@harbour.example','edit'],['reader@harbour.example','edit']])
 await h.command('envelope.share',{id,email:'reader@harbour.example',access:'view'},ben.cookie,403)
 await h.command('envelope.unshare',{id,operatorId:owned.shares.find(s=>s.email==='reader@harbour.example').operatorId},ben.cookie,403)
 // taking a share back ends it at once
 await h.command('envelope.unshare',{id,operatorId:ben.id},ana.cookie)
 assert.equal(await opens(ben.cookie),403);await voidIt(ben.cookie,403)
 await h.command('envelope.share',{id,email:'ben.share@harbour.example',access:'edit'},h.owner)
 assert.equal((await voidIt(ben.cookie)).result.status,'voided','someone it is shared with to edit voids it (SEND-002)')
 const e=await stored(id);assert.deepEqual(e.events.filter(x=>x.action==='envelope.shared'||x.action==='envelope.unshared').map(x=>[x.action,x.detail.access??null]),[['envelope.shared','view'],['envelope.shared','edit'],['envelope.shared','edit'],['envelope.unshared',null],['envelope.shared','edit']],'every grant and removal is audited')
 assert.equal(e.events.find(x=>x.action==='envelope.voided').actor,ben.id)
})
// PREP-009: a saved draft reopens with everything editable, and its approval can send it later in a US time zone.
test('PREP-009: a saved draft reopens and is saved again with a new PDF, recipients, fields and private messages, is scheduled for the next business day at 9:00 Chicago time and sends then, each recipient seeing only their own private message',async()=>{
 const first=[{name:'Dana Draft',email:'dana@harbour.example',accessCode:'MOOR-11'},{name:'Eli Early',email:'eli@harbour.example'}]
 const id=(await h.command('envelope.prepare',{...preparation(),title:'Harbour Studio draft terms',signers:first})).result.id
 const draft=await stored(id);assert.equal(draft.status,'prepared');assert.equal(draft.signers[0].accessCode,true)
 const pdf=await PDFDocument.create();pdf.addPage([595,842]);pdf.addPage([595,842]);const bytes=await pdf.save()
 const revised={id,title:'Harbour Studio final terms',filename:'final.pdf',pdfBase64:Buffer.from(bytes).toString('base64'),subject:'Final terms for your signature',message:'Thanks for the call today.',
  signers:[{name:'Dana Draft',email:'dana@harbour.example',keepAccessCode:true,message:'Dana: clause 4 is yours.'},{name:'Fay Final',email:'fay@harbour.example',order:1,message:'Fay: please check the dates.'}],
  fields:[0,1].map(signer=>({...fields[0],id:`signature-${signer}`,signer,page:1,y:.3+signer*.2}))}
 await h.command('envelope.update',{...revised,signers:[revised.signers[1],revised.signers[0]]},h.owner,400)
 await h.command('envelope.update',revised,member,403)
 await h.command('envelope.update',revised)
 const saved=await stored(id)
 assert.deepEqual([saved.title,saved.filename,saved.pageSizes.length,saved.subject,saved.message,saved.signers.map(s=>s.email),saved.fields.map(f=>f.page)],['Harbour Studio final terms','final.pdf',2,'Final terms for your signature','Thanks for the call today.',['dana@harbour.example','fay@harbour.example'],[1,1]])
 assert.equal(saved.originalSha256,digest(bytes));assert.equal(digest((await h.send(`/api/inkwell/envelopes/${id}/artifacts/original`,undefined,h.owner)).bytes),digest(bytes),'the new PDF replaced the old one')
 assert.ok(saved.events.some(e=>e.action==='envelope.updated'&&e.detail.originalSha256===digest(bytes)),'the record keeps every saved version')
 // the next business day at 09:00 in Chicago, found from Chicago's own calendar and clock
 const chicago=t=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(t).map(p=>[p.type,p.value]))
 let day=Date.now()+86_400_000;while(['Sat','Sun'].includes(chicago(day).weekday))day+=86_400_000
 const d=chicago(day),local=`${d.year}-${d.month}-${d.day}T09:00`;let sendAt=Date.UTC(+d.year,+d.month-1,+d.day,9);while(chicago(sendAt).hour!=='09')sendAt+=3_600_000
 await h.command('envelope.approve',{id,eligible:true,sendAt:{at:local,timeZone:'Europe/London'}},h.owner,400)
 const approved=(await h.command('envelope.approve',{id,eligible:true,sendAt:{at:local,timeZone:'America/Chicago'}})).result
 assert.equal(approved.scheduled.at,new Date(sendAt).toISOString())
 const record=await stored(id);assert.ok(record.events.some(e=>e.action==='envelope.approved'&&e.detail.approvedForLater===true&&e.detail.sendAt===new Date(sendAt).toISOString()),'approved for later is on the record')
 await h.command('envelope.update',revised,h.owner,409)
 await h.scheduled(sendAt-3_600_000);assert.equal(await h.mail('dana@harbour.example','Final terms for your signature'),undefined,'nothing is sent before the time')
 await h.scheduled(sendAt+17*60_000)
 assert.ok((await stored(id)).events.some(e=>e.action==='envelope.sent_scheduled'),'the pass at or after the time sends it')
 const invite=await h.mail('dana@harbour.example','Final terms for your signature')
 assert.match(invite.text,/Thanks for the call today\.\n\nDana: clause 4 is yours\./);assert.doesNotMatch(invite.text,/Fay:/,'only their own private message')
 const fay=await h.mail('fay@harbour.example','Final terms for your signature');assert.match(fay.text,/Thanks for the call today\.\n\nFay: please check the dates\./);assert.doesNotMatch(fay.text,/Dana:/,'each recipient sees only their own private message')
 const path='/api/sign/'+new URL(invite.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
 await h.post(path+'/access',{accessCode:'MOOR-11'},'')
 await h.post(path+'/code',{},'');const code=(await h.mail('dana@harbour.example','verification code')).text.match(/\b\d{6}\b/)[0]
 const cookie=(await h.post(path+'/verify',{code},'')).cookie,view=(await h.send(path,undefined,cookie)).value
 assert.equal(view.privateMessage,'Dana: clause 4 is yours.');assert.equal(view.message,'Thanks for the call today.')
 assert.equal(await h.mail('eli@harbour.example','Final terms'),undefined,'a removed recipient gets nothing')
})
test('ROUTE-008: a sender imports 200 contacts from CSV, finds a recipient by company, saves one, and sees recent recipients; viewers are refused',async()=>{
 const sasha=await sender('sasha.sender@harbour.example'),csv=s=>({method:'POST',headers:{host:new URL(h.origin).host,origin:h.origin,'content-type':'text/csv',cookie:sasha.cookie},body:s})
 const companies=['Northwind Marine','Bayside Freight','Kestrel Labs','Harbour Counsel']
 const rows=Array.from({length:200},(_,i)=>`"Contact ${String(i).padStart(3,'0')}",contact${i}@clients.example,+1 617 555 ${String(1000+i)},"${companies[i%4]}"`)
 const upload=async body=>{const r=await h.mf.dispatchFetch(h.origin+'/api/inkwell/contacts/import',csv(body));return{status:r.status,value:await r.json()}}
 const first=await upload(['name,email,phone,company',...rows,'No Email,,,"Kestrel Labs"','Bad Address,not-an-email,,'].join('\r\n'))
 assert.equal(first.status,200,JSON.stringify(first.value))
 assert.deepEqual({added:first.value.result.added,updated:first.value.result.updated},{added:200,updated:0})
 assert.deepEqual(first.value.result.refused.map(r=>r.line),[202,203],'each invalid row is named by its line and nothing of it is saved')
 // Autocomplete by company: the picker's search matches name, email or company, case-insensitively.
 const find=async(q,cookie=sasha.cookie)=>(await h.send('/api/inkwell/contacts?limit=100&q='+encodeURIComponent(q),undefined,cookie))
 const kestrel=(await find('kestrel')).value
 assert.equal(kestrel.total,50); assert.ok(kestrel.contacts.every(c=>c.company==='Kestrel Labs'))
 assert.deepEqual(kestrel.contacts[0],{name:'Contact 002',email:'contact2@clients.example',phone:'+1 617 555 1002',company:'Kestrel Labs'})
 assert.equal((await find('CONTACT17@')).value.contacts[0].email,'contact17@clients.example')
 // Re-importing an email updates that contact; saving one adds or changes it.
 const again=await upload('email,name,company\ncontact2@clients.example,Contact Two,Kestrel Labs Inc\n')
 assert.deepEqual(again.value.result,{added:0,updated:1,refused:[]})
 assert.equal((await find('contact2@')).value.contacts[0].name,'Contact Two')
 await h.post('/api/inkwell/contacts',{name:'Rae Okafor',email:'Rae@Tidewater.example',phone:'(617) 555-0199',company:'Tidewater Supply'},sasha.cookie)
 assert.deepEqual((await find('tidewater')).value.contacts,[{name:'Rae Okafor',email:'rae@tidewater.example',phone:'(617) 555-0199',company:'Tidewater Supply'}])
 await h.post('/api/inkwell/contacts',{name:'No Phone',email:'nophone@tidewater.example',phone:'call me'},sasha.cookie,400)
 // Recent recipients: the people on envelopes this sender prepared, newest first, with the book's company.
 const pdf=await PDFDocument.create(); pdf.addPage([595,842])
 const people=[{name:'Rae Okafor',email:'rae@tidewater.example'},{name:'Dev Patel',email:'dev@harbour.example'}]
 await h.command('envelope.prepare',{title:'Supply terms',filename:'terms.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:people,fields:people.map((_,signer)=>({id:`s${signer}`,label:'Signature',type:'signature',signer,page:0,x:.1,y:.5+signer*.15,width:.4,height:.07}))},sasha.cookie)
 const recent=(await find('')).value.recent
 assert.deepEqual(recent.slice(0,2).map(r=>[r.email,r.company]),[['rae@tidewater.example','Tidewater Supply'],['dev@harbour.example',null]])
 assert.deepEqual((await find('',h.owner)).value.recent.filter(r=>r.email==='rae@tidewater.example'),[],'recent recipients are the member\'s own')
 // Removing a contact; viewers and signed-out requests are refused at every contact door.
 await h.post('/api/inkwell/contacts/remove',{email:'rae@tidewater.example'},sasha.cookie)
 assert.equal((await find('tidewater')).value.total,0)
 const viewer=await h.invite('vic.viewer@harbour.example','member')
 assert.equal((await find('kestrel',viewer)).status,403)
 await h.post('/api/inkwell/contacts',{name:'X',email:'x@harbour.example'},viewer,403)
 await h.post('/api/inkwell/contacts/remove',{email:'contact3@clients.example'},viewer,403)
 assert.equal((await h.mf.dispatchFetch(h.origin+'/api/inkwell/contacts/import',{...csv('name,email\nA,a@b.example'),headers:{...csv('').headers,cookie:viewer}})).status,403)
 assert.equal((await find('kestrel','')).status,401)
})
test('MANAGE-001: with 5,000 envelopes, search by recipient email answers in under a second and each status filter shows the right count',async()=>{
 const day=86_400_000,now=Date.now(),kinds=['prepared','awaiting_signature','completed','declined','voided','expired','mine'],expected={draft:0,waiting_for_me:0,waiting_for_others:0,completed:0,declined:0,voided:0,expired:0,imported:0}
 const rows=Array.from({length:5000},(_,i)=>{const kind=kinds[i%kinds.length],createdAt=new Date(now-(i+1)*60_000).toISOString(),id=`bulk-${String(i).padStart(4,'0')}`
  const status=kind==='expired'?'awaiting_signature':kind==='mine'?'awaiting_signature':kind
  const signers=[{name:`Client ${i}`,email:kind==='mine'?'owner@harbour.example':`client${i}@harbour.example`,...(['completed'].includes(kind)?{signedAt:createdAt}:{})},{name:'Harbour Counsel',email:'counsel@harbour.example',...(kind==='completed'?{signedAt:createdAt}:{})}]
  expected[{prepared:'draft',awaiting_signature:'waiting_for_others',mine:'waiting_for_me'}[kind]??kind]++
  return {id,version:1,title:`Bulk fixture ${i} · Mooring renewal`,filename:'renewal.pdf',status,createdAt,createdBy:i%2?'sender-a':'sender-b',expiresAt:new Date(kind==='expired'?now-day:now+30*day).toISOString(),signers,fields:[],pageSizes:[{width:595,height:842}],originalSha256:'0'.repeat(64),events:[{action:'envelope.prepared',at:createdAt,actor:i%10?'sender':'agent:fixture',detail:{},previousHash:'',hash:'1'.repeat(64)}]}})
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
 const agent=await search({q:'bulk fixture',preparedBy:'agent',status:'draft',limit:'1'});assert.equal(agent.total,500,'prepared by an agent token');assert.equal(agent.envelopes[0].bucket,'draft')
 assert.equal((await stored('bulk-0005')).status,'expired','one envelope reads as expired past its expiry');assert.equal((await h.send('/api/inkwell/envelopes/bulk-none',undefined,h.owner)).status,404)
 assert.equal((await h.send('/api/inkwell/envelopes?status=unknown',undefined,h.owner)).status,400)
 assert.equal((await h.send('/api/inkwell/envelopes')).status,401)
 await h.db.batch(['iw_envelopes'].map(()=>h.db.prepare("DELETE FROM iw_envelopes WHERE id LIKE 'bulk-%'")))
})
// MANAGE-004: counts and turnaround over whole days in the account's zone (America/New_York), both days included.
test('MANAGE-004: a fixture of 300 envelopes produces the expected counts and median turnaround, per sender and in total, and the CSV matches the report',async()=>{
 const sam=await sender('report.sender@harbour.example'),ownerId=(await h.send('/api/inkwell',undefined,h.owner)).value.actor.id,hour=3_600_000,start=Date.UTC(2026,1,25,14)
 const rows=Array.from({length:300},(_,i)=>{const sent=start+i*4*hour,kind=i%5,createdBy=[ownerId,sam.id,'sender-gone'][i%3],done=sent+((i%7)+1)*5*hour,iso=t=>new Date(t).toISOString()
  const events=[{action:'envelope.prepared',at:iso(sent-hour)},{action:'envelope.approved',at:iso(sent)},...(kind<3?[{action:'envelope.completed',at:iso(done)}]:[])].map(e=>({...e,actor:'fixture',detail:{},previousHash:'',hash:'1'.repeat(64)}))
  return {id:`report-${String(i).padStart(3,'0')}`,version:1,title:`Report fixture ${i}`,filename:'r.pdf',status:kind<3?'completed':kind===3?'declined':'awaiting_signature',createdAt:iso(sent-hour),createdBy,expiresAt:iso(sent+20*24*hour),signers:[{name:'R',email:`r${i}@harbour.example`,...(kind===3?{declinedAt:iso(sent+10*hour)}:{})}],fields:[],pageSizes:[{width:595,height:842}],originalSha256:'0'.repeat(64),events,facts:{sent,done,kind}}})
 await h.db.batch(rows.map(({facts,...e})=>h.db.prepare('INSERT INTO iw_envelopes(id,version,data) VALUES(?,?,?)').bind(e.id,1,JSON.stringify(e))))
 // 1 March 00:00 EST to 1 April 00:00 EDT: the zone's own midnights either side of the DST change.
 const from=Date.UTC(2026,2,1,5),to=Date.UTC(2026,3,1,4),inside=t=>t>=from&&t<to
 const expect=list=>{const hours=list.filter(r=>r.facts.kind<3&&inside(r.facts.done)).map(r=>(r.facts.done-r.facts.sent)/hour).sort((a,b)=>a-b),m=hours.length/2,round=x=>Math.round(x*10)/10
  return {sent:list.filter(r=>inside(r.facts.sent)).length,completed:list.filter(r=>r.facts.kind<3&&inside(r.facts.done)).length,declined:list.filter(r=>r.facts.kind===3&&inside(r.facts.sent+10*hour)).length,expired:list.filter(r=>r.facts.kind===4&&inside(r.facts.sent+20*24*hour)).length,
   medianHoursToComplete:hours.length?round(hours.length%2?hours[Math.floor(m)]:(hours[m-1]+hours[m])/2):null,averageHoursToComplete:hours.length?round(hours.reduce((a,b)=>a+b,0)/hours.length):null}}
 const report=async(cookie,query={from:'2026-03-01',to:'2026-03-31'})=>h.send('/api/inkwell/reports/envelopes?'+new URLSearchParams(query),undefined,cookie)
 const all=(await report(h.owner)).value
 assert.deepEqual(all.totals,expect(rows));assert.ok(all.totals.sent>150&&all.totals.completed>50&&all.totals.expired>0,'the fixture exercises every count')
 for(const id of [ownerId,sam.id,'sender-gone']) assert.deepEqual(Object.fromEntries(Object.entries(all.senders.find(s=>s.id===id)).filter(([k])=>!['id','name','email'].includes(k))),expect(rows.filter(r=>r.createdBy===id)),id)
 assert.equal(all.senders.find(s=>s.id===sam.id).email,'report.sender@harbour.example')
 const mine=(await report(sam.cookie)).value;assert.deepEqual(mine.senders.map(s=>s.id),[sam.id],'a sender reports on their own envelopes');assert.deepEqual(mine.totals,expect(rows.filter(r=>r.createdBy===sam.id)))
 const csv=await h.send('/api/inkwell/reports/envelopes.csv?from=2026-03-01&to=2026-03-31',undefined,h.owner);assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/^text\/csv/)
 const lines=csv.value.trim().split('\r\n').map(line=>line.split(','));assert.deepEqual(lines[0],['sender','email','sent','completed','declined','expired','median_hours_to_complete','average_hours_to_complete'])
 const asCsv=(name,email,s)=>[name,email,s.sent,s.completed,s.declined,s.expired,s.medianHoursToComplete??'',s.averageHoursToComplete??''].map(String)
 assert.deepEqual(lines.slice(1),[...all.senders.map(s=>asCsv(s.name,s.email,s)),asCsv('All senders','',all.totals)],'the CSV matches the report')
 assert.equal((await report(h.owner,{from:'2026-03-31',to:'2026-03-01'})).status,400);assert.equal((await report(h.owner,{from:'March',to:'2026-03-01'})).status,400);assert.equal((await report('')).status,401)
 await h.db.prepare("DELETE FROM iw_envelopes WHERE id LIKE 'report-%'").run()
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
 // PORT-002: selected imported custody keeps its provider files and owner-only authority.
 const selected=(await h.post('/api/inkwell/exports',{scope:'selected',ids:['import:'+importedId]})).value.id
 const bundle=await h.send(`/api/inkwell/exports/${selected}/download`,undefined,h.owner),files=new Map()
 for(let offset=0;offset+512<=bundle.bytes.length;){const header=bundle.bytes.subarray(offset,offset+512);if(header.every(b=>b===0))break;const name=Buffer.from(header.subarray(0,100)).toString().split('\0')[0],size=parseInt(Buffer.from(header.subarray(124,136)).toString().replace(/\0.*$/,''),8);files.set(name,bundle.bytes.slice(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512}
 assert.equal(bundle.status,200);assert.ok(files.has(`imports/${importedId}/audit.json`));for(const [index,artifact] of library[0].artifacts.entries())assert.equal(digest(files.get(`imports/${importedId}/${artifact.role==='certificate'?'audit':artifact.role}-${index}.pdf`)),artifact.sha256)
 const exportAdmin=await h.invite('import-export-admin@harbour.example','admin')
 await h.post('/api/inkwell/exports',{scope:'selected',ids:['import:'+importedId]},exportAdmin,403)
 await h.post(`/api/inkwell/exports/${selected}/discard`,{})
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
 const e=(await stored(envelopeId))
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
 assert.ok((await h.send('/api/inkwell/envelopes/'+envelopeId,undefined,h.owner)).status===404)
 const exported=await h.send('/api/inkwell/archive',undefined,h.owner);assert.equal(exported.status,200);laterArchive=exported.value
 assert.ok(!laterArchive.ndjson.includes(envelopeId),'erased native envelope is absent from later archive')
})
test('fresh-store restore refuses resurrection with the later journal and restores complete surviving custody',async()=>{
 await h.close();h=await harness()
 await h.post('/api/inkwell/archive/restore',{archive:fullArchive,laterJournal:laterArchive},h.owner,400)
 await h.post('/api/inkwell/archive/restore',{archive:laterArchive})
 assert.ok((await h.send('/api/inkwell/envelopes/'+envelopeId,undefined,h.owner)).status===404)
 const library=(await h.send('/api/inkwell/import/records',undefined,h.owner)).value.records
 assert.equal(library.length,1)
 const file=library[0].artifacts[0],download=await h.send(file.url,undefined,h.owner)
 assert.equal(digest(download.bytes),file.sha256)
 const again=await h.send('/api/inkwell/archive',undefined,h.owner);assert.equal(again.status,200)
 const closing=a=>JSON.parse(a.ndjson.trim().split('\n').at(-1)).contentHash
 assert.equal(closing(again.value),closing(laterArchive),'domain archive export/restore/export round trip')
})

// TMPL-001: a template keeps the PDF, roles in routing order, fields, messages, reminders, expiry and access-code
// settings; each send names only the people (and a role's access code), and nothing is placed again.
test('TMPL-001: a three-role template sends twice to different people with its fields, routing, reminders and expiry',async()=>{
 const tara=await sender('tara.templates@harbour.example'),uma=await sender('uma.templates@harbour.example'),viewer=await h.invite('vera.templates@harbour.example','member')
 const roleFields=[0,1,2].map(signer=>({id:`role-${signer}`,label:'Signature',type:'signature',signer,page:0,x:.1,y:.3+signer*.15,width:.35,height:.06})).concat([{id:'client-date',label:'Date',type:'date',signer:0,page:0,x:.55,y:.3,width:.25,height:.05}])
 const roles=[{role:'Client',order:1,accessCode:true},{role:'Guarantor',order:1},{role:'Company Signer',order:2,message:'Countersign once the client has signed.'}]
 const definition={title:'Harbour Studio — services agreement',filename:'services.pdf',pdfBase64:Buffer.from(original).toString('base64'),roles,fields:roleFields,expiryDays:30,reminders:{afterDays:2,everyDays:3},subject:'Services agreement to sign',message:'Please review and sign.'}
 await h.command('template.save',definition,viewer,403)
 await h.command('template.save',{...definition,fields:roleFields.filter(f=>f.signer!==2)},tara.cookie,400)
 const templateId=(await h.command('template.save',definition,tara.cookie)).result.id
 const listed=(await h.send('/api/inkwell/templates',undefined,tara.cookie)).value.templates
 assert.deepEqual(listed.map(t=>[t.id,t.roles.map(r=>r.role)]),[[templateId,['Client','Guarantor','Company Signer']]])
 assert.deepEqual((await h.send('/api/inkwell/templates',undefined,uma.cookie)).value.templates,[],'another sender does not see it')
 assert.equal((await h.send('/api/inkwell/templates',undefined,viewer)).status,403,'a viewer has no templates')
 assert.ok((await h.send('/api/inkwell/templates',undefined,h.owner)).value.templates.some(t=>t.id===templateId),'the owner sees every template')
 const people=n=>[{name:`Client ${n}`,email:`client${n}@tmpl.example`,accessCode:`code-${n}x`},{name:`Guarantor ${n}`,email:`guarantor${n}@tmpl.example`},{name:`Signer ${n}`,email:`signer${n}@tmpl.example`}]
 await h.command('template.use',{id:templateId,recipients:people(1)},uma.cookie,404)
 await h.command('template.use',{id:templateId,recipients:people(1).slice(0,2)},tara.cookie,400)
 await h.command('template.use',{id:templateId,recipients:people(1).map(({accessCode,...p})=>p)},tara.cookie,400)
 const sent=[]
 for(const n of [1,2]){
  const before=Date.now(),{id}=(await h.command('template.use',{id:templateId,recipients:people(n)},tara.cookie)).result,draft=await stored(id,tara.cookie)
  assert.equal(draft.status,'prepared');assert.deepEqual(draft.template,{id:templateId,title:definition.title,version:1})
  assert.deepEqual(draft.signers.map(({name,email,order,accessCode,message})=>({name,email,order,accessCode,message})),[{name:`Client ${n}`,email:`client${n}@tmpl.example`,order:1,accessCode:true,message:undefined},{name:`Guarantor ${n}`,email:`guarantor${n}@tmpl.example`,order:1,accessCode:undefined,message:undefined},{name:`Signer ${n}`,email:`signer${n}@tmpl.example`,order:2,accessCode:undefined,message:roles[2].message}],'routing order and identity settings from the roles')
  assert.deepEqual(draft.fields,roleFields,'every field placed by the template');assert.deepEqual(draft.reminders,definition.reminders)
  assert.equal(draft.subject,definition.subject);assert.equal(draft.message,definition.message)
  const days=(Date.parse(draft.expiresAt)-before)/86_400_000;assert.ok(days>29.99&&days<=30.01,`expires 30 days out (${days})`)
  assert.equal(digest((await h.send('/api/inkwell/envelopes/'+id+'/artifacts/original',undefined,tara.cookie)).bytes),draft.originalSha256)
  assert.equal(draft.events[0].detail.template.id,templateId,'the record names the template')
  await h.command('envelope.approve',{id,eligible:true},tara.cookie)
  sent.push(id)
 }
 const byTemplate=(await h.send('/api/inkwell/envelopes?template='+templateId,undefined,h.owner)).value
 assert.deepEqual(byTemplate.envelopes.map(e=>e.id).sort(),[...sent].sort(),'the template filter finds exactly the envelopes sent from it');assert.equal(byTemplate.total,2)
 for(const n of [1,2]){
  assert.ok(await h.mail(`client${n}@tmpl.example`,'Services agreement to sign'),'order 1 is invited with the template subject');assert.ok(await h.mail(`guarantor${n}@tmpl.example`,'Services agreement to sign'))
  assert.equal(await h.mail(`signer${n}@tmpl.example`,'Services agreement to sign'),undefined,'order 2 waits')
 }
 const invitation=await h.mail('client2@tmpl.example','Services agreement to sign'),client='/api/sign/'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
 assert.match(invitation.text,/Please review and sign\./,'the template message is in the invitation')
 assert.deepEqual((await h.send(client)).value.access,{required:true,passed:false,locked:false},'the Client role asks for its access code')
 await h.post(client+'/access',{accessCode:'code-1x'},'',401)
 await h.post(client+'/access',{accessCode:'code-2x'},'')
 await h.command('template.remove',{id:templateId},uma.cookie,404)
 await h.command('template.remove',{id:templateId},tara.cookie)
 assert.deepEqual((await h.send('/api/inkwell/templates',undefined,tara.cookie)).value.templates,[])
 assert.equal((await stored(sent[0],tara.cookie)).template.id,templateId,'sent envelopes keep their own copy')
})

// TMPL-003: an edit is the template's next version; envelopes already sent keep the version they came from and name
// it; a sent envelope saved as a template reproduces its fields and roles.
test('TMPL-003: editing a template makes version 2 while version 1 envelopes keep their fields; a sent envelope saves as a template',async()=>{
 const val=await sender('val.versions@harbour.example'),wes=await sender('wes.versions@harbour.example')
 const v1Fields=[{id:'client-sign',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.3,width:.35,height:.06},{id:'company-sign',label:'Signature',type:'signature',signer:1,page:0,x:.1,y:.6,width:.35,height:.06}]
 const v2Fields=[...v1Fields.map(f=>({...f,y:f.y+.05})),{id:'client-title',label:'Job title',type:'text',signer:0,page:0,x:.55,y:.35,width:.3,height:.05}]
 const definition={title:'Harbour Studio — retainer',filename:'retainer.pdf',pdfBase64:Buffer.from(original).toString('base64'),roles:[{role:'Client',order:1,accessCode:true,message:'Sign first, please.'},{role:'Company Signer',order:2}],fields:v1Fields,expiryDays:21,reminders:{afterDays:1,everyDays:2}}
 const {id:templateId,version}=(await h.command('template.save',definition,val.cookie)).result
 assert.equal(version,1)
 const send=async n=>(await h.command('template.use',{id:templateId,recipients:[{name:`Client ${n}`,email:`client${n}@versions.example`,accessCode:'retainer-7'},{name:`Company ${n}`,email:`company${n}@versions.example`}]},val.cookie)).result.id
 const first=await send(1)
 await h.command('template.update',{...definition,id:templateId,fields:v2Fields},wes.cookie,404)
 assert.equal((await h.command('template.update',{...definition,id:templateId,fields:v2Fields},val.cookie)).result.version,2)
 assert.equal((await h.send('/api/inkwell/templates',undefined,val.cookie)).value.templates.find(t=>t.id===templateId).version,2)
 const second=await send(2)
 const [e1,e2]=[await stored(first,val.cookie),await stored(second,val.cookie)]
 assert.deepEqual(e1.fields,v1Fields,'the version 1 envelope keeps version 1 fields');assert.deepEqual(e1.template,{id:templateId,title:definition.title,version:1})
 assert.deepEqual(e2.fields,v2Fields,'the next send uses version 2');assert.deepEqual(e2.template,{id:templateId,title:definition.title,version:2})
 assert.equal(e1.events[0].detail.template.version,1,'the record names the version')
 await h.command('envelope.approve',{id:first,eligible:true},val.cookie)
 await h.command('template.from_envelope',{id:first},wes.cookie,403)
 const saved=(await h.command('template.from_envelope',{id:first},val.cookie)).result
 assert.equal(saved.fromEnvelope,first)
 const copy=(await h.send('/api/inkwell/templates',undefined,val.cookie)).value.templates.find(t=>t.id===saved.id)
 assert.deepEqual(copy.fields,v1Fields,'saving the first envelope as a template reproduces its fields')
 assert.deepEqual(copy.roles,definition.roles,'and its roles, routing, access-code settings and messages')
 assert.deepEqual([copy.expiryDays,copy.reminders,copy.version],[21,definition.reminders,1])
 assert.equal(digest((await h.send(`/api/inkwell/templates/${saved.id}/document`,undefined,val.cookie)).bytes),e1.originalSha256)
})

// TMPL-002: templates live in personal or shared folders, are shared with people to use or to edit (directly or through a
// folder) and searched by name and tag; a member without access cannot find one through the API.
test('TMPL-002: a member uses a shared template but cannot edit it, a folder editor changes it, and a member without access cannot find it',async()=>{
 const zoe=await sender('zoe.shares@harbour.example'),amy=await sender('amy.shares@harbour.example'),ben=await sender('ben.shares@harbour.example'),cal=await sender('cal.shares@harbour.example'),viewer=await h.invite('vi.shares@harbour.example','member')
 const list=async(cookie,query='')=>(await h.send('/api/inkwell/templates'+query,undefined,cookie)).value
 const folderId=(await h.command('template.folder_create',{name:'Vendor onboarding'},zoe.cookie)).result.id
 const fields=[{id:'vendor-sign',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.3,width:.35,height:.06}]
 const definition={title:'Vendor packet',filename:'packet.pdf',pdfBase64:Buffer.from(original).toString('base64'),roles:[{role:'Vendor',order:1}],fields,tags:['W-9','procurement']}
 await h.command('template.save',{...definition,folderId},amy.cookie,404)
 const templateId=(await h.command('template.save',{...definition,folderId},zoe.cookie)).result.id
 assert.deepEqual((await list(zoe.cookie,'?q=PROCURE')).templates.map(t=>[t.id,t.access,t.folder?.name]),[[templateId,'manage','Vendor onboarding']],'the maker finds it by tag, in its folder')
 assert.deepEqual((await list(zoe.cookie,'?q=vendor pac')).templates.map(t=>t.id),[templateId],'and by name');assert.deepEqual((await list(zoe.cookie,'?q=lease')).templates,[])
 assert.deepEqual((await list(zoe.cookie,'?folder=personal')).templates,[],'it is not in the personal folder')
 await h.command('template.share',{id:templateId,email:'amy.shares@harbour.example',access:'use'},ben.cookie,404)
 await h.command('template.share',{id:templateId,email:'vi.shares@harbour.example',access:'use'},zoe.cookie,409)
 await h.command('template.share',{id:templateId,email:'amy.shares@harbour.example',access:'use'},zoe.cookie)
 await h.command('template.share',{folderId,email:'ben.shares@harbour.example',access:'edit'},zoe.cookie)
 for(const cookie of [cal.cookie,viewer]) assert.notEqual((await h.send('/api/inkwell/templates?q=procurement',undefined,cookie)).value?.templates?.length,1,'no access, no result')
 assert.deepEqual((await list(cal.cookie)).templates,[],'a member without access cannot find it');assert.deepEqual((await list(cal.cookie)).folders,[])
 assert.equal((await h.send(`/api/inkwell/templates/${templateId}/document`,undefined,cal.cookie)).status,404)
 await h.command('template.use',{id:templateId,recipients:[{name:'Val Vendor',email:'val@vendor.example'}]},cal.cookie,404)
 const shared=(await list(amy.cookie,'?q=w-9')).templates
 assert.deepEqual(shared.map(t=>[t.id,t.access,t.shares]),[[templateId,'use',undefined]],'the member sees it to use and not who else has it')
 const sent=(await h.command('template.use',{id:templateId,recipients:[{name:'Val Vendor',email:'val@vendor.example'}]},amy.cookie)).result.id
 assert.equal((await stored(sent,amy.cookie)).template.id,templateId,'the member sends from it')
 await h.command('template.update',{...definition,id:templateId,expiryDays:10},amy.cookie,403)
 await h.command('template.remove',{id:templateId},amy.cookie,403)
 await h.command('template.share',{id:templateId,email:'cal.shares@harbour.example',access:'use'},amy.cookie,403)
 assert.deepEqual((await list(ben.cookie)).templates.map(t=>[t.id,t.access]),[[templateId,'edit']],'the folder share reaches the template to edit')
 assert.equal((await h.command('template.update',{...definition,id:templateId,expiryDays:10,tags:['W-9']},ben.cookie)).result.version,2,'an editor changes it')
 assert.deepEqual((await list(zoe.cookie)).templates.find(t=>t.id===templateId).folder.id,folderId,'an edit keeps the template in its folder')
 await h.command('template.update',{...definition,id:templateId,folderId:null},ben.cookie,403)
 await h.command('template.remove',{id:templateId},ben.cookie,403)
 assert.deepEqual((await list(amy.cookie,'?q=procurement')).templates,[],'search follows the edited tags')
 const managed=(await list(zoe.cookie)).templates.find(t=>t.id===templateId)
 assert.deepEqual([managed.version,managed.expiryDays,managed.shares.map(s=>[s.email,s.access])],[2,10,[['amy.shares@harbour.example','use']]])
 assert.deepEqual((await list(zoe.cookie)).folders.find(f=>f.id===folderId).shares.map(s=>[s.email,s.access]),[['ben.shares@harbour.example','edit']])
 assert.ok((await list(h.owner)).templates.some(t=>t.id===templateId&&t.access==='manage'),'the owner manages every template')
 await h.command('template.unshare',{id:templateId,operatorId:amy.id},zoe.cookie)
 assert.deepEqual((await list(amy.cookie)).templates,[],'taking the share back hides it again')
 await h.command('template.use',{id:templateId,recipients:[{name:'Val Vendor',email:'val@vendor.example'}]},amy.cookie,404)
})

// TMPL-005: an upload that matches a template's document (the same file, or a fresh copy whose text is nearly the same)
// is offered that template with its confidence, only to people who may use it; an unrelated agreement is offered nothing.
test('TMPL-005: a fresh copy of a template W-9 is offered that template with its confidence; an unrelated agreement gets nothing',async()=>{
 const { w9Pdf, agreementPdf } = await import('./fixtures/forms.mjs')
 const xena=await sender('xena.match@harbour.example'),yuri=await sender('yuri.match@harbour.example'),viewer=await h.invite('vic.match@harbour.example','member')
 const w9=await w9Pdf(),fields=[{id:'w9-signature',label:'Signature',type:'signature',signer:0,page:1,x:.1,y:.3,width:.35,height:.06},{id:'w9-date',label:'Date',type:'date',signer:0,page:1,x:.55,y:.3,width:.25,height:.05},{id:'w9-tin',label:'TIN',type:'text',signer:0,page:0,x:.1,y:.5,width:.3,height:.04}]
 const templateId=(await h.command('template.save',{title:'Vendor W-9',filename:'w9.pdf',pdfBase64:w9.toString('base64'),roles:[{role:'Vendor',order:1}],fields},xena.cookie)).result.id
 const match=async(bytes,cookie,status=200)=>(await h.post('/api/inkwell/templates/match',{pdfBase64:bytes.toString('base64')},cookie,status)).value
 assert.deepEqual((await match(w9,xena.cookie)).matches,[{template:{id:templateId,title:'Vendor W-9',version:1},method:'fingerprint',confidence:100}],'the same file matches by fingerprint')
 const fresh=await w9Pdf('Rev. October 2026');assert.notEqual(digest(fresh),digest(w9),'the fresh copy has different bytes')
 const [offer]=(await match(fresh,xena.cookie)).matches
 assert.equal(offer.template.id,templateId);assert.equal(offer.method,'text')
 assert.ok(offer.confidence>=80&&offer.confidence<100,`a fresh copy matches by page text below 100% (${offer.confidence})`)
 assert.deepEqual((await match(await agreementPdf(),xena.cookie)).matches,[],'an unrelated agreement on the same pages is offered nothing')
 assert.deepEqual((await match(Buffer.from(original),xena.cookie)).matches,[],'a different document is offered nothing')
 assert.deepEqual((await match(fresh,yuri.cookie)).matches,[],'a sender who may not use the template is offered nothing')
 assert.ok((await match(fresh,h.owner)).matches.some(m=>m.template.id===templateId),'the owner, who may use every template, is offered it')
 await match(fresh,viewer,403)
 assert.deepEqual((await h.send('/api/inkwell/envelopes',undefined,xena.cookie)).value.total,0,'matching places and stores nothing')
})
// RECORD-005 runs last: its seven-year clock purges every completed envelope earlier tests left behind.
test('RECORD-005: with the clock advanced, a seven-year rule purges an envelope after its warning, and a held envelope survives both the rule and an erase request; voided and expired envelopes fall under it, open ones never',async()=>{
 const day=86_400_000,admin=await h.invite('keeper@harbour.example','admin'),viewer=await h.invite('ledger@harbour.example','member'),field=[{...fields[0],signer:0}]
 const complete=async(title,person)=>{const id=(await h.command('envelope.prepare',{...preparation(),title,signers:[person],fields:field})).result.id;await h.command('envelope.approve',{id,eligible:true});const signer=await verified(person.email);assert.equal((await h.post(signer.path+'/sign',{values:{'signature-0':person.name},consent:true,commandId:crypto.randomUUID()},signer.cookie)).value.result.status,'completed');return id}
 const kept=await complete('Harbour Studio mooring lease',{name:'Rae Lind',email:'rae@harbour.example'}),held=await complete('Harbour Studio winter storage',{name:'Sol Park',email:'sol@harbour.example'})
 // Ended other ways: voided now, and expiring in 10 days unsigned; one more stays open with the default 120-day expiry.
 const sent=async(title,person,extra={})=>{const id=(await h.command('envelope.prepare',{...preparation(),title,signers:[person],fields:field,...extra})).result.id;await h.command('envelope.approve',{id,eligible:true});return id}
 const voided=await sent('Harbour Studio berth swap',{name:'Ida Voss',email:'ida@harbour.example'});await h.command('envelope.void',{id:voided,reason:'Berth no longer available'})
 const lapsed=await sent('Harbour Studio haul-out quote',{name:'Ned Ash',email:'ned@harbour.example'},{expiresAt:new Date(Date.now()+10*day).toISOString()}),open=await sent('Harbour Studio fuel account',{name:'Oli Fenn',email:'oli@harbour.example'})
 const retention=async(cookie=admin)=>(await h.send('/api/inkwell',undefined,cookie)).value.settings.retention
 // Owners and admins set the rule in whole years; a viewer can neither set it nor hold an envelope.
 await h.command('account.retention',{years:7},viewer,403);await h.command('envelope.hold',{id:held,reason:'Litigation hold'},viewer,403)
 for(const years of [0,7.5,100,'7']) await h.command('account.retention',{years},admin,400)
 await h.command('account.retention',{years:7},admin)
 assert.equal((await retention(h.owner)).rule.years,7,'the owner reads the rule an admin set')
 await h.command('envelope.hold',{id:held,reason:'ok'},admin,400)
 assert.equal((await h.command('envelope.hold',{id:held,reason:'Litigation:  Harbour v. Dock Co.'},admin)).result.legalHold.reason,'Litigation: Harbour v. Dock Co.')
 await h.command('envelope.hold',{id:held,reason:'Again'},admin,409)
 const refused=await h.post('/api/inkwell/erase',{id:held,confirmation:'ERASE'},h.owner,409)
 assert.match(refused.value.error,/legal hold \(Litigation: Harbour v\. Dock Co\.\)/,'erasing a held envelope is refused, naming the hold')
 assert.equal((await stored(held)).legalHold.reason,'Litigation: Harbour v. Dock Co.')
 // The completion instant plus seven calendar years, UTC; the warning comes 30 days before.
 const completedAt=(await stored(kept)).events.find(e=>e.action==='envelope.completed').at,due=new Date(completedAt);due.setUTCFullYear(due.getUTCFullYear()+7)
 const warned=async id=>(await stored(id)).events.filter(e=>e.action==='envelope.retention_warned')
 await h.scheduled(due-31*day)
 assert.equal((await warned(kept)).length,0,'no warning 31 days before');assert.equal(await h.mail('keeper@harbour.example','Will be purged: Harbour Studio mooring lease'),undefined)
 await h.scheduled(due-30*day);await h.scheduled(due-29*day)
 const [warning]=await warned(kept)
 assert.equal((await warned(kept)).length,1,'one warning 30 days before');assert.equal(warning.detail.purgeAt,due.toISOString())
 for(const email of ['keeper@harbour.example','owner@harbour.example']){const notice=await h.mail(email,'Will be purged: Harbour Studio mooring lease');assert.ok(notice?.text.includes(due.toISOString())&&notice.text.includes('7-year retention rule'),`${email} is warned with the purge date and rule`)}
 assert.ok((await h.send('/api/inkwell/notices',undefined,admin)).value.notices.some(n=>n.envelopeId===kept&&n.event==='retention'),'the warning is in the admin\'s activity feed')
 assert.equal((await warned(held)).length,0,'a held envelope is not warned');assert.equal(await h.mail('keeper@harbour.example','Will be purged: Harbour Studio winter storage'),undefined)
 await h.scheduled(due-3600_000);assert.equal((await stored(kept)).status,'completed','not purged before it falls due')
 await h.scheduled(due.getTime())
 assert.equal((await h.send('/api/inkwell/envelopes/'+kept,undefined,h.owner)).status,404,'purged on the due date after its warning')
 assert.equal((await h.send('/api/inkwell/envelopes/'+kept+'/artifacts/signed',undefined,h.owner)).status,404)
 assert.ok(!(await h.send('/api/inkwell/notices',undefined,admin)).value.notices.some(n=>n.envelopeId===kept),'its feed notices go with it')
 const ledger=(await retention()).purged.find(p=>p.envelopeId===kept)
 assert.deepEqual({ended:ledger.ended,years:ledger.years,endedAt:ledger.endedAt,warnedAt:ledger.warnedAt,purgedAt:ledger.purgedAt},{ended:'completed',years:7,endedAt:completedAt,warnedAt:new Date(due-30*day).toISOString(),purgedAt:due.toISOString()})
 // The void came seconds after the completion, so it was first warned a day later and is purged 30 days after that.
 assert.equal((await stored(voided)).status,'voided','the voided envelope waits out its own warning')
 assert.ok(!JSON.stringify(await retention()).includes('mooring lease'),'the ledger keeps no title')
 assert.equal((await stored(held)).status,'completed','the held envelope survives the rule')
 // Lifting the hold restarts the warning: an overdue envelope is purged 30 days after its own warning, never before.
 await h.command('envelope.lift_hold',{id:held},admin)
 assert.deepEqual((await stored(held)).events.filter(e=>e.action.startsWith('envelope.legal_hold')).map(e=>[e.action,e.actor]),[['envelope.legal_hold_placed',(await h.send('/api/inkwell',undefined,admin)).value.actor.id],['envelope.legal_hold_lifted',(await h.send('/api/inkwell',undefined,admin)).value.actor.id]],'placing and lifting are in the envelope\'s audit trail')
 await h.scheduled(due.getTime()+day)
 assert.equal((await h.send('/api/inkwell/envelopes/'+voided,undefined,h.owner)).status,404,'the voided envelope is purged 30 days after its warning');assert.equal((await retention()).purged.find(p=>p.envelopeId===voided).ended,'voided')
 assert.equal((await warned(held)).length,1,'warned at once when overdue');assert.ok(await h.mail('keeper@harbour.example','Will be purged: Harbour Studio winter storage'))
 // The unsigned envelope expired 10 days after it was sent, so it came within 30 days of falling due at the hour-before pass.
 assert.equal((await warned(lapsed))[0]?.detail.purgeAt,new Date(due-3600_000+30*day).toISOString(),'the expired envelope is due 7 years after its expiry and purged 30 days after its warning')
 await h.scheduled(due.getTime()+30*day);assert.equal((await stored(held)).status,'completed','not purged until 30 days after its warning')
 assert.equal((await h.send('/api/inkwell/envelopes/'+lapsed,undefined,h.owner)).status,404,'the expired envelope is purged');assert.equal((await retention()).purged.find(p=>p.envelopeId===lapsed).ended,'expired')
 await h.scheduled(due.getTime()+31*day);assert.equal((await h.send('/api/inkwell/envelopes/'+held,undefined,h.owner)).status,404)
 assert.equal((await stored(open)).status,'awaiting_signature');assert.equal((await warned(open)).length,0,'an envelope still open for signing is never warned or purged')
 await h.command('account.retention',{years:null},admin);assert.equal((await retention()).rule,null,'the rule can be cleared')
})

test('PREP-004: conditional required fields disappear without printing; USD calculations are live inputs validated and recomputed at signing', async () => {
 const field=(id,type,y,extra={})=>({id,label:id,type,signer:0,page:0,x:.1,y,width:.6,height:.04,...extra})
 const rules=[field('signature','signature',.2),field('other','checkbox',.3),field('details','text',.4,{condition:{field:'other',equals:'true'}}),field('reference','text',.45,{condition:{field:'other',equals:'true'}}),field('fee','number',.5),field('tax','number',.55),field('total','number',.6,{calculation:{operation:'sum',fields:['fee','tax']}}),field('optional-note','text',.65,{required:false}),field('approval-note','text',.7,{requiredWhen:{field:'other',equals:'true'}}),field('difference','number',.75,{calculation:{operation:'difference',fields:['fee','tax']}}),field('product','number',.8,{calculation:{operation:'product',fields:['fee','tax']}})]
 for (const change of [fs=>{fs[2].condition.field='missing'},fs=>{fs[2].condition.field='reference';fs[3].condition.field='details'},fs=>{fs[6].calculation.fields=['signature']},fs=>{fs[6].calculation.operation='eval'}]) {
  const invalid=structuredClone(rules);change(invalid);await h.command('envelope.prepare',{...preparation(),signers:[recipients[0]],fields:invalid},h.owner,400)
 }
 for(const checked of [true,false]) {
  const email=`conditional-${checked}@harbour.example`
  const id=(await h.command('envelope.prepare',{...preparation(),signers:[{name:'Priya Shah',email}],fields:rules})).result.id
  await h.command('envelope.approve',{id,eligible:true})
  const s=await verified(email),base={signature:'Priya Shah',other:String(checked),fee:'1200.25',tax:'15.50',total:'0.01'}
  const sign=values=>h.post(s.path+'/sign',{commandId:crypto.randomUUID(),consent:true,values},s.cookie,400)
  await sign({...base,fee:'USD 1200'});await sign({...base,fee:'1.123'});await sign({...base,fee:'9007199254740992'})
  if(checked) { const r=await sign(base);assert.match(r.value.error,/details/);await sign({...base,details:'Supplier access'}) }
  if(checked) await sign({...base,details:'Supplier access',reference:'PO-104'})
  const values={...base,...(checked?{'approval-note':'Approved by client'}:{}),details:checked?'Supplier access':'HIDDEN PRIVATE VALUE',reference:checked?'PO-104':'HIDDEN PRIVATE REFERENCE'}
  await h.post(s.path+'/sign',{commandId:crypto.randomUUID(),consent:true,values},s.cookie)
  const e=await stored(id);assert.equal(e.status,'completed');assert.equal(e.signers[0].values.total,'1215.75','server ignores a forged calculated total');assert.equal(e.signers[0].values.difference,'1184.75');assert.equal(e.signers[0].values.product,'18603.88','product rounds half away from zero');assert.ok(!('optional-note' in e.signers[0].values));assert.equal(e.signers[0].values['approval-note'],checked?'Approved by client':undefined)
  const pdf=await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,h.owner),text=await pdfText(pdf.bytes)
  assert.match(text,/1215\.75/,'calculated USD total printed')
  if(checked) {assert.match(text,/Supplier access/);assert.match(text,/PO-104/)} else {assert.ok(!('details' in e.signers[0].values));assert.ok(!('reference' in e.signers[0].values));assert.doesNotMatch(text,/HIDDEN PRIVATE/)}
  const copied=(await h.command('envelope.copy',{id})).result.id;assert.deepEqual((await stored(copied)).fields,e.fields,'copy keeps every rule')
  const template=(await h.command('template.from_envelope',{id})).result.id,fromTemplate=(await h.command('template.use',{id:template,recipients:[{name:'New client',email:'new@clients.example'}]})).result.id;assert.deepEqual((await stored(fromTemplate)).fields,e.fields,'template keeps every rule')
 }
})

// TMPL-004: these fixtures enter through template and composition commands; all signing uses recipient HTTP sessions.
const compositionInput = (title, order = 1, identity = 'email') => ({
 title, filename: title.replace(/ /g,'-')+'.pdf', pdfBase64: Buffer.from(original).toString('base64'),
 roles: [{ role: 'Client', order, ...(identity === 'sms' ? { sms: true } : identity === 'link' ? { linkOnly: true } : {}) }],
 fields: [{...fields[0],id:'signature',signer:0},{id:'reference',label:'Client reference',type:'text',signer:0,page:0,x:.1,y:.4,width:.6,height:.05}],expiryDays:30,
})
test('Combined NDA and W9 merge one Client session, retain both document fields and record every pinned source version',async()=>{
 const ndaInput=compositionInput('Synthetic NDA'),w9Input=compositionInput('Synthetic W9')
 const nda=(await h.command('template.save',ndaInput)).result,w9=(await h.command('template.save',w9Input)).result
 const revised=(await h.command('template.update',{id:w9.id,...w9Input,message:'Updated W9 invitation'})).result
 const ids=[nda.id,w9.id],preview=(await h.post('/api/inkwell/templates/compose-preview',{ids},h.owner)).value
 assert.equal(preview.roles.length,1);assert.equal(preview.roles[0].sources.length,2);assert.equal(preview.documents.length,2)
 const person={name:'Synthetic Client',email:'synthetic-composition-client@clients.example'}
 const id=(await h.command('template.combine',{ids,recipients:[person]})).result.id,e=await stored(id)
 assert.equal(e.signers.length,1);assert.equal(e.documents.length,2)
 assert.deepEqual(e.templates,[{id:nda.id,title:ndaInput.title,version:nda.version},{id:w9.id,title:w9Input.title,version:revised.version}])
 assert.equal(new Set(e.fields.map(f=>f.id)).size,e.fields.length,'source field IDs are namespaced rather than overwritten')
 for(let document=0;document<2;document++)assert.ok(e.fields.some(f=>f.document===document&&f.type==='signature'&&f.signer===0),'the one recipient owns both signatures')
 await h.command('envelope.approve',{id,eligible:true})
 const session=await verified(person.email),view=(await h.send(session.path,undefined,session.cookie)).value
 assert.equal(view.documents.length,2);assert.equal(view.fields.length,e.fields.length)
 const values=Object.fromEntries(view.fields.map(f=>[f.id,f.type==='signature'?person.name:`Reference for document ${f.document+1}`]))
 await h.post(session.path+'/sign',{values,consent:true,commandId:crypto.randomUUID()},session.cookie)
 const completed=await stored(id);assert.equal(completed.status,'completed');assert.ok(completed.documents.every(d=>d.signedSha256))
 const cert=await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes)
 for(const source of e.templates){assert.ok(cert.includes(source.title),'certificate names each source');assert.match(cert,new RegExp(source.title+'[^\\n]*'+source.version),'certificate associates the pinned version with its source')}
 assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,true)
})

test('Composition previews preserve Client at distinct orders and propose the stricter identity before an explicit email choice',async()=>{
 const a=(await h.command('template.save',compositionInput('Synthetic email source'))).result.id
 const b=(await h.command('template.save',compositionInput('Synthetic SMS source',1,'sms'))).result.id
 const later=(await h.command('template.save',compositionInput('Synthetic later source',2))).result.id
 const ids=[a,b,later],preview=(await h.post('/api/inkwell/templates/compose-preview',{ids},h.owner)).value
 const first=preview.roles.find(r=>r.order===1),second=preview.roles.find(r=>r.order===2)
 assert.equal(preview.roles.length,2);assert.equal(first.role,second.role);assert.notEqual(first.key,second.key)
 assert.equal(first.sources.length,2);assert.equal(second.sources.length,1);assert.equal(first.identity,'sms')
 assert.ok(preview.conflicts.some(c=>c.kind==='order'));assert.ok(preview.conflicts.some(c=>c.kind==='identity'&&c.proposed==='sms'&&c.selected==='sms'))
 const choices={identity:{[first.key]:'email'}},chosen=(await h.post('/api/inkwell/templates/compose-preview',{ids,choices},h.owner)).value
 assert.equal(chosen.roles.find(r=>r.key===first.key).identity,'email')
 const person={name:'Synthetic repeat client',email:'synthetic-composition-orders@clients.example'}
 const id=(await h.command('template.combine',{ids,choices,recipients:[person,person]})).result.id,prepared=await stored(id)
 assert.equal(prepared.signers.length,2);assert.deepEqual(prepared.signers.map(s=>s.order),chosen.roles.map(r=>r.order));assert.ok(prepared.signers.every(s=>!s.sms))
 assert.equal(prepared.documents.length,3)
 const orderChoice={...choices,orders:{Client:1}},merged=(await h.post('/api/inkwell/templates/compose-preview',{ids,choices:orderChoice},h.owner)).value
 assert.equal(merged.roles.length,1);assert.equal(merged.roles[0].sources.length,3);assert.equal(merged.roles[0].order,1);const mergedId=(await h.command('template.combine',{ids,choices:orderChoice,recipients:[person]})).result.id;assert.equal((await stored(mergedId)).signers.length,1);assert.equal((await stored(mergedId)).documents.length,3);assert.ok(merged.conflicts.some(c=>c.kind==='order'&&c.selected===1))
 await h.post('/api/inkwell/templates/compose-preview',{ids,choices:{orders:{Client:9}}},h.owner,400)
})

test('Composition preparation refuses inaccessible sources and a source definition changed while document bytes are staged',async()=>{
 const first=(await h.command('template.save',compositionInput('Synthetic guarded source'))).result.id
 const second=(await h.command('template.save',compositionInput('Synthetic private source'))).result.id
 const outsider=await sender('synthetic-composition-outsider@harbour.example'),ids=[first,second]
 await h.command('template.share',{id:first,email:'synthetic-composition-outsider@harbour.example',access:'use'})
 await h.post('/api/inkwell/templates/compose-preview',{ids},outsider.cookie,404)
 const recipients=[{name:'Synthetic guarded client',email:'synthetic-guarded-client@clients.example'}]
 await h.command('template.combine',{ids,recipients},outsider.cookie,404)
 const before=(await h.db.prepare('SELECT COUNT(*) AS n FROM iw_envelopes').first()).n
 // A real D1 trigger schedules the competing definition change during the command's staging writes, before its insert batch.
 await h.db.exec(`CREATE TRIGGER synthetic_composition_race AFTER INSERT ON iw_blob_staging BEGIN UPDATE iw_templates SET data=json_set(data,'$.title','Synthetic changed during preparation') WHERE id='${first}'; END`)
 try{await h.command('template.combine',{ids,recipients},h.owner,409)}finally{await h.db.exec('DROP TRIGGER synthetic_composition_race')}
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_envelopes').first()).n,before,'a stale source cannot leave a partially prepared envelope')
 assert.equal(JSON.parse((await h.db.prepare('SELECT data FROM iw_templates WHERE id=?').bind(first).first()).data).title,'Synthetic changed during preparation','the competing source change happened')
})

test('Composed source custody survives copy, draft editing and archive restore; a changed pinned version refuses verification and restore',async()=>{
 const local=await harness(),read=async(id,app=local)=>(await app.send('/api/inkwell/envelopes/'+id,undefined,app.owner)).value.envelope
 try {
  const ids=[];for(const title of ['Harbour source NDA','Harbour source W9'])ids.push((await local.command('template.save',compositionInput(title))).result.id)
  const id=(await local.command('template.combine',{ids,recipients:[{name:'Mara Quinn',email:'mara.custody@harbour.example'}]})).result.id,initial=await read(id)
  await local.command('envelope.approve',{id,eligible:true})
  const copy=(await local.command('envelope.copy',{id})).result.id,draft=await read(copy)
  assert.deepEqual(draft.templates,initial.templates);assert.ok(draft.signers.every(s=>!s.signedAt))
  await local.command('envelope.update',{id:copy,title:'Harbour copied onboarding',filename:draft.filename,signers:draft.signers,fields:draft.fields,documents:draft.documents.map((d,existing)=>({existing,mode:d.mode,visibleTo:d.visibleTo})),expiresAt:draft.expiresAt})
  const edited=await read(copy);assert.deepEqual(edited.templates,initial.templates);assert.equal(edited.originalSha256,initial.originalSha256)
  assert.equal((await local.send('/api/inkwell/envelopes/'+copy+'/verify',undefined,local.owner)).value.ok,true)
  const archive=(await local.send('/api/inkwell/archive',undefined,local.owner)).value,restored=await harness({mailProvider:null})
  try{await restored.post('/api/inkwell/archive/restore',{archive});assert.deepEqual((await read(copy,restored)).templates,initial.templates);assert.equal((await restored.send('/api/inkwell/envelopes/'+copy+'/verify',undefined,restored.owner)).value.ok,true)}finally{await restored.close()}
  edited.templates[1].version++;await local.db.prepare('UPDATE iw_envelopes SET data=? WHERE id=?').bind(JSON.stringify(edited),copy).run()
  assert.equal((await local.send('/api/inkwell/envelopes/'+copy+'/verify',undefined,local.owner)).value.ok,false)
  const damaged=(await local.send('/api/inkwell/archive',undefined,local.owner)).value,rejected=await harness({mailProvider:null})
  try{await rejected.post('/api/inkwell/archive/restore',{archive:damaged},rejected.owner,400);assert.equal((await rejected.send('/api/inkwell/envelopes/'+copy,undefined,rejected.owner)).status,404)}finally{await rejected.close()}
 }finally{await local.close()}
})
