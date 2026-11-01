import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'
import ipaddr from 'ipaddr.js'
import { workerScope } from '../worker-scope'

const MAX_BYTES = 1_000_000

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast' } catch { return false }
}

export function publicWebUrl(value: string): URL {
  const url = new URL(value)
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      (url.port && !['80', '443'].includes(url.port)) || host === 'localhost' ||
      (!host.includes('.') && !host.includes(':')) || /\.(localhost|local|internal|home|test|invalid)$/.test(host) ||
      (ipaddr.isValid(host) && !isPublicAddress(host))) {
    throw new Error('Only public web pages are available to research tools')
  }
  url.hash = ''
  return url
}

export type PublicWebResponse = { url: string; text: string; contentType: string; status: number }

/** Pin each connection, including redirects, to a checked public address.
 * Never send cookies, provider keys or browser state, or execute page scripts.
 */
export async function readPublicWeb(value: string, options: { signal?: AbortSignal; maxBytes?: number } = {}): Promise<PublicWebResponse> {
  if (workerScope()) return readPublicWebOnWorker(value, options)
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000)
  const maxBytes = Math.min(MAX_BYTES, options.maxBytes ?? MAX_BYTES)
  let url = publicWebUrl(value)
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted()
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const records = await new Promise<LookupAddress[]>((resolve, reject) => {
      const aborted = () => reject(new Error('Research request timed out'))
      signal.addEventListener('abort', aborted, { once: true })
      lookup(host, { all: true, verbatim: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
    })
    if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error('Private network destinations are blocked')
    const pinned = records[0]
    const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
      if (lookupOptions.all) callback(null, [{ address: pinned.address, family: pinned.family }])
      else callback(null, pinned.address, pinned.family)
    }
    const response = await new Promise<{ status: number; location?: string; contentType: string; text: string }>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        lookup: pinnedLookup, signal, agent: false,
        headers: { 'User-Agent': 'ValidoreResearch/1.0 (+https://validore.tech)', Accept: 'text/html, application/json, text/plain;q=0.9', 'Accept-Encoding': 'identity' },
      }, incoming => {
        const status = incoming.statusCode ?? 502
        const contentType = String(incoming.headers['content-type'] ?? '')
        if (status >= 300 && status < 400) {
          incoming.destroy()
          resolve({ status, location: incoming.headers.location, contentType, text: '' })
          return
        }
        if (Number(incoming.headers['content-length']) > maxBytes || !/text\/|json|xml/i.test(contentType)) {
          incoming.destroy()
          reject(new Error('The page is too large or has an unsupported format'))
          return
        }
        let size = 0
        const chunks: Buffer[] = []
        incoming.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) { incoming.destroy(); reject(new Error('Research response is too large')) }
          else chunks.push(chunk)
        })
        incoming.on('error', reject)
        incoming.on('end', () => resolve({ status, contentType, text: Buffer.concat(chunks).toString('utf8') }))
      })
      request.on('error', reject)
      request.end()
    })
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || hop === 3) throw new Error('Too many web redirects')
      url = publicWebUrl(new URL(response.location, url).href)
      continue
    }
    if (response.status < 200 || response.status >= 300) throw new Error('Public source is unavailable')
    return { ...response, url: url.href }
  }
  throw new Error('Public source is unavailable')
}

/** Workers enforces public DNS destinations through global_fetch_strictly_public.
 * Its node:http shim cannot pin DNS and node:dns.lookup is not implemented.
 * Validate every redirect, send only public headers, and bound decoded bytes.
 */
export async function readPublicWebOnWorker(value: string, options: { signal?: AbortSignal; maxBytes?: number } = {}): Promise<PublicWebResponse> {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000)
  const maxBytes = Math.min(MAX_BYTES, options.maxBytes ?? MAX_BYTES)
  let url = publicWebUrl(value)
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted()
    const response = await fetch(url, {
      redirect: 'manual', signal, cache: 'no-store',
      headers: { 'User-Agent': 'ValidoreResearch/1.0 (+https://validore.tech)', Accept: 'text/html, application/json, text/plain;q=0.9' },
    })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || hop === 3) throw new Error('Too many web redirects')
      url = publicWebUrl(new URL(location, url).href)
      continue
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || Number(response.headers.get('content-length')) > maxBytes || !/text\/|json|xml/i.test(contentType)) {
      await response.body?.cancel()
      throw new Error('Public source is unavailable, too large or has an unsupported format')
    }
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) try {
      while (true) {
        signal.throwIfAborted()
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) throw new Error('Research response is too large')
        chunks.push(value)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    return { url: url.href, status: response.status, contentType, text: Buffer.concat(chunks).toString('utf8') }
  }
  throw new Error('Public source is unavailable')
}
