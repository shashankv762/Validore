import { NextRequest, NextResponse } from 'next/server'

export async function readAuthBody(request: NextRequest): Promise<unknown> {
  if (request.headers.get('content-type')?.includes('application/json')) return request.json().catch(() => null)
  const form = await request.formData().catch(() => null)
  return form ? Object.fromEntries(form.entries()) : null
}
export function authFormResponse(request: NextRequest, path: string, kind: 'error' | 'message', message: string, status = 200) {
  if (request.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ [kind]: message }, { status })
  const url = new URL(path, request.url)
  url.searchParams.set(kind, message)
  return NextResponse.redirect(url, 303)
}
export function validAuthOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
}
