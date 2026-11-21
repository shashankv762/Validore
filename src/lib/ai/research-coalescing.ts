type Pending<T> = { controller: AbortController; promise: Promise<T>; waiters: number; settled: boolean }

/** The shared transport survives cancellation of one waiter, and stops when
 * every caller leaves. A joining caller always observes its own cancellation. */
export function createResearchCoalescer<T>() {
  const pending = new Map<string, Pending<T>>()
  return (key: string, signal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    signal?.throwIfAborted()
    let entry = pending.get(key)
    if (!entry) {
      const controller = new AbortController()
      entry = { controller, promise: run(controller.signal), waiters: 0, settled: false }
      pending.set(key, entry)
      const current = entry
      const done = () => { current.settled = true; if (pending.get(key) === current) pending.delete(key) }
      current.promise.then(done, done)
    }
    const current = entry
    current.waiters++
    return new Promise<T>((resolve, reject) => {
      let finished = false
      const finish = (error: unknown, result?: T) => {
        if (finished) return
        finished = true
        signal?.removeEventListener('abort', abort)
        current.waiters--
        if (!current.waiters && !current.settled) { current.controller.abort(); if (pending.get(key) === current) pending.delete(key) }
        if (error !== undefined) reject(error); else resolve(result!)
      }
      const abort = () => finish(signal?.reason ?? new Error('Research cancelled'))
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) { abort(); return }
      current.promise.then(value => finish(undefined, value), error => finish(error))
    })
  }
}
