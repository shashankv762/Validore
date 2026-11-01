'use client'

// A random, expiring identifier is enough for recent browser activity. It does
// not combine hardware, screen, language, or timezone attributes into a fingerprint.
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined' || !globalThis.crypto?.randomUUID) return ''
  const key = 'validore:device:v1'
  const now = Date.now()
  try {
    const existing = JSON.parse(localStorage.getItem(key) || 'null')
    if (typeof existing?.id === 'string' && /^[0-9a-f-]{36}$/i.test(existing.id) && typeof existing.createdAt === 'number' && existing.createdAt <= now && now - existing.createdAt < 30 * 86_400_000) return existing.id
  } catch { /* Security registration is optional when browser storage is blocked. */ }
  const id = crypto.randomUUID()
  try { localStorage.setItem(key, JSON.stringify({ id, createdAt: now })) } catch {}
  return id
}

export async function registerDevice(accountId: string): Promise<void> {
  if (typeof window === 'undefined' || !accountId) return
  const sessionKey = 'validore_device_registered:' + accountId
  try { if (sessionStorage.getItem(sessionKey)) return } catch {}
  try {
    const fingerprintHash = await getDeviceFingerprint()
    if (!fingerprintHash) return
    const response = await fetch('/api/auth/device', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprintHash }), signal: AbortSignal.timeout(10_000),
    })
    if (response.ok) { try { sessionStorage.setItem(sessionKey, '1') } catch {} }
  } catch { /* Do not block the workspace because activity registration failed. */ }
}
