'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { subscribeToPickupEvents } from '@/lib/supabase-realtime'

// Renders nothing — it exists only to own the Realtime subscription lifecycle.
// When a new status_events row lands for this pickup, we call router.refresh()
// so the server component re-fetches and re-renders the whole tracking screen
// (timeline, banners, recovery summary, cert button) with fresh data. Keeping
// the server as the single source of truth means no stage-derivation logic is
// duplicated here.
export function TrackingRealtime({ pickupId }: { pickupId: string }) {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = subscribeToPickupEvents(pickupId, () => {
      router.refresh()
    })
    return unsubscribe
  }, [pickupId, router])

  return null
}
