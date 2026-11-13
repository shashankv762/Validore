import type { NextRequest } from 'next/server'
import { adminMutation, adminRead } from '@/lib/admin-api'
import { readAdminSettings, updateAdminSettings } from '@/lib/admin-settings'

export async function GET() { return adminRead(readAdminSettings) }
export async function PATCH(request: NextRequest) { return adminMutation(request, updateAdminSettings) }
