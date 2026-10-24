'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ─── Re-render while waiting on the office (AF4 · AF5) ───────────────────────
// There is no push and no Realtime channel for the office's decisions (agent
// notices, tag approvals and office prices are all RLS-closed tables read
// through Prisma), so a screen that is waiting on one re-fetches its server
// data every few seconds. `router.refresh()` keeps client state — a half-drawn
// signature or a typed note survives it.
export function RefreshWhile({ active, intervalMs = 10_000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs, router])
  return null
}
