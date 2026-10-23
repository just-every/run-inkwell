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
  const token=body.get('response'),action=token?.includes('verify')?'inkwell_form_verify':'inkwell_form_code'
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
 const {h,config,template,form,publish,definition}=await setup()
 try{
  assert.equal(form.totalLimit,100);assert.equal(form.dailyLimit,50);assert.ok(Math.abs(Date.parse(form.expiresAt)-Date.parse(form.createdAt)-90*day)<2000)
  const view=(await h.send(`/api/forms/${form.id}`)).value
  assert.deepEqual(Object.keys(view).sort(),['admissionOnly','expiresAt','role','title']);assert.equal(view.role,'Customer');assert.ok(!JSON.stringify(view).includes('company@harbour.example'))
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
  assert.equal(admitted.verified,true);assert.match(admitted.admissionToken,/^[a-f0-9]{64}$/);assert.equal(admitted.admissionOnly,true)
  await verify(first.challengeId,correct,{},401)
  const row=await h.db.prepare('SELECT * FROM iw_form_challenges WHERE id=?').bind(first.challengeId).first()
  assert.equal(row.code_hash,null);assert.equal(row.attempts,5);assert.equal(row.grant_hash,createHash('sha256').update(admitted.admissionToken).digest('hex'));assert.ok(!JSON.stringify(row).includes(admitted.admissionToken))
  const second=(await code('other@clients.example')).value,expired=await mailedCode('other@clients.example')
  h.advanceTo(start+10*60000);await verify(second.challengeId,expired,{},401)
  const third=(await code('locked@clients.example')).value,locked=await mailedCode('locked@clients.example'),wrongLocked=locked==='000000'?'999999':'000000'
  for(let n=0;n<5;n++)await verify(third.challengeId,wrongLocked,{},401)
  await verify(third.challengeId,locked,{},401)
  assert.equal(await count(),0,'neither code requests nor verified admission create envelopes')
  assert.equal((await h.send(`/api/forms/${form.id}/submit`,{admissionToken:admitted.admissionToken})).status,404,'admission alone cannot send or sign')
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
