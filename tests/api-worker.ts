import { agentResponse } from '../src/inkwell/door/index.ts'
import { complianceRequest } from '../src/inkwell/compliance/requests'
import { hostedResponse } from '../src/inkwell/in-person'
import { embedResponse } from '../src/inkwell/embed-response'
import { api } from '../src/inkwell/api'
import { authResponse, runtimeBindings } from '../src/auth.server'
import { importResponse } from '../src/inkwell/imports'
import { archiveResponse } from '../src/inkwell/archive'
import { scheduledPass, scheduledRemoteImports } from '../src/inkwell/scheduled'
// Test-only wall clock for expiry and fixed-window boundary journeys. This entry point is
// never shipped; production handlers and their stored expiry values stay unchanged.
const NativeDate = Date
let testNow: number | undefined
globalThis.Date = new Proxy(NativeDate, {
 construct(target, args) { return Reflect.construct(target, args.length ? args : [testNow ?? NativeDate.now()]) },
 apply(target) { return new NativeDate(testNow ?? NativeDate.now()).toString() },
 get(target, property) { return property === 'now' ? () => testNow ?? NativeDate.now() : Reflect.get(target, property) },
})
// Production route handlers and native sessions on actual workerd + D1.
export default { async fetch(request: Request, env: any, ctx: ExecutionContext) {
 const clock = request.headers.get('x-inkwell-test-time')
 testNow = clock === null ? undefined : Number(clock)
 return complianceRequest(request,env,async()=>await agentResponse(request,runtimeBindings(env)) ?? await hostedResponse(request,runtimeBindings(env)) ?? await authResponse(request,env) ?? await importResponse(request,runtimeBindings(env)) ?? await archiveResponse(request,env) ?? await embedResponse(request,runtimeBindings(env),async(req,scope)=>api.fetch(req,scope,ctx)) ?? api.fetch(request,env,ctx))
},
async scheduled(controller: ScheduledController, env: any) { if(controller.cron==='* * * * *')await scheduledRemoteImports(runtimeBindings(env));else await scheduledPass(runtimeBindings(env), controller.scheduledTime) } }
