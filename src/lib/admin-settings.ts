import { z } from 'zod'
import { db } from '@/db'
import { AdminReason, AdminRequestId, assertAdminActor, beginAdminRequest, recordAdminAction, type AdminActor } from './admin-requests'
import { getPlatformSettings, lockPlatformSettings, PlatformSettingsSchema, savePlatformSettings, toAdminSettings } from './platform-settings'
import { getPlanCatalog, lockPlan, PLAN_TIERS, PlanUpdateSchema, toAdminPlan, updatePlan } from './plan-catalog'

const SettingsInput = z.strictObject({ settings: PlatformSettingsSchema, reason: AdminReason, requestId: AdminRequestId })
const PlansInput = z.strictObject({
  plans: z.array(PlanUpdateSchema.extend({ tier: z.enum(PLAN_TIERS) })).length(3), reason: AdminReason, requestId: AdminRequestId,
}).refine(value => new Set(value.plans.map(plan => plan.tier)).size === 3, 'Include each plan exactly once.')

export async function readAdminSettings(actor: AdminActor) {
  await assertAdminActor(actor)
  const settings = await getPlatformSettings()
  return { settings: toAdminSettings(settings), updatedAt: settings.updatedAt?.toISOString() ?? null }
}

export async function updateAdminSettings(actor: AdminActor, input: unknown) {
  const value = SettingsInput.parse(input)
  const duplicate = await db.transaction(async tx => {
    const request = await beginAdminRequest(tx, actor, value.requestId, 'settings.update', value)
    if (request.entries.length) return true
    await lockPlatformSettings(tx)
    const before = toAdminSettings(await getPlatformSettings(tx))
    const after = toAdminSettings(await savePlatformSettings(tx, value.settings, actor.id))
    await recordAdminAction(tx, actor, { requestId: value.requestId, requestHash: request.requestHash,
      action: 'settings.update', reason: value.reason, details: { before, after } })
    return false
  })
  return { ...await readAdminSettings(actor), requestId: value.requestId, duplicate }
}

export async function readAdminPlans(actor: AdminActor) {
  await assertAdminActor(actor)
  const catalog = await getPlanCatalog()
  return { plans: PLAN_TIERS.map(tier => toAdminPlan(catalog[tier])) }
}

export async function updateAdminPlans(actor: AdminActor, input: unknown) {
  const value = PlansInput.parse(input)
  value.plans.sort((left, right) => PLAN_TIERS.indexOf(left.tier) - PLAN_TIERS.indexOf(right.tier))
  const duplicate = await db.transaction(async tx => {
    const request = await beginAdminRequest(tx, actor, value.requestId, 'plans.update', value)
    if (request.entries.length) return true
    await lockPlan(tx, 'free')
    const before = await getPlanCatalog(tx)
    for (const plan of value.plans) await updatePlan(tx, plan.tier, plan)
    const after = await getPlanCatalog(tx)
    await recordAdminAction(tx, actor, { requestId: value.requestId, requestHash: request.requestHash,
      action: 'plans.update', reason: value.reason, details: {
        before: PLAN_TIERS.map(tier => toAdminPlan(before[tier])), after: PLAN_TIERS.map(tier => toAdminPlan(after[tier])),
      } })
    return false
  })
  return { ...await readAdminPlans(actor), requestId: value.requestId, duplicate }
}
