'use client'
import { useMemo } from 'react'
import { PlanningRunIdentity } from '@/lib/planning/run-identity'

export function usePlanningRunIdentity(module: string, ownerId: string | undefined) {
  return useMemo(() => {
    let storage: Storage | undefined
    try { if (typeof window !== 'undefined') storage = window.sessionStorage } catch { /* Browser storage is optional. */ }
    return new PlanningRunIdentity(`validore:planning:${module}:${ownerId ?? ''}`, storage)
  }, [module, ownerId])
}
