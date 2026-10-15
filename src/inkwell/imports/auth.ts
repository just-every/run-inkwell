import { operatorAuth, runtimeBindings, type Bindings } from '../../auth.server'
import type { Session } from '../../modules/operator-auth/index.mjs'
import type { D1ImportContext, D1Sql } from '../../modules/import-kit/src/d1/index'
import { archiveTargets } from './targets'
import { MAPPING, NAMESPACE } from './source'

export class ImportError extends Error { constructor(message:string, public status=400) {super(message)} }
export async function importSession(request:Request, env:Bindings):Promise<Session> {
 const session=await operatorAuth(runtimeBindings(env)).getSession(request)
 if (!session) throw new ImportError('Sign in to open the archive.',401)
 if (session.operator.role!=='owner') throw new ImportError('Only the owner can manage imported archives.',403)
 return session
}
export function ownerPredicate(session:Session):D1Sql {
 return {sql:`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND o.status='active' AND o.role='owner' AND s.operator_version=o.version AND s.revoked_at IS NULL AND s.expires_at>?)`,params:[session.id,session.operator.id,Date.now()]}
}
export function importContext(env:Bindings, session:Session, operationKey?:string):D1ImportContext {
 return {destination:'inkwell',namespace:NAMESPACE,mappingVersion:MAPPING,operationKey,batchSize:1,maxBatches:10,storage:{database:env.DB,targets:archiveTargets},authorization:{principalId:'role:owner',predicate:()=>ownerPredicate(session)}}
}
export function importSameOrigin(request:Request,env:Bindings) {
 if (request.headers.get('Origin')!==new URL(runtimeBindings(env).AUTH_ORIGIN).origin) throw new ImportError('Use this installation to change the archive.',403)
}
export async function confirmOwner(env:Bindings,session:Session) {
 const predicate=ownerPredicate(session)
 const r=await env.DB.prepare(`SELECT (${predicate.sql}) AS ok`).bind(...predicate.params!).first<{ok:number}>()
 if (r?.ok!==1) throw new ImportError('Your owner session changed. Sign in again.',403)
}
