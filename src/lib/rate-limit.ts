import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export async function rateLimitCheck(userId: string) {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[RATE-LIMIT] CRITICAL: Upstash Redis not configured in production. Blocking request.')
        return { success: false }
      }
      return { success: true } // Dev/staging: allow through
    }
    const redis = Redis.fromEnv()
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, '60 s'),
    })
    return await ratelimit.limit(userId)
  } catch (error) {
    return { success: true }
  }
}

/**
 * Atomically increments concurrency counter for a user.
 * Returns { allowed: true } if under limit, { allowed: false } if at or above limit.
 * Uses a 600s TTL to auto-expire stale counters.
 */
export async function checkAndIncrementConcurrency(userId: string, maxAllowed: number): Promise<{ allowed: boolean }> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    // Allow through if Redis not configured (dev/staging)
    return { allowed: true }
  }
  try {
    const redis = Redis.fromEnv()
    const key = `validore:concurrency:${userId}`
    const current = await redis.incr(key)
    // Set TTL only on first increment to avoid resetting it on every call
    if (current === 1) {
      await redis.expire(key, 600)
    }
    if (current > maxAllowed) {
      // Over limit — decrement immediately and deny
      await redis.decr(key)
      return { allowed: false }
    }
    return { allowed: true }
  } catch {
    // On Redis error, allow through to avoid blocking users
    return { allowed: true }
  }
}

/**
 * Decrements concurrency counter for a user (call in finally block after AI generation).
 */
export async function decrementConcurrency(userId: string): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return
  }
  try {
    const redis = Redis.fromEnv()
    const key = `validore:concurrency:${userId}`
    const current = await redis.decr(key)
    // Prevent negative values
    if (current < 0) {
      await redis.set(key, 0, { ex: 600 })
    }
  } catch {
    // Ignore Redis errors in finally block
  }
}
