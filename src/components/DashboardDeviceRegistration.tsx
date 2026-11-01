'use client'
import { useEffect } from 'react'
import { useAccount } from './AccountProvider'

export function DashboardDeviceRegistration() {
  const accountId = useAccount().data?.user.id
  useEffect(() => {
    if (!accountId) return
    import('@/lib/device-fingerprint').then(({ registerDevice }) => {
      registerDevice(accountId).catch(() => {})
    })
  }, [accountId])
  return null
}
