import { redirect } from 'next/navigation'
import { AdminAccessError, requireAdmin } from '@/lib/admin-access'
import AdminConsole from './AdminConsole'

export default async function AdminPage() {
  try { await requireAdmin() }
  catch (error) {
    if (error instanceof AdminAccessError) {
      if (error.status >= 500) throw error
      if (error.status === 401) redirect('/auth/signin?next=%2Fadmin')
      redirect('/dashboard')
    }
    throw error
  }
  return <AdminConsole />
}
