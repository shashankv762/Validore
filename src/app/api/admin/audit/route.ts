import type { NextRequest } from 'next/server'
import { adminRead } from '@/lib/admin-api'
import { getAdminAudit } from '@/lib/admin-data'

export async function GET(request: NextRequest) {
  return adminRead(actor => getAdminAudit(actor, { page: request.nextUrl.searchParams.get('page') ?? undefined }))
}
