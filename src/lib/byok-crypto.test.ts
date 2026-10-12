import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { encryptApiKey, decryptApiKey } from './byok-crypto'

describe('Custom AI credential encryption', () => {
  beforeEach(() => vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64)))
  afterEach(() => vi.unstubAllEnvs())
  it('round trips with randomized authenticated ciphertext', () => {
    const a = encryptApiKey('sk-or-secret')
    const b = encryptApiKey('sk-or-secret')
    expect(a).not.toBe(b)
    expect(a).not.toContain('sk-or-secret')
    expect(decryptApiKey(a)).toBe('sk-or-secret')
  })
  it('rejects modified ciphertext and tags', () => {
    const parts = encryptApiKey('sk-or-secret').split(':')
    parts[2] = '0'.repeat(32)
    expect(() => decryptApiKey(parts.join(':'))).toThrow()
  })
  it('never stores a key without a valid encryption key', () => {
    vi.stubEnv('ENCRYPTION_KEY', '')
    expect(() => encryptApiKey('secret')).toThrow()
    vi.stubEnv('ENCRYPTION_KEY', 'not-hex')
    expect(() => encryptApiKey('secret')).toThrow()
  })
  it('rejects old plaintext records', () => {
    expect(() => decryptApiKey('sk-or-plaintext')).toThrow('not encrypted')
  })
})
