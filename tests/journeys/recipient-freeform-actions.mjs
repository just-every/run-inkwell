import assert from 'node:assert/strict'
import {tabTo} from './a11y.mjs'

/** Role-specific actions stay distinct even when the final signer places their own fields. */
export async function recipientFreeformActions({app,width,services,open,capture}) {
 if(width===1440)await app.command('account.freeform',{enabled:true,expectedVersion:0})
 const email=(role)=>`freeform.${role}.${width}@harbour.example`,names=['Nadia Bell','Theo Reed','Elise Chen','Jordan Vale'],roles=['specify_recipients','editor','approver','certified_delivery']
 const people=roles.map((role,i)=>({name:names[i],email:email(role),role,order:i+1,...(i<2?{delegates:[4]}:{})})).concat([{name:'',email:'',order:5,unresolvedIdentity:true}])
 const {id}=await app.command('envelope.prepare',{title:`Harbour free-form delivery ${width}`,filename:'workshop.pdf',pdfBase64:services,freeForm:true,fields:[],signers:people})
 await app.command('envelope.approve',{id,eligible:true})
 const naming=await open(email(roles[0])),namingForm=naming.page.getByRole('form',{name:'Name delegated recipients',exact:true})
 await namingForm.getByLabel('Recipient 5, routing order 5 name',{exact:true}).fill('Mara Quinn');await namingForm.getByLabel('Recipient 5, routing order 5 email',{exact:true}).fill(email('client'))
 await namingForm.getByRole('checkbox',{name:/I have reviewed these recipient identities/}).check();await namingForm.getByRole('button',{name:'Name recipients and continue',exact:true}).click();await naming.page.getByRole('heading',{name:'Your recipient action has been recorded.',exact:true}).waitFor()
 const editing=await open(email(roles[1])),editor=editing.page.getByRole('form',{name:'Edit delegated recipients and fields',exact:true})
 await editor.getByText('Signers place their own fields in this free-form request. You may change only the granted identities and private messages.',{exact:true}).waitFor()
 assert.equal(await editor.getByRole('combobox',{name:/^Field type/}).count(),0);assert.equal(await editing.page.getByRole('region',{name:'Place your fields',exact:true}).count(),0)
 await editor.getByLabel('Recipient 5, routing order 5 email',{exact:true}).fill(email('procurement'));await editor.getByLabel('Recipient 5, routing order 5 private message',{exact:true}).fill('Mara, place your signature on the workshop terms before finishing.')
 await capture(editing.page,'freeform-editor-identity-only',editor)
 await editor.getByRole('checkbox',{name:/I have reviewed these recipient and field changes/}).check();const pass=editor.getByRole('button',{name:'Save edits and continue',exact:true});await tabTo(editing.page,pass);await editing.page.keyboard.press('Enter');await editing.page.getByRole('heading',{name:'Your recipient action has been recorded.',exact:true}).waitFor()
 const approving=await open(email(roles[2])),approval=approving.page.locator('.iw-sign-fields')
 await approval.getByRole('heading',{name:'Your approval',exact:true}).waitFor();assert.equal(await approving.page.getByRole('region',{name:'Place your fields',exact:true}).count(),0);assert.equal(await approving.page.getByRole('button',{name:'Sign document',exact:true}).count(),0)
 await capture(approving.page,'freeform-approver',approval);await approval.getByRole('checkbox',{name:'I have reviewed these documents and approve them.',exact:true}).check();await approval.getByRole('button',{name:'Approve documents',exact:true}).click();await approving.page.getByRole('heading',{name:'Your approval has been recorded.',exact:true}).waitFor()
 const viewing=await open(email(roles[3]));await viewing.page.getByRole('button',{name:'Open required PDF',exact:true}).click();await viewing.page.getByRole('heading',{name:'Your document opening has been recorded.',exact:true}).waitFor();await capture(viewing.page,'freeform-certified-completed')
 const final=await open(email('procurement')),placing=final.page.getByRole('region',{name:'Place your fields',exact:true})
 await placing.getByRole('button',{name:'Add field',exact:true}).click();await final.page.locator('.iw-sign-fields').getByRole('textbox',{name:/Signature/}).fill('Mara Quinn')
 await final.page.getByRole('checkbox',{name:/consent to electronic signatures/}).check();await final.page.getByRole('button',{name:'Sign document',exact:true}).click();await final.page.getByRole('heading',{name:'All signatures are complete.',exact:true}).waitFor()
 const done=(await app.call('/api/inkwell/envelopes/'+id,{cookie:app.owner})).value.envelope;assert.ok(done.signers.slice(0,4).every(s=>s.completedAt&&!s.signedAt));assert.ok(done.fields.every(f=>f.signer===4));assert.equal(done.status,'completed');assert.equal((await app.call(`/api/inkwell/envelopes/${id}/verify`,{cookie:app.owner})).value.ok,true)
}
