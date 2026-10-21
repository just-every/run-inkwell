import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

async function letter() {
  const pdf = await PDFDocument.create(); pdf.addPage([612,792])
  return { title: 'Free-form letter', filename: 'letter.pdf', pdfBase64: Buffer.from(await pdf.save()).toString('base64'), freeForm: true, fields: [], signers: [{ name: 'Mara Quinn', email: 'mara@clients.example' }] }
}
const field = { id: 'sig', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .2, width: .4, height: .05 }
const policy = async h => (await h.send('/api/inkwell/freeform-policy', undefined, h.owner)).value.policy
const read = async (h,id) => (await h.send('/api/inkwell/envelopes/'+id,undefined,h.owner)).value.envelope
const flip = async (h,enabled,cookie=h.owner) => h.command('account.freeform',{enabled,expectedVersion:(await policy(h)).version},cookie)

test('PREP-011 policy: owner/admin flips are audited, stale concurrent writes fail, members and revoked sessions cannot flip',async()=>{
  const h=await harness()
  try {
    assert.equal((await policy(h)).enabled,false)
    const admin=await h.invite('admin@harbour.example','admin'), viewer=await h.invite('viewer@harbour.example','member')
    const sender=await h.invite('sender@harbour.example','member'), senderId=(await h.send('/api/inkwell',undefined,sender)).value.actor.id
    await h.command('member.role',{operatorId:senderId,role:'sender'})
    for(const cookie of [sender,viewer]) await h.command('account.freeform',{enabled:true,expectedVersion:0},cookie,403)
    await h.post('/api/inkwell/commands',{command:'account.freeform',input:{enabled:true,expectedVersion:0},commandId:crypto.randomUUID()},'',401)
    const first=(await flip(h,true)).result.policy
    const history=async()=>(await h.send('/api/inkwell/freeform-policy/history',undefined,h.owner)).value.history
    assert.deepEqual(await history(),[{actor:first.actor,at:first.at,before:false,after:true,version:first.version}])
    await flip(h,true,admin)
    assert.equal((await history()).length,1,'a no-op creates no audit flip')
    const before=await policy(h)
    const commands=await Promise.all([h.send('/api/inkwell/commands',{command:'account.freeform',input:{enabled:false,expectedVersion:before.version},commandId:crypto.randomUUID()},h.owner),h.send('/api/inkwell/commands',{command:'account.freeform',input:{enabled:false,expectedVersion:before.version},commandId:crypto.randomUUID()},admin)])
    assert.deepEqual(commands.map(r=>r.status).sort(),[200,409],'exactly one concurrent expected-version change wins')
    const turnedOn=(await flip(h,true,admin)).result.policy
    assert.equal(turnedOn.actor,(await h.send('/api/inkwell',undefined,admin)).value.actor.id)
    const records=await history()
    assert.deepEqual(records.map(x=>[x.before,x.after]),[[false,true],[true,false],[false,true]])
    assert.ok(records.every(x=>x.actor&&Number.isFinite(Date.parse(x.at))))
    assert.equal((await h.send('/api/inkwell/freeform-policy/history',undefined,sender)).status,403)
    await h.db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE operator_id=?').bind(Date.now(),turnedOn.actor).run()
    await h.command('account.freeform',{enabled:false,expectedVersion:turnedOn.version},admin,401)
    assert.equal((await policy(h)).enabled,true,'revoked administrator session cannot change policy')
  } finally { await h.close() }
})

test('PREP-011 drafts: explicit fieldless mode is saved while off, send requires enabled policy, copy resets release snapshot and corrections cannot add fields',async()=>{
  const h=await harness()
  try {
    const base=await letter(),id=(await h.command('envelope.prepare',base)).result.id
    await h.command('envelope.prepare',{...base,freeForm:false},h.owner,400)
    await h.command('envelope.prepare',{...base,freeForm:'true'},h.owner,400)
    await h.command('envelope.prepare',{...base,fields:[field]},h.owner,400)
    await h.command('envelope.prepare',{...base,anchors:[]},h.owner,400)
    assert.equal((await read(h,id)).freeForm,true)
    await h.command('envelope.approve',{id,eligible:true},h.owner,409)
    assert.equal(await h.mail(base.signers[0].email,'Please sign:'),undefined)
    const enabled=(await flip(h,true)).result.policy
    await h.command('envelope.update',{...base,id,title:'Reviewed letter'})
    await h.command('envelope.approve',{id,eligible:true})
    const sent=await read(h,id)
    assert.deepEqual(sent.freeFormSetting,{version:enabled.version,actor:enabled.actor,at:enabled.at})
    assert.ok(await h.mail(base.signers[0].email,'Please sign:'))
    await flip(h,false)
    assert.deepEqual((await read(h,id)).freeFormSetting,sent.freeFormSetting,'already-sent envelopes retain their authority')
    await h.command('envelope.correct',{id,fields:[field]},h.owner,409)
    await h.command('envelope.correct',{id,subject:'Corrected letter'})
    const copy=(await h.command('envelope.copy',{id})).result.id,copied=await read(h,copy)
    assert.equal(copied.freeForm,true);assert.deepEqual(copied.fields,[]);assert.equal(copied.freeFormSetting,undefined)
    await h.command('envelope.approve',{id:copy,eligible:true},h.owner,409)
  } finally { await h.close() }
})

test('PREP-011 deferred sends: policy off/on invalidates scheduled and final-approval confirmations until a current editor confirms again',async()=>{
  const h=await harness()
  try {
    const base=await letter(),approver=await h.invite('approver@harbour.example','admin')
    await flip(h,true)
    const scheduled=(await h.command('envelope.prepare',{...base,title:'Scheduled free-form',signers:[{name:'Scheduled signer',email:'scheduled@clients.example'}]})).result.id
    const future=new Date(Date.now()+2*86_400_000),local=future.toISOString().slice(0,16)
    await h.command('envelope.approve',{id:scheduled,eligible:true,sendAt:{at:local,timeZone:'America/Phoenix'}})
    const at=Date.parse((await read(h,scheduled)).scheduled.at)
    await h.command('account.internal_approval',{rule:{approverEmail:'approver@harbour.example'}})
    const pending=(await h.command('envelope.prepare',{...base,title:'Approval free-form',signers:[{name:'Approval signer',email:'approval@clients.example'}]})).result.id
    await h.command('envelope.approve',{id:pending,eligible:true})
    await flip(h,false);await flip(h,true)
    await h.scheduled(at+120_000)
    const held=(await h.command('envelope.internal_decide',{id:pending,decision:'approve'},approver)).result
    assert.equal(held.held,true)
    for(const id of [scheduled,pending]) {
      const draft=await read(h,id)
      assert.equal(draft.status,'prepared');assert.ok(draft.sendHold);assert.equal(draft.scheduled,undefined);assert.equal(draft.internalApproval,undefined)
      assert.equal(draft.freeFormSetting,undefined)
    }
    await h.scheduled(at+3_600_000)
    assert.equal(await h.mail('scheduled@clients.example','Please sign:'),undefined)
    assert.equal(await h.mail('approval@clients.example','Please sign:'),undefined)
    await h.command('account.internal_approval',{rule:null})
    await h.command('envelope.approve',{id:scheduled,eligible:true})
    assert.ok(await h.mail('scheduled@clients.example','Please sign:'),'a current confirmation releases the held draft')
    await h.command('envelope.approve',{id:pending,eligible:true,sendAt:{at:local,timeZone:'America/Phoenix'}})
    assert.equal((await read(h,pending)).freeFormSetting,undefined,'scheduling does not snapshot a setting before release')
    const current=await policy(h)
    await h.scheduled(at+4_800_000)
    assert.deepEqual((await read(h,pending)).freeFormSetting,{version:current.version,actor:current.actor,at:current.at})
    assert.ok(await h.mail('approval@clients.example','Please sign:'),'current scheduled confirmation releases under the exact policy version')
  } finally { await h.close() }
})
