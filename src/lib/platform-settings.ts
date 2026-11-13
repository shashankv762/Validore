import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { platformSettings } from '@/db/schema'
import type { AdminSettings } from './admin-types'

export type SettingsExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'execute'>
export const PlatformSettingsSchema = z.strictObject({
  announcement: z.strictObject({ enabled: z.boolean(), message: z.string().trim().max(1000) }),
  maintenance: z.strictObject({ enabled: z.boolean(), message: z.string().trim().max(1000) }),
  signupEnabled: z.boolean(),
}).superRefine((settings, ctx) => {
  if (settings.announcement.enabled && !settings.announcement.message) {
    ctx.addIssue({ code: 'custom', path: ['announcement', 'message'], message: 'Enter an announcement before enabling it.' })
  }
})

const defaults = {
  announcement: null as string | null, announcementEnabled: false,
  maintenanceEnabled: false, maintenanceMessage: null as string | null,
  signupEnabled: true, updatedAt: null as Date | null, updatedBy: null as string | null,
}

/** No process cache: emergency switches take effect on the next server request. */
export async function getPlatformSettings(executor: SettingsExecutor = db) {
  if (executor === db && !process.env.DATABASE_URL) return { ...defaults }
  const [row] = await executor.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1)
  return row ? { announcement: row.announcement, announcementEnabled: row.announcementEnabled,
    maintenanceEnabled: row.maintenanceEnabled, maintenanceMessage: row.maintenanceMessage,
    signupEnabled: row.signupEnabled, updatedAt: row.updatedAt, updatedBy: row.updatedBy } : { ...defaults }
}

export function toAdminSettings(settings: Awaited<ReturnType<typeof getPlatformSettings>>): AdminSettings {
  return { announcement: { enabled: settings.announcementEnabled, message: settings.announcement ?? '' },
    maintenance: { enabled: settings.maintenanceEnabled, message: settings.maintenanceMessage ?? '' },
    signupEnabled: settings.signupEnabled }
}

/** Caller must authorize the owner and include its audit insert in this transaction. */
export async function savePlatformSettings(tx: SettingsExecutor, input: unknown, actorId: string) {
  const value = PlatformSettingsSchema.parse(input)
  const updatedBy = z.string().uuid().parse(actorId)
  const values = { announcement: value.announcement.message || null, announcementEnabled: value.announcement.enabled,
    maintenanceEnabled: value.maintenance.enabled, maintenanceMessage: value.maintenance.message || null,
    signupEnabled: value.signupEnabled, updatedAt: new Date(), updatedBy }
  await lockPlatformSettings(tx)
  await tx.insert(platformSettings).values({ id: 1, ...values }).onConflictDoUpdate({ target: platformSettings.id, set: values })
  return values
}

/** Serialize the first insert as well as existing singleton updates. */
export async function lockPlatformSettings(tx: SettingsExecutor) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('validore-platform-settings'))`)
}
