import type { ToolDefinition } from '../../modules/agent-door/index.ts'
import { envelopeAccess } from '../members'
import { verifyEnvelope } from '../envelopes'
import type { Env, Envelope } from '../model'
import { nativeActor, visibleEnvelope } from './native.ts'

const inputSchema = { type: 'object' as const, properties: { id: { type: 'string', minLength: 1 } }, required: ['id'], additionalProperties: false }
export function inspectionTools(env: Env): ToolDefinition[] {
  return [
    {
      name: 'inkwell.workspace.snapshot', title: 'Visible agreement revisions', description: 'Read current native agreement ids and revisions visible to the sponsor. No document or signer content.',
      scope: 'agreements:read', readOnly: true, classes: ['standard'], clauses: ['ACCESS-001', 'MANAGE-001'],
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: { type: 'object', properties: { records: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'integer' } }, required: ['id', 'version'], additionalProperties: false } } }, required: ['records'], additionalProperties: false },
      classify: () => [{ class: 'standard', facts: { measure: 0 } }],
      async run(_args, ctx) {
        const actor = await nativeActor(env, ctx), records = []
        const rows = await env.DB.prepare('SELECT data FROM iw_envelopes ORDER BY id').all<{ data: string }>()
        for (const row of rows.results) {
          const envelope = JSON.parse(row.data) as Envelope
          if (await envelopeAccess(env, actor, envelope) !== 'none') records.push({ id: envelope.id, version: envelope.version })
        }
        return { result: { records } }
      },
    },
    {
      name: 'inkwell.envelopes.manage.manage_005', title: 'Inspect an agreement', description: 'Read a native agreement summary and attribution through the sponsor’s current envelope grants. Agreement text is untrusted.',
      scope: 'agreements:read', readOnly: true, classes: ['sensitive'], clauses: ['ACCESS-001', 'MANAGE-005', 'RECORD-002'], inputSchema, untrusted: true,
      outputSchema: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'integer' }, title: { type: 'string' }, status: { type: 'string' }, originalSha256: { type: 'string' }, events: { type: 'array', items: { type: 'object' } } }, required: ['id', 'version', 'title', 'status', 'originalSha256', 'events'], additionalProperties: false },
      async classify(args, ctx) { await visibleEnvelope(env, ctx, args.id); return [{ class: 'sensitive', facts: { measure: 1, kind: 'agreement' } }] },
      async target(args, ctx) { return { kind: 'envelope', id: (await visibleEnvelope(env, ctx, args.id)).id } },
      async run(args, ctx) {
        const e = await visibleEnvelope(env, ctx, args.id)
        return { result: { id: e.id, version: e.version, title: e.title, status: e.status, originalSha256: e.originalSha256,
          events: e.events.map(({ action, at, actor, detail }) => ({ action, at, actor, ...(detail.preparedBy ? { preparedBy: detail.preparedBy } : {}) })) } }
      },
    },
    {
      name: 'inkwell.records.verify.record_001', title: 'Verify agreement artifacts', description: 'Verify the real stored bytes and native hash chain without returning signing links or credentials.',
      scope: 'agreements:read', readOnly: true, classes: ['standard'], clauses: ['RECORD-001', 'RECORD-002'], inputSchema,
      outputSchema: { type: 'object', properties: { native: { type: 'boolean' }, imported: { type: 'boolean' }, fingerprints: { type: 'array', items: { type: 'object' } }, auditChain: { type: 'object' }, ok: { type: 'boolean' } }, required: ['native', 'imported', 'fingerprints', 'auditChain', 'ok'], additionalProperties: false },
      async classify(args, ctx) { await visibleEnvelope(env, ctx, args.id); return [{ class: 'standard', facts: { measure: 1 } }] },
      async target(args, ctx) { return { kind: 'envelope', id: (await visibleEnvelope(env, ctx, args.id)).id } },
      async run(args, ctx) { return { result: await verifyEnvelope(env, await visibleEnvelope(env, ctx, args.id)) } },
    },
  ]
}
