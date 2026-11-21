import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseEcbReferenceRates, refreshExchangeRates } from '../scripts/refresh-exchange-rates.mjs'
import { EXCHANGE_RATE_SOURCE, REFERENCE_CURRENCIES } from '@/lib/pricing-exchange.mjs'
import snapshot from '@/data/pricing/exchange-rates.json'

const now = new Date('2026-11-17T15:00:00Z')
const xml = (asOf = '2026-11-17', rates: Record<string, number> = snapshot.rates) => `<?xml version="1.0"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<gesmes:subject>Reference rates</gesmes:subject><gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
<Cube><Cube time="${asOf}">${Object.entries(rates).filter(([currency]) => currency !== 'EUR').map(([currency, rate]) => `<Cube currency="${currency}" rate="${rate}"/>`).join('')}</Cube></Cube></gesmes:Envelope>`
const response = (body = xml()) => new Response(body, { headers: { 'Content-Type': 'application/xml' } })
const directories: string[] = []
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'validore-fx-'))
  directories.push(directory)
  const target = join(directory, 'exchange-rates.json')
  const original = JSON.stringify({ ...snapshot, asOf: '2026-11-13' }, null, 2) + '\n'
  await writeFile(target, original)
  return { target, original }
}
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

describe('ECB reference snapshot refresh', () => {
  it('parses the publisher date and full supported coverage without changing canonical amounts', () => {
    const next = parseEcbReferenceRates(xml(), now)
    expect(next).toMatchObject({ asOf: '2026-11-17', base: 'EUR', sourceUrl: EXCHANGE_RATE_SOURCE })
    expect(Object.keys(next.rates).sort()).toEqual([...REFERENCE_CURRENCIES].sort())
    expect(next.rates).toEqual(snapshot.rates)
  })
  it('rejects wrong publishers, future/invalid dates, duplicate/missing/nonfinite/unknown rates, and XML entities', () => {
    const { INR: _inr, ...partial } = snapshot.rates
    void _inr
    for (const body of [xml().replace('European Central Bank', 'Other Bank'), xml('2026-11-18'), xml('2026-02-30'), xml('2026-11-16', partial),
      xml().replace('currency="USD"', 'currency="XYZ"'), xml().replace(/rate="[^"]+"/, 'rate="Infinity"'),
      xml().replace('</Cube></Cube>', '<Cube currency="USD" rate="1"/></Cube></Cube>'), '<!DOCTYPE Cube><!ENTITY test "test">' + xml()]) {
      expect(() => parseEcbReferenceRates(body, now)).toThrow()
    }
  })
  it('atomically publishes validated rates, and leaves same-day/weekend observations untouched', async () => {
    const { target } = await fixture()
    const fetcher = vi.fn(async () => response())
    expect(await refreshExchangeRates({ target, fetcher, now })).toEqual({ changed: true, asOf: '2026-11-17', currencies: 30 })
    expect(fetcher).toHaveBeenCalledWith(EXCHANGE_RATE_SOURCE, expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }))
    const saved = await readFile(target, 'utf8')
    expect(JSON.parse(saved).asOf).toBe('2026-11-17')
    expect(await refreshExchangeRates({ target, fetcher, now })).toMatchObject({ changed: false, asOf: '2026-11-17' })
    expect(await readFile(target, 'utf8')).toBe(saved)
  })
  it('retains the exact last-good bytes and original date after failed, partial, oversized, and backward refreshes', async () => {
    const { target, original } = await fixture()
    for (const fetcher of [async () => { throw new Error('Offline') }, async () => new Response('', { status: 503 }),
      async () => response('<html>Unavailable</html>'), async () => response(xml('2026-11-12')),
      async () => response(' '.repeat(100_001)), async () => new Response(xml(), { headers: { 'Content-Type': 'text/html' } })]) {
      await expect(refreshExchangeRates({ target, fetcher, now })).rejects.toThrow()
      expect(await readFile(target, 'utf8')).toBe(original)
    }
  })
  it('fences simultaneous refreshes without removing the other run lock or overwriting newer rates', async () => {
    const { target } = await fixture()
    let release!: (value: Response) => void
    const started = Promise.withResolvers<void>()
    const first = refreshExchangeRates({ target, now, fetcher: async () => { started.resolve(); return new Promise<Response>(resolve => { release = resolve }) } })
    await started.promise
    await expect(refreshExchangeRates({ target, now, fetcher: async () => response(xml('2026-11-15')) })).rejects.toMatchObject({ code: 'EEXIST' })
    release(response())
    await expect(first).resolves.toMatchObject({ changed: true, asOf: '2026-11-17' })
    expect(JSON.parse(await readFile(target, 'utf8')).asOf).toBe('2026-11-17')
  })
})
