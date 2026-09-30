import type { ReactNode } from 'react'
import Sidebar from './Sidebar'

// All dashboard pages require auth and are dynamic (no prerendering)
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Sidebar>{children}</Sidebar>
}