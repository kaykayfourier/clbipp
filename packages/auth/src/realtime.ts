import { createClient } from './supabase/client'

// Realtime subscriptions live here (per the repo convention that Supabase
// Realtime/Storage/auth calls are wrapped in `src/lib/supabase-*.ts` helpers
// rather than scattered across components).

// Subscribe to new lifecycle events for a single pickup. Fires `onEvent` on
// every INSERT into `status_events` scoped to this pickup, so a tracking screen
// can refresh when a field agent advances the pickup.
//
// We intentionally ignore the change payload: callers re-fetch through the
// server (which re-applies RLS) rather than trusting the row off the wire, so
// the signal is all we need. RLS on `status_events` already gates which clients
// receive which rows, so a vendor only ever hears about their own pickups.
//
// Returns an unsubscribe function — call it on unmount to tear the channel down.
export function subscribeToPickupEvents(
  pickupId: string,
  onEvent: () => void
): () => void {
  const supabase = createClient()

  const channel = supabase
    .channel(`pickup-events-${pickupId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'status_events',
        filter: `pickup_id=eq.${pickupId}`,
      },
      () => onEvent()
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
