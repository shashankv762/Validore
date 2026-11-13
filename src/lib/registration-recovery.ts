import { safeNextPath } from './auth-redirect'

export const REGISTRATION_REQUIRED = 'registration_required'
export const REGISTRATION_PATH = '/auth/complete-signup'

/** Only the account API's explicit admission response may trigger recovery. */
export function registrationRecoveryPath(body: unknown, currentPath: string, origin: string): string | null {
  if (!body || typeof body !== 'object' || !('code' in body) || body.code !== REGISTRATION_REQUIRED ||
    !('next' in body) || body.next !== REGISTRATION_PATH) return null
  return REGISTRATION_PATH + '?next=' + encodeURIComponent(safeNextPath(currentPath, origin))
}
