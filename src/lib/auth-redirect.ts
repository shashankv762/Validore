export function safeNextPath(value: unknown, origin: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  try {
    const target = new URL(value, origin)
    if (/^\/auth\/(signin|signup)\/?$/.test(target.pathname)) return '/dashboard'
    return target.origin === origin ? target.pathname + target.search + target.hash : '/dashboard'
  } catch { return '/dashboard' }
}
