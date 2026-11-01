import { AsyncLocalStorage } from 'node:async_hooks'

export type WorkerEnvironment = {
  ASSETS: { fetch(request: Request): Promise<Response> }
  CRON_SECRET?: string
  [key: string]: unknown
}
type Scope = {
  env: WorkerEnvironment
  resources: Map<string, unknown>
  cleanup: Array<() => Promise<unknown>>
}

// OpenNext and the custom entry point are bundled separately. Share the same
// async context so concurrent requests never share database sockets or bindings.
const key = Symbol.for('validore.worker-scope')
const shared = globalThis as typeof globalThis & { [key]?: AsyncLocalStorage<Scope> }
const storage = shared[key] ??= new AsyncLocalStorage<Scope>()
export const workerScope = () => storage.getStore()

export async function withWorkerScope(
  env: WorkerEnvironment,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  handle: () => Promise<Response>,
): Promise<Response> {
  const scope: Scope = { env, resources: new Map(), cleanup: [] }
  let closed = false
  const finish = () => {
    if (closed) return
    closed = true
    ctx.waitUntil(Promise.allSettled(scope.cleanup.map(close => close())))
  }
  return storage.run(scope, async () => {
    try {
      const response = await handle()
      if (!response.body) { finish(); return response }
      const reader = response.body.getReader()
      // Inngest/SSR can keep working after fetch returns its streaming response.
      // Keep sockets alive until consumption ends, including cancellation/errors.
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const result = await storage.run(scope, () => reader.read())
            if (result.done) { controller.close(); finish() }
            else controller.enqueue(result.value)
          } catch (error) { controller.error(error); finish() }
        },
        async cancel(reason) { try { await reader.cancel(reason) } finally { finish() } },
      })
      return new Response(body, response)
    } catch (error) { finish(); throw error }
  })
}
