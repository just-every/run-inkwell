import assert from 'node:assert/strict'
import {expect} from '@playwright/test'

/** Reusable delegated roles keep sender grants and leave the named place open on each new request. */
export async function recipientTemplateActions({app,owner,width,title,services,capture}) {
 const saved=await app.command('template.from_envelope',{id:(await app.call('/api/inkwell/envelopes?status=completed',{cookie:app.owner})).value.envelopes.find(e=>e.title===title).id,title:`Harbour delegated services template ${width}`})
 const template=(await app.call('/api/inkwell/templates',{cookie:app.owner})).value.templates.find(t=>t.id===saved.id)
 assert.equal(template.roles[4].unresolvedIdentity,true);assert.deepEqual(template.roles[0].delegates,[4])
 const templates=async()=>{await owner.goto(app.origin+'/app');await owner.getByRole('button',{name:'Templates',exact:true}).click()}
 await templates();await owner.getByRole('button',{name:`Edit ${template.title}`,exact:true}).click()
 await expect(owner.getByLabel('Role 1 name',{exact:true})).toHaveValue(template.roles[0].role)
 assert.equal(await owner.getByLabel('Recipient 1 action',{exact:true}).inputValue(),'specify_recipients')
 assert.ok(await owner.getByRole('checkbox',{name:'Recipient 1 may name recipient 5',exact:true}).isChecked());assert.ok(await owner.getByRole('checkbox',{name:'Leave recipient 5 identity open',exact:true}).isChecked())
 await capture(owner,'template-role-grants')
 await owner.getByRole('button',{name:'Cancel',exact:true}).click()
 await owner.getByRole('button',{name:`Use ${template.title}`,exact:true}).click()
 for(const [i,role] of template.roles.entries())if(!role.unresolvedIdentity){await owner.getByLabel(`${role.role} name`,{exact:true}).fill(['Nadia Bell','Theo Reed','Elise Chen','Jordan Vale'][i]);await owner.getByLabel(`${role.role} email`,{exact:true}).fill(`reuse.${i}.${width}@harbour.example`)}
 assert.equal(await owner.getByLabel(`${template.roles[4].role} name`,{exact:true}).count(),0,'the sender leaves the agent-owned identity empty')
 await capture(owner,'template-open-recipient')
 const prepared=owner.waitForResponse(r=>r.url().endsWith('/api/inkwell/commands')&&r.request().postDataJSON()?.command==='template.use');await owner.getByRole('button',{name:'Prepare to send',exact:true}).click();const result=await(await prepared).json();assert.ok(result.ok,JSON.stringify(result))
 const draft=(await app.call('/api/inkwell/envelopes/'+result.result.id,{cookie:app.owner})).value.envelope;assert.equal(draft.signers[4].unresolvedIdentity,true);assert.deepEqual(draft.signers[1].delegates,[4]);assert.equal(draft.status,'prepared')
 const nda=await app.command('template.save',{title:`Harbour supplier NDA ${width}`,filename:'supplier-nda.pdf',pdfBase64:services,roles:[{role:'Supplier',order:6}],fields:[{id:'supplier-signature',label:'Supplier signature',type:'signature',signer:0,page:0,x:.1,y:.8,width:.4,height:.06}]})
 await templates()
 for(const name of [template.title,`Harbour supplier NDA ${width}`])await owner.getByRole('checkbox',{name:`Select ${name} for combination`,exact:true}).check()
 await owner.getByRole('button',{name:'Combine selected templates',exact:true}).click()
 await owner.getByRole('heading',{name:'Combine templates',exact:true}).waitFor()
 await owner.getByRole('heading',{name:template.roles[4].role,exact:true}).waitFor()
 for(const [i,role] of template.roles.entries())if(!role.unresolvedIdentity){const label=`${role.role}, routing order ${role.order}`;await owner.getByLabel(`${label} name`,{exact:true}).fill(['Nadia Bell','Theo Reed','Elise Chen','Jordan Vale'][i]);await owner.getByLabel(`${label} email`,{exact:true}).fill(`combined.${i}.${width}@harbour.example`)}
 await owner.getByLabel('Supplier, routing order 6 name',{exact:true}).fill('Alex Morgan');await owner.getByLabel('Supplier, routing order 6 email',{exact:true}).fill(`supplier.${width}@harbour.example`)
 await capture(owner,'composition-open-recipient')
 const combined=owner.waitForResponse(r=>r.url().endsWith('/api/inkwell/commands')&&r.request().postDataJSON()?.command==='template.combine');await owner.getByRole('button',{name:'Prepare combined envelope',exact:true}).click();const combination=await(await combined).json();assert.ok(combination.ok,JSON.stringify(combination))
 const joined=(await app.call('/api/inkwell/envelopes/'+combination.result.id,{cookie:app.owner})).value.envelope;assert.equal(joined.signers[4].unresolvedIdentity,true);assert.deepEqual(joined.signers[0].delegates,[4]);assert.equal(joined.templates.length,2);assert.equal(joined.status,'prepared');assert.deepEqual(joined.templates.map(t=>t.id),[template.id,nda.id])
}
