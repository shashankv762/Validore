'use client'
import { useEffect, useRef, type ReactNode } from 'react'
export function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onClose() }}
    className="m-auto w-[min(28rem,calc(100vw-2rem))] max-h-[90dvh] overflow-y-auto border-0 bg-transparent p-0 backdrop:bg-[#0A1628]/60">
    {children}
  </dialog>
}
