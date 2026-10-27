import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { harness } from './harness.mjs'
import { googleEdge } from './google-edge.mjs'
const field=(signer=0)=>({id:'signature-'+signer,label:'Signature',type:'signature',signer,page:0,x:.1,y:.5+signer*.15,width:.4,height:.05})
async function setup(){const edge=await googleEdge(),h=await harness({bindings:{GOOGLE_ACCESS_TOKEN:'synthetic-inkwell-1'},networkEdge:edge.networkEdge});return{edge,h}}
async function source(h,body){return (await h.post('/api/inkwell/google',body)).value}
async function ownSign(h,id){await h.command('envelope.approve',{id,eligible:true});const opened=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()}),path='/api'+new URL(opened.value.result.signing.url).pathname;await h.agree(path,opened.cookie);await h.post(path+'/sign',{values:{'signature-0':'Harbour Owner'},consent:true,commandId:crypto.randomUUID()},opened.cookie)}

test('Google Drive source completes through its template and files matching executed PDF and certificate bytes to the consented folder',async()=>{
 const {edge,h}=await setup()
 try{
  const imported=await source(h,{kind:'drive',id:'drive-pdf'})
  const template=(await h.command('template.save',{title:'Drive agreement',filename:imported.filename,pdfBase64:imported.pdfBase64,roles:[{role:'Client',order:1}],fields:[field()]})).result
  const settings={commandId:crypto.randomUUID(),templateId:template.id,provider:'google',folder:'completed-folder',enabled:true,consent:true,expectedVersion:0}
  await h.post('/api/inkwell/filing',{...settings,consent:false},h.owner,400)
  await h.post('/api/inkwell/filing',settings)
  const id=(await h.command('template.use',{id:template.id,recipients:[{name:'Harbour Owner',email:'owner@harbour.example'}]})).result.id
  edge.loseUpload()
  await ownSign(h,id)
  let view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  assert.equal(view.jobs.filter(j=>j.state==='uncertain').length,1,'a lost upload response stays visible')
  edge.corrupt();await h.post('/api/inkwell/filing/retry',{id});view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  assert.equal(view.jobs.filter(j=>j.state==='uncertain').length,1,'conflicting remote bytes never count as filed')
  edge.repair();await h.post('/api/inkwell/filing/retry',{id});view=(await h.send('/api/inkwell/filing',undefined,h.owner)).value
  assert.deepEqual(view.jobs.map(j=>[j.provider,j.folder,j.kind,j.state]).sort(),[['google','completed-folder','certificate','filed'],['google','completed-folder','signed','filed']])
  assert.equal(edge.files.length,2)
  for(const kind of ['signed','certificate']){
   const remote=edge.files.find(f=>f.name===`inkwell-${id}-${kind}.pdf`),artifact=await h.send(`/api/inkwell/envelopes/${id}/artifacts/${kind}`,undefined,h.owner)
   assert.ok(remote);assert.deepEqual(remote.data,Buffer.from(artifact.bytes));assert.equal(remote.sha256Checksum,createHash('sha256').update(artifact.bytes).digest('hex'))
  }
  await Promise.all([h.post('/api/inkwell/filing/retry',{id}),h.post('/api/inkwell/filing/retry',{id})]);assert.equal(edge.files.length,2)
  assert.equal((await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope.originalSha256,edge.hash())
 }finally{await h.close()}
})

test('Google Docs exports actual PDF bytes whose independent fingerprint is bound by preparation; unsafe sources and authority are refused',async()=>{
 const {edge,h}=await setup()
 try{
  assert.equal((await h.send('/api/inkwell/google',{kind:'drive',id:'google-doc'})).status,401)
  const viewer=await h.invite('viewer@harbour.example','member')
  await h.post('/api/inkwell/google',{kind:'drive',id:'google-doc'},viewer,403)
  await h.post('/api/inkwell/google',{kind:'drive',id:'../escape'},h.owner,400)
  await h.post('/api/inkwell/google',{kind:'drive',id:'google-doc'},h.owner,403,{origin:'https://untrusted.example'})
  edge.fail();await h.post('/api/inkwell/google',{kind:'drive',id:'google-doc'},h.owner,502)
  const imported=await source(h,{kind:'drive',id:'google-doc'})
  assert.equal(imported.converted,true);assert.equal(imported.filename,'Client proposal.pdf');assert.deepEqual(Buffer.from(imported.pdfBase64,'base64'),edge.bytes)
  const id=(await h.command('envelope.prepare',{title:'Google Doc proposal',...imported,signers:[{name:'Harbour Owner',email:'owner@harbour.example'}],fields:[field()]})).result.id
  const stored=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  assert.equal(stored.originalSha256,createHash('sha256').update(edge.bytes).digest('hex'))
  assert.ok(edge.requests.some(r=>r.path.endsWith('/export')))
 }finally{await h.close()}
})

test('Gmail attachment proposes sender and Cc without the connected member and sends to the reviewed participants',async()=>{
 const {edge,h}=await setup()
 try{
  const {gmailCard}=await import('./google-addon-harness.mjs'),card=await gmailCard(h.origin)
  assert.ok(card.widgets.some(widget=>widget.text==='client-agreement.pdf'))
  const open=new URL(card.widgets.find(widget=>widget.text==='Prepare in Inkwell').url)
  assert.equal(open.origin,h.origin);assert.equal(open.searchParams.get('gmailMessage'),'gmail-message')
  assert.equal(open.searchParams.get('gmailAction'),'send')
  const message=await source(h,{kind:'message',id:open.searchParams.get('gmailMessage')})
  assert.deepEqual(message.attachments,[{id:'attachment-pdf',filename:'client-agreement.pdf',bytes:edge.bytes.length}])
  assert.deepEqual(message.participants,[{name:'Mara Quinn',email:'mara@client.example'},{name:'Lee Chen',email:'lee@client.example'}])
  await h.post('/api/inkwell/google',{kind:'attachment',id:'gmail-message',attachmentId:'other'},h.owner,404)
  const attachmentId='a'.repeat(350);edge.message.payload.parts[0].body.attachmentId=attachmentId
  const imported=await source(h,{kind:'attachment',id:'gmail-message',attachmentId}),quiet=h.sent()
  const id=(await h.command('envelope.prepare',{title:'Gmail agreement',...imported,signers:imported.participants.map(person=>({...person,order:1})),fields:[field(),field(1)]})).result.id
  assert.equal(h.sent(),quiet,'importing and preparing never sends')
  await h.command('envelope.approve',{id,eligible:true})
  const invitations=h.attempted().slice(quiet).filter(m=>m.subject.startsWith('Please sign:'))
  assert.deepEqual(invitations.flatMap(m=>m.to).sort(),['lee@client.example','mara@client.example'])
 }finally{await h.close()}
})

test('Gmail self-signs a separate message attachment without sending any mail to the signer',async()=>{
 const {edge,h}=await setup()
 try{
  // A different current provider message, using the same attachment shape.
  edge.message.id='second-message';edge.message.payload.headers[0].value='Different Client <other@client.example>'
  const {gmailCard}=await import('./google-addon-harness.mjs'),card=await gmailCard(h.origin,'second-message'),open=new URL(card.widgets.find(widget=>widget.text==='Sign it myself').url)
  assert.equal(open.searchParams.get('gmailAction'),'self')
  const imported=await source(h,{kind:'attachment',id:open.searchParams.get('gmailMessage'),attachmentId:'attachment-pdf'}),quiet=h.sent()
  const id=(await h.command('envelope.prepare',{title:'Gmail self-sign',...imported,signers:[{name:'Harbour Owner',email:'owner@harbour.example'}],fields:[field()]})).result.id
  await ownSign(h,id)
  assert.equal(h.sent(),quiet,'self-signing sends no message, including completion mail')
  const envelope=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  assert.equal(envelope.status,'completed');assert.ok(envelope.signers[0].signedAt)
  assert.equal(envelope.originalSha256,edge.hash())
 }finally{await h.close()}
})

test('Gmail authenticated reply intake inherits current grants, contact and identity gates, private custody, holds, archive and erasure fences',async()=>{
 const {googleReplyEdge}=await import('./google-reply-edge.mjs'),sourceEdge=await googleEdge(),edge=googleReplyEdge(sourceEdge),h=await harness({bindings:{GOOGLE_ACCESS_TOKEN:'synthetic-inkwell-1',GOOGLE_PUBSUB_EMAIL:'synthetic-inkwell-3@service.example',GOOGLE_PUBSUB_SUBSCRIPTION:['projects','synthetic-inkwell-4','subscriptions','synthetic-inkwell-5'].join('/'),GOOGLE_MAILBOX:'owner@harbour.example',GOOGLE_HISTORY_START:'100',MAIL_INBOUND_DOMAIN:'replies.harbour.example'},networkEdge:edge.networkEdge})
 try{
  const imported=await source(h,{kind:'drive',id:'drive-pdf'}),id=(await h.command('envelope.prepare',{title:'Gmail reply custody',...imported,signers:[{name:'Mara Quinn',email:'mara@client.example'}],fields:[field()]})).result.id
  await h.command('envelope.approve',{id,eligible:true})
  const record=async()=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope,ownerId=(await record()).createdBy
  const view=async(cookie=h.owner)=>(await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,cookie)).value
  const grant={id,enabled:true,channels:['email'],maxContacts:1,days:[1,2,3,4,5],startHour:9,endHour:17,escalationOwner:ownerId}
  const viewer=await h.invite('reader@harbour.example','member')
  await h.command('envelope.followup',grant,viewer,403)
  await h.command('envelope.followup',grant);await h.command('envelope.resend',{id,signer:0})
  const invitation=await h.mail('mara@client.example','Please sign:'),address=invitation.reply_to??invitation.headers['Reply-To']
  assert.match(address,/^reply\+[A-Za-z0-9_-]{43}@/)
  const post=async(options={},status=200)=>{const push=edge.push(h.origin,options);return h.post('/api/inkwell/google/replies',push.body,'',status,push.headers)}
  edge.add({from:'Mara Quinn <mara@client.example>',to:address,text:'Please review clause 4.',attachments:[{name:'private-note.txt',type:'text/plain',bytes:Buffer.from('Private attachment'),external:true}]})
  await h.post('/api/inkwell/google/replies',{},'',401)
  await post({tamper:true},401);await post({claims:{aud:'https://untrusted.example'}},401);await post({claims:{email:'other@service.example'}},401);await post({published:new Date(Date.now()-3600_000).toISOString()},401);await post({email:'another@harbour.example'},403)
  edge.fail();await post({},502)
  const replay='synthetic-inkwell-6';await post({eventId:replay});await post({eventId:replay},409)
  let state=await view();assert.equal(state.replies.length,1);assert.equal(state.replies[0].text,'Please review clause 4.');assert.equal(state.replies[0].verified,true);assert.equal(state.states[0].paused,true)
  assert.deepEqual(state.replies[0].attachments,[{name:'private-note.txt',type:'text/plain',size:18,sha256:createHash('sha256').update('Private attachment').digest('hex'),status:'not kept by Inkwell'}])
  assert.equal((await view(viewer)).replies,undefined)
  const token=(await h.command('agent.issue')).result.token
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/followup`,undefined,'',{authorization:'Bearer '+token})).status,403)
  await h.command('envelope.followup_resume',{id,signer:0});assert.equal((await view()).states[0].paused,false)
  edge.add({from:'attacker@client.example',to:address,text:'A forged reply must not pause.'});await post();state=await view();assert.equal(state.replies.length,2);assert.equal(state.replies[1].verified,false);assert.equal(state.states[0].paused,false)
  edge.add({from:'mara@client.example',to:address,text:'Provider failed authentication.',headers:{'authentication-results':'gmail.example; dmarc=fail'}});await post();assert.equal((await view()).replies.at(-1).verified,false)
  const unknown=edge.add({from:'mara@client.example',to:'reply+'+'a'.repeat(43)+'@replies.harbour.example',text:'Unknown capability'});await post();assert.equal((await view()).replies.length,3);assert.equal(edge.reads.some(read=>read.id===unknown&&read.format==='full'),false,'unknown capabilities never fetch message bodies')
  await h.command('envelope.resend',{id,signer:0,newLink:true})
  const rotated=edge.add({from:'mara@client.example',to:address,text:'Old invitation capability'});await post();assert.equal((await view()).replies.length,3);assert.equal(edge.reads.some(read=>read.id===rotated&&read.format==='full'),false,'rotated capabilities never fetch message bodies')
  const fresh=await h.mail('mara@client.example','Please sign:'),current=fresh.reply_to??fresh.headers['Reply-To']
  edge.add({from:'mara@client.example',to:current,text:'é'.repeat(250001)});await post();assert.equal((await view()).replies.at(-1).text,null);assert.equal((await view()).replies.at(-1).tooLarge,true)
  await h.command('envelope.followup',{id,enabled:false});const revoked=edge.add({from:'mara@client.example',to:current,text:'Revoked grant'});await post();assert.equal((await view()).replies.length,4);assert.equal(edge.reads.some(read=>read.id===revoked&&read.format==='full'),false,'revoked grants never fetch message bodies')
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  assert.ok(JSON.stringify(archive).includes('Please review clause 4.'));assert.ok(!JSON.stringify(archive).includes(address.match(/reply\+([^@]+)/)[1]));assert.equal(JSON.parse(archive.ndjson.split('\n')[0]).tables.some(table=>table.name==='iw_google_reply_state'),false,'the active mailbox cursor is excluded from exported data')
  const restored=await harness();try{await restored.post('/api/inkwell/archive/restore',{archive});assert.deepEqual((await restored.send(`/api/inkwell/envelopes/${id}/followup`,undefined,restored.owner)).value.replies.map(reply=>reply.text).sort(),['Please review clause 4.','A forged reply must not pause.','Provider failed authentication.',null].sort());assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM iw_google_reply_state').first()).n,0);assert.equal((await restored.db.prepare('SELECT COUNT(*) AS n FROM iw_followup_capabilities').first()).n,0)}finally{await restored.close()}
  const audit=(await h.send('/api/inkwell/audit?target='+encodeURIComponent('envelope:'+id),undefined,h.owner)).value
  assert.ok(!JSON.stringify(audit).includes('Please review clause 4.')&&!JSON.stringify(h.logs()).includes('Please review clause 4.'));assert.ok(!JSON.stringify(h.attempted()).includes('Please review clause 4.'))
  await h.command('envelope.hold',{id,reason:'Preserve reply evidence'})
  const signer='/api/sign/'+new URL(fresh.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  await h.post(signer+'/code',{},'');const cookie=(await h.post(signer+'/verify',{code:(await h.mail('mara@client.example','verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie;await h.agree(signer,cookie)
  await h.post(signer+'/decline',{reason:'Needs review',commandId:crypto.randomUUID()},cookie)
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),certificate=await getDocument({data:(await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes,useSystemFonts:true}).promise
  let certificateText='';for(let page=1;page<=certificate.numPages;page++)certificateText+=(await(await certificate.getPage(page)).getTextContent()).items.map(item=>item.str).join(' ');await certificate.cleanup()
  assert.ok(!certificateText.includes('Please review clause 4.')&&!certificateText.includes('private-note.txt'),'certificate never carries private Gmail replies')
  await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'},h.owner,409)
  await h.command('envelope.lift_hold',{id});await h.post('/api/inkwell/erase',{id,confirmation:'ERASE'})
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_followup_replies WHERE envelope_id=?').bind(id).first()).n,0)
  const laterJournal=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,freshInstall=await harness();try{await freshInstall.post('/api/inkwell/archive/restore',{archive,laterJournal},freshInstall.owner,400)}finally{await freshInstall.close()}
 }finally{await h.close()}
})
