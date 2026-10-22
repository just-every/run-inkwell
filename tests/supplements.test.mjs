import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const base64 = bytes => Buffer.from(bytes).toString('base64')
const people = [{ name: 'Mara Quinn', email: 'mara@supplements.example' }, { name: 'Noor Haddad', email: 'noor@supplements.example' }]
const field = signer => ({ id: `sig-${signer}`, label: 'Signature', type: 'signature', signer, page: 0, x: .1, y: .3 + signer * .15, width: .4, height: .07 })
async function pdf(text) {
 const document = await PDFDocument.create()
 document.addPage([612, 792]).drawText(text, { x: 60, y: 730, size: 12 })
 return new Uint8Array(await document.save())
}
async function prepare(h, bytes, signers = people, extra = {}) {
 return (await h.command('envelope.prepare', { title: 'Supplemented services agreement', filename: 'agreement.pdf', pdfBase64: base64(bytes), signers, fields: signers.map((_, i) => field(i)), ...extra })).result.id
}
const envelope = async (h, id) => (await h.send(`/api/inkwell/envelopes/${id}`, undefined, h.owner)).value.envelope
const artifact = (id, supplementId) => `/api/inkwell/envelopes/${id}/artifacts/supplement-${supplementId}`
async function add(h, id, bytes, requirement = 'acknowledge', label = 'Privacy addendum') {
 return (await h.command('envelope.supplement', { id, label, filename: 'addendum.pdf', pdfBase64: base64(bytes), requirement })).result.supplementId
}
const invitationPath = invitation => '/api' + new URL(invitation.url).pathname
async function verify(h, invitation) {
 const path = invitationPath(invitation), session = await h.post(path + '/verify', { code: invitation.code }, '')
 return { path, cookie: session.cookie }
}
const sign = (h, session, signer, status = 200) => h.post(session.path + '/sign', { values: { [`sig-${signer}`]: people[signer].name }, consent: true, commandId: crypto.randomUUID() }, session.cookie, status)
const supplementPath = (session, id) => `${session.path}/supplements/${id}`
async function open(h, session, id, bytes) {
 const response = await h.send(supplementPath(session, id) + '/document', undefined, session.cookie)
 assert.equal(response.status, 200)
 assert.match(response.headers.get('content-type'), /application\/pdf/)
 assert.deepEqual(response.bytes, bytes, 'the signer receives the exact supplied PDF')
}
async function acknowledge(h, session, id, status = 200) {
 return h.post(supplementPath(session, id) + '/acknowledge', { acknowledge: true }, session.cookie, status)
}
async function paper(h, session, bytes, status) {
 const response = await h.mf.dispatchFetch(h.origin + session.path + '/paper', { method: 'POST', headers: { origin: h.origin, cookie: session.cookie, 'content-type': 'application/pdf' }, body: bytes })
 assert.equal(response.status, status, 'paper signing enforces the same supplemental-document requirements')
}
async function pdfText(bytes) {
 const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
 const document = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise
 let text = ''
 for (let n = 1; n <= document.numPages; n++) text += (await (await document.getPage(n)).getTextContent()).items.map(item => item.str).join(' ') + ' '
 return text
}

test('SIGNX-009: supplemental PDFs stay private and immutable after send; each recipient must open and acknowledge their own copy before electronic or paper signing', async () => {
 const h = await harness({ mailProvider: null })
 try {
  const [main, terms, privacy] = await Promise.all([pdf('Services agreement'), pdf('Service terms'), pdf('Privacy addendum')])
  const id = await prepare(h, main, [{ ...people[0], accessCode: 'private-terms' }, people[1]], { allowPaperSigning: true })
  const input = { id, label: 'Service terms', filename: 'terms.pdf', pdfBase64: base64(terms), requirement: 'view' }
  await h.command('envelope.supplement', input, '', 401)
  await h.command('envelope.supplement', { ...input, pdfBase64: base64(new TextEncoder().encode('not a PDF')) }, h.owner, 400)
  await h.command('envelope.supplement', { ...input, pdfBase64: base64(new Uint8Array(2 * 1024 * 1024 + 1)) }, h.owner, 400)
  const viewId = (await h.command('envelope.supplement', input)).result.supplementId
  const ackId = await add(h, id, privacy)
  const removable = await add(h, id, privacy, 'view', 'Withdrawn draft attachment')
  await h.command('envelope.remove_supplement', { id, supplementId: removable })
  assert.equal((await h.send(artifact(id, removable), undefined, h.owner)).status, 404)
  const stored = await envelope(h, id)
  assert.deepEqual(stored.supplements.map(s => ({ id: s.id, sha256: s.sha256, pages: s.pages, bytes: s.bytes, requirement: s.requirement })), [
   { id: viewId, sha256: digest(terms), pages: 1, bytes: terms.length, requirement: 'view' },
   { id: ackId, sha256: digest(privacy), pages: 1, bytes: privacy.length, requirement: 'acknowledge' },
  ])
  const other = await prepare(h, main), foreignId = await add(h, other, privacy)
  const [invitation] = (await h.command('envelope.approve', { id, eligible: true })).result.invitations
  const path = invitationPath(invitation), unverified = { path, cookie: '' }
  assert.ok(!(await h.send(path)).value.supplements?.length)
  assert.equal((await h.send(supplementPath(unverified, ackId) + '/document')).status, 401)
  await acknowledge(h, unverified, ackId, 401)
  await h.post(path + '/verify', { code: invitation.code }, '', 403)
  await h.post(path + '/access', { accessCode: 'private-terms' }, '')
  const first = await verify(h, invitation)
  assert.ok(!(await h.send(path, undefined, first.cookie)).value.supplements?.length, 'disclosure precedes access to supplemental metadata')
  assert.equal((await h.send(supplementPath(first, ackId) + '/document', undefined, first.cookie)).status, 403)
  await acknowledge(h, first, ackId, 403)
  await h.agree(path, first.cookie)
  assert.equal((await h.send(supplementPath(first, foreignId) + '/document', undefined, first.cookie)).status, 404)
  await acknowledge(h, first, foreignId, 404)
  await h.command('envelope.supplement', input, h.owner, 409)
  await h.command('envelope.remove_supplement', { id, supplementId: ackId }, h.owner, 409)
  await sign(h, first, 0, 409)
  await paper(h, first, main, 409)
  await acknowledge(h, first, ackId, 409)
  await open(h, first, ackId, privacy)
  await h.post(supplementPath(first, ackId) + '/acknowledge', { acknowledge: false }, first.cookie, 400)
  await acknowledge(h, first, ackId)
  const firstState = (await h.send(path, undefined, first.cookie)).value.supplements.find(s => s.id === ackId)
  assert.ok(Number.isFinite(Date.parse(firstState.viewedAt)))
  assert.ok(Number.isFinite(Date.parse(firstState.acknowledgedAt)))
  await sign(h, first, 0, 409)
  await open(h, first, viewId, terms)
  await sign(h, first, 0)

  const [next] = (await h.command('envelope.invite', { id })).result.invitations
  assert.equal(next.recipient, people[1].email)
  const second = await verify(h, next)
  assert.equal((await h.send(supplementPath(second, ackId) + '/document', undefined, first.cookie)).status, 401, 'another recipient session cannot open this private link')
  await h.agree(second.path, second.cookie)
  const secondState = (await h.send(second.path, undefined, second.cookie)).value.supplements
  assert.equal(secondState.length, 2)
  assert.ok(secondState.every(s => !s.viewedAt && !s.acknowledgedAt), 'the earlier recipient cannot satisfy the next recipient’s requirements')
  await sign(h, second, 1, 409)
  await paper(h, second, main, 409)
  await acknowledge(h, second, ackId, 409)
  await open(h, second, viewId, terms)
  await open(h, second, ackId, privacy)
  await paper(h, second, main, 409)
  await acknowledge(h, second, ackId)
  await paper(h, second, main, 200)
  await h.command('envelope.paper_review', { id, signer: 1, accept: true })
  const completed = await envelope(h, id)
  assert.equal(completed.status, 'completed')
  for (const signer of [0, 1]) {
   const event = completed.events.find(e => e.action === 'signer.supplement_acknowledged' && e.detail.signer === signer)
   assert.ok(event)
   assert.equal(event.detail.email, people[signer].email)
   assert.equal(event.detail.supplementId, ackId)
   assert.equal(event.detail.sha256, digest(privacy))
   assert.ok(completed.events.some(e => e.action === 'signer.supplement_viewed' && e.detail.signer === signer && e.detail.supplementId === viewId && e.detail.sha256 === digest(terms)))
  }
  await open(h, first, ackId, privacy)
  await open(h, second, viewId, terms)
  const verification = (await h.send(`/api/inkwell/envelopes/${id}/verify`, undefined, h.owner)).value
  assert.equal(verification.ok, true)
  for (const hash of [digest(terms), digest(privacy)]) assert.ok(verification.fingerprints.some(f => f.expected === hash && f.ok))
  const certificate = await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`, undefined, h.owner)).bytes)
  for (const evidence of ['Service terms', 'Privacy addendum', ...people.map(p => p.email), ...completed.events.filter(e => e.action === 'signer.supplement_acknowledged').map(e => e.at)]) assert.ok(certificate.includes(evidence), 'certificate includes supplemental custody evidence: ' + evidence)
  for (const hash of [digest(terms), digest(privacy)]) assert.ok(certificate.replace(/\s/g, '').includes(hash), 'certificate includes the supplemental fingerprint')
 } finally { await h.close() }
})

test('SIGNX-009: copy, template and archive retain supplemental bytes without carrying consent; corruption is refused and erasure fences older archives', async () => {
 const h = await harness({ mailProvider: null })
 try {
  const [main, document] = await Promise.all([pdf('Renewable agreement'), pdf('Renewal addendum')])
  const id = await prepare(h, main, people.slice(0, 1)), supplementId = await add(h, id, document)
  const [invitation] = (await h.command('envelope.approve', { id, eligible: true })).result.invitations
  const session = await verify(h, invitation)
  await h.agree(session.path, session.cookie)
  await open(h, session, supplementId, document)
  await acknowledge(h, session, supplementId)
  await sign(h, session, 0)
  const source = await envelope(h, id)
  const copied = (await h.command('envelope.copy', { id })).result.id
  const template = (await h.command('template.from_envelope', { id })).result.id
  const savedTemplate=(await h.send('/api/inkwell/templates',undefined,h.owner)).value.templates.find(t=>t.id===template)
  await h.command('template.update',{...savedTemplate,supplements:undefined,title:'Edited renewal template',pdfBase64:base64(main)})
  const fromTemplate = (await h.command('template.use', { id: template, recipients: people.slice(0, 1) })).result.id
  for (const freshId of [copied, fromTemplate]) {
   const fresh = await envelope(h, freshId)
   assert.equal(fresh.status, 'prepared')
   assert.equal(fresh.supplements.length, 1)
   const supplement = fresh.supplements[0]
   for (const key of ['label', 'filename', 'sha256', 'pages', 'bytes', 'requirement']) assert.equal(supplement[key], source.supplements[0][key], 'copied supplemental ' + key)
   assert.ok(!fresh.events.some(e => ['signer.supplement_viewed', 'signer.supplement_acknowledged'].includes(e.action)))
   assert.deepEqual((await h.send(artifact(freshId, supplement.id), undefined, h.owner)).bytes, document)
   const [invite] = (await h.command('envelope.approve', { id: freshId, eligible: true })).result.invitations
   const recipient = await verify(h, invite)
   await h.agree(recipient.path, recipient.cookie)
   await sign(h, recipient, 0, 409)
   await h.command('envelope.void', { id: freshId, reason: 'Custody copy checked' })
  }
  const archive = (await h.send('/api/inkwell/archive', undefined, h.owner)).value
  const restored = await harness({ mailProvider: null })
  try {
   await restored.post('/api/inkwell/archive/restore', { archive })
   assert.deepEqual((await restored.send(artifact(id, supplementId), undefined, restored.owner)).bytes, document)
   assert.equal((await restored.send(`/api/inkwell/envelopes/${id}/verify`, undefined, restored.owner)).value.ok, true)
   const templateCopy = (await restored.command('template.use', { id: template, recipients: people.slice(0, 1) })).result.id
   const templateSupplement = (await envelope(restored, templateCopy)).supplements[0]
   assert.deepEqual((await restored.send(artifact(templateCopy, templateSupplement.id), undefined, restored.owner)).bytes, document, 'archive includes template supplemental bytes')
  } finally { await restored.close() }

  // Fault injection changes real storage; public downloads and archive validation must detect it.
  const kind = 'supplement-' + supplementId, corrupted = document.slice()
  corrupted[corrupted.length - 1] ^= 1
  await h.db.prepare('UPDATE iw_blobs SET data=? WHERE envelope_id=? AND kind=? AND part=0').bind(corrupted.buffer, id, kind).run()
  assert.equal((await h.send(artifact(id, supplementId), undefined, h.owner)).status, 503)
  assert.equal((await h.send(supplementPath(session, supplementId) + '/document', undefined, session.cookie)).status, 503)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`, undefined, h.owner)).value.ok, false)
  const damagedArchive = (await h.send('/api/inkwell/archive', undefined, h.owner)).value
  const destination = await harness({ mailProvider: null })
  try {
   const refused = await destination.send('/api/inkwell/archive/restore', { archive: damagedArchive }, destination.owner)
   assert.ok([400, 409].includes(refused.status), 'an internally checksummed archive still rejects a supplemental fingerprint mismatch')
   assert.equal((await destination.send(`/api/inkwell/envelopes/${id}`, undefined, destination.owner)).status, 404)
  } finally { await destination.close() }
  await h.db.prepare('UPDATE iw_blobs SET data=? WHERE envelope_id=? AND kind=? AND part=0').bind(document.buffer, id, kind).run()
  await h.post('/api/inkwell/erase', { id, confirmation: 'ERASE' })
  assert.equal((await h.send(artifact(id, supplementId), undefined, h.owner)).status, 404)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_blobs WHERE envelope_id=?').bind(id).first()).n, 0)
  const laterJournal = (await h.send('/api/inkwell/archive', undefined, h.owner)).value
  const fenced = await harness({ mailProvider: null })
  try {
   await fenced.post('/api/inkwell/archive/restore', { archive, laterJournal }, fenced.owner, 400)
   assert.equal((await fenced.send(`/api/inkwell/envelopes/${id}`, undefined, fenced.owner)).status, 404)
  } finally { await fenced.close() }
 } finally { await h.close() }
})

test('Private page threads: chosen audiences, inherited replies, identity epochs, terminal immutability and complete record custody', async () => {
 const h=await harness()
 try {
  const senderCookie=await h.invite('sender@comments.example','member'),sender=(await h.send('/api/inkwell',undefined,senderCookie)).value.actor
  await h.command('member.role',{operatorId:sender.id,role:'sender'})
  const admin=await h.invite('admin@comments.example','admin'),editor=await h.invite('editor@comments.example','member'),editorId=(await h.send('/api/inkwell',undefined,editor)).value.actor.id
  await h.command('member.role',{operatorId:editorId,role:'sender'})
  const document=await PDFDocument.create();document.addPage([612,792]);document.addPage([612,792]);const bytes=await document.save()
  const id=(await h.command('envelope.prepare',{title:'Private discussion',filename:'discussion.pdf',pdfBase64:base64(bytes),signers:people,fields:people.map((_,i)=>field(i))},senderCookie)).result.id
  await h.command('envelope.share',{id,email:'editor@comments.example',access:'edit'},senderCookie)
  const base=`/api/inkwell/envelopes/${id}`
  const post=(path,input,cookie,status=200)=>h.post(path+'/comments',{...input,commandId:crypto.randomUUID()},cookie,status)
  const view=async(path,cookie)=>(await h.send(path+'/comments',undefined,cookie)).value
  const recipient=async email=>{const mail=await h.mail(email,'Please sign:'),path=new URL(mail.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.replace('/sign/','/api/sign/');await h.post(path+'/code',{},'');const code=(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(path+'/verify',{code},'')).cookie;return{path,cookie}}
  await post(base,{action:'create',page:1,text:'not sent',audience:['sender']},senderCookie,409)
  await h.command('envelope.approve',{id,eligible:true},senderCookie)
  const first=await recipient(people[0].email)
  assert.equal((await h.send(first.path+'/comments')).status,401)
  await post(first.path,{action:'create',page:1,text:'private-inkwell-comment-1',audience:['recipient:0']},first.cookie,403)
  await h.agree(first.path,first.cookie)
  await post(first.path,{action:'create',page:3,text:'outside page',audience:['recipient:0']},first.cookie,400)
  await post(first.path,{action:'create',page:1,text:'no implicit audience',audience:[]},first.cookie,400)
  const root=(await post(first.path,{action:'create',page:1,text:'private-inkwell-comment-1',audience:['recipient:0']},first.cookie)).value.result.thread
  for(const cookie of [h.owner,admin,editor,senderCookie]) {
   assert.deepEqual((await view(base,cookie)).threads,[],'owner, admin, edit share and sender receive no unselected text')
   assert.ok(!JSON.stringify((await h.send(base,undefined,cookie)).value).includes('private-inkwell-comment-1'))
   assert.ok(!new TextDecoder().decode((await h.send(base+'/artifacts/audit',undefined,cookie)).bytes).includes('private-inkwell-comment-1'))
   await post(base,{action:'reply',thread:root,text:'cannot read'},cookie,cookie===senderCookie?404:403)
  }
  await post(first.path,{action:'audience',thread:root,audience:['recipient:0','sender','recipient:1']},first.cookie)
  await post(base,{action:'reply',thread:root,text:'private-inkwell-reply-2',audience:['sender']},senderCookie,400)
  await post(base,{action:'audience',thread:root,audience:['sender']},senderCookie,403)
  await post(base,{action:'reply',thread:root,text:'private-inkwell-reply-2'},senderCookie)
  await post(first.path,{action:'reply',thread:root,text:'private-inkwell-round-3'},first.cookie)
  assert.equal((await view(base,senderCookie)).threads[0].messages.length,3,'multiple rounds retain the author-chosen audience')
  await sign(h,first,0)
  const second=await recipient(people[1].email);await h.agree(second.path,second.cookie)
  const shared=(await view(second.path,second.cookie)).threads[0]
  assert.equal(shared.page,1);assert.deepEqual(shared.messages.map(m=>m.text),['private-inkwell-comment-1','private-inkwell-reply-2','private-inkwell-round-3'])
  await post(second.path,{action:'reply',thread:root,text:'private-inkwell-round-4'},second.cookie)
  await sign(h,second,1)
  const terminal=(await view(base,senderCookie)).threads
  for(const [path,cookie] of [[base,senderCookie],[first.path,first.cookie],[second.path,second.cookie]])for(const input of [{action:'create',page:0,text:'late',audience:['sender']},{action:'reply',thread:root,text:'late'},{action:'audience',thread:root,audience:['sender']}])await post(path,input,cookie,409)
  assert.deepEqual((await view(base,senderCookie)).threads,terminal)
  const audit=(await h.send('/api/inkwell/comments/audit',undefined,admin)).value
  assert.ok(audit.events.some(e=>e.action==='comment.shared'));assert.ok(audit.events.some(e=>e.action==='comment.audience_changed'));assert.ok(audit.events.some(e=>e.action==='comment.created'));assert.ok(audit.events.some(e=>e.action==='comment.replied'))
  for(const secret of ['private-inkwell-comment-1','private-inkwell-reply-2',people[0].email])assert.ok(!JSON.stringify(audit).includes(secret),'account comment audit is opaque metadata only')
  const certificate=await pdfText((await h.send(base+'/artifacts/certificate',undefined,h.owner)).bytes)
  assert.ok(!certificate.includes('private-inkwell-'))
  const custody=(await h.send(base+'/artifacts/custody',undefined,h.owner)).value
  assert.equal(custody.threads[0].messages.length,4,'explicit record custody includes the whole transcript under document authority')
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,restored=await harness({mailProvider:null})
  try {await restored.post('/api/inkwell/archive/restore',{archive});assert.deepEqual((await restored.send(base+'/artifacts/custody',undefined,restored.owner)).value.threads,custody.threads);assert.deepEqual((await restored.send(base+'/comments',undefined,restored.owner)).value.threads,[],'custody restore never reassigns a sender audience to the destination owner')}finally{await restored.close()}
  const savedRow=await h.db.prepare('SELECT data FROM iw_comment_threads WHERE id=?').bind(root).first()
  const damaged=JSON.parse(savedRow.data);damaged.messages[0].text='tampered text'
  await h.db.prepare('UPDATE iw_comment_threads SET data=? WHERE id=?').bind(JSON.stringify(damaged),root).run()
  assert.equal((await h.send(base+'/comments',undefined,senderCookie)).status,503)
  assert.equal((await h.send(base+'/verify',undefined,h.owner)).value.ok,false)
  await h.db.prepare('UPDATE iw_comment_threads SET data=? WHERE id=?').bind(savedRow.data,root).run()
  await h.command('envelope.hold',{id,reason:'Preserve private transcript'})
  await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'},h.owner,409)
  await h.command('envelope.lift_hold',{id})
  await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'})
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_comment_threads WHERE envelope_id=?').bind(id).first()).n,0)

  // A same-email correction and a return to an earlier email after reassignment are new identities.
  const epochId=await prepare(h,bytes,people,{allowReassignment:true}),supplement=await add(h,epochId,await pdf('Identity handbook'))
  await h.command('envelope.approve',{id:epochId,eligible:true})
  const original=await recipient(people[0].email);await h.agree(original.path,original.cookie)
  assert.equal((await h.send(supplementPath(original,supplement)+'/document',undefined,original.cookie)).status,200)
  await acknowledge(h,original,supplement)
  await post(original.path,{action:'create',page:1,text:'identity-bound-thread',audience:['recipient:0']},original.cookie)
  await h.command('envelope.correct',{id:epochId,signers:[{...people[0],name:'Mara Corrected'},people[1]]})
  assert.equal((await h.send(original.path+'/comments',undefined,original.cookie)).status,404)
  const corrected=await recipient(people[0].email);await h.agree(corrected.path,corrected.cookie)
  assert.deepEqual((await view(corrected.path,corrected.cookie)).threads,[])
  assert.ok((await h.send(corrected.path,undefined,corrected.cookie)).value.supplements.every(s=>!s.viewedAt&&!s.acknowledgedAt))
  await post(corrected.path,{action:'create',page:1,text:'second-identity-thread',audience:['recipient:0']},corrected.cookie)
  await h.post(corrected.path+'/reassign',{name:'Delegate',email:'delegate@comments.example',reason:'New responsible signer',commandId:crypto.randomUUID()},corrected.cookie)
  const delegate=await recipient('delegate@comments.example');await h.agree(delegate.path,delegate.cookie)
  assert.deepEqual((await view(delegate.path,delegate.cookie)).threads,[])
  await h.post(delegate.path+'/reassign',{...people[0],reason:'Return to original mailbox',commandId:crypto.randomUUID()},delegate.cookie)
  const returned=await recipient(people[0].email);await h.agree(returned.path,returned.cookie)
  assert.deepEqual((await view(returned.path,returned.cookie)).threads,[],'reusing the email after reassignment never restores old access')
  assert.ok((await h.send(returned.path,undefined,returned.cookie)).value.supplements.every(s=>!s.viewedAt&&!s.acknowledgedAt))
  // Existing signing-group doors select member identities, never everyone in the place implicitly.
  const members=[{name:'Ada Park',email:'ada@comment-group.example'},{name:'Ben Ortiz',email:'ben@comment-group.example'}]
  const group=(await h.command('account.signing_group',{name:'Comment reviewers',members})).result.groups[0]
  const groupEnvelope=await prepare(h,bytes,[{group:group.id}]);await h.command('envelope.approve',{id:groupEnvelope,eligible:true})
  const a=await recipient(members[0].email),b=await recipient(members[1].email);await h.agree(a.path,a.cookie);await h.agree(b.path,b.cookie)
  const groupThread=(await post(a.path,{action:'create',page:1,text:'Only Ada is selected.',audience:['recipient:0:0']},a.cookie)).value.result.thread
  assert.equal((await view(a.path,a.cookie)).threads.length,1);assert.deepEqual((await view(b.path,b.cookie)).threads,[])
  await post(b.path,{action:'reply',thread:groupThread,text:'Not selected'},b.cookie,404)
  await post(a.path,{action:'audience',thread:groupThread,audience:['recipient:0:0','recipient:0:1']},a.cookie)
  await post(b.path,{action:'reply',thread:groupThread,text:'Now explicitly selected.'},b.cookie)
  assert.deepEqual((await view(a.path,a.cookie)).threads[0].audience.map(p=>p.member),[0,1])
  assert.equal((await view(b.path,b.cookie)).threads[0].messages.length,2)
 }finally{await h.close()}
})

test('Ordered documents: two signers complete agreement and W-9 in one session each; view-only policy, separate executed files, one certificate and full draft/template/archive custody',async()=>{
 const h=await harness({mailProvider:null})
 try{
  const originals=await Promise.all(['Service agreement','W-9 taxpayer form','View-only service policy'].map(pdf))
  const documents=originals.map((bytes,i)=>({filename:['agreement.pdf','w9.pdf','policy.pdf'][i],pdfBase64:base64(bytes),mode:i===2?'view':'sign'}))
  const fields=[0,1].flatMap(document=>people.map((_,signer)=>({...field(signer),id:`d${document}-s${signer}`,document,page:0})))
  const input={title:'Three-document supplier agreement',filename:'combined.pdf',documents,signers:people,fields}
  await h.command('envelope.prepare',{...input,documents:Array(21).fill(documents[0])},h.owner,400)
  await h.command('envelope.prepare',{...input,fields:[...fields,{...field(0),id:'view-only-signature',document:2,page:0}]},h.owner,400)
  await h.command('envelope.prepare',{...input,fields:fields.filter(f=>f.document===0)},h.owner,400)
  const id=(await h.command('envelope.prepare',input)).result.id,base=`/api/inkwell/envelopes/${id}`
  let record=await envelope(h,id)
  assert.deepEqual(record.documents.map(d=>[d.filename,d.mode,d.pageStart,d.pages]),[['agreement.pdf','sign',0,1],['w9.pdf','sign',1,1],['policy.pdf','view',2,1]])
  assert.deepEqual(record.fields.map(f=>[f.document,f.documentPage,f.page]),[[0,0,0],[0,0,0],[1,0,1],[1,0,1]])
  for(let i=0;i<3;i++)assert.deepEqual((await h.send(base+`/artifacts/document-${i}`,undefined,h.owner)).bytes,originals[i])
  assert.equal((await h.send(base+'/artifacts/executed-0',undefined,h.owner)).status,404)
  // An optional document can be left without signing fields; a view-only one can never get one.
  await h.command('envelope.prepare',{...input,title:'Optional W-9',documents:documents.map((d,i)=>i===1?{...d,mode:'optional'}:d),fields:fields.filter(f=>f.document===0)})
  const first=await verify(h,(await h.command('envelope.approve',{id,eligible:true})).result.invitations[0]);await h.agree(first.path,first.cookie)
  assert.deepEqual((await h.send(first.path,undefined,first.cookie)).value.documents.map(d=>d.filename),['agreement.pdf','w9.pdf','policy.pdf'])
  assert.deepEqual((await h.send(first.path+'/documents/2',undefined,first.cookie)).bytes,originals[2])
  await h.post(first.path+'/sign',{values:{'d0-s0':people[0].name},consent:true,commandId:crypto.randomUUID()},first.cookie,400)
  await h.post(first.path+'/sign',{values:{'d0-s0':people[0].name,'d1-s0':people[0].name},consent:true,commandId:crypto.randomUUID()},first.cookie)
  assert.equal((await envelope(h,id)).status,'awaiting_signature')
  const second=await verify(h,(await h.command('envelope.invite',{id})).result.invitations[0]);await h.agree(second.path,second.cookie)
  await h.post(second.path+'/sign',{values:{'d0-s1':people[1].name,'d1-s1':people[1].name},consent:true,commandId:crypto.randomUUID()},second.cookie)
  record=await envelope(h,id);assert.equal(record.status,'completed')
  const combined=await PDFDocument.load((await h.send(base+'/artifacts/signed',undefined,h.owner)).bytes)
  assert.equal(combined.getPageCount(),3)
  for(let i=0;i<3;i++){
   const executed=(await h.send(base+`/artifacts/executed-${i}`,undefined,h.owner)).bytes
   assert.equal((await PDFDocument.load(executed)).getPageCount(),1);assert.equal(digest(executed),record.documents[i].signedSha256)
   const text=await pdfText(executed);assert.ok(text.includes(['Service agreement','W-9 taxpayer form','View-only service policy'][i]))
   if(i<2)for(const p of people)assert.ok(text.includes(p.name),'each required document carries both adopted signatures')
   else for(const p of people)assert.ok(!text.includes(p.name),'view-only policy has no signature overlay')
   assert.deepEqual((await h.send(second.path+`/artifacts/executed-${i}`,undefined,second.cookie)).bytes,executed)
  }
  const certificate=await pdfText((await h.send(base+'/artifacts/certificate',undefined,h.owner)).bytes)
  for(const d of record.documents){assert.ok(certificate.includes(d.filename));for(const hash of [d.sha256,d.signedSha256])assert.ok(certificate.replace(/\s/g,'').includes(hash))}
  assert.equal((await h.send(base+'/verify',undefined,h.owner)).value.ok,true)
  const copy=(await h.command('envelope.copy',{id})).result.id,template=(await h.command('template.from_envelope',{id})).result.id
  let definition=(await h.send('/api/inkwell/templates',undefined,h.owner)).value.templates.find(t=>t.id===template)
  await h.command('template.update',{...definition,documents:definition.documents.map((d,i)=>({existing:i,mode:d.mode})),supplements:undefined,title:'Edited multi-document template',pdfBase64:base64((await h.send(base+'/artifacts/original',undefined,h.owner)).bytes)})
  const use=(await h.command('template.use',{id:template,recipients:people})).result.id
  for(const fresh of [copy,use]){
   const e=await envelope(h,fresh);assert.deepEqual(e.documents.map(({signedSha256,...d})=>d),record.documents.map(({signedSha256,...d})=>d));assert.ok(e.documents.every(d=>!d.signedSha256));assert.ok(e.signers.every(s=>!s.signedAt))
   for(let i=0;i<3;i++)assert.deepEqual((await h.send(`/api/inkwell/envelopes/${fresh}/artifacts/document-${i}`,undefined,h.owner)).bytes,originals[i])
  }
  const copied=await envelope(h,copy),reordered=[{existing:2,mode:'view'},{existing:0,mode:'sign'},{existing:1,mode:'sign'}]
  await h.command('envelope.update',{...input,id:copy,documents:reordered,fields:copied.fields.map(f=>({...f,document:f.document+1,documentPage:0,page:0}))})
  assert.deepEqual((await envelope(h,copy)).documents.map(d=>d.filename),['policy.pdf','agreement.pdf','w9.pdf'])
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,destination=await harness({mailProvider:null})
  try{await destination.post('/api/inkwell/archive/restore',{archive});assert.equal((await destination.send(base+'/verify',undefined,destination.owner)).value.ok,true);const used=(await destination.command('template.use',{id:template,recipients:people})).result.id;for(let i=0;i<3;i++)assert.deepEqual((await destination.send(`/api/inkwell/envelopes/${used}/artifacts/document-${i}`,undefined,destination.owner)).bytes,originals[i])}finally{await destination.close()}
  await h.command('envelope.hold',{id,reason:'Keep all document custody'});await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'},h.owner,409);await h.command('envelope.lift_hold',{id});await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'})
  for(let i=0;i<3;i++)assert.equal((await h.send(base+`/artifacts/document-${i}`,undefined,h.owner)).status,404)
 }finally{await h.close()}
})

test('Document uploads: bounded private chunks refuse incomplete, foreign and conflicting parts, then preserve original bytes through prepare',async()=>{
 const h=await harness()
 try{
  const bytes=await pdf('Chunk-uploaded agreement'),u=(await h.post('/api/inkwell/documents/uploads',{filename:'upload.pdf',bytes:bytes.length})).value
  await h.post('/api/inkwell/documents/uploads',{filename:'upload.pdf',bytes:100*1024*1024+1},h.owner,400)
  await h.post('/api/inkwell/documents/uploads',{filename:'upload.pdf',bytes:bytes.length},'',401)
  const viewer=await h.invite('viewer@documents.example','member');await h.post('/api/inkwell/documents/uploads',{filename:'upload.pdf',bytes:bytes.length},viewer,403)
  const other=await h.invite('sender@documents.example','member'),actor=(await h.send('/api/inkwell',undefined,other)).value.actor
  await h.command('member.role',{operatorId:actor.id,role:'sender'})
  const input={title:'Uploaded contract',documents:[{uploadId:u.id,mode:'sign'}],signers:people.slice(0,1),fields:[field(0)]}
  await h.command('envelope.prepare',input,h.owner,409)
  await h.command('envelope.prepare',input,other,404)
  const put=async(cookie,body,status)=>{const response=await h.mf.dispatchFetch(h.origin+`/api/inkwell/documents/uploads/${u.id}/parts/0`,{method:'PUT',headers:{origin:h.origin,cookie,'content-type':'application/octet-stream'},body});assert.equal(response.status,status)}
  await put(other,bytes,404);await put(h.owner,new Uint8Array(bytes.length+1),400);await put(h.owner,bytes,200);await put(h.owner,bytes,200)
  const changed=bytes.slice();changed[changed.length-1]^=1;await put(h.owner,changed,409)
  const id=(await h.command('envelope.prepare',input)).result.id
  assert.deepEqual((await h.send(`/api/inkwell/envelopes/${id}/artifacts/document-0`,undefined,h.owner)).bytes,bytes)
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_pdf_upload_parts WHERE upload_id=?').bind(u.id).first()).n,0,'successful preparation consumes transient upload bytes')
 }finally{await h.close()}
})

function untar(bytes){
 const files=new Map();for(let offset=0;offset+512<=bytes.length;){const header=bytes.subarray(offset,offset+512);if(header.every(b=>b===0))break;const name=Buffer.from(header.subarray(0,100)).toString().split('\0')[0],size=parseInt(Buffer.from(header.subarray(124,136)).toString().replace(/\0.*$/,''),8);assert.ok(Number.isSafeInteger(size));files.set(name,bytes.slice(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512}return files
}
test('Document export: all or selected stable snapshots, PDF/certificate/audit/CSV fingerprints, byte-range resume, current admin authority and erasure invalidation',async()=>{
 const h=await harness()
 try{
  const main=await pdf('Exportable agreement'),one=await prepare(h,main,people.slice(0,1)),two=await prepare(h,await pdf('Other agreement'),people.slice(0,1))
  const finished=await prepare(h,await pdf('Executed export record'),people.slice(0,1))
  await h.command('envelope.approve',{id:finished,eligible:true})
  const invite=await h.mail(people[0].email,'Please sign:'),path=new URL(invite.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.replace('/sign/','/api/sign/')
  await h.post(path+'/code',{},'');const code=(await h.mail(people[0].email,'verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(path+'/verify',{code},'')).cookie;await h.agree(path,cookie);await sign(h,{path,cookie},0)
  const admin=await h.invite('export-admin@inkwell.example','admin'),viewer=await h.invite('export-viewer@inkwell.example','member')
  await h.post('/api/inkwell/exports',{scope:'all'},'',401);await h.post('/api/inkwell/exports',{scope:'all'},viewer,403)
  await h.post('/api/inkwell/exports',{scope:'selected',ids:['00000000-0000-0000-0000-000000000000']},h.owner,409)
  const selected=(await h.post('/api/inkwell/exports',{scope:'selected',ids:[one,finished]},admin)).value.id
  assert.equal((await h.send(`/api/inkwell/exports/${selected}`,undefined,admin)).value.records,2)
  assert.equal((await h.send(`/api/inkwell/exports/${selected}/download`,undefined,h.owner)).status,404,'another member cannot take over an export job')
  const first=await h.send(`/api/inkwell/exports/${selected}/download`,undefined,admin),files=untar(first.bytes)
  assert.deepEqual(files.get(`envelopes/${one}/original.pdf`),main);assert.ok(![...files.keys()].some(k=>k.includes(two)))
  const manifest=Buffer.from(files.get('fingerprints.ndjson')).toString().trim().split('\n').map(JSON.parse)
  for(const f of manifest){assert.equal(digest(files.get(f.path)),f.sha256);assert.equal(files.get(f.path).length,f.bytes)}
  assert.ok(Buffer.from(files.get('index.csv')).toString().includes(one));assert.ok(files.has(`envelopes/${one}/audit.json`));assert.ok(files.has(`envelopes/${one}/custody.json`));assert.ok(files.has(`envelopes/${finished}/signed.pdf`));assert.ok(files.has(`envelopes/${finished}/certificate.pdf`))
  const cut=Math.floor(first.bytes.length/2),a=await h.send(`/api/inkwell/exports/${selected}/download`,undefined,admin,{range:`bytes=0-${cut-1}`}),b=await h.send(`/api/inkwell/exports/${selected}/download`,undefined,admin,{range:`bytes=${cut}-`})
  assert.equal(a.status,206);assert.equal(b.status,206);assert.deepEqual(Buffer.concat([a.bytes,b.bytes]),Buffer.from(first.bytes));assert.equal(b.headers.get('accept-ranges'),'bytes')
  await h.command('envelope.update',{id:one,title:'Changed after export',filename:'changed.pdf',pdfBase64:base64(await pdf('Changed document')),signers:people.slice(0,1),fields:[field(0)]})
  assert.deepEqual((await h.send(`/api/inkwell/exports/${selected}/download`,undefined,admin)).bytes,first.bytes,'an interrupted export resumes the exact snapshot after a live edit')
  const all=(await h.post('/api/inkwell/exports',{scope:'all'})).value.id,allFiles=untar((await h.send(`/api/inkwell/exports/${all}/download`,undefined,h.owner)).bytes)
  assert.ok(allFiles.has(`envelopes/${one}/original.pdf`));assert.ok(allFiles.has(`envelopes/${two}/original.pdf`))
  await h.post('/api/inkwell/erase',{id:one,confirmation:'ERASE'})
  assert.equal((await h.send(`/api/inkwell/exports/${selected}/download`,undefined,admin)).status,410)
  assert.equal((await h.send(`/api/inkwell/exports/${all}/download`,undefined,h.owner)).status,410)
  await h.post(`/api/inkwell/exports/${all}/discard`,{})
  const adminId=(await h.send('/api/inkwell',undefined,admin)).value.actor.id;await h.post('/auth/operator/status',{operatorId:adminId,status:'inactive'})
  assert.equal((await h.send(`/api/inkwell/exports/${selected}/download`,undefined,admin)).status,401,'the first request after losing authority is refused')
 }finally{await h.close()}
})

test('Whole archive transfers: durable build cursor, range resume and idempotent part restore publish an empty destination only after all fingerprints pass',async()=>{
 const h=await harness({mailProvider:null}),destination=await harness({mailProvider:null})
 try{
  const original=await pdf('Resumable whole-installation record'),id=await prepare(h,original,people.slice(0,1))
  const base='/api/inkwell/archive/transfers',job=(await h.post(base+'/exports',{} ,h.owner,201)).value.id
  let state=(await h.post(`${base}/exports/${job}/advance`,{maxParts:1})).value
  const checkpoint=state.completed;assert.ok(checkpoint>0)
  assert.equal((await h.send(`${base}/exports/${job}`,undefined,h.owner)).value.completed,checkpoint)
  while(state.phase==='building')state=(await h.post(`${base}/exports/${job}/advance`,{expectedPart:state.completed,maxParts:1})).value
  assert.equal(state.phase,'complete')
  const download=await h.send(`${base}/exports/${job}/download`,undefined,h.owner),cut=113
  const first=await h.send(`${base}/exports/${job}/download`,undefined,h.owner,{range:`bytes=0-${cut-1}`}),rest=await h.send(`${base}/exports/${job}/download`,undefined,h.owner,{range:`bytes=${cut}-`})
  assert.equal(rest.status,206);assert.deepEqual(Buffer.concat([first.bytes,rest.bytes]),Buffer.from(download.bytes))
  const manifest=(await h.send(`${base}/exports/${job}/records/manifest`,undefined,h.owner)).value,closing=(await h.send(`${base}/exports/${job}/records/closing`,undefined,h.owner)).value
  assert.ok(!manifest.tables.some(t=>t.name.startsWith('iw_exit_')),'export working copies never enter installation custody')
  const restore=(await destination.post(base+'/imports',{manifest,confirmed:true},destination.owner,201)).value.id
  await destination.post(`${base}/imports/${restore}/finalize`,{contentHash:closing.contentHash,archiveHash:closing.archiveHash},destination.owner,400)
  assert.equal((await destination.send(`/api/inkwell/envelopes/${id}`,undefined,destination.owner)).status,404,'incomplete restore publishes no product record')
  const put=async(index,part,status=200)=>{const response=await destination.mf.dispatchFetch(destination.origin+`${base}/imports/${restore}/parts/${index}`,{method:'PUT',headers:{origin:destination.origin,cookie:destination.owner,'content-type':'application/json'},body:JSON.stringify(part)});assert.equal(response.status,status,await response.text())}
  for(let index=0;index<manifest.partCount;index++){const part=(await h.send(`${base}/exports/${job}/records/${index}`,undefined,h.owner)).value;await put(index,part);if(index===0){await put(index,part);const corrupt=structuredClone(part);corrupt.sha256='0'.repeat(64);await put(index,corrupt,400)}}
  const staged=(await destination.send(`${base}/imports/${restore}`,undefined,destination.owner)).value;assert.equal(staged.completed,manifest.partCount)
  const result=(await destination.post(`${base}/imports/${restore}/finalize`,{contentHash:closing.contentHash,archiveHash:closing.archiveHash})).value;assert.equal(result.phase,'complete')
  assert.deepEqual((await destination.send(`/api/inkwell/envelopes/${id}/artifacts/original`,undefined,destination.owner)).bytes,original)
  assert.equal((await destination.send(`/api/inkwell/envelopes/${id}/verify`,undefined,destination.owner)).value.ok,true)
  await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'})
  assert.equal((await h.send(`${base}/exports/${job}/download`,undefined,h.owner)).status,404,'erasure removes all transfer snapshots and download capabilities')
 }finally{await h.close();await destination.close()}
})

// ROUTE-012 exercises the same recipient session that powers the page and API view; no record-holder session leaks in.
test('Document visibility: offer-only candidate cannot fetch the memo through signing, PDFs, comments, completed links or attached copies; manager signs both and the certificate names each scope',async()=>{
 const h=await harness()
 try {
  const originals=await Promise.all(['Public offer letter','Confidential compensation memo'].map(pdf))
  const input={title:'Hiring offer',filename:'offer.pdf',documents:originals.map((b,i)=>({filename:i?'compensation-memo.pdf':'offer.pdf',pdfBase64:base64(b),mode:'sign',...(i?{visibleTo:{signers:[1],copies:[]}}:{})})),signers:people,fields:[{...field(0),id:'candidate',document:0,page:0},{...field(1),id:'manager-offer',document:0,page:0},{...field(1),id:'manager-memo',document:1,page:0}],copies:[{name:'Offer filing',email:'copy@visibility.example'}],allowPaperSigning:true}
  await h.command('envelope.prepare',{...input,documents:input.documents.map((d,i)=>i?{...d,visibleTo:{signers:[8],copies:[]}}:d)},h.owner,400)
  await h.command('envelope.prepare',{...input,fields:[...input.fields,{...field(0),id:'hidden-field',document:1,page:0}]},h.owner,400)
  const recipient=async email=>{const mail=await h.mail(email,'Please sign:'),path='/api'+new URL(mail.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname;await h.post(path+'/code',{},'');const cookie=(await h.post(path+'/verify',{code:(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie;await h.agree(path,cookie);return{path,cookie}}
  const checkPdf=async(bytes,count,hidden)=>{assert.equal((await PDFDocument.load(bytes)).getPageCount(),count);const text=await pdfText(bytes);assert.ok(text.includes('Public offer letter'));assert.equal(text.includes('Confidential compensation memo'),hidden)}
  const id=(await h.command('envelope.prepare',input)).result.id,base=`/api/inkwell/envelopes/${id}`
  await h.command('envelope.approve',{id,eligible:true})
  const candidate=await recipient(people[0].email)
  const state=(await h.send(candidate.path,undefined,candidate.cookie)).value
  assert.deepEqual(state.documents.map(d=>[d.index,d.filename]),[[0,'offer.pdf']]);assert.equal(state.pageSizes.length,1);assert.ok(!JSON.stringify(state).includes('memo'))
  assert.equal((await h.send(candidate.path+'/documents/1',undefined,candidate.cookie)).status,404)
  assert.equal((await h.send(base+'/artifacts/original',undefined,candidate.cookie)).status,401,'a signing session never borrows record-holder access')
  await checkPdf((await h.send(candidate.path+'/document',undefined,candidate.cookie)).bytes,1,false)
  await h.post(base+'/comments',{action:'create',page:1,text:'synthetic-inkwell-1',audience:['sender','recipient:0'],commandId:crypto.randomUUID()},h.owner,400)
  await h.post(base+'/comments',{action:'create',page:1,text:'synthetic-inkwell-2',audience:['sender','recipient:1'],commandId:crypto.randomUUID()},h.owner)
  assert.deepEqual((await h.send(candidate.path+'/comments',undefined,candidate.cookie)).value.threads,[])
  await h.post(candidate.path+'/comments',{action:'create',page:1,text:'synthetic-inkwell-3',audience:['recipient:0'],commandId:crypto.randomUUID()},candidate.cookie,400)
  await h.post(candidate.path+'/sign',{values:{candidate:people[0].name,'manager-memo':people[0].name},consent:true,commandId:crypto.randomUUID()},candidate.cookie,400)
  await h.post(candidate.path+'/sign',{values:{candidate:people[0].name},consent:true,commandId:crypto.randomUUID()},candidate.cookie)
  const manager=await recipient(people[1].email)
  assert.equal((await h.send(manager.path,undefined,manager.cookie)).value.documents.length,2)
  await checkPdf((await h.send(manager.path+'/document',undefined,manager.cookie)).bytes,2,true)
  await h.post(manager.path+'/sign',{values:{'manager-offer':people[1].name},consent:true,commandId:crypto.randomUUID()},manager.cookie,400)
  await h.post(manager.path+'/sign',{values:{'manager-offer':people[1].name,'manager-memo':people[1].name},consent:true,commandId:crypto.randomUUID()},manager.cookie)
  await checkPdf((await h.send(candidate.path+'/artifacts/signed',undefined,candidate.cookie)).bytes,1,false)
  assert.equal((await h.send(candidate.path+'/artifacts/executed-1',undefined,candidate.cookie)).status,404)
  const cert=await pdfText((await h.send(base+'/artifacts/certificate',undefined,h.owner)).bytes)
  assert.match(cert,/Visible documents: offer.pdf/);assert.match(cert,/Visible documents: offer.pdf; compensation-memo.pdf/)
  assert.ok(!(await pdfText((await h.send(candidate.path+'/artifacts/certificate',undefined,candidate.cookie)).bytes)).includes('memo'))
  for(const email of [people[0].email,'copy@visibility.example',people[1].email]) {
   const path='/api'+new URL((await h.mail(email,'Completed:')).text.match(/http:\/\/[^\s]+\/copy\/[^\s]+/)[0]).pathname
   assert.equal((await h.send(path+'/artifacts/signed')).status,401)
   await h.post(path+'/code',{},'');const cookie=(await h.post(path+'/verify',{code:(await h.mail(email,'Your Inkwell code for a completed copy')).text.match(/\b\d{6}\b/)[0]},'')).cookie
   const manager=email===people[1].email
   await checkPdf((await h.send(path+'/artifacts/signed',undefined,cookie)).bytes,manager?2:1,manager)
   assert.equal((await h.send(path+'/artifacts/executed-1',undefined,cookie)).status,manager?200:404)
   assert.equal((await h.send(path,undefined,cookie)).value.documents.length,manager?2:1)
  }
  assert.equal((await h.send(base+'/verify',undefined,h.owner)).value.ok,true)
  await h.command('envelope.send_copy',{id,recipients:[{name:'Later offer copy',email:'later@visibility.example'}],documents:[0]})
  const laterPath='/api'+new URL((await h.mail('later@visibility.example','Completed:')).text.match(/http:\/\/[^\s]+\/copy\/[^\s]+/)[0]).pathname
  await h.post(laterPath+'/code',{},'');const laterCookie=(await h.post(laterPath+'/verify',{code:(await h.mail('later@visibility.example','Your Inkwell code for a completed copy')).text.match(/\b\d{6}\b/)[0]},'')).cookie
  await checkPdf((await h.send(laterPath+'/artifacts/signed',undefined,laterCookie)).bytes,1,false)
  assert.equal((await h.send(laterPath+'/artifacts/executed-1',undefined,laterCookie)).status,404)
  assert.equal((await h.send(base+'/verify',undefined,h.owner)).value.ok,true,'a new explicit copy grant is audited without changing executed fingerprints')
  // The attachment delivery path must use the same per-party scope, including paper scan appendices.
  await h.command('account.completed_copies',{delivery:'attachment'})
  const second=(await h.command('envelope.prepare',{...input,title:'Attached hiring offer',signers:people.map((p,i)=>({...p,email:`attached-${i}@visibility.example`}))})).result.id
  await h.command('envelope.approve',{id:second,eligible:true})
  const a=await recipient('attached-0@visibility.example');await h.post(a.path+'/sign',{values:{candidate:people[0].name},consent:true,commandId:crypto.randomUUID()},a.cookie)
  const b=await recipient('attached-1@visibility.example'),scan=await PDFDocument.create();scan.addPage([612,792]).drawText('Confidential compensation memo scan');scan.addPage([612,792]).drawText('Manager wet signature')
  await paper(h,b,new Uint8Array(await scan.save()),200);await h.command('envelope.paper_review',{id:second,signer:1,accept:true})
  const attached=await h.mail('attached-0@visibility.example','Completed:'),managerMail=await h.mail('attached-1@visibility.example','Completed:')
  await checkPdf(Buffer.from(attached.attachments[0].content,'base64'),1,false)
  await checkPdf(Buffer.from(managerMail.attachments[0].content,'base64'),4,true)
  assert.ok(!(await pdfText(Buffer.from(attached.attachments[1].content,'base64'))).includes('memo'))
  const component=(await h.send(a.path+'/artifacts/executed-0',undefined,a.cookie)).bytes
  await checkPdf(component,1,false)
 }finally{await h.close()}
})

test('Document visibility custody: draft reordering, copy, template use/edit, corrections, archive restore and tamper refusal preserve recipient grants',async()=>{
 const h=await harness({mailProvider:null})
 try {
  const originals=await Promise.all(['Private manager memo','Public offer letter'].map(pdf)),documents=originals.map((b,i)=>({filename:i?'offer.pdf':'memo.pdf',pdfBase64:base64(b),mode:'sign',...(i?{}:{visibleTo:{signers:[1],copies:[]}})}))
  const fields=[{...field(0),id:'candidate',document:1,page:0},{...field(1),id:'manager-offer',document:1,page:0},{...field(1),id:'manager-memo',document:0,page:0}]
  const input={title:'Scoped custody',filename:'combined.pdf',documents,signers:people,fields},id=(await h.command('envelope.prepare',input)).result.id
  const first=await verify(h,(await h.command('envelope.approve',{id,eligible:true})).result.invitations[0]);await h.agree(first.path,first.cookie)
  let view=(await h.send(first.path,undefined,first.cookie)).value
  assert.equal(view.fields[0].page,0);assert.equal(view.documents[0].index,1,'a leading hidden document does not leave a blank page')
  await h.command('envelope.correct',{id,signers:[{...people[0],email:'replacement@visibility.example'},people[1]]})
  assert.equal((await h.send(first.path,undefined,first.cookie)).status,404)
  const replaced=await verify(h,(await h.command('envelope.invite',{id})).result.invitations[0]);await h.agree(replaced.path,replaced.cookie)
  assert.equal((await h.send(replaced.path+'/documents/0',undefined,replaced.cookie)).status,404)
  await h.command('envelope.void',{id,reason:'Preserve scoped custody without executing'})
  const copy=(await h.command('envelope.copy',{id})).result.id,template=(await h.command('template.from_envelope',{id})).result.id
  let definition=(await h.send('/api/inkwell/templates',undefined,h.owner)).value.templates.find(t=>t.id===template)
  await h.command('template.update',{...definition,supplements:undefined,documents:definition.documents.map((d,i)=>({existing:i,mode:d.mode,visibleTo:d.visibleTo})),pdfBase64:base64((await h.send(`/api/inkwell/envelopes/${id}/artifacts/original`,undefined,h.owner)).bytes)})
  const use=(await h.command('template.use',{id:template,recipients:people})).result.id
  for(const fresh of [copy,use])assert.deepEqual((await envelope(h,fresh)).documents.map(d=>d.visibleTo),[{signers:[1],copies:[]},undefined])
  const copyRecord=await envelope(h,copy)
  await h.command('envelope.update',{...input,id:copy,documents:[{existing:1,mode:'sign'},{existing:0,mode:'sign',visibleTo:{signers:[1],copies:[]}}],fields:copyRecord.fields.map(f=>({...f,document:1-f.document,documentPage:0}))})
  assert.deepEqual((await envelope(h,copy)).documents.map(d=>d.visibleTo),[undefined,{signers:[1],copies:[]}])
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,destination=await harness({mailProvider:null})
  try {await destination.post('/api/inkwell/archive/restore',{archive});for(const fresh of [id,copy,use]){assert.equal((await destination.send(`/api/inkwell/envelopes/${fresh}/verify`,undefined,destination.owner)).value.ok,true);assert.deepEqual((await envelope(destination,fresh)).documents,(await envelope(h,fresh)).documents)}}finally{await destination.close()}
  const stored=await envelope(h,id);stored.documents[0].visibleTo.signers.push(0)
  await h.db.prepare('UPDATE iw_envelopes SET data=? WHERE id=?').bind(JSON.stringify(stored),id).run()
  const damaged=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,refused=await harness({mailProvider:null})
  try{const result=await refused.send('/api/inkwell/archive/restore',{archive:damaged},refused.owner);assert.ok([400,409].includes(result.status),'a valid-checksum archive cannot widen a recipient audience');assert.equal((await refused.send(`/api/inkwell/envelopes/${id}`,undefined,refused.owner)).status,404)}finally{await refused.close()}
 }finally{await h.close()}
})

test('Document visibility policy: owner-only hide-without-fields narrows defaults and free-form placements use only visible pages',async()=>{
 const h=await harness()
 try {
  const docs=await Promise.all(['Confidential memo','Public offer letter'].map(pdf)),documents=docs.map((b,i)=>({filename:i?'offer.pdf':'memo.pdf',pdfBase64:base64(b),mode:'optional'})),fields=[{...field(0),document:1,page:0},{...field(1),document:0,page:0}],input={title:'Policy visibility',filename:'combined.pdf',documents,signers:people,fields,copies:[{name:'Filing copy',email:'filing@visibility.example'}]}
  const initial=(await h.command('envelope.prepare',input)).result.id
  assert.ok((await envelope(h,initial)).documents.every(d=>!d.visibleTo),'default recipients see every document')
  const viewer=await h.invite('viewer@visibility.example','member')
  await h.command('account.envelope_defaults',{expiryDays:120,reminders:null,expectedVersion:0,hideDocumentsWithoutFields:true},viewer,403)
  await h.command('account.envelope_defaults',{expiryDays:120,reminders:null,expectedVersion:0,hideDocumentsWithoutFields:true})
  const id=(await h.command('envelope.prepare',input)).result.id
  assert.deepEqual((await envelope(h,id)).documents.map(d=>d.visibleTo),[{signers:[1],copies:[]},{signers:[0],copies:[]}])
  assert.ok((await envelope(h,initial)).documents.every(d=>!d.visibleTo),'changing policy never rewrites earlier approvals or drafts')
  await h.command('account.envelope_defaults',{expiryDays:120,reminders:null,expectedVersion:1,hideDocumentsWithoutFields:false})
  await h.command('account.freeform',{enabled:true,expectedVersion:0})
  const free=(await h.command('envelope.prepare',{...input,freeForm:true,fields:[],documents:documents.map((d,i)=>({...d,mode:'sign',visibleTo:{signers:i?[0]:[1],copies:[]}}))})).result.id
  await h.command('envelope.approve',{id:free,eligible:true})
  const mail=await h.mail(people[0].email,'Please sign:'),path='/api'+new URL(mail.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname;await h.post(path+'/code',{},'');const first={path,cookie:(await h.post(path+'/verify',{code:(await h.mail(people[0].email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie};await h.agree(first.path,first.cookie)
  const own=[{...field(0),id:'placed',page:0}]
  await h.post(first.path+'/progress',{fields:own.map(f=>({...f,page:1})),values:{placed:people[0].name}},first.cookie,400)
  await h.post(first.path+'/progress',{fields:own,values:{placed:people[0].name}},first.cookie)
  assert.equal((await h.send(first.path,undefined,first.cookie)).value.fields[0].page,0)
  await h.post(first.path+'/sign',{fields:own,values:{placed:people[0].name},consent:true,commandId:crypto.randomUUID()},first.cookie)
  assert.equal((await envelope(h,free)).fields[0].page,1,'visible placement maps back to the canonical document')
 }finally{await h.close()}
})
