import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import { DashboardDeviceRegistration } from '@/components/DashboardDeviceRegistration'

// All dashboard pages require auth and are dynamic (no prerendering)
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Sidebar>
      <DashboardDeviceRegistration />
      {children}
    </Sidebar>
  )
}