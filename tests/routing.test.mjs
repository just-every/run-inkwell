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
test('SEND-001 and ADMIN-004: deferred sends hold after role, active status, edit share or confirmed definition changes; a current editor confirms again', async () => {
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
   const heldEvent = released.events.findLast(e=>e.action==='envelope.send_held')
   assert.equal(heldEvent.detail.authority,actor.id)
   assert.ok(await h.mail(email, 'Sending held:'), 'ADMIN-004 notifies the principal even when their account was deactivated')
   if (mode==='internal') { assert.equal(heldEvent.actor,(await h.send('/api/inkwell',undefined,approver)).value.actor.id); assert.equal(heldEvent.detail.attemptedDecision,'approve'); assert.equal(heldEvent.detail.sendReleased,false) }
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

test('Recipient roles: eight signers, approver, filler and completed-only copies; nominated witness isolates signed documents, blocks later orders and returns a decline for replacement',async()=>{
 const h=await harness()
 try {
  const pdf=async title=>{const p=await PDFDocument.create();p.addPage([612,792]).drawText(title,{x:50,y:740});return Buffer.from(await p.save()).toString('base64')}
  const people=Array.from({length:8},(_,i)=>({name:`Harbour signer ${i+1}`,email:`signer-${i+1}@roles.example`,order:i===0?1:2,...(i===0?{witnesses:{minimum:1,maximum:2,address:true}}:{})}))
  people.push({name:'Finance Approver',email:'approver@roles.example',role:'approver',order:3},{name:'Accounts Filler',email:'filler@roles.example',role:'form_filler',order:4})
  const fields=Array.from({length:8},(_,i)=>({id:`sig-${i}`,label:`Signature ${i+1}`,type:'signature',signer:i,document:i===1?1:0,documentPage:0,page:0,x:.08,y:.12+i*.08,width:.6,height:.045}))
  fields.push({id:'reference',label:'Purchase reference',type:'text',signer:9,document:0,documentPage:0,page:0,x:.08,y:.78,width:.6,height:.045})
  const copies=Array.from({length:3},(_,i)=>({name:`Records desk ${i+1}`,email:`copy-${i+1}@roles.example`}))
  const id=(await h.command('envelope.prepare',{title:'Workshop service packet',documents:[{filename:'agreement.pdf',pdfBase64:await pdf('Client agreement'),mode:'sign',visibleTo:{signers:[0,2,3,4,5,6,7,8,9],copies:[0,1,2]}},{filename:'compensation.pdf',pdfBase64:await pdf('PRIVATE COMPENSATION MEMO'),mode:'sign',visibleTo:{signers:[1],copies:[0,1,2]}}],fields,signers:people,copies})).result.id
  const read=async()=>(await h.send(`/api/inkwell/envelopes/${id}`,undefined,h.owner)).value.envelope
  const open=async email=>{const invitation=await h.mail(email,'Please sign:')??await h.mail(email,'Please approve:')??await h.mail(email,'Please complete fields:'),path='/api'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname;await h.post(path+'/code',{},'');const cookie=(await h.post(path+'/verify',{code:(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie;await h.agree(path,cookie);return{path,cookie}}
  const post=(s,action,body,status=200)=>h.post(s.path+'/'+action,{...body,commandId:crypto.randomUUID()},s.cookie,status)
  const sign=async(s,values)=>post(s,'sign',{values,consent:true,timeZone:'America/New_York'})
  await h.command('envelope.approve',{id,eligible:true})
  for(const p of [...people.slice(1),...copies])assert.equal(await h.mail(p.email,'Please sign:'),undefined)
  const first=await open(people[0].email)
  assert.equal((await h.send(first.path,undefined,first.cookie)).value.fields.length,1)
  await post(first,'sign',{values:{'sig-0':people[0].name},consent:true},400)
  await post(first,'witnesses',{nominees:[{name:people[0].name,email:people[0].email}]},400)
  await post(first,'witnesses',{nominees:[{name:people[1].name,email:people[1].email}]},400)
  await h.post(first.path+'/witnesses',{nominees:[{name:'Taylor Witness',email:'taylor@witness.example'}],commandId:crypto.randomUUID()},'',401)
  await post(first,'witnesses',{nominees:[{name:'Taylor Witness',email:'taylor@witness.example'}]})
  assert.equal(await h.mail('taylor@witness.example','Please sign:'),undefined,'nomination alone sends nothing')
  await sign(first,{'sig-0':people[0].name})
  assert.ok(await h.mail('taylor@witness.example','Please sign:'));assert.equal(await h.mail(people[1].email,'Please sign:'),undefined)
  await post(first,'sign',{values:{'sig-0':'Changed signature'},consent:true},409)
  const declined=await open('taylor@witness.example')
  await post(declined,'decline',{reason:'I cannot attend this signing'})
  assert.equal((await read()).status,'awaiting_signature');assert.equal((await read()).signers[0].witnessReturnRequired,true)
  assert.equal((await h.send(declined.path,undefined,declined.cookie)).status,404)
  assert.equal(await h.mail(people[1].email,'Please sign:'),undefined)
  await post(first,'witnesses',{nominees:[{name:'Riley Witness',email:'riley@witness.example'}]})
  const witness=await open('riley@witness.example'),view=(await h.send(witness.path,undefined,witness.cookie)).value
  assert.equal(view.role,'witness');assert.equal(view.witnessedSigner.name,people[0].name);assert.deepEqual(view.documents.map(d=>d.filename),['agreement.pdf'])
  assert.ok(view.fields.every(f=>f.signer===view.signerIndex));assert.deepEqual(view.fields.map(f=>f.type),['signature','full_name','date_signed','text'])
  const preview=await pdfText((await h.send(witness.path+'/document',undefined,witness.cookie)).bytes)
  assert.ok(preview.includes(people[0].name),'witness sees the principal’s completed mark');assert.ok(!preview.includes('PRIVATE COMPENSATION MEMO'))
  assert.equal((await h.send(witness.path+'/documents/1',undefined,witness.cookie)).status,404)
  await post(witness,'approve',{consent:true},403);await post(witness,'fill',{values:{},consent:true},403)
  await post(witness,'sign',{values:{'sig-0':'Forged'},consent:true},400)
  await sign(witness,Object.fromEntries(view.fields.filter(f=>f.type!=='date_signed').map(f=>[f.id,f.type==='text'?'18 Harbour Road':f.type==='full_name'?'Riley Witness':'Riley Witness'])))
  assert.ok(await h.mail(people[1].email,'Please sign:'))
  for(let i=1;i<8;i++){const s=await open(people[i].email);await post(s,'approve',{consent:true},403);await sign(s,{[`sig-${i}`]:people[i].name})}
  const approver=await open(people[8].email),approvalView=(await h.send(approver.path,undefined,approver.cookie)).value
  assert.equal(approvalView.role,'approver');assert.deepEqual(approvalView.fields,[])
  await post(approver,'sign',{values:{},consent:true},403)
  await post(approver,'fill',{values:{reference:'not yours'},consent:true},403)
  await post(approver,'approve',{consent:false},400)
  await post(approver,'approve',{consent:true})
  assert.equal((await read()).signers[8].signedAt,undefined);assert.ok((await read()).signers[8].completedAt)
  const filler=await open(people[9].email),fillerView=(await h.send(filler.path,undefined,filler.cookie)).value
  assert.equal(fillerView.role,'form_filler');assert.deepEqual(fillerView.fields.map(f=>f.id),['reference'])
  await post(filler,'sign',{values:{reference:'PO-2048'},consent:true},403)
  await post(filler,'fill',{values:{'sig-0':'not yours'},consent:true},400)
  await post(filler,'fill',{values:{},consent:true},400)
  for(const c of copies)assert.equal(await h.mail(c.email,'Completed:'),undefined)
  await post(filler,'fill',{values:{reference:'PO-2048'},consent:true})
  const done=await read();assert.equal(done.status,'completed');assert.ok(done.signers[9].completedAt);assert.equal(done.signers[9].signedAt,undefined)
  const certificate=(await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes)).replace(/\s+/g,' ')
  assert.ok(certificate.includes('Witness for signer 1: Harbour signer 1'));assert.ok(certificate.includes('Approved without signing at:'));assert.ok(certificate.includes('Fields completed without signing at:'));assert.ok(certificate.includes('riley@witness.example'));assert.ok(certificate.includes('Witness declined at'));for(const i of [0,done.signers.findIndex(s=>s.email==='riley@witness.example')]){const authentication=done.events.find(e=>e.action==='signer.email_verified'&&e.detail.signer===i);assert.ok(authentication);assert.ok(certificate.includes(authentication.at));assert.ok(certificate.includes(done.signers[i].email))}
  assert.ok((await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,h.owner)).bytes)).includes('PO-2048'))
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,true)
  for(const c of copies){const mail=await h.mail(c.email,'Completed:');assert.ok(mail);assert.ok(!mail.text.includes('/sign/'),'copies have no action link')}
  const witnessCopy=await h.mail('riley@witness.example','Completed:'),copyPath='/api'+new URL(witnessCopy.text.match(/http:\/\/[^\s]+\/copy\/[^\s]+/)[0]).pathname
  await h.post(copyPath+'/code',{},'');const copyCookie=(await h.post(copyPath+'/verify',{code:(await h.mail('riley@witness.example')).text.match(/\b\d{6}\b/)[0]},'')).cookie
  assert.ok(!(await pdfText((await h.send(copyPath+'/artifacts/signed',undefined,copyCookie)).bytes)).includes('PRIVATE COMPENSATION MEMO'))
  assert.equal((await h.send(copyPath+'/artifacts/executed-1',undefined,copyCookie)).status,404)
  const copied=(await h.command('envelope.copy',{id})).result.id,copiedRecord=(await h.send('/api/inkwell/envelopes/'+copied,undefined,h.owner)).value.envelope
  assert.equal(copiedRecord.signers.length,10);assert.equal(copiedRecord.signers[8].role,'approver');assert.equal(copiedRecord.signers[9].role,'form_filler');assert.deepEqual(copiedRecord.signers[0].witnesses,people[0].witnesses)
  assert.ok(copiedRecord.signers.every(s=>!s.completedAt&&!s.signedAt&&!s.witnessNominees))
  const template=(await h.command('template.from_envelope',{id})).result.id,reused=(await h.command('template.use',{id:template,recipients:people.map(({name,email})=>({name,email}))})).result.id,reusedRecord=(await h.send('/api/inkwell/envelopes/'+reused,undefined,h.owner)).value.envelope
  assert.equal(reusedRecord.signers.length,10);assert.equal(reusedRecord.signers[8].role,'approver');assert.equal(reusedRecord.signers[9].role,'form_filler');assert.deepEqual(reusedRecord.signers[0].witnesses,people[0].witnesses)
  const restored=await harness()
  try{const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value;await restored.post('/api/inkwell/archive/restore',{archive});assert.equal((await restored.send(`/api/inkwell/envelopes/${id}/verify`,undefined,restored.owner)).value.ok,true)}finally{await restored.close()}
 }finally{await h.close()}
})

test('Recipient include rules: approver, filler and both pre-named witnesses inherit the route, while skipped roles receive no action or completed copy',async()=>{
 const h=await harness()
 try{
  const pdf=await PDFDocument.create();pdf.addPage([612,792]);const base={filename:'rules.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64')}
  const field=(id,type,signer,y,extra={})=>({id,label:id,type,signer,page:0,x:.1,y,width:.6,height:.045,...extra}),rule={field:'amount',operator:'greater_than',value:'10000'}
  const open=async email=>{const mail=await h.mail(email,'Please sign:')??await h.mail(email,'Please approve:')??await h.mail(email,'Please complete fields:'),path='/api'+new URL(mail.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname;const linkOnly=(await h.send(path)).value.linkOnly;let cookie;if(linkOnly)cookie=(await h.post(path+'/open',{},'')).cookie;else{await h.post(path+'/code',{},'');cookie=(await h.post(path+'/verify',{code:(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie}await h.agree(path,cookie);return{path,cookie}}
  const act=(s,path,body,status=200)=>h.post(s.path+'/'+path,{...body,commandId:crypto.randomUUID()},s.cookie,status)
  for(const amount of ['5000','25000']){
   const principal={name:'Mara Quinn',email:`mara-${amount}@rules.example`,order:1,includeWhen:rule,witnesses:{minimum:2,maximum:2,linkOnly:true,named:[{name:'Witness North',email:`north-${amount}@rules.example`},{name:'Witness South',email:`south-${amount}@rules.example`}]}},approver={name:'Approver',email:`approve-${amount}@rules.example`,role:'approver',order:2,includeWhen:rule},filler={name:'Filler',email:`fill-${amount}@rules.example`,role:'form_filler',order:2,includeWhen:rule},last={name:'Jon Reed',email:`last-${amount}@rules.example`,order:3}
   const fields=[field('first','signature',0,.1),field('amount','number',0,.2,{readOnly:true,prefill:{value:amount,source:'Confirmed amount'}}),field('reference','text',2,.3),field('last','signature',3,.4)]
   const id=(await h.command('envelope.prepare',{...base,title:'Conditional roles '+amount,signers:[principal,approver,filler,last],fields})).result.id
   await h.command('envelope.approve',{id,eligible:true})
   const read=async()=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
   if(amount==='5000'){
    assert.deepEqual((await read()).signers.slice(0,3).map(s=>s.routeResult.state),['skipped','skipped','skipped'])
    for(const s of [principal,approver,filler,...principal.witnesses.named])assert.equal(await h.mail(s.email,'Please sign:'),undefined)
   }else{
    const s=await open(principal.email);await act(s,'sign',{values:{first:principal.name},consent:true})
    const active=(await read()).signers.filter(s=>s.witnessFor===0);assert.equal(active.length,2);assert.ok(active.every(w=>w.routeResult.state==='included'&&w.includeWhen.field==='amount'))
    for(const [n,w] of active.entries()){
     assert.equal(await h.mail(approver.email,'Please sign:'),undefined)
     const v=await open(w.email),own=(await h.send(v.path,undefined,v.cookie)).value.fields
     await act(v,'sign',{values:Object.fromEntries(own.filter(f=>f.type!=='date_signed').map(f=>[f.id,w.name])),consent:true,timeZone:'America/New_York'})
     if(n===0)assert.equal(await h.mail(approver.email,'Please sign:'),undefined,'the second witness still blocks later orders')
    }
    const a=await open(approver.email);await act(a,'approve',{consent:true})
    const f=await open(filler.email);await act(f,'fill',{values:{reference:'RF-300'},consent:true})
    await h.command('envelope.correct',{id,fields:(await read()).fields.map(f=>f.id==='reference'?{...f,label:'Changed after action'}:f)},h.owner,409)
   }
   const s=await open(last.email);await act(s,'sign',{values:{last:last.name},consent:true})
   assert.equal((await read()).status,'completed');assert.equal((await h.send('/api/inkwell/envelopes/'+id+'/verify',undefined,h.owner)).value.ok,true)
   if(amount==='5000')for(const s of [principal,approver,filler])assert.equal(await h.mail(s.email,'Completed:'),undefined)
  }
 }finally{await h.close()}
})

// Append to routing.test.mjs, reusing its test/assert/PDFDocument/StandardFonts/harness/pdfText imports.
async function viewRolePdf(label){const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);doc.addPage([612,792]).drawText(label,{x:50,y:700,size:14,font});return Buffer.from(await doc.save()).toString('base64')}
async function viewRoleSession(h,email){
 const invitation=await h.mail(email),path='/api'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname
 await h.post(path+'/code',{},'');const code=(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0]
 const cookie=(await h.post(path+'/verify',{code},'')).cookie
 return {path,cookie}
}
const viewRoleRecord=async(h,id)=>(await h.post('/api/inkwell/envelopes/'+id,undefined)).value.envelope

test('View roles advance only after authenticated successful PDF openings cover every permitted component; hidden, metadata and repeated requests do not fabricate delivery',async()=>{
 const h=await harness()
 try{
  const viewRule={field:'delivery-route',operator:'equals',value:'yes'},people=[{name:'Reader',email:'reader@example.test',role:'needs_to_view',order:1,includeWhen:viewRule},{name:'Certified recipient',email:'certified@example.test',role:'certified_delivery',order:2,includeWhen:viewRule},{name:'Final signer',email:'final@example.test',order:3}]
  const definitions=await Promise.all(['Agreement','Visible appendix','Private memo'].map(viewRolePdf))
  const {id}=(await h.command('envelope.prepare',{title:'Observed document openings',documents:definitions.map((pdfBase64,i)=>({filename:`document-${i}.pdf`,pdfBase64,mode:i===0?'sign':'view',visibleTo:{signers:i===2?[2]:[0,1,2],copies:[]}})),signers:people,fields:[{id:'signature',label:'Signature',type:'signature',signer:2,document:0,page:0,x:.1,y:.5,width:.4,height:.07},{id:'delivery-route',label:'Delivery route',type:'text',signer:2,document:0,page:0,x:.1,y:.7,width:.4,height:.04,readOnly:true,prefill:{value:'yes',source:'Sender input'}}]})).result
  await h.command('envelope.approve',{id,eligible:true})
  assert.ok((await viewRoleRecord(h,id)).signers.slice(0,2).every(s=>s.routeResult?.state==='included'))
  const first=await viewRoleSession(h,people[0].email)
  await h.post(first.path+'/document',undefined,first.cookie,403)
  await h.agree(first.path,first.cookie)
  await h.post(first.path,undefined,first.cookie)
  assert.equal((await viewRoleRecord(h,id)).signers[0].completedAt,undefined,'authentication and metadata never finish a view role')
  await h.post(first.path+'/documents/2',undefined,first.cookie,404)
  assert.equal((await viewRoleRecord(h,id)).events.filter(e=>e.action==='recipient.document_opened').length,0,'a hidden PDF request stores no opening')
  const duplicate=await Promise.all([h.send(first.path+'/documents/0',undefined,first.cookie),h.send(first.path+'/documents/0',undefined,first.cookie)])
  assert.ok(duplicate.every(r=>r.status===200),'concurrent same-document openings are idempotent')
  let record=await viewRoleRecord(h,id)
  assert.equal(record.signers[0].viewedDocuments.length,1);assert.equal(record.signers[0].completedAt,undefined)
  assert.equal(await h.mail(people[1].email),undefined,'the later routing order is not invited after only one component')
  await h.post(first.path+'/documents/1',undefined,first.cookie)
  record=await viewRoleRecord(h,id)
  assert.ok(record.signers[0].completedAt);assert.equal(record.signers[0].signedAt,undefined);assert.equal(record.signers[0].adoption,undefined)
  assert.deepEqual(record.signers[0].viewedDocuments.map(d=>[d.document,d.sha256]),[0,1].map(i=>[i,record.documents[i].sha256]))
  const completion=record.events.find(e=>e.action==='recipient.viewed')
  assert.equal(completion.at,record.signers[0].completedAt);assert.equal(completion.detail.observation,'authenticated_pdf_open_request')
  await h.post(first.path+'/documents/0',undefined,first.cookie)
  assert.equal((await viewRoleRecord(h,id)).events.filter(e=>e.action==='recipient.viewed').length,1,'reopening does not duplicate the completed action')
  const second=await viewRoleSession(h,people[1].email);await h.agree(second.path,second.cookie)
  const delivered=await h.post(second.path+'/document',undefined,second.cookie)
  assert.ok((await pdfText(delivered.bytes)).includes('Visible appendix'));assert.ok(!(await pdfText(delivered.bytes)).includes('Private memo'))
  record=await viewRoleRecord(h,id)
  assert.deepEqual(record.signers[1].viewedDocuments.map(d=>d.document),[0,1]);assert.ok(record.events.some(e=>e.action==='recipient.certified_delivered'&&e.at===record.signers[1].completedAt))
  const final=await viewRoleSession(h,people[2].email);await h.agree(final.path,final.cookie)
  await h.post(final.path+'/sign',{values:{signature:people[2].name},consent:true,commandId:crypto.randomUUID()},final.cookie)
  record=await viewRoleRecord(h,id);assert.equal(record.status,'completed')
  for(const i of [0,1]){assert.equal(record.signers[i].signedAt,undefined);assert.equal(record.signers[i].values,undefined)}
 }finally{await h.close()}
})

test('A legacy single-PDF view role opens virtual document zero and completes without adopting a signature',async()=>{
 const h=await harness()
 try{
  const email='single-reader@example.test', {id}=(await h.command('envelope.prepare',{title:'Legacy single-document view',filename:'single.pdf',pdfBase64:await viewRolePdf('Single view document'),signers:[{name:'Single reader',email,role:'needs_to_view'}],fields:[]})).result
  await h.command('envelope.approve',{id,eligible:true})
  const session=await viewRoleSession(h,email);await h.agree(session.path,session.cookie)
  await h.post(session.path+'/document',undefined,session.cookie)
  const completed=await viewRoleRecord(h,id)
  assert.equal(completed.status,'completed');assert.equal(completed.signers[0].signedAt,undefined)
  assert.deepEqual(completed.signers[0].viewedDocuments,[{document:0,sha256:completed.originalSha256,at:completed.signers[0].completedAt}])
  await h.post(session.path+'/document',undefined,session.cookie)
  assert.equal((await viewRoleRecord(h,id)).events.filter(e=>e.action==='recipient.viewed').length,1)
 }finally{await h.close()}
})

test('Naming and editing use sender-granted later places, audit identities and fields, refuse wider authority and invite only the resulting recipient',async()=>{
 const h=await harness()
 try{
  const pdfBase64=await viewRolePdf('Harbour Studio - Contractor services'),field={id:'client-signature',label:'Client signature',type:'signature',signer:2,page:0,x:.1,y:.65,width:.4,height:.07}
  const namingRule={field:'naming-route',operator:'equals',value:'yes'}
  const signers=[{name:'Jordan Ellis',email:'jordan@harbour.example',role:'specify_recipients',order:1,delegates:[2],includeWhen:namingRule},{name:'Priya Shah',email:'priya@harbour.example',role:'editor',order:2,delegates:[2],includeWhen:namingRule},{name:'',email:'',unresolvedIdentity:true,order:3}]
  const locked={id:'naming-route',label:'Naming route',type:'text',signer:2,page:0,x:.1,y:.8,width:.4,height:.04,readOnly:true,prefill:{value:'yes',source:'Sender input'}}
  const input={title:'Contractor services',documents:[{filename:'services.pdf',pdfBase64,mode:'sign'},{filename:'internal-memo.pdf',pdfBase64:await viewRolePdf('Private internal compensation memo'),mode:'view',visibleTo:{signers:[2],copies:[]}}],signers,fields:[field,locked]}
  await h.command('envelope.prepare',{...input,signers:signers.map((s,i)=>i===0?{...s,delegates:[1]}:s)},h.owner,400)
  const sender=await h.invite('sender.delegation@harbour.example','member'),people=(await h.send('/api/inkwell',undefined,h.owner)).value.people
  await h.command('member.role',{operatorId:people.find(p=>p.email==='sender.delegation@harbour.example').id,role:'sender'})
  await h.command('envelope.prepare',input,sender,403)
  const {id}=(await h.command('envelope.prepare',input)).result;await h.command('envelope.approve',{id,eligible:true})
  const read=async()=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  assert.ok((await read()).signers.slice(0,2).every(s=>s.routeResult?.state==='included'));assert.equal((await read()).signers[2].email,'');assert.equal((await read()).signers[2].activatedAt,undefined)
  const agent=await viewRoleSession(h,signers[0].email);await h.agree(agent.path,agent.cookie)
  const projection=(await h.post(agent.path,undefined,agent.cookie)).value.delegation
  assert.deepEqual(projection.targets.map(t=>[t.place,t.unresolved]),[[2,true]]);assert.deepEqual(projection.fields,[])
  await h.post(agent.path+'/sign',{values:{},consent:true,commandId:crypto.randomUUID()},agent.cookie,403)
  await h.post(agent.path+'/specify-recipients',{recipients:[{place:1,name:'Other editor',email:'other@harbour.example'}],consent:true,commandId:crypto.randomUUID()},agent.cookie,403)
  await h.post(agent.path+'/specify-recipients',{recipients:[{place:2,name:'Mara Quinn',email:'mara@harbour.example'}],message:'Replace the sender message',consent:true,commandId:crypto.randomUUID()},agent.cookie,403)
  const naming={recipients:[{place:2,name:'Mara Quinn',email:'mara@harbour.example'}],consent:true,commandId:crypto.randomUUID()}
  await h.post(agent.path+'/specify-recipients',naming,agent.cookie);await h.post(agent.path+'/specify-recipients',naming,agent.cookie)
  assert.equal((await read()).events.filter(e=>e.action==='recipient.specified').length,1)
  assert.equal(await h.mail('mara@harbour.example','Please sign:'),undefined,'order three waits for editor')
  const editor=await viewRoleSession(h,signers[1].email);await h.agree(editor.path,editor.cookie)
  const editView=(await h.post(editor.path,undefined,editor.cookie)).value.delegation
  assert.deepEqual(editView.targets.map(t=>t.place),[2]);assert.equal(editView.fields[0].id,field.id)
  const added={id:'purchase-order',label:'Purchase order',type:'text',signer:2,page:0,x:.1,y:.5,width:.4,height:.05}
  await h.post(editor.path+'/edit',{recipients:[{place:2,name:'Mara Quinn',email:'mara.corrected@harbour.example',order:1}],fields:[field,locked,added],consent:true,commandId:crypto.randomUUID()},editor.cookie,403)
  await h.post(editor.path+'/edit',{recipients:[],fields:[field,locked,{...added,signer:1}],consent:true,commandId:crypto.randomUUID()},editor.cookie,403)
  await h.post(editor.path+'/edit',{recipients:[],fields:[field,locked,{...added,page:1}],consent:true,commandId:crypto.randomUUID()},editor.cookie,403)
  const editing={recipients:[{place:2,name:'Mara Quinn',email:'mara.corrected@harbour.example',message:'Please supply the workshop purchase order.'}],fields:[field,locked,added],consent:true,commandId:crypto.randomUUID()}
  await h.post(editor.path+'/edit',editing,editor.cookie)
  const edited=await read(),identity=edited.events.findLast(e=>e.action==='signer.corrected'&&e.detail.byRecipient===1),fields=edited.events.find(e=>e.action==='envelope.corrected'&&e.detail.byRecipient===1)
  assert.equal(identity.detail.before.email,'mara@harbour.example');assert.equal(identity.detail.after.email,'mara.corrected@harbour.example');assert.ok(fields.detail.changes.fields.after.some(f=>f.id===added.id));assert.equal(edited.signers[2].message,editing.recipients[0].message)
  assert.equal(await h.mail('mara@harbour.example','Please sign:'),undefined)
  const client=await viewRoleSession(h,'mara.corrected@harbour.example');await h.agree(client.path,client.cookie)
  await h.post(client.path+'/edit',editing,client.cookie,403)
  await h.post(client.path+'/sign',{values:{'client-signature':'Mara Quinn','purchase-order':'PO-2026-42'},consent:true,commandId:crypto.randomUUID()},client.cookie)
  assert.equal((await read()).status,'completed');assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,true)
  const certificate=(await pdfText((await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes)).replace(/\s+/g,' ')
  assert.ok(certificate.includes('Naming agent'));assert.ok(certificate.includes('Editor'));assert.ok(certificate.includes('Later recipients named'));assert.ok(certificate.includes('Later recipient edits completed'))
  const copied=(await h.command('envelope.copy',{id})).result.id,copy=(await h.send('/api/inkwell/envelopes/'+copied,undefined,h.owner)).value.envelope
  assert.deepEqual(copy.signers[0].delegates,[2]);assert.equal(copy.signers[2].unresolvedIdentity,true);assert.equal(copy.signers[2].email,'');assert.ok(copy.signers.every(s=>!s.completedAt&&!s.signedAt))
  const template=(await h.command('template.from_envelope',{id})).result.id,reused=(await h.command('template.use',{id:template,recipients:[{name:'Jordan Ellis',email:'jordan.reuse@harbour.example'},{name:'Priya Shah',email:'priya.reuse@harbour.example'},{}]})).result.id
  const reuse=(await h.send('/api/inkwell/envelopes/'+reused,undefined,h.owner)).value.envelope;assert.equal(reuse.signers[2].unresolvedIdentity,true);assert.deepEqual(reuse.signers[1].delegates,[2])
  for(const probe of [copied,reused])assert.equal((await h.send(`/api/inkwell/envelopes/${probe}/verify`,undefined,h.owner)).value.ok,true,'prepared delegated custody '+probe)
  const restored=await harness();try{const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value;await restored.post('/api/inkwell/archive/restore',{archive});assert.equal((await restored.send(`/api/inkwell/envelopes/${id}/verify`,undefined,restored.owner)).value.ok,true);const restoredDraft=(await restored.send('/api/inkwell/envelopes/'+reused,undefined,restored.owner)).value.envelope;assert.equal(restoredDraft.signers[2].unresolvedIdentity,true);assert.deepEqual(restoredDraft.signers[0].delegates,[2])}finally{await restored.close()}
  const damaged=structuredClone(await read());damaged.signers[0].delegates=[1];await h.db.prepare('UPDATE iw_envelopes SET data=? WHERE id=?').bind(JSON.stringify(damaged),id).run();assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,false,'a changed grant cannot inherit old action evidence');const corrupted=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,badDestination=await harness();try{await badDestination.post('/api/inkwell/archive/restore',{archive:corrupted},badDestination.owner,400);assert.equal((await badDestination.send('/api/inkwell/envelopes',undefined,badDestination.owner)).value.envelopes.length,0)}finally{await badDestination.close()}
 }finally{await h.close()}
})

test('Conditional naming, editing, required-view and certified-delivery roles are skipped without an action or copy; a skipped naming agent leaves its open place held for sender correction',async()=>{
 const h=await harness()
 try{
  const pdfBase64=await viewRolePdf('Harbour Studio - Conditional delivery')
  for(const role of ['specify_recipients','editor','needs_to_view','certified_delivery']){
   const rule={field:'route',operator:'equals',value:'include'},recipient={name:'Routing participant',email:`${role}@harbour.example`,order:1,role,includeWhen:rule,...(['specify_recipients','editor'].includes(role)?{delegates:[1]}:{})},final=role==='specify_recipients'?{name:'',email:'',unresolvedIdentity:true,order:3}:{name:'Mara Quinn',email:`mara.${role}@harbour.example`,order:3}
   const signature={id:'signature',label:'Client signature',type:'signature',signer:1,page:0,x:.1,y:.6,width:.4,height:.07},route={id:'route',label:'Route',type:'text',signer:1,page:0,x:.1,y:.75,width:.4,height:.04,readOnly:true,prefill:{value:'skip',source:'Sender input'}}
   const {id}=(await h.command('envelope.prepare',{title:`Conditional ${role}`,filename:'delivery.pdf',pdfBase64,signers:[recipient,final],fields:[signature,route]})).result
   await h.command('envelope.approve',{id,eligible:true})
   let record=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
   assert.equal(record.signers[0].routeResult.state,'skipped');assert.equal(record.signers[0].completedAt,undefined);assert.equal(await h.mail(recipient.email),undefined)
   if(role==='specify_recipients'){
    assert.equal(record.signers[1].activatedAt,undefined,'a skipped naming agent never invents a later identity')
    await h.command('envelope.correct',{id,signers:[recipient,{name:'Mara Quinn',email:'mara.named-by-sender@harbour.example',order:3}]})
    final.email='mara.named-by-sender@harbour.example'
   }
   const client=await viewRoleSession(h,final.email);await h.agree(client.path,client.cookie);await h.post(client.path+'/sign',{values:{signature:'Mara Quinn'},consent:true,commandId:crypto.randomUUID()},client.cookie)
   record=(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
   assert.equal(record.status,'completed');assert.equal(await h.mail(recipient.email),undefined,'a skipped role also receives no completed copy')
   assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,true)
  }
 }finally{await h.close()}
})
