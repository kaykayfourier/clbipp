'use server'

import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'

// ─── Vendor lifecycle transitions ────────────────────────────────────────────
// Both actions run the mutation through the SERVICE-ROLE admin client, not the
// vendor's session. Why: there is no vendor UPDATE policy on `pickups` and only
// the service role may write `status_events` — so a vendor session can't advance
// its own lifecycle (the UI is not the security boundary, RLS is). Because the
// admin client bypasses RLS, each action re-verifies ownership itself.
//
// The caller identity comes from the vendor's authenticated session (server
// client); the actual write uses the admin client.

// Statuses a pickup can still be accepted/cancelled from (pre-collection).
const PRE_COLLECTION = new Set(['requested', 'scheduled'])

// ─── acceptOffer ─────────────────────────────────────────────────────────────
// Vendor accepted the offer on /offer or /offer-breakdown. Advances the pickup
// to "collected" and writes the audit event (which also fires the realtime ping
// on the tracking screen). Idempotent: re-running once collected is a no-op.
export async function acceptOffer(
  pickupId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) return { error: 'Not authenticated.' }

  const admin = createAdminClient()

  // Re-verify ownership + state with the admin client (RLS is bypassed here).
  const { data: pickup, error: readError } = await admin
    .from('pickups')
    .select('id, vendor_id, status')
    .eq('id', pickupId)
    .single()

  if (readError || !pickup) return { error: 'Pickup not found.' }
  if (pickup.vendor_id !== user.id) return { error: 'Not authorised for this pickup.' }

  // Already past the offer stage → treat as success so the confirmation page
  // still renders on refresh. Only cancelled is a genuine error.
  if (!PRE_COLLECTION.has(pickup.status)) {
    if (pickup.status === 'cancelled') return { error: 'This pickup was cancelled.' }
    return { error: null }
  }

  // Can't accept an offer that doesn't exist (guards direct /handover?id= hits).
  const { data: offer } = await admin
    .from('offers')
    .select('pickup_id')
    .eq('pickup_id', pickupId)
    .maybeSingle()

  if (!offer) return { error: 'No offer to accept for this pickup yet.' }

  const { error: updateError } = await admin
    .from('pickups')
    .update({ status: 'collected' })
    .eq('id', pickupId)

  if (updateError) {
    console.error('[acceptOffer] status update failed:', updateError)
    return { error: updateError.message }
  }

  // Audit event — now a real write (service role), no longer RLS-dropped.
  // Non-fatal: the status already advanced, so a failed event is logged, not
  // surfaced to the vendor.
  const { error: eventError } = await admin.from('status_events').insert({
    pickup_id: pickupId,
    status: 'collected',
    actor_id: user.id,
    actor_role: 'vendor',
    notes: 'Offer accepted by vendor',
  })
  if (eventError) console.error('[acceptOffer] status_events insert failed:', eventError)

  return { error: null }
}

// ─── cancelPickup ────────────────────────────────────────────────────────────
// Vendor cancelled from the /scheduled screen. Only allowed pre-collection —
// once in the recovery pipeline it can't be pulled back. Writes the cancelled
// audit event too.
export async function cancelPickup(
  pickupId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) return { error: 'Not authenticated.' }

  const admin = createAdminClient()

  const { data: pickup, error: readError } = await admin
    .from('pickups')
    .select('id, vendor_id, status')
    .eq('id', pickupId)
    .single()

  if (readError || !pickup) return { error: 'Pickup not found.' }
  if (pickup.vendor_id !== user.id) return { error: 'Not authorised for this pickup.' }

  if (pickup.status === 'cancelled') return { error: null } // already cancelled
  if (!PRE_COLLECTION.has(pickup.status)) {
    return { error: 'This pickup can no longer be cancelled.' }
  }

  const { error: updateError } = await admin
    .from('pickups')
    .update({ status: 'cancelled' })
    .eq('id', pickupId)

  if (updateError) {
    console.error('[cancelPickup] status update failed:', updateError)
    return { error: updateError.message }
  }

  const { error: eventError } = await admin.from('status_events').insert({
    pickup_id: pickupId,
    status: 'cancelled',
    actor_id: user.id,
    actor_role: 'vendor',
    notes: 'Pickup cancelled by vendor',
  })
  if (eventError) console.error('[cancelPickup] status_events insert failed:', eventError)

  return { error: null }
}
