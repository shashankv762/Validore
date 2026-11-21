import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function createDatabase() {
  const poolSize = Number(process.env.DB_MAX_CONNECTIONS || 2)
  if (!Number.isSafeInteger(poolSize) || poolSize < 1 || poolSize > 50) throw new Error('DB_MAX_CONNECTIONS must be an integer from 1 to 50')
  const client = postgres(process.env.DATABASE_URL!, {
    prepare: false, max: poolSize, idle_timeout: 20, connect_timeout: 10,
    // Disposable PostgreSQL fixtures deliberately truncate cascading rows.
    // Suppress only routine NOTICE messages; query errors still propagate.
    ...(process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL === process.env.DATABASE_URL ? { onnotice: () => {} } : {}),
    // Existing naive timestamps are decoded as UTC by Drizzle. Keep server
    // defaults/casts in that same zone without rewriting historical records.
    connection: { application_name: 'validore', statement_timeout: 30_000, timezone: 'UTC' },
  })
  return drizzle(client, { schema })
}
type Database = ReturnType<typeof createDatabase>
const processGlobal = globalThis as typeof globalThis & { validoreDatabase?: Database }

// Create one lazy connection pool per Node process.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = processGlobal.validoreDatabase ??= createDatabase()
    const value = Reflect.get(database, property)
    // postgres-js is a callable client with its own methods (end, begin, etc.).
    // Binding it as a Drizzle method drops those properties and prevents clean
    // pool shutdown in integration tests and server maintenance.
    return typeof value === 'function' && property !== '$client' ? value.bind(database) : value
  },
})
