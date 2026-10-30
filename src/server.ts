import { agentResponse } from './inkwell/door/index.ts'
import { embedResponse } from './inkwell/embed-response'
import { complianceRequest } from './inkwell/compliance/requests'
import { hostedResponse } from './inkwell/in-person'
import { withDemo } from './modules/demo/index.mjs'
import { seedDemo } from './demo'
import { rejectedResponse } from './base/rejected-response'
import start from '@tanstack/react-start/server-entry'
import { dispatch } from './base/dispatch'
import { staticAssetResponse } from './base/static-assets'
import { lobbyResponse } from './base/lobby'
import { setupStateResponse } from './base/setup-state'
import { authResponse, runtimeBindings, type Bindings } from './auth.server'
import { identity } from './identity'
import { api } from './inkwell/api'
import { importResponse } from './inkwell/imports'
import { archiveResponse } from './inkwell/archive'
import { scheduledPass, scheduledRemoteImports } from './inkwell/scheduled'

// Start documents keep their own cache policy and add no-transform, so no proxy
// rewrites the HTML React hydrates (Cloudflare's email address obfuscation
// honours it; src/base/hydration/README.md).
function noTransform(response: Response, request: Request): Response {
  const headers = new Headers(response.headers), policy = headers.get('cache-control')
  const path = new URL(request.url).pathname
  if (!path.startsWith('/embed/') && !headers.has('content-security-policy')) headers.set('content-security-policy', "frame-ancestors 'self'")
  headers.set('cache-control', policy ? `${policy}, no-transform` : 'no-transform')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default withDemo({
  async fetch(request, env, execution) {
    return complianceRequest(request, env, async () => {
    const asset = await staticAssetResponse(request, env)
    if (asset) return asset
    const agent = await agentResponse(request, runtimeBindings(env))
    if (agent) return noTransform(agent, request)
    const hosted = await hostedResponse(request, runtimeBindings(env))
    if (hosted) return noTransform(hosted, request)
    const embedded = await embedResponse(request, runtimeBindings(env), async (req,scope) => new URL(req.url).pathname.startsWith('/api/') ? api.fetch(req, scope, execution) : noTransform(await start.fetch(req), req))
    if (embedded) return embedded
    const auth = await authResponse(request, env)
    if (auth) return noTransform(auth, request)
    // The installed variant: the Lobby at / and the public claim state it reads.
    // Local dev serves the saved origin's data at its own port (RER_DEV_ORIGIN).
    const product = await importResponse(request, runtimeBindings(env)) ?? await archiveResponse(request,env)
    if (product) return product
    const state = await setupStateResponse(request, runtimeBindings(env))
    if (state) return noTransform(state, request)
    const lobby = await lobbyResponse(request, runtimeBindings(env), identity)
    if (lobby) return noTransform(lobby, request)
    return rejectedResponse(request, await dispatch(request, () => api.fetch(request, env, execution), async () => noTransform(await start.fetch(request), request)))
    })
  },
  // The hourly pass: DELIV-004 expiry warnings and DELIV-003 reminders.
  async scheduled(controller, env) { if(controller.cron==='* * * * *')await scheduledRemoteImports(runtimeBindings(env));else await scheduledPass(runtimeBindings(env), controller.scheduledTime) },
} satisfies ExportedHandler<Bindings>, { seed: seedDemo })
