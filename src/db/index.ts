import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const poolSize = Number(process.env.DB_MAX_CONNECTIONS || 5)
if (!Number.isSafeInteger(poolSize) || poolSize < 1 || poolSize > 50) throw new Error('DB_MAX_CONNECTIONS must be an integer from 1 to 50')
const processGlobal = globalThis as typeof globalThis & { validorePostgres?: ReturnType<typeof postgres> }
const client = processGlobal.validorePostgres ?? postgres(process.env.DATABASE_URL!, {
  prepare: false, max: poolSize, idle_timeout: 20, connect_timeout: 10,
  connection: { application_name: 'validore', statement_timeout: 30_000 },
})
if (process.env.NODE_ENV === 'development') processGlobal.validorePostgres = client
export const db = drizzle(client, { schema })
