type PendingIdentity = { key: string; payloadHash: string }
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : value

/** Only a UUID and payload digest are kept in the tab. Founder answers are
 * never written to browser storage. An uncertain run survives a reload. */
export class PlanningRunIdentity {
  private current: PendingIdentity | null = null
  constructor(private readonly scope: string, private readonly storage?: Storage) {}
  async keyFor(payload: unknown): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(payload))))
    const payloadHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    if (!this.current) {
      try {
        const saved = JSON.parse(this.storage?.getItem(this.scope) ?? 'null')
        if (saved && typeof saved.payloadHash === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.key)) this.current = saved
      } catch { /* Browser storage may be unavailable; memory retries still work. */ }
    }
    if (this.current?.payloadHash !== payloadHash) this.current = { key: crypto.randomUUID(), payloadHash }
    try { this.storage?.setItem(this.scope, JSON.stringify(this.current)) } catch { /* Optional tab persistence. */ }
    return this.current.key
  }
  confirmed(key: string) {
    if (this.current?.key !== key) return
    this.current = null
    try { this.storage?.removeItem(this.scope) } catch { /* Optional tab persistence. */ }
  }
}
