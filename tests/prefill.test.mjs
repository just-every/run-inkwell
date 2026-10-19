import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { harness } from './harness.mjs'

const pdfText = async bytes => {
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs')
 const pdf=await getDocument({data:new Uint8Array(bytes),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
 return (await (await pdf.getPage(1)).getTextContent()).items.map(item=>item.str).join('\n')
}

test('PREP-008: sender/API prefill, reported provenance, template merge and server-enforced locked terms survive signing and custody', async()=>{
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
