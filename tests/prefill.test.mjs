import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import { harness } from './harness.mjs'

const pdfText = async bytes => {
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs')
 const pdf=await getDocument({data:new Uint8Array(bytes),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
 return (await (await pdf.getPage(1)).getTextContent()).items.map(item=>item.str).join('\n')
}

test('PREP-008: sender and API prefill, reported provenance, template merge and server-enforced locked terms survive signing and custody', async()=>{
 const h=await harness()
 try {
  const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]),font=await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('Harbour Studio - Service agreement',{x:60,y:740,size:18,font})
  const field=(id,type,y,extra={})=>({id,label:id,type,signer:0,page:0,x:.1,y,width:.7,height:.05,...extra})
  const fields=[field('signature','signature',.2),field('company','text',.3),field('address','text',.4),field('amount','number',.5),field('date','date',.6),field('agreed','checkbox',.7),field('memo','text',.8,{required:false,prefill:{value:'Old note to clear',source:'Sender input'}})]
  const base={title:'Acme workshop',filename:'service.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers:[{name:'Mara Quinn',email:'mara@clients.example'}],fields}
  const read=async id=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const t=(await h.command('template.save',{...base,roles:[{role:'Client'}]})).result.id
  // This is a CRM deal fixture supplied by an API caller, not a fabricated production connector or verified provider.
  const hubspotDeal={id:'deal-902',company:'Acme Workshops LLC',address:'48 River Street',amount:'1250.25'}
  const source=key=>`HubSpot deal ${hubspotDeal.id} / ${key} (reported by API caller)`
  const prefill=Object.fromEntries(['company','address','amount'].map(key=>[key,{value:hubspotDeal[key],source:source(key),readOnly:key==='amount'}]))
  prefill.date={value:'2026-10-22',source:'Sender input'};prefill.agreed={value:'true',source:'Sender input',readOnly:true}
  const {id}=(await h.command('template.use',{id:t,recipients:base.signers,prefill})).result
  let e=await read(id)
  assert.deepEqual(e.fields.find(f=>f.id==='amount').prefill,{value:'1250.25',source:source('amount')})
  assert.ok(e.fields.find(f=>f.id==='amount').readOnly)
  assert.equal(e.events[0].detail.fields.find(f=>f.id==='company').prefill.source,source('company'),'prepared audit binds provenance')
  // The sender may change a draft value/source; a sent envelope's fields remain fixed.
  const edited=e.fields.map(f=>f.id==='address'?{...f,prefill:{value:'50 River Street',source:'Sender correction'}}:f)
  await h.command('envelope.update',{...base,id,fields:edited})
  assert.equal((await read(id)).fields.find(f=>f.id==='address').prefill.source,'Sender correction')
  await h.command('envelope.approve',{id,eligible:true})
  const invitation=await h.mail(base.signers[0].email,'Please sign:'),token=new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1),path='/api/sign/'+token
  let view=(await h.send(path)).value
  assert.ok(view.fields.every(f=>!f.prefill),'an unverified link exposes no business values or their sources')
  await h.post(path+'/code',{},'')
  const code=(await h.mail(base.signers[0].email,'verification code')).text.match(/\b\d{6}\b/)[0]
  const session=(await h.post(path+'/verify',{code},'')).cookie
  assert.ok((await h.send(path,undefined,session)).value.fields.every(f=>!f.prefill),'existing disclosure gate also protects prefill')
  await h.agree(path,session)
  view=(await h.send(path,undefined,session)).value
  assert.equal(view.fields.find(f=>f.id==='company').prefill.value,hubspotDeal.company)
  assert.equal(view.fields.find(f=>f.id==='address').prefill.value,'50 River Street')
  await h.post(path+'/progress',{values:{signature:'Mara Quinn',amount:'1.00'}},session,400)
  await h.post(path+'/sign',{values:{signature:'Mara Quinn',amount:'1.00'},consent:true,commandId:crypto.randomUUID()},session,400)
  await h.post(path+'/sign',{values:{signature:'Mara Quinn',agreed:'false'},consent:true,commandId:crypto.randomUUID()},session,400)
  await h.post(path+'/progress',{values:{signature:'Mara Quinn',company:'Acme Studio LLC',memo:''}},session)
  assert.equal((await h.send(path,undefined,session)).value.progress.company,'Acme Studio LLC');assert.equal((await h.send(path,undefined,session)).value.progress.memo,'','an explicit clear survives Finish later')
  // Omitted fields use prepared values. Editable fields may be replaced, while a lock remains effective even when omitted.
  await h.post(path+'/sign',{values:{signature:'Mara Quinn',company:'Acme Studio LLC',memo:''},consent:true,commandId:crypto.randomUUID()},session)
  e=await read(id)
  assert.equal(e.status,'completed');assert.equal(e.signers[0].values.company,'Acme Studio LLC');assert.equal(e.signers[0].values.address,'50 River Street');assert.equal(e.signers[0].values.amount,'1250.25');assert.equal(e.signers[0].values.date,'2026-10-22');assert.equal(e.signers[0].values.agreed,'true');assert.equal(e.signers[0].values.memo,'')
  const audit=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/audit`,undefined,h.owner)).value.envelope
  assert.equal(audit.fields.find(f=>f.id==='amount').prefill.source,source('amount'))
  const executed=await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,h.owner),text=await pdfText(executed.bytes)
  assert.ok(!text.includes('Old note to clear'),'a cleared optional default stays absent from the executed PDF')
  for(const value of ['Acme Studio LLC','50 River Street','$1250.25','2026-10-22']) assert.ok(text.includes(value),`executed PDF contains ${value}`)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,true)
  const copy=(await h.command('envelope.copy',{id})).result.id
  assert.deepEqual((await read(copy)).fields,e.fields);assert.equal((await read(copy)).signers[0].values,undefined,'copy retains prepared defaults, never signed values')
  const saved=(await h.command('template.from_envelope',{id,title:'Prefilled service agreement'})).result.id
  const reused=(await h.command('template.use',{id:saved,recipients:base.signers})).result.id
  assert.deepEqual((await read(reused)).fields,e.fields)
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value
  const fresh=await harness()
  try {await fresh.post('/api/inkwell/archive/restore',{archive},fresh.owner);const restored=(await fresh.send('/api/inkwell/envelopes/'+id,undefined,fresh.owner)).value.envelope;assert.deepEqual(restored.fields,e.fields);assert.deepEqual(restored.signers[0].values,e.signers[0].values)} finally {await fresh.close()}
  for(const bad of [
   {...fields[0],prefill:{value:'Pretend signature',source:'Sender input'}},
   {...fields[1],readOnly:true},
   {...fields[1],prefill:{value:'Acme',source:''}},
   {...fields[1],prefill:{value:'x'.repeat(501),source:'Sender'}},
   {...fields[1],prefill:{value:'Acme',source:'x'.repeat(201)}},
   {...fields[1],readOnly:'true',prefill:{value:'Acme',source:'Sender'}},
   {...fields[1],prefill:{value:'two\nlines',source:'Sender'}},
   {...fields[3],prefill:{value:'1.234',source:'Sender'}},
   {...fields[4],prefill:{value:'2026-02-30',source:'Sender'}},
   {...fields[5],prefill:{value:'yes',source:'Sender'}},
   {...fields[3],calculation:{operation:'sum',fields:['amount']},prefill:{value:'1',source:'Sender'}},
  ]) await h.command('envelope.prepare',{...base,fields:fields.map(f=>f.id===bad.id?bad:f)},h.owner,400)
  await h.command('template.use',{id:t,recipients:base.signers,prefill:{unknown:{value:'X',source:'Sender'}}},h.owner,400)
  await h.command('template.use',{id:t,recipients:base.signers,prefill:{signature:{value:'Forged',source:'Sender'}}},h.owner,400)
 } finally {await h.close()}
})

test('PREP-003 round A: initials adoption, automatic US signing dates, business-type prefill/locks and field validation through public doors', async()=>{
 const h=await harness({mailProvider:null})
 try {
  const pdf=await PDFDocument.create();pdf.addPage([612,792]);pdf.addPage([612,792])
  const make=(id,type,signer,y,extra={})=>({id,label:id,type,signer,page:signer,x:.1,y,width:.7,height:.025,...extra})
  const business={full_name:'Mara Quinn',email:'mara@clients.example',company:'Acme Workshop',title:'Director'}
  const fields=[0,1].flatMap(s=>[
   make(`sig${s}`,'signature',s,.1),make(`ini${s}`,'initials',s,.14),make(`iniAgain${s}`,'initials',s,.18),make(`signed${s}`,'date_signed',s,.22),
   ...Object.entries(business).flatMap(([type,value],i)=>[make(`${type}${s}`,type,s,.26+i*.08,{prefill:{value,source:`API fixture / ${type}`},readOnly:true}),make(`${type}Edit${s}`,type,s,.30+i*.08,{prefill:{value,source:`Sender / ${type}`}})]),
   make(`zip${s}`,'text',s,.62,{pattern:'zip'}),make(`phone${s}`,'text',s,.66,{pattern:'phone'}),make(`ein${s}`,'text',s,.70,{pattern:'ein'}),make(`ssn${s}`,'text',s,.74,{pattern:'ssn'}),make(`date${s}`,'text',s,.78,{pattern:'date'}),
  ])
  const base={title:'PREP-003 all round A types',filename:'round-a.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),fields,roles:[{role:'Client'},{role:'Counterparty'}]}
  const t=(await h.command('template.save',base)).result.id
  const recipients=[{name:'Mara Quinn',email:'mara@clients.example'},{name:'Harbour Owner',email:'owner@harbour.example'}]
  const id=(await h.command('template.use',{id:t,recipients})).result.id
  const invitations=(await h.command('envelope.approve',{id,eligible:true})).result.invitations
  const audit=async()=> (await h.send(`/api/inkwell/envelopes/${id}/artifacts/audit`,undefined,h.owner)).value.envelope
  // The owner signs their own second routing place through the native session; the first uses the emailed-code door.
  const marks=['drawn','uploaded'],png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQImWP4z8Dwn4GBgYGJAQoAHgQCAZK7TscAAAAASUVORK5CYII=','base64')
  for(const s of [0,1]) {
   let path,cookie
   if(s===0){const link=invitations.find(i=>i.email===recipients[s].email)??invitations[0];path=new URL(link.url).pathname.replace('/sign/','/api/sign/');cookie=(await h.post(path+'/verify',{code:link.code},'')).cookie}
   if(s===1){const response=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()},h.owner);path=new URL(response.value.result.signing.url).pathname.replace('/sign/','/api/sign/');cookie=response.cookie}
   await h.agree(path,cookie)
   const view=(await h.send(path,undefined,cookie)).value
   for(const [type,value] of Object.entries(business)) {
    const f=view.fields.find(f=>f.id===`${type}${s}`);assert.equal(f.prefill.value,value);assert.equal(f.prefill.source,`API fixture / ${type}`);assert.equal(f.readOnly,true)
    const changed={[f.id]:type==='email'?'elsewhere@clients.example':'Changed term'}
    await h.post(path+'/progress',{values:changed},cookie,400)
    const refused=await h.post(path+'/sign',{values:changed,consent:true,commandId:crypto.randomUUID(),timeZone:'Pacific/Honolulu'},cookie,400);assert.match(refused.value.error,new RegExp(f.label))
   }
   const values={ [`sig${s}`]:recipients[s].name,[`ini${s}`]:s?'HO':'MQ',[`iniAgain${s}`]:s?'HO':'MQ',[`zip${s}`]:'02110-1234',[`phone${s}`]:'+1 (212) 555-0100',[`ein${s}`]:'12-3456789',[`ssn${s}`]:'123-45-6789',[`date${s}`]:'2026-10-21',...Object.fromEntries(Object.keys(business).map(type=>[`${type}Edit${s}`,type==='email'?'updated@clients.example':`Updated ${type}`])) }
   const sign=extra=>({values,consent:true,initialsAdoption:{method:marks[s],...(s?{mediaType:'image/png'}:{}),imageBase64:png.toString('base64')},timeZone:'Pacific/Honolulu',commandId:crypto.randomUUID(),...extra})
   for(const [key,invalid] of [[`zip${s}`,'12'],[`phone${s}`,'call me'],[`ein${s}`,'12-345'],[`ssn${s}`,'123'],[`emailEdit${s}`,'missing-at'],[`date${s}`,'2026-02-30']]) {
    const failed=await h.post(path+'/sign',sign({values:{...values,[key]:invalid}}),cookie,400);assert.match(failed.value.error,new RegExp(key),'a field-level refusal names the invalid field')
   }
   await h.post(path+'/sign',sign({timeZone:'Europe/Paris'}),cookie,400)
   await h.post(path+'/sign',sign({values:{...values,[`iniAgain${s}`]:'DIFFERENT'}}),cookie,400)
   await h.post(path+'/sign',sign({values:{...values,[`signed${s}`]:'1900-01-01'}}),cookie)
   const e=await audit(),signed=e.signers[s]
   const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Pacific/Honolulu',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(signed.signedAt)).map(p=>[p.type,p.value]))
   assert.equal(signed.values[`signed${s}`],`${parts.year}-${parts.month}-${parts.day}`,'date signed comes from the server signing instant, never caller values')
   assert.equal(signed.signingTimeZone,'Pacific/Honolulu');assert.equal(signed.initialsAdoption.method,marks[s]);assert.match(signed.initialsAdoption.sha256,/^[a-f0-9]{64}$/)
   for(const [type,value] of Object.entries(business)){assert.equal(signed.values[`${type}${s}`],value);assert.equal(signed.values[`${type}Edit${s}`],values[`${type}Edit${s}`])}
  }
  const e=await audit();assert.equal(e.status,'completed')
  const executed=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,h.owner)).bytes
  const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs'),document=await getDocument({data:new Uint8Array(executed),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
  for(const pageNumber of [1,2]){const page=await document.getPage(pageNumber),text=(await page.getTextContent()).items.map(i=>i.str).join(' ');for(const value of ['123-45-6789','12-3456789','Acme Workshop','updated@clients.example'])assert.ok(text.includes(value),`executed page ${pageNumber} retains ${value}`);assert.equal((await page.getOperatorList()).fnArray.filter(op=>op===OPS.paintImageXObject).length,2,'adopted initials image appears in both initials fields')}
  const cert=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes
  const certificate=await getDocument({data:new Uint8Array(cert),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
  let text='';for(let p=1;p<=certificate.numPages;p++)text+=(await (await certificate.getPage(p)).getTextContent()).items.map(i=>i.str).join(' ')
  assert.match(text,/drawn initials/);assert.match(text,/uploaded initials image/);assert.match(text,/Date signed time zone: Pacific\/Honolulu/)
  // Saved member initials reuse the independent mark on the next own-signing request.
  const next=(await h.command('envelope.prepare',{...base,fields:fields.filter(f=>f.signer===1).map(f=>({...f,signer:0,page:0})),signers:[recipients[1]]})).result.id
  await h.command('envelope.approve',{id:next,eligible:true})
  const opened=await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id:next},commandId:crypto.randomUUID()},h.owner),path=new URL(opened.value.result.signing.url).pathname.replace('/sign/','/api/sign/'),view=(await h.send(path,undefined,opened.cookie)).value
  assert.equal(view.savedInitials.value,'HO');assert.equal(view.savedInitials.adoption.method,'uploaded');assert.equal(view.savedInitials.imageBase64,png.toString('base64'))
  await h.agree(path,opened.cookie)
  await h.post(path+'/sign',{values:e.signers[1].values,consent:true,timeZone:'America/New_York',initialsAdoption:{method:view.savedInitials.adoption.method,mediaType:view.savedInitials.adoption.mediaType,imageBase64:view.savedInitials.imageBase64},commandId:crypto.randomUUID()},opened.cookie)
  const reused=(await h.send(`/api/inkwell/envelopes/${next}/artifacts/audit`,undefined,h.owner)).value.envelope
  assert.equal(reused.events.findLast(event=>event.action==='signer.signed').detail.initialsSaved,true,'record identifies reuse of the member initials');assert.equal(reused.status,'completed');assert.equal(reused.signers[0].initialsAdoption.sha256,e.signers[1].initialsAdoption.sha256,'saved initials are actually reused in the next executed record')
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,fresh=await harness({mailProvider:null})
  try{await fresh.post('/api/inkwell/archive/restore',{archive},fresh.owner);const restored=(await fresh.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,fresh.owner)).bytes;assert.deepEqual(restored,executed,'the executed fields and initials survive whole-installation restore')}finally{await fresh.close()}
  // Generated evidence is never accepted as caller prefill, and new patterns are schema checked before sending.
  for(const change of [{id:'ini0',prefill:{value:'MQ',source:'Sender'}},{id:'signed0',prefill:{value:'1900-01-01',source:'Sender'}},{id:'zip0',pattern:'invented'},{id:'zip0',prefill:{value:'invalid',source:'Sender'}},{id:'ssn0',masked:'false'}])await h.command('template.save',{...base,fields:fields.map(f=>f.id===change.id?{...f,...change}:f)},h.owner,400)
 }finally{await h.close()}
})

test('PREP-003 round B: radio, dropdown, checkbox group bounds, notes and image stamps retain source/locks and signed-record custody', async()=>{
 const h=await harness({mailProvider:null})
 try {
  const pdf=await PDFDocument.create();pdf.addPage([612,792]);pdf.addPage([612,792])
  const stamp='data:image/png;base64,'+(await readFile('public/brand/icon-192.png')).toString('base64'),jpegStamp='data:image/jpeg;base64,'+(await readFile('tests/fixtures/signature.jpg')).toString('base64');assert.ok(stamp.length>500,'a real stamp exercises the image allowance beyond ordinary text values')
  const definitions=[
   ['radio','Delivery method','Courier',['Courier','Pickup','Mail']],
   ['dropdown','Service level','Standard',['Standard','Priority','Economy']],
   ['checkbox_group','Contact methods','["Email","Phone"]',['Email','Phone','Post']],
   ['note','Service note','Please deliver to reception'],['stamp','Approval stamp',stamp],
  ]
  const make=(id,type,page,y,extra={})=>({id,label:id,type,signer:0,page,x:.1,y,width:.8,height:.04,...extra})
  const fields=[make('signature','signature',0,.08),...definitions.flatMap(([type,label,value,options],i)=>[
   make(type,type,0,.18+i*.14,{label,...(options?{options}:{}),...(type==='checkbox_group'?{minimum:2,maximum:2}:{}),prefill:{value,source:`Sender fixture / ${type}`}}),
   make(`${type}_locked`,type,1,.18+i*.14,{label:`Locked ${label}`,...(options?{options}:{}),...(type==='checkbox_group'?{minimum:2,maximum:2}:{}),prefill:{value:type==='stamp'?jpegStamp:value,source:`API fixture / ${type}`},readOnly:true}),
  ]),make('optional','radio',0,.82,{options:['Yes','No'],required:false,prefill:{value:'Yes',source:'Sender'}}),make('conditional','note',1,.82,{required:false,requiredWhen:{field:'radio',equals:'Pickup'}})]
  const base={title:'PREP-003 round B choices and notes',filename:'choices.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),fields,roles:[{role:'Client'}]}
  const t=(await h.command('template.save',base)).result.id
  const recipients=[{name:'Mara Quinn',email:'mara@clients.example'}]
  const id=(await h.command('template.use',{id:t,recipients,prefill:{dropdown:{value:'Priority',source:'API caller / request 902'}}})).result.id
  const read=async target=>(await h.send(`/api/inkwell/envelopes/${target}/artifacts/audit`,undefined,h.owner)).value.envelope
  const draft=await read(id)
  assert.equal(draft.fields.find(f=>f.id==='dropdown').prefill.source,'API caller / request 902')
  assert.deepEqual(draft.fields.find(f=>f.id==='checkbox_group').options,['Email','Phone','Post'])
  const invitation=(await h.command('envelope.approve',{id,eligible:true})).result.invitations[0],path=new URL(invitation.url).pathname.replace('/sign/','/api/sign/')
  assert.ok((await h.send(path)).value.fields.every(f=>!f.prefill),'choice/note prefill remains behind verification and disclosure')
  const cookie=(await h.post(path+'/verify',{code:invitation.code},'')).cookie
  assert.ok((await h.send(path,undefined,cookie)).value.fields.every(f=>!f.prefill))
  await h.agree(path,cookie)
  const view=(await h.send(path,undefined,cookie)).value
  for(const [type,,value] of definitions) {
   const locked=view.fields.find(f=>f.id===`${type}_locked`)
   assert.equal(locked.prefill.value,type==='stamp'?jpegStamp:value);assert.equal(locked.prefill.source,`API fixture / ${type}`);assert.equal(locked.readOnly,true)
   const changed={[locked.id]:type==='checkbox_group'?'["Phone","Post"]':type==='note'?'Changed note':type==='stamp'?'data:image/png;base64,aW52YWxpZA==':locked.options[1]}
   const progress=await h.post(path+'/progress',{values:changed},cookie,400);assert.match(progress.value.error,new RegExp(locked.label))
   const failed=await h.post(path+'/sign',{values:{signature:'Mara Quinn',...changed},consent:true,commandId:crypto.randomUUID()},cookie,400);assert.match(failed.value.error,new RegExp(locked.label))
  }
  const values={signature:'Mara Quinn',radio:'Pickup',dropdown:'Economy',checkbox_group:'["Post","Phone"]',note:'Leave with the concierge',stamp:jpegStamp,optional:''}
  const sign=changes=>({values:{...values,conditional:'Back door',...changes},consent:true,commandId:crypto.randomUUID()})
  for(const [field,value,message] of [['radio','Invented','Delivery method'],['dropdown','Invented','Service level'],['checkbox_group','["Email"]','Contact methods'],['checkbox_group','["Email","Phone","Post"]','Contact methods'],['checkbox_group','["Email","Email"]','Contact methods'],['checkbox_group','["Invented","Phone"]','Contact methods'],['checkbox_group','Email','Contact methods'],['checkbox_group','[]','Contact methods'],['conditional','','conditional'],['stamp','https://outside.example/stamp.png','Approval stamp']]) {
   const result=await h.post(path+'/sign',sign({[field]:value}),cookie,400);assert.match(result.value.error,new RegExp(message))
   assert.equal((await read(id)).status,'awaiting_signature','a refusal writes no signature')
  }
  await h.post(path+'/progress',{values:{stamp:'https://outside.example/stamp.png'}},cookie,400)
  const badStamp=await h.post(path+'/sign',sign({stamp:'data:image/png;base64,aW52YWxpZA=='}),cookie,415);assert.match(badStamp.value.error,/Approval stamp/)
  const oversized=await h.post(path+'/sign',sign({stamp:'data:image/png;base64,'+'a'.repeat(Math.ceil(512*1024/3)*4+40)}),cookie,400);assert.match(oversized.value.error,/Approval stamp/)
  // Partial selections survive Finish later, but cannot finish outside the inclusive bounds.
  await h.post(path+'/progress',{values:{...values,checkbox_group:'["Phone"]'}},cookie)
  assert.equal((await h.send(path,undefined,cookie)).value.progress.checkbox_group,'["Phone"]')
  await h.post(path+'/sign',sign({}),cookie)
  const completed=await read(id),signed=completed.signers[0].values
  assert.equal(completed.status,'completed')
  assert.equal(signed.radio,'Pickup');assert.equal(signed.dropdown,'Economy');assert.equal(signed.checkbox_group,'["Phone","Post"]','selected labels are stored in declared option order');assert.equal(signed.note,'Leave with the concierge');assert.equal(signed.stamp,jpegStamp,'an editable PNG prefill can be replaced by a signer-uploaded JPEG');assert.equal(signed.optional,'');assert.equal(signed.conditional,'Back door')
  for(const [type,,value] of definitions)assert.equal(signed[`${type}_locked`],type==='stamp'?jpegStamp:value)
  // PREP-003 ct A4: signed stamp evidence binds the actual bytes and supplier, not only the values map.
  const {createHash}=await import('node:crypto'),digest=value=>createHash('sha256').update(value).digest('hex')
  const jpegBytes=Buffer.from(jpegStamp.split(',')[1],'base64'),pngBytes=Buffer.from(stamp.split(',')[1],'base64')
  const stampEvent=completed.events.findLast(e=>e.action==='signer.signed')
  assert.deepEqual(stampEvent.detail.stamps,[
   {field:'stamp',label:'Approval stamp',mediaType:'image/jpeg',bytes:jpegBytes.length,sha256:digest(jpegBytes),supplier:{kind:'signer upload'}},
   {field:'stamp_locked',label:'Locked Approval stamp',mediaType:'image/jpeg',bytes:jpegBytes.length,sha256:digest(jpegBytes),supplier:{kind:'sender/API prefill',source:'API fixture / stamp',readOnly:true}},
  ])
  const certificateBytes=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/certificate`,undefined,h.owner)).bytes
  const {getDocument:readCertificate}=await import('pdfjs-dist/legacy/build/pdf.mjs')
  const certificate=await readCertificate({data:new Uint8Array(certificateBytes),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
  let certificateText='';for(let i=1;i<=certificate.numPages;i++)certificateText+=(await(await certificate.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ')+' '
  const compact=certificateText.replace(/\s/g,'')
  for(const line of [`Stamp (Approval stamp): JPEG SHA-256 ${digest(jpegBytes)}, signer upload; a supplied image, not a verified seal`,`Stamp (Locked Approval stamp): JPEG SHA-256 ${digest(jpegBytes)}, sender/API prefill (source: API fixture / stamp; read-only: yes); a supplied image, not a verified seal`])assert.ok(compact.includes(line.replace(/\s/g,'')),line)
  const bytes=(await h.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,h.owner)).bytes
  const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs'),executed=await getDocument({data:new Uint8Array(bytes),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
  const texts=[];for(let i=1;i<=executed.numPages;i++){const page=await executed.getPage(i);texts.push((await page.getTextContent()).items.map(item=>item.str).join(' '));const operators=await page.getOperatorList(),imageIndex=operators.fnArray.indexOf(OPS.paintImageXObject);assert.equal(operators.fnArray.filter(op=>op===OPS.paintImageXObject).length,1,`stamp image is embedded on page ${i}`);let matrix=[1,0,0,1];const stack=[];for(let index=0;index<=imageIndex;index++){const op=operators.fnArray[index],args=operators.argsArray[index];if(op===OPS.save)stack.push(matrix);else if(op===OPS.restore)matrix=stack.pop();else if(op===OPS.transform){const [a,b,c,d]=matrix,[e,f,g,h]=args;matrix=[a*e+c*f,b*e+d*f,a*g+c*h,b*g+d*h]}}const pixels=operators.argsArray[imageIndex],ratio=Math.hypot(matrix[0],matrix[1])/Math.hypot(matrix[2],matrix[3]);assert.ok(Math.abs(ratio-pixels[1]/pixels[2])<.0001,'stamp image keeps its source proportions under the complete PDF graphics transform')}
  for(const value of ['Pickup','Economy','Phone, Post','Leave with the concierge'])assert.ok(texts[0].includes(value),`executed PDF retains ${value}`)
  for(const value of ['Courier','Standard','Email, Phone','Please deliver to reception','Back door'])assert.ok(texts[1].includes(value),`locked field prints ${value}`)
  assert.equal((await h.send(`/api/inkwell/envelopes/${id}/verify`,undefined,h.owner)).value.ok,true)
  const copied=(await h.command('envelope.copy',{id})).result.id;assert.deepEqual((await read(copied)).fields,completed.fields);assert.equal((await read(copied)).signers[0].values,undefined)
  const saved=(await h.command('template.from_envelope',{id,title:'Retained choices'})).result.id,reused=(await h.command('template.use',{id:saved,recipients})).result.id;assert.deepEqual((await read(reused)).fields,completed.fields)
  const archive=(await h.send('/api/inkwell/archive',undefined,h.owner)).value,fresh=await harness({mailProvider:null})
  try{await fresh.post('/api/inkwell/archive/restore',{archive},fresh.owner);const restored=(await fresh.send(`/api/inkwell/envelopes/${id}/artifacts/audit`,undefined,fresh.owner)).value.envelope;assert.deepEqual(restored.fields,completed.fields);assert.deepEqual(restored.signers[0].values,signed);assert.deepEqual((await fresh.send(`/api/inkwell/envelopes/${id}/artifacts/signed`,undefined,fresh.owner)).bytes,bytes)}finally{await fresh.close()}
  // Tampered source storage is exported with valid archive checksums. The public restore must still refuse it.
  const {canonicalJson,makePart}=await import('@runeditrun/rer/modules/portability')
  const {ContentVerifier,ArchiveVerifier}=await import('../node_modules/@runeditrun/rer/modules/portability/format.mjs')
  for(const [name,change] of [
   ['signed bytes',e=>{e.signers[0].values.stamp=stamp}],
   ['fingerprint',e=>{e.events.findLast(e=>e.action==='signer.signed').detail.stamps[0].sha256='0'.repeat(64)}],
   ['type',e=>{e.events.findLast(e=>e.action==='signer.signed').detail.stamps[0].mediaType='image/png'}],
   ['byte count',e=>{e.events.findLast(e=>e.action==='signer.signed').detail.stamps[0].bytes++}],
   ['supplier',e=>{e.events.findLast(e=>e.action==='signer.signed').detail.stamps[1].supplier.readOnly=false}],
  ]) {
   const damaged=structuredClone(completed);change(damaged)
   let previousHash='';for(const event of damaged.events){event.previousHash=previousHash;const {hash,...body}=event;event.hash=digest(canonicalJson(body));previousHash=event.hash}
   const records=archive.ndjson.trim().split('\n').map(line=>JSON.parse(line)),manifest=records[0],contentHash=new ContentVerifier(manifest),archiveHash=new ArchiveVerifier(manifest)
   for(let i=1;i<records.length-1;i++) {
    const part=records[i]
    for(const item of part.items) {
     if(item.kind!=='row')continue
     if(item.table==='iw_envelopes'&&item.row.id===id)item.row.data=JSON.stringify(damaged)
     if(item.table==='iw_events'&&item.row.envelope_id===id){const event=damaged.events[item.row.sequence];item.row.data=JSON.stringify(event);item.row.hash=event.hash}
    }
    records[i]=await makePart(part.index,part.items);archiveHash.add(records[i]);for(const item of part.items)contentHash.add(item)
   }
   records[records.length-1]={...records.at(-1),contentHash:contentHash.digest(),archiveHash:archiveHash.digest()}
   const damagedArchive={...archive,ndjson:records.map(record=>canonicalJson(record)).join('\n')+'\n'}
   const target=await harness({mailProvider:null})
   try{const refusal=await target.send('/api/inkwell/archive/restore',{archive:damagedArchive},target.owner);assert.equal(refusal.status,400,`PREP-003 restore refuses tampered ${name}: ${JSON.stringify(refusal.value)}`);assert.match(refusal.value.error,/staged_validation/);assert.equal((await target.send(`/api/inkwell/envelopes/${id}`,undefined,target.owner)).status,404,'tampered custody is never published')}finally{await target.close()}
  }
  const stampDefault=(await h.command('template.use',{id:t,recipients})).result.id;const stampInvite=(await h.command('envelope.approve',{id:stampDefault,eligible:true})).result.invitations[0],stampPath=new URL(stampInvite.url).pathname.replace('/sign/','/api/sign/'),stampCookie=(await h.post(stampPath+'/verify',{code:stampInvite.code},'')).cookie;await h.agree(stampPath,stampCookie);await h.post(stampPath+'/sign',{values:{signature:'Mara Quinn'},consent:true,commandId:crypto.randomUUID()},stampCookie);const defaultRecord=await read(stampDefault);assert.equal(defaultRecord.signers[0].values.stamp,stamp,'an omitted stamp uses its prepared image');assert.deepEqual(defaultRecord.events.findLast(e=>e.action==='signer.signed').detail.stamps[0],{field:'stamp',label:'Approval stamp',mediaType:'image/png',bytes:pngBytes.length,sha256:digest(pngBytes),supplier:{kind:'sender/API prefill',source:'Sender fixture / stamp',readOnly:false}})
  // Each new business-data type can also be optional and explicitly left blank, including a group with a nonzero minimum.
  const optionalFields=completed.fields.map(field=>definitions.some(([type])=>type===field.type)?{...field,required:false,readOnly:undefined,prefill:undefined}:field)
  await h.command('envelope.update',{...base,id:copied,signers:recipients,fields:optionalFields})
  const optionalInvite=(await h.command('envelope.approve',{id:copied,eligible:true})).result.invitations[0],optionalPath=new URL(optionalInvite.url).pathname.replace('/sign/','/api/sign/'),optionalCookie=(await h.post(optionalPath+'/verify',{code:optionalInvite.code},'')).cookie
  await h.agree(optionalPath,optionalCookie)
  await h.post(optionalPath+'/sign',{values:{signature:'Mara Quinn',optional:''},consent:true,commandId:crypto.randomUUID()},optionalCookie)
  const optionalRecord=await read(copied);assert.equal(optionalRecord.status,'completed');for(const field of optionalFields.filter(field=>definitions.some(([type])=>type===field.type)))assert.ok(!optionalRecord.signers[0].values[field.id],`optional ${field.type} may remain blank`)
  // Invalid declarations and prefills refuse the whole template, not a truncated set of choices.
  for(const change of [{id:'radio',options:['Same',' Same ']},{id:'radio',options:['Only']},{id:'radio',prefill:{value:'Invented',source:'Sender'}},{id:'dropdown',options:['Good','Bad\nchoice']},{id:'checkbox_group',minimum:3,maximum:2},{id:'checkbox_group',minimum:1.5},{id:'checkbox_group',maximum:4},{id:'checkbox_group',prefill:{value:'["Phone"]',source:'Sender'}},{id:'note',options:['Yes','No']},{id:'stamp',prefill:{value:'data:image/svg+xml;base64,aW52YWxpZA==',source:'Sender'}}])await h.command('template.save',{...base,fields:fields.map(f=>f.id===change.id?{...f,...change}:f)},h.owner,400)
 }finally{await h.close()}
})
