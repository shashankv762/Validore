import { describe, expect, it } from 'vitest'
import { databaseErrorCode, isDatabaseSetupError } from '@/lib/database-errors'

describe('safe PostgreSQL failure classification', () => {
  it.each(['42703', '42P01'])('recognizes missing schema through Drizzle wrappers: %s', code => {
    const error = new Error('query and private parameters', { cause: Object.assign(new Error('private cause'), { code }) })
    expect(databaseErrorCode(error)).toBe(code)
    expect(isDatabaseSetupError(error)).toBe(true)
  })
  it('does not misclassify connectivity and unique-constraint failures as setup problems', () => {
    expect(isDatabaseSetupError({ code: '23505' })).toBe(false)
    expect(isDatabaseSetupError({ code: 'ECONNREFUSED' })).toBe(false)
    expect(databaseErrorCode({ code: 'ECONNREFUSED' })).toBeUndefined()
    expect(databaseErrorCode(null)).toBeUndefined()
  })
  it('terminates on cyclic causes without logging or exposing the error', () => {
    const error = { cause: null as unknown }
    error.cause = error
    expect(databaseErrorCode(error)).toBeUndefined()
  })
})
