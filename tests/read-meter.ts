import { runtimeBindings } from '../src/auth.server'
import { scheduledPass, scheduledRemoteImports } from '../src/inkwell/scheduled'
import { searchEnvelopes } from '../src/inkwell/search'

// Test-only: runs one scheduled or polled path with the D1 binding wrapped, and answers how many rows D1 says it read.
// Reached through the test worker only (api-worker.ts); never shipped.
function metered(db: D1Database, count: (rows: number) => void) {
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, { get(target, key) {
    if (key === '__raw') return target
    if (key === 'bind') return (...values: unknown[]) => wrap(target.bind(...values))
    if (key === 'first') return async (column?: string) => { const result = await target.all(); count(result.meta.rows_read); const row = result.results[0] ?? null; return column ? (row as any)?.[column] : row }
    if (key === 'all' || key === 'run') return async () => { const result = await (target as any)[key](); count(result.meta.rows_read); return result }
    if (key === 'raw') return async () => { const result = await target.all(); count(result.meta.rows_read); return result.results.map(row => Object.values(row as object)) }
    const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value
  } })
  return new Proxy(db, { get(target, key) {
    if (key === 'prepare') return (sql: string) => wrap(target.prepare(sql))
    if (key === 'batch') return async (list: D1PreparedStatement[]) => { const results = await target.batch(list.map(statement => (statement as any).__raw ?? statement)); for (const result of results) count(result.meta.rows_read); return results }
    const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value
  } })
}

export async function readBudget(request: Request, env: any) {
  const url = new URL(request.url), operation = url.searchParams.get('op')
  let rows = 0
  const bindings = runtimeBindings({ ...env, DB: metered(env.DB, n => { rows += n }) })
  try { if (operation === 'hourly') await scheduledPass(bindings, Number(url.searchParams.get('at')))
  else if (operation === 'minute') await scheduledRemoteImports(bindings)
  else if (operation === 'dashboard') await searchEnvelopes(bindings, { id: 'owner', email: 'owner@harbour.example', role: 'owner', name: 'Owner', version: 1 } as any, new URLSearchParams())
  else return new Response('unknown operation', { status: 400 }) } catch (error: any) { return new Response(String(error?.errors?.map((e: any) => e?.stack ?? e).join('\n') ?? error?.stack ?? error), { status: 500 }) }
  return Response.json({ rows })
}
