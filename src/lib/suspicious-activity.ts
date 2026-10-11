import { db } from '@/db'
import { userDevices } from '@/db/schema'
import { eq, count } from 'drizzle-orm'

export interface SuspiciousActivityResult {
  suspicious: boolean
  deviceCount: number
  warning?: string
}

/**
 * Checks if a user has suspicious activity based on the number of registered devices.
 * Warns if deviceCount >= 3, as this could indicate account sharing or credential theft.
 */
export async function checkSuspiciousActivity(userId: string): Promise<SuspiciousActivityResult> {
  try {
    const result = await db
      .select({ deviceCount: count() })
      .from(userDevices)
      .where(eq(userDevices.userId, userId))

    const deviceCount = result[0]?.deviceCount ?? 0

    if (deviceCount >= 3) {
      console.warn(`[SUSPICIOUS-ACTIVITY] User ${userId} has ${deviceCount} registered devices. Potential account sharing or compromise.`)
      return {
        suspicious: true,
        deviceCount,
        warning: `Account is active on ${deviceCount} devices. If you don't recognize all devices, please change your password.`,
      }
    }

    return { suspicious: false, deviceCount }
  } catch (err) {
    console.error('[SUSPICIOUS-ACTIVITY] Failed to check device count:', err)
    return { suspicious: false, deviceCount: 0 }
  }
}
