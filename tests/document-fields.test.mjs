import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import { harness } from './harness.mjs'

const pageText = async bytes => {
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs')
 const pdf=await getDocument({data:new Uint8Array(bytes),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
 return (await (await pdf.getPage(1)).getTextContent()).items.map(item=>item.str).join('\n')
}
const w9Name=field=>`topmostSubform[0].Page1[0].${field}[0]`

// PREP-007 (fillable IRS W-9, Rev. March 2024, tests/fixtures/fw9.pdf, public domain): the W-9 has no signature form
// field, so the API caller anchors the signature and date on its printed "Signature of" label, the Docusign way.
test('PREP-007: text tags, anchor strings and AcroForm fields become placed fields with no manual placement; the W-9 named fields prefill through the API',async()=>{
 const h=await harness()
 try {
  const read=async id=>(await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
  const sign=async(email,values)=>{
   const invitation=await h.mail(email,'Please sign:'),path='/api/sign/'+new URL(invitation.text.match(/http:\/\/[^\s]+\/sign\/[^\s]+/)[0]).pathname.split('/').at(-1)
   await h.post(path+'/code',{},'')
   const session=(await h.post(path+'/verify',{code:(await h.mail(email,'verification code')).text.match(/\b\d{6}\b/)[0]},'')).cookie
   await h.agree(path,session)
   const view=(await h.send(path,undefined,session)).value
   await h.post(path+'/sign',{values,consent:true,timeZone:'America/Chicago',commandId:crypto.randomUUID()},session)
   return view
  }
  // 1. A PDF written with text tags: two recipients' fields, one tag mid-line after its label.
  const tagged=await PDFDocument.create(),page=tagged.addPage([612,792]),font=await tagged.embedFont(StandardFonts.Helvetica)
  page.drawText('Harbour Studio - Mutual NDA',{x:72,y:740,size:18,font})
  page.drawText('{{signature:1}}',{x:72,y:600,size:14,font})
  page.drawText('Date: {{date_signed:1}}',{x:320,y:600,size:12,font})
  page.drawText('{{company:1:Client company}}',{x:72,y:560,size:12,font})
  page.drawText('{{signature:2}}',{x:72,y:480,size:14,font})
  const pdfBase64=Buffer.from(await tagged.save()).toString('base64'),width=text=>[...text].reduce((sum,c)=>sum+font.widthOfTextAtSize(c,12),0)
  const offered=(await h.post('/api/inkwell/documents/fields',{pdfBase64})).value.fields
  assert.deepEqual(offered.map(f=>[f.type,f.signer,f.label,f.origin]),[['signature',0,'Signature','text_tag'],['date_signed',0,'Date signed','text_tag'],['company',0,'Client company','text_tag'],['signature',1,'Signature','text_tag']])
  const box=f=>({left:f.x*612,top:f.y*792,right:(f.x+f.width)*612,bottom:(f.y+f.height)*792})
  const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1.5,`${label}: ${a} vs ${b}`)
  near(box(offered[0]).left,72,'a tag starting its line is placed where it is drawn');near(box(offered[0]).top,792-600-14*.8,'the box tops at the tag text')
  near(box(offered[0]).right,72+[...'{{signature:1}}'].reduce((sum,c)=>sum+font.widthOfTextAtSize(c,14),0),'the box spans the tag')
  near(box(offered[1]).left,320+width('Date: '),'a tag after its label on the same line')
  await h.post('/api/inkwell/documents/fields',{pdfBase64},'',401)
  const signers=[{name:'Mara Quinn',email:'mara@clients.example'},{name:'Theo Park',email:'theo@harbour.example',order:2}]
  const ndaInput={title:'Tagged NDA',filename:'nda.pdf',pdfBase64,signers,prefill:{'Client company':{value:'Acme Workshops LLC',source:'Sender input'}}}
  assert.match((await h.command('envelope.prepare',{...ndaInput,signers:signers.slice(0,1)},h.owner,400)).error,/recipient 2/,'a tag for a recipient the envelope lacks is refused')
  const nda=(await h.command('envelope.prepare',ndaInput)).result.id
  let e=await read(nda)
  assert.deepEqual(e.fields.map(({prefill:_p,...f})=>f),offered,'prepared with no fields given, the envelope carries the tagged fields as offered')
  assert.deepEqual(e.fields.find(f=>f.name==='Client company').prefill,{value:'Acme Workshops LLC',source:'Sender input'},'a tag label names its field for prefill')
  await h.command('envelope.approve',{id:nda,eligible:true})
  await sign(signers[0].email,{'tag-1':'Mara Quinn'})
  await sign(signers[1].email,{'tag-4':'Theo Park'})
  e=await read(nda)
  assert.equal(e.status,'completed')
  const ndaText=await pageText((await h.send(`/api/inkwell/envelopes/${nda}/artifacts/signed`,undefined,h.owner)).bytes)
  assert.match(ndaText,/Acme Workshops LLC/);assert.match(ndaText,/Mara Quinn/);assert.match(ndaText,/Theo Park/)
  // 2. The fillable W-9 through the agent API: AcroForm fields keep their full names, which the prefill map uses.
  const w9=(await readFile('tests/fixtures/fw9.pdf')).toString('base64'),headers={authorization:'Bearer '+(await h.command('agent.issue')).result.token}
  const anchors=[{text:'Signature of',type:'signature',recipient:1,x:62,y:-14,width:240,height:30},{text:'Signature of',type:'date_signed',recipient:1,x:329,y:-14,width:150,height:30}]
  const source='Vendor portal record 77 (reported by the API caller)'
  const prefill={[w9Name('f1_01')]:{value:'Acme Workshops LLC',source},[`topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]`]:{value:'48 River Street',source,readOnly:true},[`topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]`]:{value:'true',source}}
  const w9Input={title:'Vendor W-9',filename:'fw9.pdf',pdfBase64:w9,signers:[{name:'Mara Quinn',email:'mara@clients.example'}],anchors,prefill}
  await h.post('/api/inkwell/agent/prepare',{...w9Input,prefill:{[w9Name('f9_99')]:{value:'x',source}},commandId:crypto.randomUUID()},'',400,headers)
  await h.post('/api/inkwell/agent/prepare',{...w9Input,anchors:[{...anchors[0],text:'Signature of the requester'}],commandId:crypto.randomUUID()},'',400,headers)
  const w9Id=(await h.post('/api/inkwell/agent/prepare',{...w9Input,commandId:crypto.randomUUID()},'',200,headers)).value.result.id
  e=await read(w9Id)
  const forms=e.fields.filter(f=>f.origin==='form_field')
  assert.equal(forms.length,23,'every W-9 form field: 15 text fields and 8 checkboxes')
  assert.deepEqual([forms.filter(f=>f.type==='text').length,forms.filter(f=>f.type==='checkbox').length],[15,8])
  assert.ok(forms.every(f=>f.page===0&&f.signer===0&&f.name.startsWith('topmostSubform[0].Page1[0].')),'each keeps its full form name')
  const named=name=>e.fields.find(f=>f.name===name)
  near(named(w9Name('f1_01')).x*612,58.6,'the name field sits at its widget');near((named(w9Name('f1_01')).y+named(w9Name('f1_01')).height)*792,792-659.967,'the name field sits at its widget')
  assert.deepEqual(named(w9Name('f1_01')).prefill,{value:'Acme Workshops LLC',source},'a W-9 named field prefills with its reported source')
  assert.ok(named('topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]').readOnly)
  assert.deepEqual(e.fields.filter(f=>f.origin==='anchor').map(f=>[f.type,f.name]),[['signature','Signature of'],['date_signed','Signature of']],'the anchored signature and date, from the caller\'s anchor string')
  assert.equal(e.events[0].actor.startsWith('agent:'),true)
  await h.command('envelope.approve',{id:w9Id,eligible:true})
  const signature=e.fields.find(f=>f.type==='signature').id,address=named('topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]').id
  const view=await sign('mara@clients.example',{[signature]:'Mara Quinn',[named(w9Name('f1_11')).id]:'123'})
  assert.equal(view.fields.find(f=>f.id===address).prefill.value,'48 River Street','the signer sees the prefilled value')
  e=await read(w9Id)
  assert.equal(e.status,'completed');assert.equal(e.signers[0].values[address],'48 River Street');assert.equal(e.signers[0].values[named(w9Name('f1_01')).id],'Acme Workshops LLC')
  const executed=(await h.send(`/api/inkwell/envelopes/${w9Id}/artifacts/signed`,undefined,h.owner)).bytes
  const w9Text=await pageText(executed)
  for (const value of ['Acme Workshops LLC','48 River Street','Mara Quinn','123']) assert.ok(w9Text.includes(value),`the executed W-9 shows ${value}`)
  const executedPdf=await PDFDocument.load(executed)
  assert.equal(executedPdf.catalog.get(PDFName.of('AcroForm')),undefined,'the executed W-9 keeps no form of its own under the signed values')
  assert.ok(executedPdf.getPages().every(p=>!p.node.Annots()?.asArray().some(a=>executedPdf.context.lookup(a).get(PDFName.of('Subtype'))===PDFName.of('Widget'))))
 } finally { await h.close() }
})
