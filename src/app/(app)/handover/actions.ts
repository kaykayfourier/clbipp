'use server'

import { createClient } from '@/lib/supabase/server'

// ─── acceptOffer ─────────────────────────────────────────────────────────────
// Called from the handover page when the vendor navigates here after pressing
// "Accept offer" on /offer or /offer-breakdown.
//
// 1. Updates pickups.status → "collected"
// 2. Inserts a status_events row (best-effort; non-fatal if the table isn't
//    seeded in this environment yet)
//
// RLS ensures the vendor can only update their own pickup rows.

export async function acceptOffer(
  pickupId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'Not authenticated.' }
  }

  // Update pickup status → collected
  const { error: updateError } = await supabase
    .from('pickups')
    .update({ status: 'collected' })
    .eq('id', pickupId)
    .eq('vendor_id', user.id) // belt-and-suspenders on top of RLS

  if (updateError) {
    console.error('[acceptOffer] status update failed:', updateError)
    return { error: updateError.message }
  }

  // Insert status_event — best-effort, non-fatal
  try {
    const { error: eventError } = await supabase.from('status_events').insert({
      pickup_id: pickupId,
      status: 'collected',
      actor_id: user.id,
      actor_role: 'vendor',
      notes: 'Offer accepted by vendor',
    })
    if (eventError) {
      console.warn('[acceptOffer] status_events insert skipped:', eventError.message)
    }
  } catch (err) {
    console.warn('[acceptOffer] status_events insert threw:', err)
  }

  return { error: null }
}
