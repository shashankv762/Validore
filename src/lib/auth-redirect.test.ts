import { describe, it, expect } from 'vitest'
import { safeNextPath } from './auth-redirect'
describe('Authentication return paths', () => {
  it('preserves local paths and queries', () => { expect(safeNextPath('/dashboard/reports?page=2', 'https://validore.example')).toBe('/dashboard/reports?page=2') })
  it('rejects external, protocol-relative, backslash, and malformed targets', () => {
    for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', 'http://[', null]) expect(safeNextPath(path, 'https://validore.example')).toBe('/dashboard')
  })
})
