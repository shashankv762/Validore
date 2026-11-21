export function specialistConcurrency(value: string | undefined, freeOnly = true): number {
  const fallback = freeOnly ? 1 : 3
  if (!value?.trim()) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(5, parsed) : fallback
}

/** Local callers can queue actual work. This semaphore cannot coordinate
 * separate durable-step invocations; those must use runSpecialistPhase. */
export function createSpecialistScheduler(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) throw new RangeError('Specialist concurrency must be an integer between one and five')
  let active = 0
  const waiting: (() => void)[] = []
  return async function run<T>(work: () => Promise<T>): Promise<T> {
    await new Promise<void>(resolve => {
      const start = () => { active++; resolve() }
      if (active < concurrency) start(); else waiting.push(start)
    })
    try { return await work() }
    finally { active--; waiting.shift()?.() }
  }
}

/** Register only one bounded batch of durable steps at a time. A semaphore
 * inside step.run would reset in each server invocation and allow the entire
 * phase to hit a gateway concurrently. Explicit batches survive that boundary.
 * Provider deadlines still begin inside each step's actual work callback. */
export async function runSpecialistPhase<T extends readonly (() => Promise<unknown>)[]>(
  concurrency: number,
  tasks: T,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) throw new RangeError('Specialist concurrency must be an integer between one and five')
  const results: unknown[] = []
  for (let start = 0; start < tasks.length; start += concurrency) {
    results.push(...await Promise.all(tasks.slice(start, start + concurrency).map(task => task())))
  }
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> }
}
