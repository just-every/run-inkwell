import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

// The signed-in owner whose turn it is opens their own signing page from the app and signs through the signer flow.
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
   const { signing } = (await h.command('envelope.open_signing',{id})).result
   const path = '/api'+new URL(signing.url).pathname
   let code = signing.code
   if (mailProvider) {
    assert.equal(code,undefined,'with mail set up the code goes to the signer mailbox')
    await h.post(path+'/code',{},'')
    code = (await h.mail(signers[0].email,'verification code')).text.match(/\b\d{6}\b/)[0]
   }
   const session = await h.post(path+'/verify',{code},'')
   assert.equal((await h.send(path,undefined,session.cookie)).value.canSign,true)
   await h.agree(path,session.cookie)
   await h.post(path+'/sign',{values:{'signature-0':'Harbour Owner'},consent:true,commandId:crypto.randomUUID()},session.cookie)
   const after = await listed()
   assert.ok(after.signers[0].signedAt)
   assert.equal(after.ownSigningAvailable,false,'the owner has no turn once the next recipient is up')
   await h.command('envelope.open_signing',{id},h.owner,409)
   const audit = JSON.parse(new TextDecoder().decode((await h.send(`/api/inkwell/envelopes/${id}/artifacts/audit`,undefined,h.owner)).bytes)).envelope.events.map(e=>e.action)
   assert.ok(audit.includes(mailProvider ? 'invitation.opened_in_app' : 'invitation.manual_issued'))
   assert.ok(audit.includes('signer.signed'))
  } finally { await h.close() }
 })
}
