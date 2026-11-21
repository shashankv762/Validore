import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

const state = vi.hoisted(() => ({ client: null as unknown as PGlite, send: vi.fn() }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('@/db/schema')
  state.client = new PGlite()
  return { db: drizzle(state.client, { schema }) }
})
vi.mock('@/inngest/client', () => ({ inngest: { send: state.send } }))
import { db } from '@/db'
import { dispatchValidationJob, reconcileValidationDispatches } from '@/lib/validation/dispatch'
import { assertExecutionCapacity, releaseExecutionLease, reserveExecutionLease } from '@/lib/execution-admission'

beforeAll(async () => state.client.exec(`create table validation_jobs (id uuid primary key, user_id uuid not null, status text not null,
  dispatched_at timestamptz, dispatch_lease_expires_at timestamptz, created_at timestamp default now(), updated_at timestamp default now());
  create table planning_module_requests (id uuid primary key, status text not null, lease_expires_at timestamptz);
  create table ai_execution_leases (id uuid primary key default gen_random_uuid(), user_id uuid not null,
    lease_kind text not null, expires_at timestamptz not null, created_at timestamptz not null default now());`))
afterAll(async () => state.client.close())
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv('VALIDATION_RUNNER', 'inngest'); vi.stubEnv('AI_GLOBAL_ACTIVE_RUNS', '1')
  await state.client.exec('truncate validation_jobs, planning_module_requests, ai_execution_leases')
  state.send.mockResolvedValue({ ids: ['synthetic-event'] })
})
afterEach(() => vi.unstubAllEnvs())
const admit = async () => {
  const id = randomUUID(); const userId = randomUUID()
  await state.client.query('insert into validation_jobs (id, user_id, status) values ($1, $2, $3)', [id, userId, 'pending'])
  return { id, userId }
}

describe('durable validation dispatch and app capacity', () => {
  it('leases one publisher and acknowledges the same admitted identity exactly once', async () => {
    const job = await admit()
    expect(await Promise.all([dispatchValidationJob(job.id), dispatchValidationJob(job.id)])).toContain(true)
    expect(state.send).toHaveBeenCalledOnce()
    expect(state.send).toHaveBeenCalledWith({ id: job.id, name: 'validore/validation.requested', data: { jobId: job.id, userId: job.userId } })
    expect(await dispatchValidationJob(job.id)).toBe(false)
  })
  it('recovers an ambiguous acknowledgement after lease expiry without another admission or debit', async () => {
    const job = await admit()
    state.send.mockRejectedValueOnce(new Error('Response lost after publish'))
    expect(await dispatchValidationJob(job.id)).toBe(false)
    expect(await dispatchValidationJob(job.id)).toBe(false)
    await state.client.query("update validation_jobs set dispatch_lease_expires_at = now() - interval '1 second' where id = $1", [job.id])
    expect(await reconcileValidationDispatches()).toEqual({ dispatched: 1 })
    expect(state.send.mock.calls[0][0]).toEqual(state.send.mock.calls[1][0])
    const saved = await state.client.query<{ status: string; dispatched_at: Date }>('select status, dispatched_at from validation_jobs where id = $1', [job.id])
    expect(saved.rows[0].status).toBe('pending'); expect(saved.rows[0].dispatched_at).not.toBeNull()
  })
  it('does not republish expired or terminal jobs', async () => {
    const job = await admit()
    await state.client.query("update validation_jobs set created_at = now() - interval '61 minutes' where id = $1", [job.id])
    expect(await dispatchValidationJob(job.id)).toBe(false)
    await state.client.query("update validation_jobs set status = 'failed', created_at = now() where id = $1", [job.id])
    expect(await dispatchValidationJob(job.id)).toBe(false)
    expect(state.send).not.toHaveBeenCalled()
  })
  it('shares one admission budget across validations and active planning leases and permits its own takeover', async () => {
    await db.transaction(tx => assertExecutionCapacity(tx))
    const job = await admit()
    await expect(db.transaction(tx => assertExecutionCapacity(tx))).rejects.toThrow('capacity is currently in use')
    await state.client.query("update validation_jobs set status = 'complete' where id = $1", [job.id])
    const planningId = randomUUID()
    await state.client.query("insert into planning_module_requests values ($1, 'pending', now() + interval '5 minutes')", [planningId])
    await expect(db.transaction(tx => assertExecutionCapacity(tx))).rejects.toThrow('capacity is currently in use')
    await db.transaction(tx => assertExecutionCapacity(tx, { excludePlanningRequestId: planningId }))
    await state.client.exec("update planning_module_requests set lease_expires_at = now() - interval '1 second'")
    await db.transaction(tx => assertExecutionCapacity(tx))
  })
  it('reserves and releases feedback-analysis capacity visible to other admissions', async () => {
    const userId = randomUUID()
    let leaseId = ''
    await db.transaction(async tx => { leaseId = await reserveExecutionLease(tx, userId, 'customer-feedback-analysis', new Date(Date.now() + 60_000)) })
    await expect(db.transaction(tx => assertExecutionCapacity(tx))).rejects.toThrow('capacity is currently in use')
    await releaseExecutionLease(leaseId, userId)
    await expect(db.transaction(tx => assertExecutionCapacity(tx))).resolves.toBeUndefined()
  })
})
