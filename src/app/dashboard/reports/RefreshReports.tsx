'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RefreshReports({ active }: { active: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, 5000)
    return () => clearInterval(timer)
  }, [active, router])
  return null
}
