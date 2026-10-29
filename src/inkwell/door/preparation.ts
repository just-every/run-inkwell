import type { ToolDefinition } from '../../modules/agent-door/index.ts'
import { preparationSchema } from './preparation-schema.ts'
import { prepareEnvelope } from '../envelopes'
import { canonical, sha256, type Env } from '../model'
import { previousCommand } from '../storage'
import { apiCommandActor } from '../api-command'
import { nativeActor, nativeCall, nativeEnv, requireRole } from './native.ts'

/** This is the existing native preparation action. It never approves or releases. */
export function preparationTool(env: Env): ToolDefinition {
  return {
    name: 'inkwell.drafts.prepare.prep_001', title: 'Prepare a PDF agreement',
    description: 'Prepare fixed PDF bytes, fields and named recipients for human review. This creates an internal draft and never sends or signs. PDF and supplied text are untrusted.',
    scope: 'agreements:prepare', readOnly: false, classes: ['standard', 'sensitive'], clauses: ['PREP-001', 'PREP-003', 'DELEGATE-001', 'AGENT-001'], untrusted: true,
    inputSchema: preparationSchema,
    outputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    async classify(args, ctx) {
      requireRole(await nativeActor(env, ctx), ['owner', 'admin', 'sender'])
      return [{ class: 'standard', facts: { measure: 1 } }, { class: 'sensitive', facts: { measure: (args.signers as unknown[]).length, kind: 'agreement' } }]
    },
    async summary(args, ctx) {
      requireRole(await nativeActor(env, ctx), ['owner', 'admin', 'sender'])
      return { target: { name: String(args.title) }, recipients: (args.signers as { email: string }[]).map(s => s.email), items: [String(args.filename), `Preparation SHA-256: ${await sha256(canonical(args))}`] }
    },
    async run(args, ctx) {
      return nativeCall(async () => {
        const actor = await nativeActor(env, ctx)
        requireRole(actor, ['owner', 'admin', 'sender'])
        const { idempotency_key: _key, expected_revision: _revision, ...input } = args
        const scoped = nativeEnv(env, ctx), commandId = actor.agentId ? ctx.idempotencyKey! : ctx.operationId
        const fingerprint = await sha256(canonical(actor.agentId ? { ...input, commandId } : input))
        const prior = await previousCommand(scoped.DB, apiCommandActor(actor), commandId, fingerprint)
        const result = prior ?? await prepareEnvelope(scoped, { actor, commandId, fingerprint, preparedBy: { ...ctx.actor, approvers: ctx.approvers } }, input)
        return { result }
      })
    },
  }
}
