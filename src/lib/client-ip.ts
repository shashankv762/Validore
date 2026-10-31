import { isIP } from 'node:net'

/** Read from the trusted end of the proxy chain, never the client-supplied prefix. */
export function clientIp(request: { headers: Headers }): string | null {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS || 1)
  if (!Number.isSafeInteger(hops) || hops < 1 || hops > 10) return null
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map(value => value.trim())
  const candidate = forwarded?.length
    ? forwarded[forwarded.length - hops]
    : request.headers.get('x-real-ip')?.trim()
  return candidate && isIP(candidate) ? candidate : null
}
