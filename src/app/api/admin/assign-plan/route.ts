import type { NextRequest } from 'next/server'
import { adminMutation } from '@/lib/admin-api'
import { assignAdminPlan } from '@/lib/admin-user-plans'

export async function POST(request: NextRequest) {
  return adminMutation(request, (actor, body) => assignAdminPlan(actor, body))
}
