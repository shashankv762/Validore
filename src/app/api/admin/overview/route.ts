import { adminRead } from '@/lib/admin-api'
import { getAdminOverview } from '@/lib/admin-data'

export async function GET() { return adminRead(getAdminOverview) }
