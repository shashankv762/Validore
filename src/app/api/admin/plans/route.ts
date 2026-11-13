import type { NextRequest } from 'next/server'
import { adminMutation, adminRead } from '@/lib/admin-api'
import { readAdminPlans, updateAdminPlans } from '@/lib/admin-settings'

export async function GET() { return adminRead(readAdminPlans) }
export async function PUT(request: NextRequest) { return adminMutation(request, updateAdminPlans) }
