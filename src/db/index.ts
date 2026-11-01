import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { workerScope } from '../lib/worker-scope'

function createDatabase() {
  const poolSize = Number(process.env.DB_MAX_CONNECTIONS || 2)
  if (!Number.isSafeInteger(poolSize) || poolSize < 1 || poolSize > 50) throw new Error('DB_MAX_CONNECTIONS must be an integer from 1 to 50')
  const scope = workerScope()
  const client = postgres(process.env.DATABASE_URL!, {
    prepare: false, max: poolSize, idle_timeout: 20, connect_timeout: 10,
    connection: { application_name: 'validore', statement_timeout: 30_000 },
  })
  if (scope) scope.cleanup.push(() => client.end({ timeout: 5 }))
  return drizzle(client, { schema })
}
type Database = ReturnType<typeof createDatabase>
const processGlobal = globalThis as typeof globalThis & { validoreDatabase?: Database }

function currentDatabase(): Database {
  const scope = workerScope()
  if (!scope) return processGlobal.validoreDatabase ??= createDatabase()
  let database = scope.resources.get('database') as Database | undefined
  if (!database) {
    database = createDatabase()
    scope.resources.set('database', database)
  }
  return database
}

// Preserve existing transaction/query APIs, with one pool per Worker request.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = currentDatabase()
    const value = Reflect.get(database, property)
    return typeof value === 'function' ? value.bind(database) : value
  },
})
