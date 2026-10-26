import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

/** Direct public-door cases complement the built iframe journey; only mail is faked. */
export async function embeddingAuthorityCases(){
 console.log('Embedding authority: starting worker')
 const start=Date.UTC(2026,9,26,12),h=await harness({now:start})
 console.log('Embedding authority: worker ready')
 const origin='https://portal.harbour.example',base='/api/inkwell',grant=(value=origin,enabled=true)=>h.post(base+'/embed-origins',{origin:value,enabled,consent:true}),issue=(cookie=h.owner,input={})=>h.post(base+'/embeds',{origin,mode:'prepare',consent:true,...input},cookie)
 const redeem=async(url,status=303)=>{const r=await h.send(new URL(url).pathname,undefined,'');assert.equal(r.status,status,JSON.stringify(r.value));return{...r,id:r.headers.get('location')?.split('/').at(-1)}}
 const api=(session,path,body,cookie=session.cookie)=>h.send('/api/embed/'+session.id+path,body,cookie)
 const signingTokens=[]
 const invitation=async()=>{const token=new URL((await h.mail('embed-mara@harbour.example','Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1);signingTokens.push(token);return token}
 try{
  await h.post(base+'/embeds',{origin,mode:'prepare',consent:true},h.owner,403)
  const admin=await h.invite('embed-admin@harbour.example','admin'),viewer=await h.invite('embed-viewer@harbour.example','member'),person=(await h.send(base,undefined,viewer)).value.actor
  await h.post(base+'/embed-origins',{origin,enabled:true,consent:true},viewer,403)
  await h.command('member.role',{operatorId:person.id,role:'sender'})
  await h.post(base+'/embeds',{origin,mode:'prepare',consent:true},viewer,403)
  const agent=(await h.command('agent.issue')).result.token
  assert.equal((await h.send(base+'/embeds',{origin,mode:'prepare',consent:true},'',{authorization:'Bearer '+agent})).status,403,'a preparation agent cannot authorize an embedded launch')
  await h.post(base+'/embed-origins',{origin:'https://PORTAL.HARBOUR.EXAMPLE:443/',enabled:true,consent:true},admin)
  assert.deepEqual((await h.send(base+'/embed-origins',undefined,h.owner)).value.origins,[origin])
  for(const invalid of ['null','https://*.harbour.example','https://portal.harbour.example/path','https://user@portal.harbour.example','https://portal.harbour.example?x=1','https://portal.harbour.example#x'])await h.post(base+'/embed-origins',{origin:invalid,enabled:true,consent:true},h.owner,400)
  for(const unlisted of ['http://portal.harbour.example','https://sub.portal.harbour.example','https://portal.harbour.example:444'])await h.post(base+'/embeds',{origin:unlisted,mode:'prepare',consent:true},h.owner,unlisted.startsWith('http:')?400:403)
  console.log('Embedding authority: origins and roles passed')
  const launched=(await issue()).value,replies=await Promise.all(Array.from({length:4},()=>h.send(new URL(launched.url).pathname)))
  assert.equal(replies.filter(r=>r.status===303).length,1,'one concurrent redemption succeeds')
  assert.ok(replies.filter(r=>r.status!==303).every(r=>[403,409].includes(r.status)))
  const winner=replies.find(r=>r.status===303),session={id:winner.headers.get('location').split('/').at(-1),cookie:winner.cookie}
  assert.ok(winner.headers.get('set-cookie').includes('HttpOnly')&&winner.headers.get('set-cookie').includes('Partitioned'))
  assert.equal((await api(session,'/meta')).status,200)
  assert.equal((await api(session,'/meta',undefined,'')).status,401,'blocked cookies never expose a session')
  assert.equal((await api(session,'/api/inkwell/envelopes')).status,403)
  assert.equal((await api(session,'/api/inkwell/api-keys')).status,403)
  assert.equal((await h.send('/api/embed/'+session.id+'/close',{},session.cookie,{origin:'https://attacker.example'})).status,403)
  const lost=(await issue()).value;await redeem(lost.url);await redeem(lost.url,403)
  await redeem(new URL('/embed/'+'b'.repeat(64),h.origin).href,403)
  const recovery=await redeem((await issue()).value.url);assert.equal((await api(recovery,'/meta')).status,200)
  assert.equal((await api(recovery,'/close',{})).status,200);assert.equal((await api(recovery,'/meta')).status,403,'closing refuses the next read')
  console.log('Embedding authority: redemption passed')
  const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('Harbour consulting deposit agreement',{x:40,y:720});const bytes=await pdf.save()
  const uploadSession=await redeem((await issue()).value.url),upload=(await api(uploadSession,'/api/inkwell/documents/uploads',{filename:'agreement.pdf',bytes:bytes.length})).value
  const part=await h.mf.dispatchFetch(h.origin+'/api/embed/'+uploadSession.id+'/api/inkwell/documents/uploads/'+upload.id+'/parts/0',{method:'PUT',headers:{origin:h.origin,cookie:uploadSession.cookie,'content-type':'application/octet-stream','x-inkwell-test-time':String(start)},body:bytes});assert.equal(part.status,200)
  const inspected=await api(uploadSession,'/api/inkwell/documents/fields',{uploadId:upload.id});assert.equal(inspected.status,200)
  assert.equal((await api(session,'/api/inkwell/documents/fields',{uploadId:upload.id})).status,404,'another embedded allocation cannot inspect staged bytes')
  const prepared={title:'Harbour embedded agreement',filename:'agreement.pdf',pdfBase64:Buffer.from(bytes).toString('base64'),signers:[{name:'Mara Quinn',email:'embed-mara@harbour.example'}],fields:[{id:'signature',label:'Signature',type:'signature',signer:0,page:0,x:.1,y:.6,width:.4,height:.06},{id:'private-reference',label:'Private reference',type:'text',masked:true,prefill:{value:'synthetic-inkwell-1',source:'synthetic-inkwell-2'},signer:0,page:0,x:.1,y:.4,width:.4,height:.06}]}
  const uploaded=await api(uploadSession,'/api/inkwell/commands',{command:'envelope.prepare',commandId:'upload-proof',input:{...prepared,documents:[{uploadId:upload.id,mode:'sign'}]}});assert.equal(uploaded.status,200,JSON.stringify(uploaded.value))
  const saved=await api(session,'/api/inkwell/commands',{command:'envelope.prepare',commandId:'first',input:prepared});assert.equal(saved.status,200,JSON.stringify(saved.value))
  const envelope=saved.value.result.id,retried=await api(session,'/api/inkwell/commands',{command:'envelope.prepare',commandId:'retry',input:prepared});assert.equal(retried.value.result.id,envelope)
  assert.equal(await h.mail('embed-mara@harbour.example','Please sign:'),undefined,'opening and preparing sends no invitation')
  assert.equal((await api(session,'/api/inkwell/commands',{command:'envelope.approve',commandId:'without-consent',input:{id:envelope}})).status,400)
  assert.equal((await api(session,'/api/inkwell/commands',{command:'agent.issue',commandId:'credential',input:{}})).status,403)
  const sent=await api(session,'/api/inkwell/commands',{command:'envelope.approve',commandId:'send',input:{id:envelope,eligible:true}});assert.equal(sent.status,200,JSON.stringify(sent.value));assert.ok(await h.mail('embed-mara@harbour.example','Please sign:'))
  console.log('Embedding authority: preparation passed')
  const archive=(await h.send(base+'/archive',undefined,h.owner)).value
  const serialized=JSON.stringify(archive);assert.ok(!archive.ndjson.split('\n').filter(Boolean).map(line=>JSON.parse(line)).flatMap(record=>record.items??[]).some(item=>item.kind==='row'&&item.table.startsWith('iw_embed_'))&&!serialized.includes(launched.url),'archives exclude active embedding custody')
  const restored=await harness({now:start})
  try{await restored.post(base+'/archive/restore',{archive});assert.deepEqual((await restored.send(base+'/embed-origins',undefined,restored.owner)).value.origins,[]);assert.equal((await restored.send('/api/embed/'+session.id+'/meta',undefined,session.cookie)).status,403)}finally{await restored.close()}
  const beforeErasure=await redeem((await issue(h.owner,{mode:'sign',token:await invitation()})).value.url)
  await h.command('envelope.correct',{id:envelope,signers:[{name:'Mara Quinn',email:'replacement@harbour.example'}]})
  assert.equal((await api(beforeErasure,'/meta')).status,403,'recipient replacement refuses the next embedded read')
  await h.command('envelope.correct',{id:envelope,signers:[{name:'Mara Quinn',email:'embed-mara@harbour.example'}]})
  assert.equal((await api(beforeErasure,'/meta')).status,403,'restoring the earlier address never revives its old embedded authority')
  const current=await redeem((await issue(h.owner,{mode:'sign',token:await invitation()})).value.url)
  await h.command('envelope.void',{id:envelope,reason:'Erasure after review'})
  assert.equal((await api(current,'/meta')).status,403,'voiding refuses the next read')
  await h.post(base+'/erase',{id:envelope,confirmation:'ERASE'})
  assert.equal((await api(beforeErasure,'/api/sign/anything',{})).status,403)
  const later=(await h.send(base+'/archive',undefined,h.owner)).value,refusedRestore=await harness({now:start})
  try{await refusedRestore.post(base+'/archive/restore',{archive,laterJournal:later},refusedRestore.owner,400)}finally{await refusedRestore.close()}
  const rows=(await h.db.prepare('SELECT detail FROM iw_embed_audit').all()).results
  assert.ok(rows.some(r=>JSON.parse(r.detail).consentVersion));assert.ok(!JSON.stringify(rows).includes(launched.url.split('/').at(-1))&&!JSON.stringify(rows).includes(session.cookie.split('=')[1]))
  assert.ok(rows.some(r=>JSON.parse(r.detail).purpose==='authorization'&&JSON.parse(r.detail).outcome==='refused'),'unauthorized native embedding configuration is audited without credentials')
  assert.ok(rows.some(r=>JSON.parse(r.detail).purpose==='redeem'&&JSON.parse(r.detail).outcome==='refused'),'unknown and replayed launches retain a safe refusal event')
  const adminActor=(await h.send(base,undefined,admin)).value.actor,revokedRole=await redeem((await issue(admin)).value.url)
  await h.post('/auth/operator/status',{operatorId:adminActor.id,status:'inactive'})
  await h.post('/auth/operator/status',{operatorId:adminActor.id,status:'active'})
  assert.equal((await api(revokedRole,'/meta')).status,403,'restoring member authority does not revive embedding')
  await grant(origin,false);assert.equal((await api(session,'/meta')).status,403);await grant();assert.equal((await api(session,'/meta')).status,403,'readding an origin does not revive a session')
  const closingAdmin=await h.invite('closing-admin@harbour.example','admin'),ended=await redeem((await issue(closingAdmin)).value.url);await h.post('/auth/signout',{},closingAdmin,204);assert.equal((await api(ended,'/meta')).status,403)
  const expiring=await redeem((await issue()).value.url),unredeemed=(await issue()).value.url
  h.advanceTo(start+15*60_000);assert.equal((await api(expiring,'/meta')).status,403);await redeem(unredeemed,403)
  h.advanceTo(start+15*60_000+1)
  await h.post(base+'/embed-origins',{origin,enabled:true,consent:true},h.owner,403)
  const audit=(await h.db.prepare('SELECT id,actor,action,origin,at,envelope_id,detail FROM iw_embed_audit').all()).results
  for(const action of ['origin.changed','launch.authorized','launch.redeemed','launch.closed','authority.refused','request.refused','launch.expired']){
   const row=audit.find(row=>row.action===action);assert.ok(row,action+' is audited');assert.ok(row.actor);assert.ok(Number.isFinite(Date.parse(row.at)));assert.ok(JSON.parse(row.detail).outcome)
  }
  const granted=audit.find(row=>row.action==='origin.changed'&&JSON.parse(row.detail).after===origin),authorized=audit.find(row=>row.action==='launch.authorized')
  assert.equal(granted.origin,origin);assert.ok(JSON.parse(granted.detail).consentVersion);assert.ok(JSON.parse(granted.detail).version)
  assert.equal(authorized.origin,origin);assert.ok(JSON.parse(authorized.detail).expiresAt);assert.ok(JSON.parse(authorized.detail).allocation);assert.ok(JSON.parse(authorized.detail).grantVersion)
  // ADMIN-005: the owner's public account history adopts every embedding lifecycle record.
  const unified=[],filters=new URLSearchParams({q:'embedding.',limit:'200'})
  do{
   const response=await h.send(base+'/audit?'+filters,undefined,h.owner)
   assert.equal(response.status,200,'the owner can read unified embedding history')
   unified.push(...response.value.entries)
   if(!response.value.nextCursor)break
   filters.set('cursor',response.value.nextCursor)
  }while(true)
  assert.equal(unified.length,audit.length,'account history includes every origin and embedding event exactly once')
  const permitted=['origin','envelopeId','purpose','outcome','consent','consentVersion','version','grantVersion','expiresAt','status','beforeEnabled','afterEnabled']
  for(const source of audit){
   const entry=unified.find(entry=>entry.target==='embedding:'+source.id),detail=JSON.parse(source.detail)
   assert.ok(entry,'the embedding source event appears at its public target')
   assert.equal(entry.action,'embedding.'+source.action)
   assert.equal(entry.actorId,source.actor,'the source actor survives projection')
   assert.equal(entry.at,source.at,'the source event time survives projection')
   assert.equal(entry.after.origin,source.origin);assert.equal(entry.after.envelopeId,source.envelope_id)
   assert.equal(entry.after.outcome,detail.outcome)
   assert.deepEqual(Object.keys(entry.after).filter(key=>!permitted.includes(key)),[],'only safe embedding context is published')
   if(source.action==='origin.changed'){
    assert.deepEqual(entry.before,{origin:detail.before})
    assert.equal(entry.after.beforeEnabled,detail.before!==null)
    assert.equal(entry.after.afterEnabled,detail.after!==null)
    assert.equal(entry.after.consent,detail.consent)
    assert.equal(entry.after.version,detail.version)
    assert.equal(entry.after.consentVersion,detail.consentVersion)
   }else assert.equal(entry.before,null,'lifecycle events do not invent prior account values')
   if(['prepare','sign','grant','redeem'].includes(detail.purpose))assert.equal(entry.after.purpose,detail.purpose)
   if(detail.purpose==='authorization')assert.equal(entry.after.purpose,null,'unrecognized detail values stay outside the safe projection')
   for(const key of ['expiresAt','grantVersion','status'])if(detail[key]!==undefined)assert.equal(entry.after[key],detail[key])
  }
  const accountHistory=JSON.stringify(unified),digest=value=>createHash('sha256').update(value).digest('hex')
  const confidential=[launched.url,launched.url.split('/').at(-1),session.id,session.cookie.split('=')[1],...signingTokens,...signingTokens.map(digest),'Mara Quinn','embed-mara@harbour.example','replacement@harbour.example','synthetic-inkwell-1','synthetic-inkwell-2',...audit.flatMap(row=>{const detail=JSON.parse(row.detail);return[detail.launch,detail.recipient,detail.allocation].filter(Boolean)})]
  assert.ok(audit.some(row=>JSON.parse(row.detail).launch)&&audit.some(row=>JSON.parse(row.detail).recipient),'real source records contain launch and recipient hashes that must be withheld')
  for(const value of confidential)assert.ok(!accountHistory.includes(value),'embedding account history excludes credentials, hashes, recipient identity and private document values')
  console.log('Embedded authority: canonical origins, roles, concurrent single redemption, lost response, cookie refusal, idempotent draft, explicit send, revocation, absolute expiry, audit and archive custody passed.')
 }finally{await h.close()}
}

if (process.argv[1]?.endsWith('/embedding-cases.mjs')) await embeddingAuthorityCases()
