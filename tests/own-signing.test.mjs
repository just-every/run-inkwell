import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

// MANAGE-003: the signed-in owner whose turn it is opens their own signing page from the app and signs with their session.
for (const mailProvider of ['resend', null]) {
 test(`the owner signs their own turn from the app (${mailProvider ? 'mail set up' : 'mail not set up'})`, async () => {
  const h = await harness({ mailProvider })
  try {
   const pdf = await PDFDocument.create(); pdf.addPage([595,842])
   const signers = [{name:'Harbour Owner',email:'owner@harbour.example'},{name:'Alex Morgan',email:'alex@harbour.example'}]
   const fields = signers.map((_,signer)=>({id:`signature-${signer}`,label:'Signature',type:'signature',signer,page:0,x:.1,y:.5+signer*.15,width:.4,height:.07}))
   const id = (await h.command('envelope.prepare',{title:'Harbour studio agreement',filename:'agreement.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),signers,fields})).result.id
   await h.command('envelope.open_signing',{id},h.owner,409)
   await h.command('envelope.approve',{id,eligible:true})
   const listed = async () => (await h.send('/api/inkwell',undefined,h.owner)).value.envelopes.find(e=>e.id===id)
   assert.equal((await listed()).ownSigningAvailable,true)
   const opened = await h.post('/api/inkwell/commands',{command:'envelope.open_signing',input:{id},commandId:crypto.randomUUID()})
   const path = '/api'+new URL(opened.value.result.signing.url).pathname, session = opened
   assert.equal((await h.send(path,undefined,session.cookie)).value.verified,true,'the signed-in session authenticates the signer')
   assert.equal((await h.send(path,undefined,session.cookie)).value.canSign,true)
   await h.agree(path,session.cookie)
   await h.post(path+'/sign',{values:{'signature-0':'Harbour Owner'},consent:true,commandId:crypto.randomUUID()},session.cookie)
   const after = await listed()
   assert.ok(after.signers[0].signedAt)
   assert.equal(after.ownSigningAvailable,false,'the owner has no turn once the next recipient is up')
   await h.command('envelope.open_signing',{id},h.owner,409)
   const audit = JSON.parse(new TextDecoder().decode((await h.send(`/api/inkwell/envelopes/${id}/artifacts/audit`,undefined,h.owner)).bytes)).envelope.events.map(e=>e.action)
   assert.ok(audit.includes('signer.session_verified'))
   assert.equal(await h.mail(signers[0].email,'verification code'),undefined,'no code is sent for in-app signing')
   assert.ok(audit.includes('signer.signed'))
  } finally { await h.close() }
 })
}
