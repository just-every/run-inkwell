import assert from 'node:assert/strict'
import { latestLocalAgent } from './agent-door-fixtures.mjs'

export async function afterStep({ step, args, result, tool, phase }) {
  if (step.id === 'prepare' && phase === 'autonomous') {
    const conflict = await tool(step.tool, { ...args, title: 'Changed agreement on the same operation key' })
    assert.equal(conflict.result?._meta?.['com.runeditrun/error']?.code, 'idempotency_conflict')
    const read = await tool('inkwell.envelopes.manage.manage_005', { id: result.id })
    const envelope = read.result?.structuredContent
    assert.equal(envelope?.status, 'prepared')
    const attribution = envelope.events.find(event => event.action === 'envelope.prepared')
    assert.equal(attribution.actor, `${attribution.preparedBy.agent.name} for ${attribution.preparedBy.for.name}`)
    assert.ok(attribution.preparedBy.agent.id)
    assert.ok(attribution.preparedBy.for.id)
  }
  if (step.id === 'verify') assert.equal(result.ok, true, 'native artifact and chain verification')
}
export default async function ({ tool, request, origin, cookie }) {
  const scoped = await tool('inkwell.envelopes.manage.manage_005', { id: crypto.randomUUID() }, { client: 'local' })
  assert.equal(scoped.status, 403)
  assert.equal(scoped.result?._meta?.['com.runeditrun/error']?.code, 'insufficient_scope')
  const revoked = await request(origin + '/api/inkwell/commands', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'agent.revoke', commandId: crypto.randomUUID(), input: { id: latestLocalAgent } }) })
  assert.equal(revoked.status, 200)
  const stopped = await tool('inkwell.drafts.prepare.prep_001', {}, { client: 'local' })
  assert.equal(stopped.status, 401, 'revocation stops the next local credential call')
  const missing = await tool('inkwell.envelopes.manage.manage_005', { id: crypto.randomUUID() })
  assert.equal(missing.result?._meta?.['com.runeditrun/error']?.code, 'resource_unavailable')
}
