import type { NextRequest } from 'next/server'
import { adminMutation } from '@/lib/admin-api'
import { grantAdminCredits } from '@/lib/admin-actions'

export async function POST(request: NextRequest) { return adminMutation(request, grantAdminCredits) }
