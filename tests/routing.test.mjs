import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { harness } from './harness.mjs'
const pdfText=async bytes=>{const{getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdf=await getDocument({data:new Uint8Array(bytes),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise;let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join('\n')+'\n';return text}

test('ROUTE-003: one template routes 5000/25000 USD differently, records skipped rules, preserves custody and refuses changing settled decisions',async()=>{
 const h=await harness()
 try{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage([612,792]).drawText('Harbour Studio - Service agreement',{x:60,y:740,size:18,font})
  const field=(id,signer,type,y,extra={})=>({id,label:id,signer,type,page:0,x:.1,y,width:.7,height:.04,...extra})
  const fields=[field('client',0,'signature',.15),field('amount',0,'number',.25,{readOnly:true,prefill:{value:'5000.00',source:'Sender input'}}),field('director',1,'signature',.35),field('director-note',1,'text',.45,{readOnly:true,prefill:{value:'DIRECTOR ONLY - MUST NOT PRINT WHEN SKIPPED',source:'Sender input'}}),field('company',2,'signature',.55)]
  const rule={field:'amount',operator:'greater_than',value:'10000.00'},roles=[{role:'Client',order:1},{role:'Finance director',order:2,includeWhen:rule},{role:'Company',order:3}]
  const template=(await h.command('template.save',{title:'Conditional workshop',filename:'workshop.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles,fields})).result.id
  const read=async id=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const parties=suffix=>[{name:'Mara Quinn',email:`mara.${suffix}@clients.example`},{name:'Finance Director',email:`finance.${suffix}@harbour.example`},{name:'Jon Reed',email:`jon.${suffix}@harbour.example`}]
  const send=async(amount,suffix)=>{const recipients=parties(suffix),id=(await h.command('template.use',{id:template,recipients,prefill:{amount:{value:amount,source:'API caller',readOnly:true}}})).result.id;await h.command('envelope.approve',{id,eligible:true});return{id,recipients}}
  const sign=async(email,values)=>{const invitation=await h.mail(email,'Please sign:'),token=new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1),path='/api/sign/'+token;await h.post(path+'/code',{},'');const code=(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(path+'/verify',{code},'')).cookie;await h.agree(path,cookie);return h.post(path+'/sign',{values,consent:true,commandId:crypto.randomUUID()},cookie)}
  const low=await send('5000','low'),e=await read(low.id),skip=e.signers[1].routeResult
  assert.equal(skip.state,'skipped');assert.equal(skip.value,'5000.00');assert.ok(skip.at)
  const event=e.events.find(e=>e.action==='signer.route_skipped');assert.deepEqual(event.detail.rule,rule);assert.equal(event.detail.result,false);assert.equal(event.at,skip.at)
  assert.equal(await h.mail(low.recipients[1].email,'Please sign:'),undefined,'skipped recipient receives no invitation')
  const member=await h.invite(low.recipients[1].email,'member')
  await h.command('envelope.open_signing',{id:low.id},member,409)
  const waiting=(await h.send('/api/inkwell/envelopes?status=waiting_for_me',undefined,member)).value;assert.equal(waiting.counts.waiting_for_me,0,'skipped recipient has no actionable count');assert.equal(waiting.envelopes.length,0,'skipped recipient has no actionable row in the dashboard')
  await h.command('envelope.resend',{id:low.id,signer:1},h.owner,409)
  await h.command('envelope.correct',{id:low.id,fields:fields.map(f=>f.id==='amount'?{...f,prefill:{value:'25000.00',source:'Changed'}}:f)},h.owner,409)
  await h.command('envelope.correct',{id:low.id,signers:low.recipients.map((p,i)=>({...p,order:i+1,...(i===1?{includeWhen:null}:{})}))},h.owner,409)
  await sign(low.recipients[0].email,{client:'Mara Quinn'})
  assert.ok(await h.mail(low.recipients[2].email,'Please sign:'),'routing proceeds past skipped director')
  await sign(low.recipients[2].email,{company:'Jon Reed'})
  const completed=await read(low.id);assert.equal(completed.status,'completed');assert.equal(await h.mail(low.recipients[1].email,'Completed:'),undefined,'skipped recipient receives no completed-copy mail or link');assert.equal(completed.signers[1].signedAt,undefined)
  const signed=await pdfText((await h.send(`/api/inkwell/envelopes/${low.id}/artifacts/signed`,undefined,h.owner)).bytes)
  assert.ok(signed.includes('Mara Quinn'));assert.ok(signed.includes('Jon Reed'));assert.ok(!signed.includes('DIRECTOR ONLY'),'all skipped fields stay out of the executed PDF')
  const certificate=(await pdfText((await h.send(`/api/inkwell/envelopes/${low.id}/artifacts/certificate`,undefined,h.owner)).bytes)).replace(/\s+/g,' ')
  assert.ok(certificate.includes('Skipped at'));assert.ok(certificate.includes(skip.at));assert.ok(certificate.includes('amount greater_than 10000.00'));assert.ok(certificate.includes('result false'))
  assert.equal((await h.send(`/api/inkwell/envelopes/${low.id}/verify`,undefined,h.owner)).value.ok,true)
  const copy=(await h.command('envelope.copy',{id:low.id})).result.id,copied=await read(copy);assert.deepEqual(copied.signers[1].includeWhen,rule);assert.ok(copied.signers.every(s=>!s.routeResult&&!s.activatedAt&&!s.signedAt))
  const saved=(await h.command('template.from_envelope',{id:low.id})).result.id,reused=(await h.command('template.use',{id:saved,recipients:parties('reused')})).result.id;assert.deepEqual((await read(reused)).signers[1].includeWhen,rule);assert.ok((await read(reused)).signers.every(s=>!s.routeResult))
  const high=await send('25000','high');assert.equal((await read(high.id)).signers[1].routeResult.state,'included');assert.equal(await h.mail(high.recipients[1].email,'Please sign:'),undefined,'included later recipient waits for the earlier signer')
  await sign(high.recipients[0].email,{client:'Mara Quinn'});assert.ok(await h.mail(high.recipients[1].email,'Please sign:'))
  await h.command('envelope.correct',{id:high.id,signers:high.recipients.map((p,i)=>({...p,order:i+1,...(i===1?{includeWhen:null}:{})}))},h.owner,409,'active-rule-change')
  await sign(high.recipients[1].email,{director:'Finance Director'});await sign(high.recipients[2].email,{company:'Jon Reed'});assert.equal((await read(high.id)).status,'completed')
  for(const [operator,value,expected] of [['equals','5000',true],['not_equals','5000',false],['greater_than','5000',false],['less_than','5000.01',true],['at_least','5000',true],['at_most','5000',true]]){
   const recipients=parties(operator),id=(await h.command('envelope.prepare',{title:operator,filename:'workshop.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),fields,signers:recipients.map((p,i)=>({...p,order:i+1,...(i===1?{includeWhen:{field:'amount',operator,value}}:{})}))})).result.id
   await h.command('envelope.approve',{id,eligible:true});assert.equal((await read(id)).signers[1].routeResult.state,expected?'included':'skipped');await h.command('envelope.void',{id,reason:'Comparison checked'})
  }
 }finally{await h.close()}
})

test('ROUTE-003: lower-order answers decide atomically; missing answers pause visibly until audited correction; invalid/hidden sources refuse before send',async()=>{
 const h=await harness()
 try{
  const pdf=await PDFDocument.create();pdf.addPage([612,792]);const base={title:'Routing answers',filename:'answers.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64')}
  const fields=[{id:'one',label:'Client signature',type:'signature',signer:0,page:0,x:.1,y:.2,width:.6,height:.04},{id:'amount',label:'Amount',type:'number',signer:0,page:0,x:.1,y:.3,width:.6,height:.04,required:false},{id:'two',label:'Director signature',type:'signature',signer:1,page:0,x:.1,y:.4,width:.6,height:.04}]
  const rule={field:'amount',operator:'greater_than',value:'10000.00'},signers=[{name:'Mara',email:'mara@clients.example',order:1},{name:'Director',email:'director@harbour.example',order:2,includeWhen:rule}]
  const prepare=async(extra={})=>(await h.command('envelope.prepare',{...base,fields,signers,...extra})).result.id
  const read=async id=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const sign=async(email,values)=>{const invite=await h.mail(email,'Please sign:'),path=new URL(invite.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.replace('/sign/','/api/sign/');await h.post(path+'/code',{},'');const code=(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(path+'/verify',{code},'')).cookie;await h.agree(path,cookie);await h.post(path+'/sign',{values,consent:true,commandId:crypto.randomUUID()},cookie)}
  const id=await prepare();await h.command('envelope.approve',{id,eligible:true});assert.equal((await read(id)).signers[1].routeResult,undefined);assert.equal(await h.mail(signers[1].email,'Please sign:'),undefined)
  await sign(signers[0].email,{one:'Mara'})
  let e=await read(id);assert.equal(e.status,'awaiting_signature');assert.equal(e.signers[1].routeResult.state,'unresolved')
  const detail=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope;assert.match(detail.recipients?.[1]?.waitingOn??'',/unresolved/)
  assert.equal(await h.mail(signers[1].email,'Please sign:'),undefined,'missing answer never silently includes or skips')
  await h.command('envelope.correct',{id,signers:signers.map((s,i)=>({...s,...(i===1?{includeWhen:null}:{})}))})
  e=await read(id);assert.equal(e.signers[1].includeWhen,undefined);assert.ok(e.events.some(e=>e.action==='signer.corrected'&&e.detail.signer===1));assert.ok(await h.mail(signers[1].email,'Please sign:'))
  await sign(signers[1].email,{two:'Director'});assert.equal((await read(id)).status,'completed')
  const actual=await prepare({title:'Actual answer'});await h.command('envelope.approve',{id:actual,eligible:true});await sign(signers[0].email,{one:'Mara',amount:'25000'});e=await read(actual);assert.equal(e.signers[1].routeResult.state,'included');assert.equal(e.signers[1].routeResult.value,'25000.00');assert.ok(e.events.find(e=>e.action==='signer.route_included'));await sign(signers[1].email,{two:'Director'});assert.equal((await read(actual)).status,'completed')
  const hiddenFields=[...fields.map(f=>f.id==='amount'?{...f,readOnly:true,prefill:{value:'25000',source:'Sender'},condition:{field:'show',equals:'true'}}:f),{id:'show',label:'Show',type:'checkbox',signer:0,page:0,x:.1,y:.5,width:.1,height:.04,readOnly:true,prefill:{value:'false',source:'Sender'}}]
  const hidden=await prepare({fields:hiddenFields});const before=h.sent();await h.command('envelope.approve',{id:hidden,eligible:true},h.owner,409);assert.equal(h.sent(),before);assert.equal((await read(hidden)).status,'prepared')
  for(const [badRule,badSigners] of [[{field:'unknown',operator:'equals',value:'x'},signers],[{field:'one',operator:'equals',value:'Mara'},signers],[rule,signers.map(s=>({...s,order:1}))],[{field:'amount',operator:'greater_than',value:'1.001'},signers]]) await h.command('envelope.prepare',{...base,fields,signers:badSigners.map((s,i)=>({...s,...(i===1?{includeWhen:badRule}:{})}))},h.owner,400)
 }finally{await h.close()}
})

test('ROUTE-003: copy recipients carry the same include rule, decided once at completion: skipped gets nothing, unresolved is sent and recorded',async()=>{
 const h=await harness()
 try{
  const pdf=await PDFDocument.create();pdf.addPage([612,792]);const base={title:'Copy routing',filename:'copies.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64')}
  const field=(id,type,y,extra={})=>({id,label:id,type,signer:0,page:0,x:.1,y,width:.6,height:.04,...extra})
  const fields=amount=>[field('one','signature',.2),field('amount','number',.3,{readOnly:true,prefill:{value:amount,source:'Sender input'}}),field('tier','text',.4,{required:false}),field('note','text',.5,{required:false})]
  const big={field:'amount',operator:'greater_than',value:'10000'}
  const copies=s=>[{name:'Auditor',email:`auditor.${s}@harbour.example`,includeWhen:big},{name:'Account Manager',email:`am.${s}@harbour.example`,includeWhen:{field:'tier',operator:'equals',value:'gold'}},{name:'Legal',email:`legal.${s}@harbour.example`,includeWhen:{field:'note',operator:'equals',value:'yes'}},{name:'Plain',email:`plain.${s}@harbour.example`}]
  const read=async id=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const run=async(amount,s)=>{const email=`mara.${s}@clients.example`,id=(await h.command('envelope.prepare',{...base,fields:fields(amount),signers:[{name:'Mara',email,order:1}],copies:copies(s)})).result.id;await h.command('envelope.approve',{id,eligible:true})
   assert.ok((await read(id)).copies.every(c=>!c.routeResult),'copy rules wait for completion')
   const invite=await h.mail(email,'Please sign:'),path=new URL(invite.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.replace('/sign/','/api/sign/');await h.post(path+'/code',{},'');const code=(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0],cookie=(await h.post(path+'/verify',{code},'')).cookie;await h.agree(path,cookie);await h.post(path+'/sign',{values:{one:'Mara',tier:'gold'},consent:true,commandId:crypto.randomUUID()},cookie)
   return id}
  const low=await run('5000','low'),e=await read(low);assert.equal(e.status,'completed')
  assert.deepEqual(e.copies.map(c=>c.routeResult?.state),['skipped','included','unresolved',undefined])
  assert.equal(e.copies[0].routeResult.value,'5000.00');assert.equal(e.copies[1].routeResult.value,'gold')
  const skip=e.events.find(x=>x.action==='copy.route_skipped');assert.equal(skip.detail.party,1);assert.deepEqual(skip.detail.rule,{...big,value:'10000.00'});assert.equal(skip.detail.result,false)
  assert.equal(e.events.find(x=>x.action==='copy.route_unresolved').detail.result,'unresolved')
  assert.ok(e.events.findIndex(x=>x.action==='copy.route_skipped')<e.events.findIndex(x=>x.action==='certificate.created'),'decided before the certificate')
  assert.equal(await h.mail('auditor.low@harbour.example','Completed:'),undefined,'skipped copy recipient gets no completed-copy mail or link')
  for(const email of ['am.low','legal.low','plain.low'])assert.ok(await h.mail(`${email}@harbour.example`,'Completed:'),`${email} gets the copy`)
  assert.ok(!e.events.find(x=>x.action==='envelope.copies_queued').detail.recipients.some(r=>r.email==='auditor.low@harbour.example'))
  const certificate=(await pdfText((await h.send(`/api/inkwell/envelopes/${low}/artifacts/certificate`,undefined,h.owner)).bytes)).replace(/\s+/g,' ')
  assert.ok(certificate.includes('Copy recipient 1: Auditor <auditor.low@harbour.example>'));assert.ok(certificate.includes('Copy skipped at'));assert.ok(certificate.includes('amount greater_than 10000.00; result false (source 5000.00); no completed-copy mail or link'))
  assert.ok(certificate.includes('note equals yes; source missing or hidden; rule unresolved, copy sent'));assert.ok(certificate.includes('tier equals gold; result true (source gold)'))
  const high=await run('25000','high');assert.equal((await read(high)).copies[0].routeResult.state,'included');assert.ok(await h.mail('auditor.high@harbour.example','Completed:'),'the 25,000 envelope sends the auditor a copy')
  const copied=await read((await h.command('envelope.copy',{id:low})).result.id);assert.deepEqual(copied.copies[0].includeWhen,{...big,value:'10000.00'});assert.ok(copied.copies.every(c=>!c.routeResult),'a copy keeps rules and resets outcomes')
  await h.command('envelope.send_copy',{id:low,recipients:[{name:'Late',email:'late@harbour.example',includeWhen:big}]},h.owner,400)
  for(const bad of [{field:'one',operator:'equals',value:'Mara'},{field:'tier',operator:'greater_than',value:'5'},{field:'missing',operator:'equals',value:'x'}]) await h.command('envelope.prepare',{...base,fields:fields('5000'),signers:[{name:'Mara',email:'mara@clients.example',order:1}],copies:[{name:'Bad',email:'bad@harbour.example',includeWhen:bad}]},h.owner,400)
 }finally{await h.close()}
})

test('ROUTE-004: a sender envelope above the rule threshold waits for the named approver; a rejection returns it with the reason; an approval sends it',async()=>{
 const h=await harness()
 try{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage([612,792]).drawText('Harbour Studio - Supply agreement',{x:60,y:740,size:18,font})
  const pdfBase64=Buffer.from(await pdf.save()).toString('base64')
  const member=async(email,role)=>{const cookie=await h.invite(email,'member'),me=(await h.send('/api/inkwell',undefined,cookie)).value.actor;await h.command('member.role',{operatorId:me.id,role},h.owner);return{cookie,id:me.id}}
  const admin=await h.invite('ada.admin@harbour.example','admin'),sam=await member('sam.sender@harbour.example','sender'),dana=await member('dana.finance@harbour.example','sender'),vic=await member('vic.viewer@harbour.example','viewer')
  const read=async(id,cookie=h.owner)=>(await h.send('/api/inkwell/envelopes/'+id,undefined,cookie))
  const fields=amount=>[{id:'sig',label:'Client signature',signer:0,type:'signature',page:0,x:.1,y:.2,width:.4,height:.05},{id:'value',label:'Contract value',signer:0,type:'number',page:0,x:.1,y:.3,width:.3,height:.04,...(amount===undefined?{}:{readOnly:true,prefill:{value:amount,source:'Sender input'}})}]
  const prepare=async(suffix,amount,cookie=sam.cookie)=>(await h.command('envelope.prepare',{title:`Supply ${suffix}`,filename:'supply.pdf',pdfBase64,signers:[{name:'Mara Quinn',email:`mara.${suffix}@clients.example`}],fields:fields(amount)},cookie)).result.id
  // Only an owner or admin sets the account rule, and only an owner, admin or sender can be its approver.
  const rule={approverEmail:'dana.finance@harbour.example',threshold:{field:'contract value',above:'10000'}}
  await h.command('account.internal_approval',{rule},sam.cookie,403)
  await h.command('account.internal_approval',{rule:{...rule,approverEmail:'vic.viewer@harbour.example'}},admin,400)
  await h.command('account.internal_approval',{rule},admin)
  assert.deepEqual((await h.send('/api/inkwell',undefined,h.owner)).value.settings.internalApproval.threshold,{field:'contract value',above:'10000.00'})
  // At or below the threshold the sender's own approval sends it at once.
  const small=await prepare('small','10000.00');await h.command('envelope.approve',{id:small,eligible:true},sam.cookie)
  assert.equal((await read(small)).value.envelope.status,'awaiting_signature');assert.ok(await h.mail('mara.small@clients.example','Please sign:'))
  // Above it, the sender's eligibility approval waits for the named approver: no invitation, the draft locked.
  const big=await prepare('big','25000.00'),waiting=await h.command('envelope.approve',{id:big,eligible:true},sam.cookie)
  assert.deepEqual(waiting.result.waitingForApproval,['dana.finance'])
  let envelope=(await read(big,sam.cookie)).value.envelope
  assert.equal(envelope.status,'prepared');assert.equal(envelope.internalApproval.state,'pending');assert.deepEqual(envelope.internalApproval.steps.map(s=>[s.name,s.rules,s.why]),[['dana.finance',['account'],['Contract value 25000.00 USD is above 10000.00 USD']]])
  assert.equal(await h.mail('mara.big@clients.example','Please sign:'),undefined,'no recipient is invited before the internal approval')
  assert.ok((await h.mail('dana.finance@harbour.example','Approval needed:')).text.includes('Contract value 25000.00 USD is above 10000.00 USD'),'the approver is asked by email')
  await h.command('envelope.approve',{id:big,eligible:true},sam.cookie,409)
  await h.command('envelope.update',{id:big,title:'Changed',filename:'supply.pdf',pdfBase64,signers:[{name:'Mara Quinn',email:'mara.big@clients.example'}],fields:fields('1.00')},sam.cookie,409)
  // The approver finds it waiting for them and may read it; nobody else may decide.
  const mine=(await h.send('/api/inkwell/envelopes?status=waiting_for_me',undefined,dana.cookie)).value;assert.deepEqual(mine.envelopes.map(e=>e.id),[big]);assert.equal(mine.envelopes[0].approvalAvailable,true)
  assert.equal((await read(big,dana.cookie)).value.envelope.access,'view')
  for(const cookie of [sam.cookie,admin,vic.cookie]) await h.command('envelope.internal_decide',{id:big,decision:'approve'},cookie,403)
  await h.command('envelope.internal_decide',{id:big,decision:'reject',reason:'no'},dana.cookie,400)
  // A rejection returns it to the sender with the reason, as an editable draft.
  await h.command('envelope.internal_decide',{id:big,decision:'reject',reason:'Volume discount missing from clause 4'},dana.cookie)
  envelope=(await read(big,sam.cookie)).value.envelope
  assert.equal(envelope.status,'prepared');assert.equal(envelope.internalApproval.state,'rejected');assert.equal(envelope.internalApproval.steps[0].reason,'Volume discount missing from clause 4')
  assert.deepEqual(envelope.events.filter(e=>e.action.startsWith('envelope.internal_')).map(e=>[e.action,e.actor]),[['envelope.internal_approval_requested',sam.id],['envelope.internal_rejected',dana.id]])
  assert.ok((await h.mail('sam.sender@harbour.example','Rejected:')).text.includes('Volume discount missing from clause 4'),'the sender is told the reason')
  assert.equal((await h.send('/api/inkwell/envelopes?status=draft',undefined,sam.cookie)).value.envelopes.some(e=>e.id===big),true)
  assert.equal((await h.send('/api/inkwell/envelopes?status=waiting_for_me',undefined,dana.cookie)).value.counts.waiting_for_me,0)
  await h.command('envelope.update',{id:big,title:'Supply big',filename:'supply.pdf',pdfBase64,signers:[{name:'Mara Quinn',email:'mara.big@clients.example'}],fields:fields('24000.00')},sam.cookie)
  // Sent again, it asks again; the approval sends it under the sender's authority.
  await h.command('envelope.approve',{id:big,eligible:true},sam.cookie)
  const approved=await h.command('envelope.internal_decide',{id:big,decision:'approve'},dana.cookie)
  assert.equal(approved.result.status,'awaiting_signature');assert.ok(await h.mail('mara.big@clients.example','Please sign:'),'the approval sends the invitation')
  envelope=(await read(big,sam.cookie)).value.envelope
  const sent=envelope.events.find(e=>e.action==='envelope.approved');assert.equal(sent.actor,sam.id);assert.deepEqual(sent.detail.internalApprovals.map(a=>[a.approver,a.name]),[[dana.id,'dana.finance']])
  assert.equal(envelope.events.filter(e=>e.action==='envelope.internal_approved').length,1)
  assert.ok((await h.mail('sam.sender@harbour.example','Approved:')))
  // A value the sender did not lock is not known before sending, so it needs the approval too; no such field, no rule.
  const open=await prepare('open',undefined);assert.ok((await h.command('envelope.approve',{id:open,eligible:true},sam.cookie)).result.waitingForApproval)
  const plain=(await h.command('envelope.prepare',{title:'NDA',filename:'nda.pdf',pdfBase64,signers:[{name:'Mara Quinn',email:'mara.nda@clients.example'}],fields:[fields()[0]]},sam.cookie)).result.id
  assert.equal((await h.command('envelope.approve',{id:plain,eligible:true},sam.cookie)).result.status,'awaiting_signature')
  // An approver keeps reading what they decided after the envelope is lowered below the threshold and sent without them.
  const lowered=await prepare('lowered','30000.00');await h.command('envelope.approve',{id:lowered,eligible:true},sam.cookie);await h.command('envelope.internal_decide',{id:lowered,decision:'reject',reason:'Too high for this client'},dana.cookie)
  await h.command('envelope.update',{id:lowered,title:'Supply lowered',filename:'supply.pdf',pdfBase64,signers:[{name:'Mara Quinn',email:'mara.lowered@clients.example'}],fields:fields('9000.00')},sam.cookie)
  assert.equal((await h.command('envelope.approve',{id:lowered,eligible:true},sam.cookie)).result.status,'awaiting_signature');assert.equal((await read(lowered,dana.cookie)).status,200)
  assert.ok((await h.send('/api/inkwell/envelopes',undefined,dana.cookie)).value.envelopes.some(e=>e.id===lowered))
  // A template rule applies to every envelope sent from it, with the account rule; the approver's own send is their approval.
  await h.command('account.internal_approval',{rule:null},h.owner)
  const template=(await h.command('template.save',{title:'Supply template',filename:'supply.pdf',pdfBase64,roles:[{role:'Client',order:1}],fields:fields('500.00'),approval:{approverEmail:'ada.admin@harbour.example'}},sam.cookie)).result.id
  const fromTemplate=(await h.command('template.use',{id:template,recipients:[{name:'Mara Quinn',email:'mara.tpl@clients.example'}]},sam.cookie)).result.id
  assert.deepEqual((await h.command('envelope.approve',{id:fromTemplate,eligible:true},sam.cookie)).result.waitingForApproval,['ada.admin'])
  assert.equal((await h.command('envelope.internal_decide',{id:fromTemplate,decision:'approve'},admin)).result.status,'awaiting_signature')
  const byAdmin=(await h.command('template.use',{id:template,recipients:[{name:'Mara Quinn',email:'mara.tpl2@clients.example'}]},admin)).result.id
  assert.equal((await h.command('envelope.approve',{id:byAdmin,eligible:true},admin)).result.status,'awaiting_signature')
  assert.equal((await read(byAdmin)).value.envelope.events.find(e=>e.action==='envelope.approved').detail.internalApprovals[0].bySender,true)
  const copied=(await h.command('envelope.copy',{id:fromTemplate},sam.cookie)).result.id;assert.ok((await h.command('envelope.approve',{id:copied,eligible:true},sam.cookie)).result.waitingForApproval,'a copy keeps the template rule')
 }finally{await h.close()}
})

test('ROUTE-005: the "Company Signers" group of three signs as one place; one member signs, the others see it done, and the record names the signer and the group',async()=>{
 const h=await harness()
 try{
  const pdf=await PDFDocument.create();pdf.addPage([612,792]);const base={title:'Supply agreement',filename:'supply.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64')}
  const fields=[{id:'client',label:'Client signature',type:'signature',signer:0,page:0,x:.1,y:.2,width:.6,height:.04},{id:'company',label:'Company signature',type:'signature',signer:1,page:0,x:.1,y:.4,width:.6,height:.04}]
  const members=[{name:'Ada Park',email:'ada@harbour.example'},{name:'Ben Ortiz',email:'ben@harbour.example'},{name:'Cy Lane',email:'cy@harbour.example'}]
  await h.command('account.signing_group',{name:'Solo',members:members.slice(0,1)},h.owner,400)
  const group=(await h.command('account.signing_group',{name:'Company Signers',members})).result.groups[0]
  await h.command('account.signing_group',{name:'company signers',members},h.owner,409)
  assert.deepEqual((await h.send('/api/inkwell',undefined,h.owner)).value.signingGroups.map(g=>g.name),['Company Signers'])
  const read=async id=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const signers=[{name:'Mara Quinn',email:'mara@clients.example',order:1},{group:group.id,order:2}]
  await h.command('envelope.prepare',{...base,fields,signers:[signers[0],{...signers[1],accessCode:'harbour-42'}]},h.owner,409)
  await h.command('envelope.prepare',{...base,fields,signers:[signers[0],{...signers[1],inPerson:true}]},h.owner,409)
  await h.command('envelope.prepare',{...base,fields,signers:[signers[0],{group:group.id,order:2},{name:'Ada again',email:'ada@harbour.example',order:3}]},h.owner,400)
  const id=(await h.command('envelope.prepare',{...base,fields,signers})).result.id
  // The draft snapshots the group: a later change to the group does not reach it.
  await h.command('account.signing_group',{id:group.id,name:'Company Signers',members:members.slice(0,2)})
  assert.deepEqual((await read(id)).signers[1].group.members.map(m=>m.email),members.map(m=>m.email))
  await h.command('account.signing_group',{id:group.id,name:'Company Signers',members})
  await h.command('envelope.approve',{id,eligible:true})
  const link=async email=>new URL((await h.mail(email,'Please sign:')).text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.replace('/sign/','/api/sign/')
  const verify=async(email,path)=>{await h.post(path+'/code',{},'');const code=(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0];return (await h.post(path+'/verify',{code},'')).cookie}
  const sign=async(email,values)=>{const path=await link(email),cookie=await verify(email,path);await h.agree(path,cookie);return h.post(path+'/sign',{values,consent:true,commandId:crypto.randomUUID()},cookie)}
  for(const m of members)assert.equal(await h.mail(m.email,'Please sign:'),undefined,'the group waits for its routing order')
  await sign('mara@clients.example',{client:'Mara Quinn'})
  // At its turn every member gets their own link; reminders go to every member.
  const paths=await Promise.all(members.map(m=>link(m.email)));assert.equal(new Set(paths).size,3)
  assert.ok((await h.mail('ada@harbour.example','Please sign:')).text.includes('signing group Company Signers'))
  await h.command('envelope.remind',{id});for(const m of members)assert.ok(await h.mail(m.email,'Reminder to sign'),`${m.name} is reminded`)
  await h.scheduled(Date.parse((await read(id)).expiresAt)-2*86_400_000);for(const m of members)assert.ok(await h.mail(m.email,'Expires soon'),`${m.name} is warned before expiry`)
  const ben=await verify('ben@harbour.example',paths[1]);await h.post(paths[1]+'/reassign',{name:'Dee',email:'dee@harbour.example',reason:'Away',commandId:crypto.randomUUID()},ben,409)
  const ada=await verify('ada@harbour.example',paths[0]);await h.agree(paths[0],ada)
  // Ben signs for the group; nobody else's agreement or verification counts for him.
  await h.post(paths[1]+'/sign',{values:{company:'Ben Ortiz'},consent:true,commandId:crypto.randomUUID()},ben,403);await h.agree(paths[1],ben);await h.post(paths[1]+'/sign',{values:{company:'Ben Ortiz'},consent:true,commandId:crypto.randomUUID()},ben)
  const done=await read(id);assert.equal(done.status,'completed');assert.equal(done.signers[1].group.signedBy,1)
  for(const path of [paths[0],paths[2]]){const view=(await h.send(path,undefined,'')).value;assert.equal(view.group.name,'Company Signers');assert.equal(view.group.signedBy.name,'Ben Ortiz');assert.ok(view.group.signedBy.at);assert.equal(view.canSign,false)}
  await h.post(paths[0]+'/sign',{values:{company:'Ada Park'},consent:true,commandId:crypto.randomUUID()},ada,409)
  await h.send(paths[0]+'/artifacts/signed',undefined,ada).then(r=>assert.equal(r.status,409,'another member gets no completed copy'))
  assert.ok(await h.mail('ben@harbour.example','Completed:'),'the member who signed gets the completed copy');for(const email of ['ada@harbour.example','cy@harbour.example'])assert.equal(await h.mail(email,'Completed:'),undefined)
  const certificate=(await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes)).replace(/\s+/g,' ')
  assert.ok(certificate.includes('Signer 2: Signing group Company Signers'));assert.ok(certificate.includes('Signed for Company Signers by Ben Ortiz <ben@harbour.example>'))
  assert.ok(certificate.includes('Group members invited: Ada Park <ada@harbour.example>; Ben Ortiz <ben@harbour.example>; Cy Lane <cy@harbour.example>'))
  assert.equal((certificate.match(/emailed verification code, verified/g)??[]).length,2,'the certificate shows the signing member\'s authentication, not another member\'s')
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,true)
  // A member's decline declines the envelope and names them; a copy keeps the group.
  const copy=(await h.command('envelope.copy',{id})).result.id;assert.equal((await read(copy)).signers[1].group.name,'Company Signers')
  const second=(await h.command('envelope.prepare',{...base,fields,signers:[{group:group.id,order:1},{...signers[0],order:2}]})).result.id
  await h.command('envelope.approve',{id:second,eligible:true})
  const cy=await link('cy@harbour.example'),cookie=await verify('cy@harbour.example',cy);await h.post(cy+'/decline',{reason:'Terms not agreed',commandId:crypto.randomUUID()},cookie)
  const declined=await read(second);assert.equal(declined.status,'declined');assert.equal(declined.signers[0].group.declinedBy,2)
  assert.equal((await h.send(await link('ada@harbour.example'),undefined,'')).value.declined.by,'Cy Lane')
  // TMPL-001: a template role may be filled by the group.
  const template=(await h.command('template.save',{...base,roles:[{role:'Client',order:1},{role:'Company',order:2}],fields})).result.id
  const used=(await h.command('template.use',{id:template,recipients:[{name:'Mara Quinn',email:'mara@clients.example'},{group:group.id}]})).result.id
  assert.deepEqual((await read(used)).signers[1].group.members.map(m=>m.name),members.map(m=>m.name))
 }finally{await h.close()}
})

// SEND-001 / ROUTE-004: authority and the confirmed definition are rechecked when a delayed send is released.
test('SEND-001: deferred sends hold after role, active status, edit share or confirmed definition changes; a current editor confirms again', async () => {
 const h = await harness()
 try {
  const pdf = await PDFDocument.create(); pdf.addPage([612,792])
  const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
  const fields = [{id:'sig',label:'Signature',signer:0,type:'signature',page:0,x:.1,y:.2,width:.4,height:.05}]
  const approver = await h.invite('release.approver@harbour.example','admin')
  const read = async id => (await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const sendAt = new Date(Date.now()+2*86_400_000), local = sendAt.toISOString().slice(0,16)
  // Honolulu has no clock transitions: a future UTC wall-clock is still a future time there.
  const schedule = {at:local,timeZone:'Pacific/Honolulu'}
  for (const mode of ['scheduled','internal']) for (const change of ['role','inactive','share','definition','none']) {
   const email = `release.${mode}.${change}@harbour.example`, cookie = await h.invite(email,'member')
   const actor = (await h.send('/api/inkwell',undefined,cookie)).value.actor
   await h.command('member.role',{operatorId:actor.id,role:'sender'})
   await h.command('account.internal_approval',{rule:mode==='internal'?{approverEmail:'release.approver@harbour.example'}:null})
   const recipient = `client.${mode}.${change}@clients.example`
   const input = {title:`Harbour services ${mode} ${change}`,filename:'services.pdf',pdfBase64,signers:[{name:'Mara Quinn',email:recipient}],fields}
   const id = (await h.command('envelope.prepare',input,change==='share'?h.owner:cookie)).result.id
   if (change==='share') await h.command('envelope.share',{id,email,access:'edit'})
   await h.command('envelope.approve',{id,eligible:true,...(mode==='scheduled'?{sendAt:schedule}:{})},cookie)
   const confirmed = await read(id)
   assert.equal(await h.mail(recipient,'Please sign:'),undefined,'no invitation while deferred')
   if (change==='role') await h.command('member.role',{operatorId:actor.id,role:'viewer'})
   if (change==='inactive') await h.post('/auth/operator/status',{operatorId:actor.id,status:'inactive'},h.owner)
   if (change==='share') await h.command('envelope.unshare',{id,operatorId:actor.id})
   if (change==='definition') await h.command('envelope.extend',{id,days:1})
   if (mode==='scheduled') await h.scheduled(Date.parse(confirmed.scheduled.at)+60_000)
   else await h.command('envelope.internal_decide',{id,decision:'approve'},approver)
   const released = await read(id)
   if (change==='none') {
    assert.equal(released.status,'awaiting_signature');assert.ok(await h.mail(recipient,'Please sign:'),'unchanged live authority releases the invitation')
    assert.equal(released.events.findLast(e=>e.action==='envelope.approved').actor,actor.id)
    continue
   }
   assert.equal(released.status,'prepared');assert.ok(released.sendHold?.at)
   assert.equal(released.scheduled,undefined);assert.equal(released.internalApproval,undefined)
   assert.ok(released.events.some(e=>e.action==='envelope.send_held'&&e.detail.authority===actor.id))
   assert.equal(await h.mail(recipient,'Please sign:'),undefined,'no invitation after revoked authority or a changed definition')
   await h.command('envelope.open_signing',{id},h.owner,409)
   // Restoration of the old role/share/status does not automatically release a held confirmation.
   if (change==='role') await h.command('member.role',{operatorId:actor.id,role:'sender'})
   if (change==='share') await h.command('envelope.share',{id,email,access:'edit'})
   if (change==='inactive') await h.post('/auth/operator/status',{operatorId:actor.id,status:'active'},h.owner)
   await h.scheduled((confirmed.scheduled?Date.parse(confirmed.scheduled.at):sendAt.getTime())+120_000)
   assert.equal((await read(id)).status,'prepared');assert.equal(await h.mail(recipient,'Please sign:'),undefined)
   await h.command('envelope.approve',{id,eligible:true})
   if (mode==='internal') await h.command('envelope.internal_decide',{id,decision:'approve'},approver)
   const sent = await read(id)
   assert.equal(sent.status,'awaiting_signature');assert.equal(sent.sendHold,undefined)
   assert.equal(sent.originalSha256,confirmed.originalSha256);assert.deepEqual(sent.fields,confirmed.fields)
   assert.ok(await h.mail(recipient,'Please sign:'),'fresh confirmation releases exactly one invitation')
   const verify = await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)
   assert.equal(verify.status,200);assert.equal(verify.value.auditChain.ok,true)
  }
 } finally { await h.close() }
})
