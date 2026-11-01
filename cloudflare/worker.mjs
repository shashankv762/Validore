import handler from '../.open-next/worker.js'
import { withWorkerScope } from '../src/lib/worker-scope.ts'
import { runCreditMaintenance, prepareWorkerRequest } from './handlers.ts'

const worker = {
  fetch(request, env, ctx) {
    const prepared = prepareWorkerRequest(request)
    if (prepared instanceof Response) return prepared
    return withWorkerScope(env, ctx, () => handler.fetch(prepared, env, ctx))
  },
  scheduled(_event, env, ctx) {
    return runCreditMaintenance(env, ctx, request =>
      withWorkerScope(env, ctx, () => handler.fetch(request, env, ctx)))
  },
}
export default worker
