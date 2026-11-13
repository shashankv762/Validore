import type { NextRequest } from 'next/server'
import { adminMutation, adminRead } from '@/lib/admin-api'
import { changeAdminAccountStatus } from '@/lib/admin-actions'
import { getAdminUserDetail } from '@/lib/admin-data'
import { deleteAdminUser } from '@/lib/admin-user-deletion'

type Context = { params: Promise<{ id: string }> }
export async function GET(_request: NextRequest, context: Context) {
  return adminRead(async actor => getAdminUserDetail(actor, (await context.params).id))
}
export async function PATCH(request: NextRequest, context: Context) {
  return adminMutation(request, async (actor, body) => changeAdminAccountStatus(actor, (await context.params).id, body))
}
export async function DELETE(request: NextRequest, context: Context) {
  return adminMutation(request, async (actor, body) => deleteAdminUser(actor, (await context.params).id, body))
}
