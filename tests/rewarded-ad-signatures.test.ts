import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyApplixirCallback } from '@/lib/ads/applixir'
import { rewardedAdConfig, type RewardedAdConfig } from '@/lib/ads/config'

const config: RewardedAdConfig = { provider: 'applixir', apiKey: 'publisher-public-key', gameId: '1234', secret: 'a-private-webhook-secret-at-least-32-characters', dailyLimit: 5, globalDailyLimit: 50 }
const sessionId = '11111111-1111-4111-8111-111111111111'
const signed = (id = sessionId) => {
  const tid = 'provider-transaction-123'
  return new URLSearchParams({ gameApiKey: config.apiKey, gameId: config.gameId, userId: id, tid,
    signature: createHash('md5').update(config.apiKey + config.gameId + id + tid + config.secret).digest('hex') })
}
afterEach(() => vi.unstubAllEnvs())

describe('AppLixir signed web rewards', () => {
  it('binds the completion to the signed session ID, never unsigned custom data', () => {
    const query = signed()
    query.set('customData', '{"userId":"someone-else","credits":1000000}')
    query.set('rewardAmount', '1000000')
    expect(verifyApplixirCallback(query, config)).toEqual({ provider: 'applixir', sessionId, transactionId: 'provider-transaction-123' })
  })
  it.each(['gameApiKey', 'gameId', 'userId', 'tid', 'signature'])('rejects tampering, missing, and duplicate %s fields', field => {
    const altered = signed(); altered.set(field, field === 'signature' ? '0'.repeat(32) : 'changed')
    expect(verifyApplixirCallback(altered, config)).toBeNull()
    const missing = signed(); missing.delete(field)
    expect(verifyApplixirCallback(missing, config)).toBeNull()
    const duplicate = signed(); duplicate.append(field, duplicate.get(field)!)
    expect(verifyApplixirCallback(duplicate, config)).toBeNull()
  })
  it('requires a transaction ID and signature even if a plaintext secret is supplied', () => {
    const query = signed(); query.delete('signature'); query.set('secretKey', config.secret)
    expect(verifyApplixirCallback(query, config)).toBeNull()
  })
  it('fails closed until explicitly enabled with all provider settings and bounded budgets', () => {
    vi.stubEnv('REWARDED_ADS_ENABLED', 'false')
    expect(rewardedAdConfig()).toBeNull()
    vi.stubEnv('REWARDED_ADS_ENABLED', 'true'); vi.stubEnv('APPLIXIR_API_KEY', config.apiKey)
    vi.stubEnv('APPLIXIR_GAME_ID', config.gameId); vi.stubEnv('APPLIXIR_S2S_SECRET', 'too-short')
    expect(rewardedAdConfig()).toBeNull()
    vi.stubEnv('APPLIXIR_S2S_SECRET', config.secret)
    expect(rewardedAdConfig()).toMatchObject({ dailyLimit: 5, globalDailyLimit: 50 })
    vi.stubEnv('REWARDED_ADS_DAILY_LIMIT', 'NaN'); expect(rewardedAdConfig()).toBeNull()
    vi.stubEnv('REWARDED_ADS_DAILY_LIMIT', '5'); vi.stubEnv('REWARDED_ADS_GLOBAL_DAILY_LIMIT', '1000000')
    expect(rewardedAdConfig()).toBeNull()
  })
})
