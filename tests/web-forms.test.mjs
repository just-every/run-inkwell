import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'
const day=86400000
async function setup(options={}){
 const checks=[]
 const h=await harness({...options,bindings:{TURNSTILE_SECRET_KEY:'synthetic-inkwell-1'},networkEdge:async request=>{
  if(new URL(request.url).hostname!=='challenges.cloudflare.com')return
  const body=new URLSearchParams(await request.text());assert.equal(body.get('secret'),'synthetic-inkwell-1');checks.push(body)
  const token=body.get('response'),action=token?.includes('submit')?'inkwell_form_submit':token?.includes('verify')?'inkwell_form_verify':'inkwell_form_code'
  return Response.json({success:token!=='synthetic-inkwell-refused',hostname:token==='synthetic-inkwell-other-host'?'outside.example':new URL(h.origin).hostname,action})
 }})
 const pdf=await PDFDocument.create();pdf.addPage([612,792]).drawText('synthetic-inkwell-2')
 const definition={title:'Supplier agreement',filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Customer',order:1},{role:'Company',order:2}],fields:[{id:'sig',label:'Customer signature',type:'signature',signer:0,page:0,x:.1,y:.2,width:.4,height:.05},{id:'company',label:'Company signature',type:'signature',signer:1,page:0,x:.1,y:.4,width:.4,height:.05}]}
 const template=(await h.command('template.save',definition)).result
 const config={title:'Supplier admission',templateId:template.id,templateVersion:1,publicRole:0,fixedRecipients:[null,{name:'Company signer',email:'company@harbour.example'}]}
 const publish=async(extra={},cookie=h.owner,status=200)=>(await h.post('/api/inkwell/forms',{...config,...extra,commandId:crypto.randomUUID()},cookie,status)).value
 const form=(await publish()).form
 const code=async(email='mara@clients.example',token='synthetic-inkwell-code',status=200)=>h.post(`/api/forms/${form.id}/code`,{email,turnstileToken:token},'',status)
 const verify=async(challengeId,code,extra={},status=200)=>h.post(`/api/forms/${form.id}/verify`,{challengeId,code,turnstileToken:'synthetic-inkwell-verify',...extra},'',status)
 const mailedCode=async email=>(await h.mail(email)).text.match(/\b\d{6}\b/)[0]
 return {h,checks,definition,template,config,form,publish,code,verify,mailedCode}
}

test('FORM-001: publication pins one public role, every fixed recipient and bounded limits without exposing private roles',async()=>{
 const start=Date.now(),{h,config,template,form,publish,definition}=await setup({now:start})
 try{
  assert.equal(form.publicUrl,h.origin+'/form/'+form.id);assert.equal(form.qrUrl,h.origin+`/api/forms/${form.id}/qr.svg`);assert.ok(form.embedSnippet.includes(`src="${form.publicUrl}"`));assert.equal(form.totalLimit,100);assert.equal(form.dailyLimit,50);assert.ok(Math.abs(Date.parse(form.expiresAt)-Date.parse(form.createdAt)-90*day)<2000)
  const view=(await h.send(`/api/forms/${form.id}`)).value
  assert.deepEqual(Object.keys(view).sort(),['expiresAt','role','submissionAvailable','title']);assert.equal(view.role,'Customer');assert.ok(!JSON.stringify(view).includes('company@harbour.example'))
  for(const extra of [{publicRole:2},{publicRole:-1},{fixedRecipients:[{name:'Override',email:'override@clients.example'},null]},{fixedRecipients:[null]},{totalLimit:10001},{totalLimit:0},{dailyLimit:0},{expiryDays:366},{templateVersion:2}])await publish(extra,h.owner,extra.templateVersion?409:400)
  const commandId=crypto.randomUUID(),body={...config,commandId,totalLimit:10000,dailyLimit:25,expiryDays:365}
  const first=(await h.post('/api/inkwell/forms',body,h.owner)).value,again=(await h.post('/api/inkwell/forms',body,h.owner)).value
  assert.equal(first.form.id,again.form.id,'retries never republish or transfer ownership')
  await h.post('/api/inkwell/forms',{...body,title:'Changed'},h.owner,409)
  await assert.rejects(h.db.prepare('UPDATE iw_form_versions SET data=? WHERE id=?').bind('{}',form.id).run(),/immutable form version/)
  await h.command('template.update',{...definition,id:template.id,title:'Changed definition'})
  assert.equal((await h.send(`/api/forms/${form.id}`)).status,409,'a changed template must be republished as a new form version')
  const next=(await publish({templateVersion:2})).form;assert.notEqual(next.id,form.id)
  await h.post(`/api/inkwell/forms/${next.id}/disable`,{commandId:crypto.randomUUID()},h.owner)
  assert.equal((await h.send(`/api/forms/${next.id}`)).status,404)
  const accountAudit=(await h.send('/api/inkwell/audit?limit=200',undefined,h.owner)).value.entries
  assert.ok(accountAudit.some(e=>e.action==='form.published'&&e.target===`form:${form.id}`&&e.actorId===form.ownerId))
  assert.ok(accountAudit.some(e=>e.action==='form.disabled'&&e.target===`form:${next.id}`&&e.before.disabledAt===null&&e.after.disabledAt))
  assert.ok(!JSON.stringify(accountAudit).includes('company@harbour.example'),'Account audit excludes fixed recipient identities')
  const expiring=(await publish({templateVersion:2,expiryDays:1})).form;h.advanceTo(start+day);assert.equal((await h.send(`/api/forms/${expiring.id}`)).status,410);await h.post(`/api/forms/${expiring.id}/code`,{email:'expired@clients.example',turnstileToken:'synthetic-inkwell-code'},'',410)
 }finally{await h.close()}
})

test('FORM-001: native owner grants let senders publish only with live template access; permission loss never revives old forms',async()=>{
 const {h,template,publish,config}=await setup()
 try{
  const sender=await h.invite('sam.forms@harbour.example','member'),person=(await h.send('/api/inkwell',undefined,sender)).value.actor
  await h.command('member.role',{operatorId:person.id,role:'sender'})
  await publish({},sender,403)
  const grant=async(enabled,expectedVersion)=>h.post('/api/inkwell/web-form-permissions',{memberId:person.id,enabled,expectedVersion,commandId:crypto.randomUUID()},h.owner)
  await grant(true,0)
  await publish({},sender,404)
  await h.command('template.share',{id:template.id,email:person.email,access:'use'})
  const owned=(await publish({},sender)).form;assert.equal(owned.ownerId,person.id)
  const viewer=await h.invite('vic.forms@harbour.example','member');await publish({},viewer,403)
  assert.equal((await h.send('/api/inkwell/web-form-permissions',undefined,sender)).status,403)
  await h.post('/api/inkwell/web-form-permissions',{memberId:person.id,enabled:false,expectedVersion:1,commandId:crypto.randomUUID()},sender,403)
  await grant(false,1);await grant(true,2)
  assert.equal((await h.send(`/api/forms/${owned.id}`)).status,404,'restoring a grant never revives a suspended form')
  const replacement=(await publish({},sender)).form;assert.notEqual(replacement.id,owned.id)
  await h.command('member.role',{operatorId:person.id,role:'viewer'});await h.command('member.role',{operatorId:person.id,role:'sender'})
  assert.equal((await h.send(`/api/forms/${replacement.id}`)).status,404,'restoring a role never revives a form')
  const agent=(await h.command('agent.issue',{name:'synthetic-inkwell-3'})).result.token
  for(const path of ['/api/inkwell/forms','/api/inkwell/web-form-permissions',`/api/forms/${owned.id}`]){
   assert.equal((await h.send(path,undefined,'',{authorization:`Bearer ${agent}`})).status,403)
   const postPath=path.startsWith('/api/forms/')?path+'/code':path
   assert.equal((await h.send(postPath,{...config,commandId:crypto.randomUUID()},'',{authorization:`Bearer ${agent}`})).status,403)
  }
 }finally{await h.close()}
})

test('FORM-001: server-checked bot tokens and ten-minute five-attempt email codes precede any envelope or signing authority',async()=>{
 const start=Date.now(),{h,checks,form,code,verify,mailedCode}=await setup({now:start})
 try{
  const count=async()=>Number((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_envelopes').first()).n)
  await code('mara@clients.example','',403);await code('mara@clients.example','synthetic-inkwell-refused',403);await code('mara@clients.example','synthetic-inkwell-other-host',403)
  assert.equal(h.sent(),0,'refused bot checks send no email')
  const first=(await code()).value,correct=await mailedCode('mara@clients.example')
  await verify(first.challengeId,correct,{recipients:[{email:'injected@clients.example'}]},400)
  await verify(first.challengeId,correct,{values:{company:'not mine'}},400)
  await verify(first.challengeId,correct,{turnstileToken:'synthetic-inkwell-code'},403,'a code-stage bot token cannot verify')
  const wrong=correct==='000000'?'999999':'000000'
  for(let n=0;n<4;n++)await verify(first.challengeId,wrong,{},401)
  const admitted=(await verify(first.challengeId,correct)).value
  assert.equal(admitted.verified,true);assert.match(admitted.admissionToken,/^[a-f0-9]{64}$/);assert.equal(admitted.submissionAvailable,true)
  await verify(first.challengeId,correct,{},401)
  const row=await h.db.prepare('SELECT * FROM iw_form_challenges WHERE id=?').bind(first.challengeId).first()
  assert.equal(row.code_hash,null);assert.equal(row.attempts,5);assert.equal(row.grant_hash,createHash('sha256').update(admitted.admissionToken).digest('hex'));assert.ok(!JSON.stringify(row).includes(admitted.admissionToken))
  const second=(await code('other@clients.example')).value,expired=await mailedCode('other@clients.example')
  h.advanceTo(start+10*60000);await verify(second.challengeId,expired,{},401)
  const third=(await code('locked@clients.example')).value,locked=await mailedCode('locked@clients.example'),wrongLocked=locked==='000000'?'999999':'000000'
  for(let n=0;n<5;n++)await verify(third.challengeId,wrongLocked,{},401)
  await verify(third.challengeId,locked,{},401)
  assert.equal(await count(),0,'neither code requests nor verified admission create envelopes')
  assert.equal((await h.send(`/api/forms/${form.id}/submit`,{admissionToken:admitted.admissionToken})).status,400,'an admission token alone cannot supply the name or submit-time bot proof')
  assert.ok(checks.length>10,'Turnstile is verified at the actual network edge for both steps')
 }finally{await h.close()}
})

test('FORM-001: three email-code requests per rolling hour include failed mail; admission PII expires and never enters record archives',async()=>{
 const start=Date.now(),{h,form,code,mailedCode,verify}=await setup({now:start})
 try{
  const first=(await code('privacy@clients.example')).value,secretCode=await mailedCode('privacy@clients.example')
  const verified=(await verify(first.challengeId,secretCode)).value
  h.failSends(1);await code('privacy@clients.example');await code('PRIVACY@clients.example');await code('privacy@clients.example','synthetic-inkwell-code',429)
  await code('separate@clients.example')
  const manager=(await h.send('/api/inkwell/forms',undefined,h.owner)).value
  assert.deepEqual(manager.forms.find(row=>row.id===form.id).statistics,{total:0,today:0})
  assert.ok(!JSON.stringify(manager).includes('privacy@clients.example'));assert.ok(!JSON.stringify(manager).includes(verified.admissionToken))
  const exported=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,archive=JSON.stringify(exported)
  assert.ok(!archive.includes('privacy@clients.example'));assert.ok(!archive.includes(verified.admissionToken));assert.ok(!archive.includes('grant_hash'))
  const restored=await harness();try{await restored.post('/api/inkwell/archive/restore',{archive:exported},restored.owner);assert.deepEqual((await restored.send('/api/inkwell/forms',undefined,restored.owner)).value.forms,[]);assert.deepEqual((await restored.send('/api/inkwell/web-form-permissions',undefined,restored.owner)).value.permissions,[]);assert.equal((await restored.send(`/api/forms/${form.id}`)).status,404)}finally{await restored.close()}
  h.advanceTo(start+3600000);await code('privacy@clients.example')
  await h.scheduled(start+day)
  const old=await h.db.prepare('SELECT id FROM iw_form_challenges WHERE id=?').bind(first.challengeId).first();assert.equal(old,null)
  const stillValid=(await h.send(`/api/forms/${form.id}`)).value;assert.equal(stillValid.title,'Supplier admission')
 }finally{await h.close()}
})


async function admission(f,email){const challenge=(await f.code(email)).value;return (await f.verify(challenge.challengeId,await f.mailedCode(email))).value.admissionToken}
const submit=(f,token,extra={},status=200,ip='192.0.2.10')=>f.h.post(`/api/forms/${f.form.id}/submit`,{name:'Mara Quinn',admissionToken:token,turnstileToken:'synthetic-inkwell-submit',commandId:crypto.randomUUID(),...extra},'',status,{'cf-connecting-ip':ip})
async function policy(f,mode,extra={}){const row=(await f.h.send('/api/inkwell/send-policies',undefined,f.h.owner)).value.policies.find(p=>p.source==='web_form');await f.h.command('account.send_policy',{source:'web_form',mode,templates:[f.template.id],expectedVersion:row.version,...extra})}

test('FORM-001 and SEND-001: verified public submissions send under their form policy and fixed roles, sign and countersign through ordinary signer doors',async()=>{
 const start=Date.now(),f=await setup({now:start}),{h,form}=f
 try{
  await policy(f,'autonomous')
  const token=await admission(f,'mara.public@clients.example')
  await submit(f,token,{recipients:[{email:'injected@clients.example'}]},400)
  await submit(f,token,{values:{company:'not mine'}},400)
  await submit(f,token,{turnstileToken:'synthetic-inkwell-verify'},403)
  const sent=await submit(f,token),id=sent.value.result.id,path='/api'+sent.value.result.signingPath
  assert.equal(sent.value.result.status,'awaiting_signature');assert.ok(sent.cookie)
  const read=async()=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  let envelope=await read(),approved=envelope.events.findLast(e=>e.action==='envelope.approved')
  assert.equal(approved.detail.eligible,false);assert.equal(approved.detail.sendPolicy.source,'web_form');assert.equal(approved.detail.sendPolicy.credential.id,form.id);assert.equal(approved.detail.sendPolicy.policies[0].version,1)
  assert.deepEqual(envelope.signers.map(s=>s.email),['mara.public@clients.example','company@harbour.example']);assert.equal(envelope.formSubmission.id,form.id)
  await submit(f,token,{},401)
  await h.agree(path,sent.cookie)
  await h.post(path+'/sign',{consent:true,commandId:crypto.randomUUID(),values:{sig:'Mara Quinn',company:'Not mine'}},sent.cookie,400)
  await h.post(path+'/sign',{consent:true,commandId:crypto.randomUUID(),values:{sig:'Mara Quinn'}},sent.cookie)
  const company='/api/sign/'+new URL((await h.mail('company@harbour.example','Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
  await h.post(company+'/code',{},'');const code=(await h.mail('company@harbour.example','Your Inkwell verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(company+'/verify',{code},'')).cookie
  await h.agree(company,cookie);await h.post(company+'/sign',{consent:true,commandId:crypto.randomUUID(),values:{company:'Company signer'}},cookie)
  envelope=await read();assert.equal(envelope.status,'completed');assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true)
  const stats=(await h.send('/api/inkwell/forms',undefined,h.owner)).value.forms.find(row=>row.id===form.id).statistics;assert.deepEqual(stats,{total:1,today:1});assert.ok(Object.values(stats).every(value=>typeof value==='number'))
  const again=await admission(f,'mara.public@clients.example');await submit(f,again,{},429)
  assert.equal((await h.db.prepare('SELECT total_count FROM iw_forms WHERE id=?').bind(form.id).first()).total_count,1)
  h.advanceTo(start+day);const afterDay=await submit(f,await admission(f,'mara.public@clients.example'));assert.equal(afterDay.value.result.status,'awaiting_signature');assert.notEqual(afterDay.value.result.id,id,'the email may submit again at the exact rolling 24-hour boundary')
 }finally{await h.close()}
})

test('FORM-001: policy-off submissions remain unsigned held drafts; only the qualifying form owner or the owner-loss fallback can confirm or void',async()=>{
 const f=await setup(),{h,form}=f
 try{
  const other=await h.invite('other.admin@harbour.example','admin'),token=await admission(f,'held.public@clients.example'),sent=h.sent()
  const held=await submit(f,token),id=held.value.result.id
  assert.equal(held.value.result.status,'held');assert.equal(h.sent(),sent)
  const read=async()=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  assert.equal((await read()).status,'prepared');assert.ok((await read()).sendHold);assert.ok((await read()).signers.every(s=>!s.signedAt))
  await policy(f,'autonomous');await h.scheduled(Date.now());assert.equal((await read()).status,'prepared','switching policy back on never releases a held draft')
  await h.command('envelope.approve',{id,eligible:true},other,403);await h.command('envelope.void',{id,reason:'Unauthorized reviewer'},other,403)
  await h.command('envelope.approve',{id,eligible:true});assert.equal((await read()).status,'awaiting_signature');assert.ok(await h.mail('held.public@clients.example','Please sign:'))
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_policy_send_usage WHERE envelope_id=?').bind(id).first()).n,1,'a personally released form send still consumes the account policy-send budget')
  await policy(f,'off')
  const next=await submit(f,await admission(f,'void.public@clients.example'))
  await h.command('envelope.void',{id:next.value.result.id,reason:'Owner declined eligibility'})
  assert.equal((await h.send('/api/inkwell/envelopes/'+next.value.result.id,undefined,h.owner)).value.envelope.status,'voided')
 }finally{await h.close()}
})

test('FORM-001: atomic total, UTC-day and account-wide IP limits refuse excess submissions without creating or mailing envelopes',async()=>{
 const f=await setup(),{h,form,publish,config}=f
 try{
  const limited=(await publish({totalLimit:1,dailyLimit:100})).form
  // Each case uses an ordinary published form and verified email admission; no fixture bypasses counters.
  const admitFor=async(id,email)=>{const c=(await h.post(`/api/forms/${id}/code`,{email,turnstileToken:'synthetic-inkwell-code'},'')).value;return (await h.post(`/api/forms/${id}/verify`,{challengeId:c.challengeId,code:await f.mailedCode(email),turnstileToken:'synthetic-inkwell-verify'},'')).value.admissionToken}
  const postFor=(id,token,ip='192.0.2.42',status=200)=>h.post(`/api/forms/${id}/submit`,{name:'Public signer',admissionToken:token,turnstileToken:'synthetic-inkwell-submit',commandId:crypto.randomUUID()},'',status,{'cf-connecting-ip':ip})
  await postFor(limited.id,await admitFor(limited.id,'limit-one@clients.example'))
  await postFor(limited.id,await admitFor(limited.id,'limit-two@clients.example'),'192.0.2.42',429)
  const daily=(await publish({totalLimit:100,dailyLimit:1})).form
  await postFor(daily.id,await admitFor(daily.id,'daily-one@clients.example'),'192.0.2.43')
  await postFor(daily.id,await admitFor(daily.id,'daily-two@clients.example'),'192.0.2.43',429)
  const start=Number((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_envelopes').first()).n)
  for(let n=0;n<10;n++)await submit(f,await admission(f,`ip-${n}@clients.example`),{},200,'192.0.2.99')
  await submit(f,await admission(f,'ip-over@clients.example'),{},429,'192.0.2.99')
  const different=(await publish({...config,title:'Other form'})).form
  await postFor(different.id,await admitFor(different.id,'cross-form@clients.example'),'192.0.2.99',429)
  assert.equal(Number((await h.db.prepare('SELECT COUNT(*) AS n FROM iw_envelopes').first()).n),start+10)
  assert.equal(h.sent(),16,'only verification code mail exists while policies are off; no invitations are queued')
 }finally{await h.close()}
})

test('FORM-001 and SEND-001: form policy and credential changes fence the last internal approval and owner-loss fallback is explicit',async()=>{
 const f=await setup(),{h}=f
 try{
  const approver=await h.invite('form.approver@harbour.example','admin')
  await h.command('account.internal_approval',{rule:{approverEmail:'form.approver@harbour.example'}})
  await policy(f,'autonomous',{requireInternalApproval:true})
  const requested=await submit(f,await admission(f,'pending.form@clients.example')),id=requested.value.result.id
  const read=async envelopeId=>(await h.send('/api/inkwell/envelopes/'+envelopeId,undefined,h.owner)).value.envelope
  assert.equal((await read(id)).internalApproval.state,'pending');assert.ok(!(await h.mail('pending.form@clients.example','Please sign:')))
  await policy(f,'off')
  assert.equal((await h.command('envelope.internal_decide',{id,decision:'approve'},approver)).result.held,true)
  await policy(f,'autonomous');await h.scheduled(Date.now());assert.ok((await read(id)).sendHold)
  const credentialRequest=await submit(f,await admission(f,'credential.form@clients.example')),credentialId=credentialRequest.value.result.id
  await h.post(`/api/inkwell/forms/${f.form.id}/disable`,{commandId:crypto.randomUUID()},h.owner)
  assert.equal((await h.command('envelope.internal_decide',{id:credentialId,decision:'approve'},approver)).result.held,true)
  assert.equal((await read(credentialId)).events.at(-1).detail.code,'send_credential')
  // A sender-owned unsigned hold survives publisher loss; it never transfers or releases itself.
  const sender=await h.invite('publisher.form@harbour.example','member'),person=(await h.send('/api/inkwell',undefined,sender)).value.actor
  await h.command('member.role',{operatorId:person.id,role:'sender'})
  await h.post('/api/inkwell/web-form-permissions',{memberId:person.id,enabled:true,expectedVersion:0,commandId:crypto.randomUUID()},h.owner)
  await h.command('template.share',{id:f.template.id,email:person.email,access:'use'})
  const owned=(await f.publish({},sender)).form;await policy(f,'off')
  const challenge=(await h.post(`/api/forms/${owned.id}/code`,{email:'fallback@clients.example',turnstileToken:'synthetic-inkwell-code'},'')).value
  const grant=(await h.post(`/api/forms/${owned.id}/verify`,{challengeId:challenge.challengeId,code:await f.mailedCode('fallback@clients.example'),turnstileToken:'synthetic-inkwell-verify'},'')).value.admissionToken
  const held=(await h.post(`/api/forms/${owned.id}/submit`,{name:'Fallback signer',admissionToken:grant,turnstileToken:'synthetic-inkwell-submit',commandId:crypto.randomUUID()},' ',200,{'cf-connecting-ip':'192.0.2.53'})).value.result.id
  await h.command('envelope.approve',{id:held,eligible:true},h.owner,403)
  await h.command('member.role',{operatorId:person.id,role:'viewer'})
  await h.command('account.internal_approval',{rule:null})
  await h.command('envelope.approve',{id:held,eligible:true},h.owner)
  assert.equal((await read(held)).status,'awaiting_signature');assert.ok(await h.mail('fallback@clients.example','Please sign:'))
  assert.equal((await h.send(`/api/forms/${owned.id}`)).status,404)
 }finally{await h.close()}
})
