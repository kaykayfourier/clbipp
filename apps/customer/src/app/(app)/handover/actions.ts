'use server'

import { redirect } from 'next/navigation'
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

import { isStageBefore } from '@clbipp/ui'

// A pickup can still be accepted/cancelled from anything before `collected`.
// Derived from LIFECYCLE_STAGES rather than a hard-coded set so that adding a
// stage (Batch 7A added `arrived` and `offered`) doesn't silently lock these
// two actions out of it. `cancelled` is not on the linear lifecycle, so
// isStageBefore returns false for it — handled explicitly by both callers.
function isPreCollection(status: string): boolean {
  return isStageBefore(status, 'collected')
}

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
  if (!isPreCollection(pickup.status)) {
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

// ─── acceptOfferAndConfirm ───────────────────────────────────────────────────
// The form action behind the "Accept offer" button on /offer and
// /offer-breakdown, and the ONLY thing that should ever call acceptOffer().
//
// Until Batch 12 that button was a <Link> to /handover, and /handover called
// acceptOffer() during its render — so the lifecycle advanced on a GET. That is
// the wrong shape for a state change: a GET is fetched by link prefetchers, by
// crawlers, and by anything that "opens" a URL on the user's behalf, none of
// which represent a person deciding to sell their batteries. It also had to be
// excluded from `npm run smoke` for exactly that reason, which meant the one
// screen doing a lifecycle write was the one screen never smoke-tested.
//
// Now: POST does the write, then redirects to /handover, which is a pure read.
// Redirect-after-POST also means a refresh on the confirmation page re-renders
// rather than re-submitting.
export async function acceptOfferAndConfirm(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  if (!pickupId) redirect('/dashboard')

  const { error } = await acceptOffer(pickupId)

  // Back to the offer with the reason, rather than onward to a confirmation
  // screen confirming something that didn't happen. acceptOffer has already
  // done the ownership check, so there is nothing to re-verify here.
  if (error) {
    redirect(`/offer?id=${encodeURIComponent(pickupId)}&error=${encodeURIComponent(error)}`)
  }

  redirect(`/handover?id=${encodeURIComponent(pickupId)}`)
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
  if (!isPreCollection(pickup.status)) {
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

// ─── reschedulePickup ────────────────────────────────────────────────────────
// Backs the new /reschedule/[id] screen. Called from two places: the
// "Reschedule" button on /scheduled (an active, not-yet-collected pickup just
// wants a new preferred date), and the cancelled view on /track/[id] and
// /scheduled (a cancelled pickup gets REACTIVATED with the new date instead of
// making the customer create a brand new request).
export async function reschedulePickup(
  pickupId: string,
  preferredDate: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) return { error: 'Not authenticated.' }
  if (!preferredDate) return { error: 'Choose a date to reschedule to.' }

  const admin = createAdminClient()

  const { data: pickup, error: readError } = await admin
    .from('pickups')
    .select('id, vendor_id, status')
    .eq('id', pickupId)
    .single()

  if (readError || !pickup) return { error: 'Pickup not found.' }
  if (pickup.vendor_id !== user.id) return { error: 'Not authorised for this pickup.' }

  // Reschedulable pre-collection (same window as cancel), OR already
  // cancelled — that second case is the reactivation path from the "reschedule
  // the same cancelled pickup instead of a new request" requirement.
  const reschedulable = isPreCollection(pickup.status) || pickup.status === 'cancelled'
  if (!reschedulable) {
    return { error: 'This pickup has already moved past collection and can no longer be rescheduled.' }
  }

  // A cancelled pickup comes back as a fresh request; an active one keeps
  // whatever stage it's already at and just gets a new preferred date.
  const nextStatus = pickup.status === 'cancelled' ? 'requested' : pickup.status

  const { error: updateError } = await admin
    .from('pickups')
    .update({ status: nextStatus, preferred_date: preferredDate })
    .eq('id', pickupId)

  if (updateError) {
    console.error('[reschedulePickup] update failed:', updateError)
    return { error: updateError.message }
  }

  const { error: eventError } = await admin.from('status_events').insert({
    pickup_id: pickupId,
    status: nextStatus,
    actor_id: user.id,
    actor_role: 'vendor',
    notes:
      pickup.status === 'cancelled'
        ? `Pickup rescheduled by vendor (reactivated from cancelled) to ${preferredDate}`
        : `Pickup rescheduled by vendor to ${preferredDate}`,
  })
  if (eventError) console.error('[reschedulePickup] status_events insert failed:', eventError)

  return { error: null }
}
