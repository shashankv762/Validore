import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'
import ipaddr from 'ipaddr.js'

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
