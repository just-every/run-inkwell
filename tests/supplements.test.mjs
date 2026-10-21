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
  assert.ok(audit.events.some(e=>e.action==='comment.audience_changed'));assert.ok(audit.events.some(e=>e.action==='comment.created'));assert.ok(audit.events.some(e=>e.action==='comment.replied'))
  for(const secret of ['private-inkwell-comment-1','private-inkwell-reply-2',people[0].email])assert.ok(!JSON.stringify(audit).includes(secret),'account comment audit is opaque metadata only')
  const certificate=await pdfText((await h.send(base+'/artifacts/certificate',undefined,h.owner)).bytes)
  assert.ok(!certificate.includes('private-inkwell-'))
  const custody=(await h.send(base+'/artifacts/custody',undefined,h.owner)).value
  assert.equal(custody.threads[0].messages.length,4,'explicit record custody includes the whole transcript under document authority')
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,restored=await harness({mailProvider:null})
  try {await restored.post('/api/inkwell/archive/restore',{archive});assert.deepEqual((await restored.send(base+'/artifacts/custody',undefined,restored.owner)).value.threads,custody.threads);assert.deepEqual((await restored.send(base+'/comments',undefined,restored.owner)).value.threads,[],'custody restore never reassigns a sender audience to the destination owner')}finally{await restored.close()}
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
 }finally{await h.close()}
})
