import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import Sidebar from './Sidebar'
import { DashboardDeviceRegistration } from '@/components/DashboardDeviceRegistration'
import { AccountProvider } from '@/components/AccountProvider'
import './workspace.css'
import './interview.css'

// All dashboard pages require auth and are dynamic (no prerendering)
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Workspace', robots: { index: false, follow: false } }

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      <Sidebar>
        <DashboardDeviceRegistration />
        {children}
      </Sidebar>
    </AccountProvider>
  )
}
