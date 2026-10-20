import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { harness } from './harness.mjs'

test('AGENT-007: ten real envelope corrections produce a cited proposal, and only the template maker explicitly publishes version 2', async () => {
  const h = await harness()
  try {
    const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
    const pdfBase64 = Buffer.from(await pdf.save()).toString('base64')
    const signature = { id: 'signature', label: 'Client signature', type: 'signature', signer: 0, page: 0, x: .1, y: .7, width: .5, height: .05 }
    const base = { title: 'Harbour services', filename: 'services.pdf', pdfBase64, roles: [{ role: 'Client', order: 1 }], fields: [signature], expiryDays: 45, reminders: { afterDays: 2, everyDays: 3 }, message: 'Please review the scope.' }
    const id = (await h.command('template.save', base)).result.id
    const read = async envelope => (await h.send(`/api/inkwell/envelopes/${envelope}`, undefined, h.owner)).value.envelope
    const proposals = async () => (await h.send(`/api/inkwell/templates/${id}/proposals`, undefined, h.owner)).value.proposals
    const examples = []
    for (let i = 0; i < 10; i++) {
      const signers = [{ name: `Client ${i}`, email: `client.${i}@harbour.example` }]
      const envelope = (await h.command('template.use', { id, recipients: signers })).result.id
      if (i === 0) assert.deepEqual(await proposals(), [], 'ordinary per-send recipient substitutions do not create suggestions')
      const fields = [signature, { id: `placed-${i}`, label: 'Purchase order', type: 'text', signer: 0, page: 0, x: .1, y: .5, width: .5, height: .05 }]
      await h.command('envelope.update', { id: envelope, title: `Harbour services — order ${i}`, filename: 'services.pdf', pdfBase64, signers, fields })
      assert.equal((await read(envelope)).template.id, id, 'editing preserves template lineage')
      await h.command('envelope.approve', { id: envelope, eligible: true })
      examples.push(envelope)
    }
    const [proposal] = await proposals()
    assert.equal((await proposals()).length, 1)
    assert.equal(proposal.examples.length, 10)
    assert.deepEqual(proposal.examples.map(e => e.id).sort(), examples.sort())
    assert.ok(proposal.reasons.some(reason => reason.includes('Purchase order')))
    assert.equal(proposal.changes.before.fields.length, 1)
    assert.equal(proposal.changes.after.fields.length, 2)
    for (const example of proposal.examples) assert.ok((await read(example.id)).events.some(event => event.hash === example.eventHash && event.action === 'envelope.updated'))
    const listed = () => h.send('/api/inkwell/templates', undefined, h.owner)
    assert.equal((await listed()).value.templates[0].version, 1, 'proposal alone does not change anything')
    const editor = await h.invite('editor@harbour.example', 'member')
    const editorId = (await h.send('/api/inkwell', undefined, editor)).value.actor.id
    await h.command('member.role', { operatorId: editorId, role: 'sender' })
    await h.command('template.share', { id, email: 'editor@harbour.example', access: 'edit' })
    assert.equal((await h.send(`/api/inkwell/templates/${id}/proposals`, undefined, editor)).status, 403)
    await h.command('template.apply_proposal', { id, proposalId: proposal.id, version: 1 }, editor, 403)
    assert.equal((await h.send(`/api/inkwell/templates/${id}/proposals`)).status, 401)
    await h.command('template.apply_proposal', { id, proposalId: 'missing', version: 1 }, h.owner, 409)
    const commandId = crypto.randomUUID(), input = { id, proposalId: proposal.id, version: 1 }
    const published = (await h.command('template.apply_proposal', input, h.owner, 200, commandId)).result
    assert.equal(published.version, 2)
    assert.deepEqual((await h.command('template.apply_proposal', input, h.owner, 200, commandId)).result, published, 'replaying approval never publishes twice')
    await h.command('template.apply_proposal', input, h.owner, 409)
    const template = (await listed()).value.templates[0]
    assert.equal(template.fields.length, 2); assert.equal(template.expiryDays, 45); assert.deepEqual(template.reminders, base.reminders)
    assert.equal(template.maintenance.examples.length, 10)
    assert.equal((await h.send('/api/inkwell/templates', undefined, editor)).value.templates[0].maintenance, undefined, 'shared-template access does not disclose private correction references')
    assert.deepEqual(await proposals(), [], 'old-version corrections are not proposed again')
    const prior = await read(examples[0])
    assert.equal(prior.template.version, 1); assert.ok(prior.fields.some(f => f.label === 'Purchase order'))
    const next = (await h.command('template.use', { id, recipients: [{ name: 'New Client', email: 'new@harbour.example' }] })).result.id
    assert.equal((await read(next)).fields.length, 2, 'the next send inherits the published field without placement')
  } finally { await h.close() }
})

test('AGENT-007: corrected source PDFs, prepared addresses and role routing are reviewable; changed or erased evidence cannot publish stale suggestions', async () => {
  const h = await harness()
  try {
    const pdf = await PDFDocument.create(); pdf.addPage([612, 792])
    const original = Buffer.from(await pdf.save()).toString('base64')
    pdf.addPage([612, 792]); const revised = Buffer.from(await pdf.save()).toString('base64')
    const fields = [{ id: 'sig', label: 'Signature', type: 'signature', signer: 0, page: 0, x: .1, y: .7, width: .5, height: .05 }, { id: 'address', label: 'Company address', type: 'text', signer: 0, page: 0, x: .1, y: .3, width: .5, height: .05, prefill: { value: '10 Old Street', source: 'Company record' }, readOnly: true }]
    const id = (await h.command('template.save', { title: 'Vendor W-9 packet', filename: 'w9.pdf', pdfBase64: original, roles: [{ role: 'Vendor', order: 1 }], fields })).result.id
    const signers = [{ name: 'River Supplies', email: 'river@harbour.example', order: 2 }]
    const envelope = (await h.command('template.use', { id, recipients: signers })).result.id
    await h.command('envelope.update', { id: envelope, title: 'Revised vendor packet', filename: 'w9-revised.pdf', pdfBase64: revised, signers, fields: fields.map(f => f.id === 'address' ? { ...f, prefill: { value: '80 River Road', source: 'Corrected company record' } } : f) })
    const load = async () => (await h.send(`/api/inkwell/templates/${id}/proposals`, undefined, h.owner)).value.proposals
    const [proposal] = await load()
    assert.notEqual(proposal.changes.after.originalSha256, proposal.changes.before.originalSha256)
    assert.equal(proposal.changes.after.roles[0].order, 2)
    assert.equal(proposal.changes.after.fields.find(f => f.id === 'address').prefill.value, '80 River Road')
    await h.command('envelope.update', { id: envelope, title: 'Unchanged vendor packet', filename: 'w9.pdf', pdfBase64: original, signers: [{ ...signers[0], order: 1 }], fields })
    assert.deepEqual(await load(), [], 'reverted corrections no longer support the suggestion')
    await h.command('template.apply_proposal', { id, proposalId: proposal.id, version: 1 }, h.owner, 409)
    await h.command('envelope.update', { id: envelope, title: 'Revised vendor packet', filename: 'w9-revised.pdf', pdfBase64: revised, signers, fields: fields.map(f => f.id === 'address' ? { ...f, prefill: { value: '80 River Road', source: 'Corrected company record' } } : f) })
    await h.command('template.apply_proposal', { id, proposalId: proposal.id, version: 1 })
    const templates = (await h.send('/api/inkwell/templates', undefined, h.owner)).value.templates
    assert.equal(templates[0].pageSizes.length, 2); assert.equal(templates[0].filename, 'w9-revised.pdf')
    const unchanged = (await h.send(`/api/inkwell/envelopes/${envelope}`, undefined, h.owner)).value.envelope
    assert.equal(unchanged.template.version, 1)
    // A suggestion is derived from its live source, never a stale cached revision after erasure.
    const doomed = (await h.command('template.use', { id, recipients: signers })).result.id
    pdf.addPage([612, 792]); const third = Buffer.from(await pdf.save()).toString('base64')
    await h.command('envelope.update', { id: doomed, title: 'Withdrawn third revision', filename: 'w9-third.pdf', pdfBase64: third, signers, fields })
    const [stale] = await load()
    assert.ok(stale)
    await h.command('envelope.approve', { id: doomed, eligible: true })
    await h.command('envelope.void', { id: doomed, reason: 'Withdrawn source revision' })
    await h.post('/api/inkwell/erase', { id: doomed, confirmation: 'ERASE' }, h.owner)
    await h.command('template.apply_proposal', { id, proposalId: stale.id, version: 2 }, h.owner, 409)
    assert.deepEqual(await load(), [])
  } finally { await h.close() }
})
