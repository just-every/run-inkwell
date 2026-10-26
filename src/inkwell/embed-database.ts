import { guardStatements, type Guard } from './storage'

/** Fence even native adapters' direct writes in the same D1 transaction as embedding authority. */
export function embeddedDatabase(db: D1Database, guard: Guard): D1Database {
 const originals = new WeakMap<object, D1PreparedStatement>()
 const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => {
  const changing = !/^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(sql)
  const batch = async () => { const g=guardStatements(db,[guard]);return (await db.batch([g.check,statement,g.clear]))[1] }
  const proxy = new Proxy(statement, {get(target,key) {
   if(key==='bind')return (...values:unknown[])=>wrap(target.bind(...values),sql)
   if(changing&&key==='run')return batch
   if(changing&&key==='all')return batch
   if(changing&&key==='first')return async(column?:string)=>{const row=(await batch()).results[0] as Record<string,unknown>|undefined;return column&&row?row[column]:row??null}
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value
  }})
  originals.set(proxy,statement);return proxy
 }
 return new Proxy(db,{get(target,key){
  if(key==='prepare')return (sql:string)=>wrap(target.prepare(sql),sql)
  if(key==='batch')return async(statements:D1PreparedStatement[])=>{const g=guardStatements(db,[guard]);return (await target.batch([g.check,...statements.map(s=>originals.get(s)??s),g.clear])).slice(1,-1)}
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value
 }})
}
