#!/usr/bin/env node
// Fixed public publisher only. No environment files, credentials or database.
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { DOMParser } from 'linkedom'
import { EXCHANGE_RATE_SOURCE, REFERENCE_CURRENCIES, validReferenceSnapshot } from '../src/lib/pricing-exchange.mjs'

const outputFile = fileURLToPath(new URL('../src/data/pricing/exchange-rates.json', import.meta.url))
const maximumBytes = 100_000

/** Parse only the ECB daily envelope. Partial feeds never replace full coverage. */
export function parseEcbReferenceRates(xml, now = new Date()) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > maximumBytes || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid ECB XML document')
  const document = new DOMParser().parseFromString(xml, 'text/xml')
  const root = document.documentElement
  if (root?.tagName !== 'gesmes:Envelope' || root.getAttribute('xmlns:gesmes') !== 'http://www.gesmes.org/xml/2002-08-01' ||
      root.getAttribute('xmlns') !== 'http://www.ecb.int/vocabulary/2002-08-01/eurofxref') throw new Error('Unrecognized ECB envelope')
  const elements = Array.from(root.querySelectorAll('*'))
  const sender = elements.find(element => element.tagName === 'gesmes:Sender')
  if (sender?.textContent.trim() !== 'European Central Bank') throw new Error('Unrecognized ECB publisher')
  const dates = elements.filter(element => element.localName === 'Cube' && element.hasAttribute('time'))
  if (dates.length !== 1) throw new Error('Expected one ECB observation date')
  const rates = { EUR: 1 }
  for (const element of Array.from(dates[0].children)) {
    const currency = element.getAttribute('currency')
    const rawRate = element.getAttribute('rate')
    if (element.localName !== 'Cube' || !REFERENCE_CURRENCIES.includes(currency) || Object.hasOwn(rates, currency) ||
        !rawRate || !/^(?:\d+)(?:\.\d+)?$/.test(rawRate) || element.children.length) throw new Error('Invalid or duplicate ECB currency rate')
    rates[currency] = Number(rawRate)
  }
  const snapshot = { asOf: dates[0].getAttribute('time'), source: 'European Central Bank', sourceUrl: EXCHANGE_RATE_SOURCE, base: 'EUR', rates }
  if (!validReferenceSnapshot(snapshot, now) || REFERENCE_CURRENCIES.some(currency => !Object.hasOwn(rates, currency))) {
    throw new Error('Invalid or incomplete ECB currency coverage')
  }
  return snapshot
}

async function fetchRates(fetcher, now) {
  const response = await fetcher(EXCHANGE_RATE_SOURCE, { redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/xml,text/xml', 'User-Agent': 'Validore-Reference-Rates/1.0' } })
  if (!response.ok) { await response.body?.cancel(); throw new Error(`ECB HTTP ${response.status}`) }
  if (!/^(?:application|text)\/(?:[\w.+-]*\+)?xml\b/i.test(response.headers.get('content-type') ?? '') ||
      Number(response.headers.get('content-length')) > maximumBytes) {
    await response.body?.cancel(); throw new Error('Invalid ECB response type or size')
  }
  if (!response.body) throw new Error('Empty ECB response')
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maximumBytes) throw new Error('ECB response exceeds size limit')
      chunks.push(value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  return parseEcbReferenceRates(Buffer.concat(chunks).toString('utf8'), now)
}

/** Atomic replacement; any fetch/parse/write failure retains the last good file.
 * An exclusive local lock prevents an older concurrent run replacing newer data. */
export async function refreshExchangeRates({ target = outputFile, fetcher = fetch, now = new Date() } = {}) {
  const lock = target + '.refresh-lock'
  await mkdir(dirname(target), { recursive: true })
  await mkdir(lock) // Fail visibly if another run owns the lock; never remove its lock.
  const temporary = target + '.' + randomUUID() + '.tmp'
  try {
    let previous = null
    try { previous = JSON.parse(await readFile(target, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (previous && !validReferenceSnapshot(previous, now)) throw new Error('Existing FX snapshot is invalid; review before replacing it')
    const next = await fetchRates(fetcher, now)
    if (previous && next.asOf < previous.asOf) throw new Error('ECB response predates the retained snapshot')
    if (previous && next.asOf === previous.asOf && REFERENCE_CURRENCIES.every(currency => next.rates[currency] === previous.rates[currency])) {
      return { changed: false, asOf: previous.asOf, currencies: Object.keys(previous.rates).length }
    }
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' })
    await rename(temporary, target)
    return { changed: true, asOf: next.asOf, currencies: Object.keys(next.rates).length }
  } finally {
    await rm(temporary, { force: true })
    await rmdir(lock)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await refreshExchangeRates())) }
  catch (error) { console.error(`FX refresh failed; retained the previous snapshot: ${error.message}`); process.exitCode = 1 }
}
