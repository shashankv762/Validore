'use client'

export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined' || typeof crypto === 'undefined') return 'server-side'
  const raw = [
    navigator.userAgent,
    screen.width,
    screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.hardwareConcurrency || 0,
    navigator.maxTouchPoints || 0,
  ].join('|')
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(raw)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // Fallback: use a simple hash
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash).toString(16)
  }
}

export async function registerDevice(): Promise<void> {
  if (typeof window === 'undefined') return
  const SESSION_KEY = 'validore_device_registered'
  if (sessionStorage.getItem(SESSION_KEY)) return
  try {
    const fingerprintHash = await getDeviceFingerprint()
    const res = await fetch('/api/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprintHash, userAgent: navigator.userAgent }),
    })
    if (res.ok) {
      sessionStorage.setItem(SESSION_KEY, '1')
    }
  } catch (err) {
    console.warn('[DEVICE-FP] Failed to register device:', err)
  }
}
