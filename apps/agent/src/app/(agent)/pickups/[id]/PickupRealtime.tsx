'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { subscribeToPickupEvents } from '@clbipp/auth/realtime'

// Renders nothing — it exists only to own the Realtime subscription lifecycle.
// Same shape as the customer app's TrackingRealtime: when a new status_events
// row lands for this pickup, `router.refresh()` re-runs the server component and
// the whole screen (timeline, banners, custody log) comes back fresh. Keeping
// the server as the single source of truth means no stage-derivation logic is
// duplicated in the browser.
//
// 🔴 THIS ONLY WORKS BECAUSE OF THE TWO POLICIES BATCH 8 ADDED. Unlike every
// other read in this app, the subscription runs in the BROWSER under the agent's
// own JWT — Prisma is not involved, so RLS is the whole story. Before Batch 8
// `status_events` was vendor-scoped only, and an agent's channel would report
// SUBSCRIBED and then never fire. If this screen ever goes quiet again, check
// `supabase/policies.sql` first — and check BOTH policies, because the
// status_events one alone silently matches nothing (the header there has the
// measurements).
export function PickupRealtime({ pickupId }: { pickupId: string }) {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = subscribeToPickupEvents(pickupId, () => {
      router.refresh()
    })
    return unsubscribe
  }, [pickupId, router])

  return null
}
