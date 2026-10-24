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

// ─── voidOfferAcceptance ─────────────────────────────────────────────────────
// Clears `Offer.acceptedAt` for a pickup that is leaving the offer flow.
//
// Added in Batch 5b, when `acceptedAt` stopped being decorative: the agent app
// reads it as permission to collect (Batch 6), so it must be null whenever
// there is no live acceptance behind it. Both callers treat failure as
// non-fatal — the status write they are attached to is the one that matters,
// and a stale timestamp on a cancelled pickup is caught by the agent's own
// status check as well.
async function voidOfferAcceptance(
  admin: ReturnType<typeof createAdminClient>,
  pickupId: string,
  caller: string
): Promise<void> {
  const { error } = await admin
    .from('offers')
    .update({ accepted_at: null })
    .eq('pickup_id', pickupId)

  if (error) console.error(`[${caller}] clearing offer acceptance failed:`, error)
}

// ─── acceptOffer ─────────────────────────────────────────────────────────────
// Vendor accepted the offer on /offer or /offer-breakdown.
//
// ⚠ THIS ACTION NO LONGER ADVANCES THE LIFECYCLE (Batch 5b, decision D7). It
// used to write `offered → collected`, which meant a vendor marked their own
// battery collected — the one transition D7 explicitly reserves for the field
// agent, who is the only party physically holding the load.
//
// What it writes now: `Offer.acceptedAt`, and nothing else. The status stays at
// `offered` until the agent app writes `collected` from the field (Batch 6).
// So `offered` is now TWO states, distinguished only by `acceptedAt`:
//
//   acceptedAt === null  → awaiting the vendor's decision   (/offer renders)
//   acceptedAt !== null  → accepted, awaiting the agent     (/handover renders)
//
// Every screen that switches on `status === 'offered'` has to make that
// distinction — see /offer, /offer-breakdown, /handover, /track/[id],
// /t/[token], /scheduled and lib/pickup-nav.ts.
//
// Idempotent twice over: an offer that is already accepted is left alone (the
// timestamp is not re-stamped), and a pickup already past `offered` reports
// success so a refresh on the confirmation page still renders.
// 🔴 AF5 · FD24 — the vendor accepts the PRICE THEY SAW. Since the agent can
// re-offer (and the office set a new price) while /offer is open, a bare
// "accept" could otherwise agree to a figure the vendor never read. The button
// carries the price it rendered; the update matches only that price on an
// unaccepted offer, and anything else sends the vendor back to the new one.
const OFFER_CHANGED = 'The offer was updated. Check the new price.'

export async function acceptOffer(
  pickupId: string,
  seenPricePaise: number | null
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

  if (pickup.status === 'cancelled') return { error: 'This pickup was cancelled.' }

  // Already past the offer stage → the agent has collected, so the acceptance
  // that got them there necessarily happened. Treat as success so a refresh on
  // the confirmation page still renders.
  if (!isPreCollection(pickup.status)) return { error: null }

  // Exact match, not a pre-collection range — the same guard /offer uses. There
  // is nothing to accept before the agent has priced the load on site, and the
  // loose range was only ever reachable because it predated `offered` being a
  // status of its own (Batch 7A).
  if (pickup.status !== 'offered') {
    return { error: 'There is no offer to accept for this pickup yet.' }
  }

  // Can't accept an offer that doesn't exist (guards direct /handover?id= hits).
  const { data: offer } = await admin
    .from('offers')
    .select('pickup_id, accepted_at, estimated_price')
    .eq('pickup_id', pickupId)
    .maybeSingle()

  if (!offer) return { error: 'No offer to accept for this pickup yet.' }

  // Idempotent: a double-submit must not re-stamp the acceptance, because the
  // agent app reads this timestamp as "when the vendor agreed" and Batch 6
  // gates collection on it.
  if (offer.accepted_at) return { error: null }
  if (seenPricePaise === null || offer.estimated_price !== seenPricePaise) return { error: OFFER_CHANGED }

  const acceptedAt = new Date().toISOString()
  const { data: accepted, error: updateError } = await admin
    .from('offers')
    .update({ accepted_at: acceptedAt })
    .eq('pickup_id', pickupId)
    .is('accepted_at', null)
    .eq('estimated_price', seenPricePaise)
    .select('pickup_id')

  if (updateError) {
    console.error('[acceptOffer] offer acceptance failed:', updateError)
    return { error: 'Could not accept the offer. Please try again.' }
  }
  if (!accepted || accepted.length === 0) {
    // Lost a race: either a double-submit already accepted it (success) or the
    // price changed between the read above and this write.
    const { data: now } = await admin.from('offers').select('accepted_at').eq('pickup_id', pickupId).maybeSingle()
    return now?.accepted_at ? { error: null } : { error: OFFER_CHANGED }
  }

  // The round the vendor accepted. Non-fatal: the acceptance is on the offer.
  await markLatestRound(admin, pickupId, 'accepted', acceptedAt, 'acceptOffer')

  // Audit event. The status is unchanged, so this is a SECOND `offered` row —
  // the agent's offer and the vendor's acceptance of it. `buildStages` is
  // first-wins for exactly this reason, so the timeline keeps showing the date
  // the offer was made rather than the date it was accepted.
  //
  // Non-fatal: the acceptance is already recorded on the offer row, so a failed
  // event is logged rather than surfaced to the vendor.
  //
  // ⚠ No id supplied: `status_events.id` is BIGSERIAL, a real database default.
  // Do not generalise that to other tables — Prisma's `@default(uuid())` is
  // applied by the Prisma client, not the database, so a service-role insert
  // into a uuid-keyed table must generate its own id. See "Batch 2 — as built".
  const { error: eventError } = await admin.from('status_events').insert({
    pickup_id: pickupId,
    status: 'offered',
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

  const seen = Number(formData.get('pricePaise'))
  const { error } = await acceptOffer(pickupId, Number.isSafeInteger(seen) && seen > 0 ? seen : null)

  // Back to the offer with the reason, rather than onward to a confirmation
  // screen confirming something that didn't happen. acceptOffer has already
  // done the ownership check, so there is nothing to re-verify here.
  if (error) {
    redirect(`/offer?id=${encodeURIComponent(pickupId)}&error=${encodeURIComponent(error)}`)
  }

  redirect(`/handover?id=${encodeURIComponent(pickupId)}`)
}

// ─── cancelPickup / declineOffer ─────────────────────────────────────────────
// Vendor cancelled from /scheduled, or declined an offer from /offer. Both stop
// the pickup (`cancelled`, which is re-enterable through reschedule) and differ
// only in what the timeline says, so the office can tell a declined price from
// a called-off pickup. Only allowed pre-collection.
export async function cancelPickup(
  pickupId: string
): Promise<{ error: string | null }> {
  return stopPickup(pickupId, 'Pickup cancelled by vendor')
}

// A decline is NOT a cancellation: there may be a back-and-forth on price.
// It records the decision on the timeline (status stays `offered`, a fact, not
// a stage) so the office can follow up; the vendor can still accept later.
export async function declineOffer(
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
    .select('id, vendor_id, status, offers(accepted_at)')
    .eq('id', pickupId)
    .single()
  if (readError || !pickup) return { error: 'Pickup not found.' }
  if (pickup.vendor_id !== user.id) return { error: 'Not authorised for this pickup.' }
  const offer = Array.isArray(pickup.offers) ? pickup.offers[0] : pickup.offers
  if (pickup.status !== 'offered' || !offer) return { error: 'There is no offer to decline.' }
  if (offer.accepted_at) return { error: 'You have already accepted this offer.' }

  // AF5 — a second press on the same price is not a second decision.
  const { data: latest } = await admin
    .from('offer_rounds')
    .select('outcome')
    .eq('pickup_id', pickupId)
    .order('round_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest?.outcome === 'declined') return { error: null }

  const { error: eventError } = await admin.from('status_events').insert({
    pickup_id: pickupId,
    status: 'offered',
    actor_id: user.id,
    actor_role: 'vendor',
    notes: 'Vendor declined the offer. Office to follow up.',
  })
  if (eventError) {
    console.error('[declineOffer] status_events insert failed:', eventError)
    return { error: 'Could not record that. Please try again.' }
  }
  // AF5 · FD24 — the round the vendor declined. A decline is not final: the
  // agent may re-offer, and the vendor can still accept this price.
  await markLatestRound(admin, pickupId, 'declined', new Date().toISOString(), 'declineOffer')
  return { error: null }
}

// ─── markLatestRound (AF5) ───────────────────────────────────────────────────
// The vendor's response, on the round they were looking at. offer_rounds is
// RLS-closed with zero policies, so only the service role can write it — which
// is this client. Non-fatal by design: the decision itself is already on the
// offer / the timeline; this is the negotiation record beside it.
async function markLatestRound(
  admin: ReturnType<typeof createAdminClient>,
  pickupId: string,
  outcome: 'accepted' | 'declined',
  at: string,
  caller: string
): Promise<void> {
  const { data: latest } = await admin
    .from('offer_rounds')
    .select('id')
    .eq('pickup_id', pickupId)
    .order('round_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!latest) return
  const { error } = await admin.from('offer_rounds').update({ outcome, outcome_at: at }).eq('id', latest.id)
  if (error) console.error(`[${caller}] offer round update failed:`, error)
}

async function stopPickup(
  pickupId: string,
  note: string
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
    console.error('[stopPickup] status update failed:', updateError)
    return { error: 'Could not cancel the pickup. Please try again.' }
  }

  // Void any acceptance. Since Batch 5b the agent app gates collection on
  // `Offer.acceptedAt`, so an acceptance that outlives its pickup is an agent
  // being told to collect a load the vendor has called off. Non-fatal and
  // unconditional — a pickup with no offer just updates zero rows.
  await voidOfferAcceptance(admin, pickupId, 'stopPickup')

  const { error: eventError } = await admin.from('status_events').insert({
    pickup_id: pickupId,
    status: 'cancelled',
    actor_id: user.id,
    actor_role: 'vendor',
    notes: note,
  })
  if (eventError) console.error('[stopPickup] status_events insert failed:', eventError)

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

  // Reactivation also drops the old assignment. A pickup sitting at `requested`
  // with an agent still on it is self-contradictory: it shows up on that agent's
  // day view while the dispatch board lists it as unassigned, and the stale
  // `agentFeePaise` was priced against an assessment that is now void. The
  // dispatch board sets both again when it reassigns.
  const reactivating = pickup.status === 'cancelled'

  const { error: updateError } = await admin
    .from('pickups')
    .update(
      // FV11 — either way the pickup leaves any collection run it was on: the
      // run was planned for the OLD date (one agent, one day), and a stop that
      // has moved to another day is not on it any more. Dispatch re-plans it.
      reactivating
        ? {
            status: nextStatus,
            preferred_date: preferredDate,
            agent_id: null,
            agent_fee_paise: null,
            scheduled_slot: null,
            eta_minutes: null,
            collection_run_id: null,
            run_sequence: null,
          }
        : { status: nextStatus, preferred_date: preferredDate, collection_run_id: null, run_sequence: null }
    )
    .eq('id', pickupId)

  if (updateError) {
    console.error('[reschedulePickup] update failed:', updateError)
    return { error: 'Could not reschedule the pickup. Please try again.' }
  }

  // Reactivation only. A cancelled pickup coming back as `requested` is the
  // vendor RE-requesting, not resuming: the old offer was priced against an
  // assessment that is now stale, so any acceptance of it must not survive.
  // Rescheduling an ACTIVE pickup is just a new date and leaves the offer alone.
  //
  // 🔴 The remaining half of that loose end is still open: the audit log can run
  // backwards (a `requested` event landing after a `cancelled` one). The stale
  // `agentId` / `agentFeePaise` half is CLOSED — cleared in the update above.
  // See LANE_OWNERSHIP.md.
  if (reactivating) {
    await voidOfferAcceptance(admin, pickupId, 'reschedulePickup')
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
