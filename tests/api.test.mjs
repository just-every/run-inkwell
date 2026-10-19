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
  `Authenticated at ${stamp(at('signer.session_verified'))}: signed-in Inkwell session of member ${readerId}, verified · IP 198.51.100.4 · User agent: RecordDesk/5.0`,
  `Disclosure ${version} accepted at: ${stamp(e.signers[1].disclosure.acceptedAt)}`,`Adopted signature (Signature): "Reader", typed name`,
  `Signed at: ${stamp(e.signers[1].signedAt)} · IP 198.51.100.4 · User agent: RecordDesk/5.0`,
  // every event up to the one that records this certificate's own creation
  ...e.events.slice(0,e.events.findIndex(x=>x.action==='certificate.created')).map(x=>`${stamp(x.at)} ${x.action}`),
 ]) assert.ok(text.includes(line),`the certificate shows: ${line}`)
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
