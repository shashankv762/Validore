export const AD_REWARD_CREDITS = 10
export const AD_SESSION_MS = 30 * 60_000
export const AD_COOLDOWN_MS = 60_000

function limit(value: string | undefined, fallback: number, maximum: number) {
  if (!value) return fallback
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 1 && number <= maximum ? number : null
}

export function rewardedAdConfig() {
  if (process.env.REWARDED_ADS_ENABLED !== 'true') return null
  const apiKey = process.env.APPLIXIR_API_KEY?.trim()
  const gameId = process.env.APPLIXIR_GAME_ID?.trim()
  const secret = process.env.APPLIXIR_S2S_SECRET
  const dailyLimit = limit(process.env.REWARDED_ADS_DAILY_LIMIT, 5, 20)
  const globalDailyLimit = limit(process.env.REWARDED_ADS_GLOBAL_DAILY_LIMIT, 50, 1000)
  if (!apiKey || !/^[a-zA-Z0-9_-]{8,200}$/.test(apiKey) || !gameId || !/^\d{1,20}$/.test(gameId) ||
      !secret || secret.length < 32 || secret.length > 256 || !dailyLimit || !globalDailyLimit) return null
  return { provider: 'applixir' as const, apiKey, gameId, secret, dailyLimit, globalDailyLimit }
}

export type RewardedAdConfig = NonNullable<ReturnType<typeof rewardedAdConfig>>
export type RewardSession = { id: string; status: 'pending' | 'cancelled' | 'rewarded' | 'expired'; expiresAt: string }
export type RewardStatus = {
  enabled: boolean
  creditsPerAd: number
  dailyLimit: number
  remainingToday: number
  nextAvailableAt: string | null
  session?: RewardSession | null
}
