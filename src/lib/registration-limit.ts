import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { clientIp } from './client-ip'
import { signupWeeklyIpLimit } from './signup-policy'

/** Shared admission limit for new app profiles, regardless of the Auth provider. */
export async function registrationLimit(request: { headers: Headers }): Promise<{ allowed: boolean; status: 429 | 503; message: string }> {
  const ip = clientIp(request)
  const configured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  const unavailable = { allowed: false, status: 503 as const, message: 'Registration is temporarily unavailable. Please try again later.' }
  if (!ip || !configured) return process.env.NODE_ENV === 'production' ? unavailable : { ...unavailable, allowed: true }
  try {
    const limiter = new Ratelimit({
      redis: Redis.fromEnv({ retry: { retries: 0 }, signal: () => AbortSignal.timeout(2500) }),
      limiter: Ratelimit.slidingWindow(signupWeeklyIpLimit(), '7 d'),
      prefix: 'validore:registration_ip',
    })
    const { success } = await limiter.limit(ip)
    return { allowed: success, status: 429, message: 'Too many account registrations from this network. Please try again later.' }
  } catch { return unavailable }
}
