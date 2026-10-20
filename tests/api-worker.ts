import { complianceRequest } from '../src/inkwell/compliance/requests'
import { hostedResponse } from '../src/inkwell/in-person'
import { api } from '../src/inkwell/api'
import { authResponse, runtimeBindings } from '../src/auth.server'
import { importResponse } from '../src/inkwell/imports'
import { archiveResponse } from '../src/inkwell/archive'
import { scheduledPass } from '../src/inkwell/scheduled'
// Production route handlers and native sessions on actual workerd + D1.
export default { async fetch(request: Request, env: any, ctx: ExecutionContext) {
 return complianceRequest(request,env,async()=>await hostedResponse(request,runtimeBindings(env)) ?? await authResponse(request,env) ?? await importResponse(request,runtimeBindings(env)) ?? await archiveResponse(request,env) ?? api.fetch(request,env,ctx))
},
async scheduled(controller: ScheduledController, env: any) { await scheduledPass(runtimeBindings(env), controller.scheduledTime) } }
