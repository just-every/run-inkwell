/** Actor identity comes from the native session, never a request-supplied header. */
export type AccountAuditActor = string | { kind: 'system'; id: string }
type Database = D1Database | D1DatabaseSession
type Statement = { native: D1PreparedStatement; writes: boolean }
const nativeDatabases = new WeakMap<object, Database>()
const statements = new WeakMap<D1PreparedStatement, Statement>()

// Strip SQL strings, quoted identifiers and comments before checking for writes.
// WITH ... INSERT, UPDATE or DELETE and PRAGMA must not accidentally bypass context.
function writes(sql: string) {
  const words = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\r\n]*|\/\*[\s\S]*?\*\//g, ' ')
  return !/^\s*(?:SELECT|WITH|EXPLAIN)\b/i.test(words) || /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX|ANALYZE)\b/i.test(words)
}

/** Every write and its actor context share one D1 batch transaction. SQLite
 * serializes those transactions, so concurrent requests cannot borrow actors.
 * A failed write rolls back the context too. Bootstrap and restore use the raw DB.
 */
export function withAuditDatabase(db: D1Database, actor: AccountAuditActor): D1Database {
  db = (nativeDatabases.get(db) ?? db) as D1Database
  const actorId = typeof actor === 'string' ? actor : actor.id
  const actorKind = typeof actor === 'string' ? 'operator' : 'system'
  if (!actorId || actorId.length > 200 || /[\x00-\x1f]/.test(actorId)) throw new Error('Invalid account audit actor.')

  function wrap(database: Database): Database {
    async function batch<T>(prepared: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const records = prepared.map(statement => statements.get(statement) ?? { native: statement, writes: true })
      if (!records.some(record => record.writes)) return database.batch<T>(records.map(record => record.native))
      // No upsert: any stale context fails closed instead of misattributing it.
      const result = await database.batch<T>([
        database.prepare('INSERT INTO iw_account_audit_context(singleton,actor_id,actor_kind) VALUES(1,?,?)').bind(actorId, actorKind),
        ...records.map(record => record.native),
        database.prepare('DELETE FROM iw_account_audit_context WHERE singleton=1'),
      ])
      return result.slice(1, -1)
    }
    function prepare(sql: string): D1PreparedStatement {
      function statement(native: D1PreparedStatement): D1PreparedStatement {
        const write = writes(sql)
        const execute = async <T>() => (await batch<T>([wrapped]))[0]
        const wrapped: D1PreparedStatement = {
          bind: (...values: unknown[]) => statement(native.bind(...values)),
          async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
            if (!write) return column === undefined ? native.first<T>() : native.first<T>(column)
            const row = (await execute<Record<string, unknown>>()).results[0]
            if (!row) return null
            if (column === undefined) return row as T
            if (!Object.prototype.hasOwnProperty.call(row, column)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (\"${column}\")`)
            return row[column] as T
          },
          run: <T = Record<string, unknown>>() => write ? execute<T>() : native.run<T>(),
          all: <T = Record<string, unknown>>() => write ? execute<T>() : native.all<T>(),
          raw: ((options?: { columnNames?: boolean }) => {
            // D1.batch discards column metadata. Do not fabricate mutating raw
            // results (especially empty RETURNING sets or duplicate columns).
            if (write) return Promise.reject(new Error('Audited writes must use run(), all(), first(), or batch(); mutating raw() is unsupported.'))
            return options?.columnNames ? native.raw({ columnNames: true }) : native.raw()
          }) as D1PreparedStatement['raw'],
        }
        statements.set(wrapped, { native, writes: write })
        return wrapped
      }
      return statement(database.prepare(sql))
    }
    const proxy = new Proxy(database, {
      get(target, property) {
        if (property === 'prepare') return prepare
        if (property === 'batch') return batch
        if (property === 'withSession' && 'withSession' in target) return (bookmark?: string) => wrap(target.withSession(bookmark))
        if (property === 'exec') return () => Promise.reject(new Error('Audited writes must use prepared statements; exec() is unsupported.'))
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    nativeDatabases.set(proxy, database)
    return proxy
  }
  return wrap(db) as D1Database
}
