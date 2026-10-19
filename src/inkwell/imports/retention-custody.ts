import { createPortability } from '@runeditrun/rer/modules/portability'
import policy from '../archive-policy.mjs'
import type { Env } from '../model'
import type { D1Sql } from '../../modules/import-kit/src/d1/index'

/** Preserve portability's public statement API while handing its exact SQL to import-kit.
 * The recorder delegates real D1 operations; it never invents a restore fence. */
export async function archiveErasureCheckpoint(env: Env, record: string): Promise<D1Sql[]> {
 const statementSql = Symbol('portability statement SQL')
 const wrap = (statement: D1PreparedStatement, sql: string, params: unknown[] = []): D1PreparedStatement => {
  const proxy = new Proxy(statement, {get(target,key) {
   if (key === statementSql) return {sql,params}
   if (key === 'bind') return (...values: unknown[]) => wrap(target.bind(...values),sql,values)
   const value = Reflect.get(target,key)
   return typeof value === 'function' ? value.bind(target) : value
  }})
  return proxy
 }
 const db = {prepare:(sql:string)=>wrap(env.DB.prepare(sql),sql),batch:env.DB.batch.bind(env.DB),exec:env.DB.exec.bind(env.DB),dump:env.DB.dump.bind(env.DB)} as D1Database
 const service = await createPortability({db,policy})
 const writes = [...await service.redactionStatements(),...await service.erasureStatements('iw_imported_archives',{id:record}),...await service.invalidateTransfersStatements()]
 return writes.map(statement => {const sql=(statement as unknown as Record<symbol,D1Sql>)[statementSql];if(!sql)throw new Error('Portability returned an unrecorded statement.');return sql})
}
