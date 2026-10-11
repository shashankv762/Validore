'use client'
import { useEffect } from 'react'

export function DashboardDeviceRegistration() {
  useEffect(() => {
    import('@/lib/device-fingerprint').then(({ registerDevice }) => {
      registerDevice().catch(() => {})
    })
  }, [])
  return null
}
