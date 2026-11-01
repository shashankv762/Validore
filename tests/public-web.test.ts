import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { isPublicAddress, publicWebUrl, readPublicWeb } from '@/lib/ai/public-web'

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:https', () => ({ request: mocks.request }))
vi.mock('node:http', () => ({ request: mocks.request }))
beforeEach(() => vi.resetAllMocks())

describe('public research destination checks', () => {
  it.each(['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1'])('blocks non-public address %s', address => {
    expect(isPublicAddress(address)).toBe(false)
  })
  it.each(['file:///etc/passwd', 'http://localhost/admin', 'https://user:pass@example.org/', 'http://2130706433/', 'http://127.1/', 'https://example.org:8443/', 'http://[::ffff:127.0.0.1]/'])('blocks unsafe URL %s', url => {
    expect(() => publicWebUrl(url)).toThrow()
  })
  it('blocks a hostname when any resolved address is private', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }])
    await expect(readPublicWeb('https://example.org')).rejects.toThrow('Private network')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('pins the connection to checked DNS and strips credentials from requests', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    mocks.request.mockImplementation((_url, _options, callback) => {
      const request = Object.assign(new EventEmitter(), { end: () => {
        const incoming = Object.assign(Readable.from([Buffer.from('public article')]), { statusCode: 200, headers: { 'content-type': 'text/plain' } })
        callback(incoming)
      } })
      return request
    })
    expect(await readPublicWeb('https://example.org/research#section')).toMatchObject({ url: 'https://example.org/research', text: 'public article' })
    const options = mocks.request.mock.calls[0][1]
    const callback = vi.fn()
    options.lookup('example.org', { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }])
    expect(options.headers).not.toHaveProperty('Cookie')
    expect(options.headers).not.toHaveProperty('Authorization')
  })
  it('revalidates redirects before making another request', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    mocks.request.mockImplementation((_url, _options, callback) => Object.assign(new EventEmitter(), { end: () => callback(Object.assign(Readable.from([]), { statusCode: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })) }))
    await expect(readPublicWeb('https://example.org/redirect')).rejects.toThrow('Only public')
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
})
