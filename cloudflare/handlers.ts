import type { WorkerEnvironment } from '../src/lib/worker-scope'

export function prepareWorkerRequest(request: Request): Request | Response {
  const url = new URL(request.url)
  if (url.hostname === 'www.validore.tech') {
    url.hostname = 'validore.tech'
    return Response.redirect(url, 308)
  }
  // Cloudflare sets CF-Connecting-IP at ingress. Never let an incoming XFF
  // prefix determine signup quotas. Missing/invalid IPs still fail closed.
  const headers = new Headers(request.headers)
  headers.delete('x-forwarded-for')
  headers.delete('x-real-ip')
  const ip = headers.get('cf-connecting-ip')
  if (ip) headers.set('x-forwarded-for', ip)
  return new Request(request, { headers })
}

export async function runCreditMaintenance(
  env: WorkerEnvironment,
  _ctx: { waitUntil(promise: Promise<unknown>): void },
  fetchApp: (request: Request) => Promise<Response>,
) {
  if (!env.CRON_SECRET) throw new Error('CRON_SECRET is required for credit maintenance')
  // Call the application directly: independent of DNS, with no public secret URL.
  const request = new Request('https://validore.tech/api/cron/reset-credits', {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  })
  const response = await fetchApp(request)
  const body = await response.text()
  if (!response.ok) throw new Error(`Credit maintenance failed (${response.status})`)
  const result = JSON.parse(body) as { success?: boolean }
  if (result.success !== true) throw new Error('Credit maintenance did not report success')
}
