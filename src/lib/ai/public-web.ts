import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'
import ipaddr from 'ipaddr.js'
import { currentResearchBudgetId, reserveResearchHttp } from './research-http-budget'
import { createResearchCoalescer } from './research-coalescing'
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
const coalesce = createResearchCoalescer<PublicWebResponse>()

/** Pin each connection, including redirects, to a checked public address.
 * Never send cookies, provider keys or browser state, or execute page scripts.
 */
export async function readPublicWeb(value: string, options: { signal?: AbortSignal; maxBytes?: number } = {}): Promise<PublicWebResponse> {  if (workerScope()) return readPublicWebOnWorker(value, options)
  const budgetId = currentResearchBudgetId()
  if (!budgetId) return readPublicWebTransport(value, options)
  const url = publicWebUrl(value).href
  return coalesce(budgetId + ':' + url + ':' + String(options.maxBytes ?? MAX_BYTES), options.signal,
    signal => readPublicWebTransport(url, { ...options, signal }))
}


export async function readPublicWebOnWorker(value: string, options: { signal?: AbortSignal; maxBytes?: number } = {}): Promise<PublicWebResponse> {
  const maxBytes = Number.isFinite(options.maxBytes) ? Math.max(1, Math.min(MAX_BYTES, Math.floor(options.maxBytes!))) : MAX_BYTES
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000)
  let url = publicWebUrl(value)
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted()
    const admission = await reserveResearchHttp(url.href, maxBytes)
    const hopSignal = admission ? AbortSignal.any([signal, AbortSignal.timeout(admission.timeoutMs)]) : signal
    let consumed = maxBytes
    try {
      const response = await fetch(url.href, { redirect: 'manual', cache: 'no-store', signal: hopSignal,
        headers: { 'User-Agent': 'ValidoreResearch/1.0 (+https://validore.tech)', Accept: 'text/html, application/json, text/plain;q=0.9' } })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location'); await response.body?.cancel()
        if (!location || hop === 3) throw new Error('Too many web redirects')
        url = publicWebUrl(new URL(location, url).href); continue
      }
      const contentType = response.headers.get('content-type') ?? ''
      const contentLength = Number(response.headers.get('content-length'))
      if ((Number.isFinite(contentLength) && contentLength > maxBytes) || !/text\/|json|xml/i.test(contentType)) {
        await response.body?.cancel(); throw new Error('The page is too large or has an unsupported format')
      }
      if (response.status < 200 || response.status >= 300 || !response.body) throw new Error('Public source is unavailable')
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let text = ''; let size = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) { text += decoder.decode(); break }
          size += next.value.byteLength
          if (size > maxBytes) { await reader.cancel(); throw new Error('Research response is too large') }
          text += decoder.decode(next.value, { stream: true })
        }
      } finally { reader.releaseLock() }
      consumed = size
      return { url: url.href, text, contentType, status: response.status }
    } finally { await admission?.finish(consumed) }
  }
  throw new Error('Public source is unavailable')
}

async function readPublicWebTransport(value: string, options: { signal?: AbortSignal; maxBytes?: number }): Promise<PublicWebResponse> {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000)
  const maxBytes = Number.isFinite(options.maxBytes) ? Math.max(1, Math.min(MAX_BYTES, Math.floor(options.maxBytes!))) : MAX_BYTES
  let url = publicWebUrl(value)
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted()
    const admission = await reserveResearchHttp(url.href, maxBytes)
    const hopSignal = admission ? AbortSignal.any([signal, AbortSignal.timeout(admission.timeoutMs)]) : signal
    let consumed = maxBytes
    try {
      const host = url.hostname.replace(/^\[|\]$/g, '')
      const records = await new Promise<LookupAddress[]>((resolve, reject) => {
        const aborted = () => reject(new Error('Research request timed out'))
        hopSignal.throwIfAborted()
        hopSignal.addEventListener('abort', aborted, { once: true })
        lookup(host, { all: true, verbatim: true }).then(resolve, reject).finally(() => hopSignal.removeEventListener('abort', aborted))
      })
      if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error('Private network destinations are blocked')
      const pinned = records.find(record => record.family === 4) ?? records[0]
      const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, [{ address: pinned.address, family: pinned.family }])
        else callback(null, pinned.address, pinned.family)
      }
      const response = await new Promise<{ status: number; location?: string; contentType: string; text: string }>((resolve, reject) => {
        const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
          lookup: pinnedLookup, signal: hopSignal, agent: false,
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
      consumed = Buffer.byteLength(response.text)
      if (response.status >= 300 && response.status < 400) {
        if (!response.location || hop === 3) throw new Error('Too many web redirects')
        url = publicWebUrl(new URL(response.location, url).href)
        continue
      }
      if (response.status < 200 || response.status >= 300) throw new Error('Public source is unavailable')
      return { ...response, url: url.href }
    } finally { await admission?.finish(consumed) }
  }
  throw new Error('Public source is unavailable')
}
