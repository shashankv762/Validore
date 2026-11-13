import type { NextRequest } from 'next/server'
import { adminRead } from '@/lib/admin-api'
import { getAdminUsers } from '@/lib/admin-data'

export async function GET(request: NextRequest) {
  return adminRead(actor => getAdminUsers(actor, {
    q: request.nextUrl.searchParams.get('q') ?? undefined,
    status: request.nextUrl.searchParams.get('status') ?? undefined,
    page: request.nextUrl.searchParams.get('page') ?? undefined,
  }))
}
