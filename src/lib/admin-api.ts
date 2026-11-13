import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AdminAccessError, requireAdmin } from './admin-access'
import { AdminOperationError, type AdminActor } from './admin-requests'
import { guardApiRequest, PRIVATE_HEADERS, readJsonBody, RequestBodyError } from './api-security'

export function adminJson(value: unknown) {
  return NextResponse.json(value, { headers: PRIVATE_HEADERS })
}

export function adminApiError(error: unknown) {
  if (error instanceof AdminAccessError || error instanceof AdminOperationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: PRIVATE_HEADERS })
  }
  if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE_HEADERS })
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Check the submitted values.', code: 'invalid_input' }, { status: 400, headers: PRIVATE_HEADERS })
  console.error('[admin] Request could not complete')
  return NextResponse.json({ error: 'The action could not complete. Retry using the same request reference.', code: 'admin_unavailable' }, { status: 503, headers: PRIVATE_HEADERS })
}

export async function adminRead(operation: (actor: AdminActor) => Promise<unknown>) {
  try {
    const { user } = await requireAdmin()
    return adminJson(await operation(user))
  } catch (error) { return adminApiError(error) }
}

export async function adminMutation(request: NextRequest, operation: (actor: AdminActor, body: unknown) => Promise<unknown>) {
  try {
    const denied = await guardApiRequest(request)
    if (denied) return denied
    const { user } = await requireAdmin()
    return adminJson(await operation(user, await readJsonBody(request, 65_536)))
  } catch (error) { return adminApiError(error) }
}
