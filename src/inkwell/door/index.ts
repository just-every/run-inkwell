import { createAgentDoor, operatorAuthPeople, type Capability, type Trust } from '../../modules/agent-door/index.ts'
import { createBusinessSettings } from '../../modules/business-settings/index.ts'
import { operatorAuth, type Bindings } from '../../auth.server'
import { withAuditDatabase } from '../account-audit-db'
import { authenticateAgent } from '../agents'
import { Refusal } from '../model'
import { inspectionTools } from './inspection.ts'
import { preparationTool } from './preparation.ts'

export const capabilities: Capability[] = ['tools', 'policy', 'pause', 'audit', 'idempotency']
export const notTools = [
  { clauses: ['HTTP-001', 'ADMIN-007', 'PORT-001'], reason: 'installation' as const },
  { clauses: ['MOVE-001'], reason: 'import-door' as const },
  { clauses: ['MOBILE-001'], reason: 'device' as const },
  { clauses: ['SIGN-001', 'SIGNX-001'], reason: 'screen' as const },
]
function trust(env: Bindings): Trust | null {
  const issuer = env.RER_OWNER_CLAIM_ISSUER, installationId = env.RER_OWNER_CLAIM_INSTALLATION_ID, publicKeys = env.RER_OWNER_CLAIM_PUBLIC_KEYS
  if (![issuer, installationId, publicKeys].some(Boolean)) return null
  if (!issuer || !installationId || !publicKeys) throw new Error('Incomplete agent door trust configuration')
  return { issuer, installationId, appOrigin: env.AUTH_ORIGIN, publicKeys: JSON.parse(publicKeys) as Trust['publicKeys'] }
}
export function inkwellAgentDoor(env: Bindings) {
  return createAgentDoor({
    seed: 'inkwell', name: 'Inkwell', specialist: 'agreement operations', db: env.DB, origin: env.AUTH_ORIGIN, trust: trust(env), capabilities, limits: { maxBodyBytes: 3_000_000 },
    people: operatorAuthPeople({ db: env.DB, session: request => operatorAuth(env).getSession(request) }),
    tools: [preparationTool(env), ...inspectionTools(env)], notTools,
    async localCredentials(request) {
      if (!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization') ?? '')) return null
      try {
        const actor = await authenticateAgent(request, env)
        return { sponsor: { id: actor.id }, agent: { id: actor.agentId!, name: 'Inkwell preparation agent', specialist: 'agreement operations' }, scopes: ['agreements:prepare'], clientId: `preparation:${actor.agentId}` }
      } catch (error) { if (error instanceof Refusal) return null; throw error }
    },
  })
}
export async function agentResponse(request: Request, env: Bindings): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (path === '/api/rer/business-settings' || path === '/rer-business-logo' || path === '/rer-business.css') {
    const scoped = { ...env, DB: withAuditDatabase(env.DB, { kind: 'system', id: 'business-settings' }) }
    const auth = operatorAuth(scoped)
    const settings = createBusinessSettings({ db: scoped.DB, trust: env.RER_BUSINESS_TRUST, business: { settings: 1, values: ['display_name'], team: { roles: { admin: 'admin', member: 'member' } } }, team: auth.businessTeam })
    const response = await settings.handle(request)
    if (response) return response
  }
  if (path === '/mcp' || path === '/api/rer/agent-policy' || path === '/agents' || path.startsWith('/agents/') || path.startsWith('/.well-known/oauth-protected-resource')) return inkwellAgentDoor(env).handle(request)
  return null
}
