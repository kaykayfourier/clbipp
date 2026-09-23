'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'
import { isStageBefore } from '@clbipp/ui'
import { COLLECTION_DATE_MESSAGES, parseCollectionDate } from '@clbipp/core/collection'

// ─── Agent lifecycle transitions ─────────────────────────────────────────────
// 📌 THIS IS THE REFERENCE SERVICE-ROLE ACTION FOR THE AGENT APP (task sheet,
// Batch 1 step 5). Batches 3, 5b, 6 and 7a copy this shape. Four things make it
// the shape, and none of them are optional:
//
//   1. The CALLER's identity comes from the session (server client). Never from
//      the form — a form field is attacker-controlled, and using it here would
//      make step 2 check the request against itself.
//   2. The WRITE goes through the service-role admin client, because there are
//      no agent-scoped RLS policies on `pickups` and only the service role may
//      write `status_events` (D10 — the agent app is read-scoped by Prisma and
//      write-scoped by these actions, not by a new policy layer).
//   3. Because the service role BYPASSES RLS, the action re-verifies ownership
//      itself. This `agent_id === user.id` check is standing in for a policy;
//      delete it and any logged-in agent can advance anyone's pickup.
//   4. Status and event are written together. `pickups.status` is a
//      denormalised cache of the `status_events` log, and drift between the two
//      is invisible until a timeline renders wrong weeks later.
//
// The vendor-side equivalent is apps/customer/src/app/(app)/handover/actions.ts.

// ─── markArrived ─────────────────────────────────────────────────────────────
// `scheduled → arrived`. The agent tapped "Arrived" on the job detail screen —
// this is the transition `arrived` was ADDED for in Batch 7A (CLAUDE.md), and
// the first point in the lifecycle the agent app owns (D7).
//
// Idempotent by design: a re-tap, a double-submit or a refresh is a no-op that
// still routes onward, because a field agent on one bar of signal will tap it
// twice and must not get an error for it.
export async function markArrived(pickupId: string): Promise<{ error: string | null }> {
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
    .select('id, agent_id, status')
    .eq('id', pickupId)
    .single()

  if (readError || !pickup) return { error: 'Job not found.' }

  // 🔴 The ownership check. See note 3 above.
  if (pickup.agent_id !== user.id) return { error: 'This job is not assigned to you.' }

  if (pickup.status === 'cancelled') return { error: 'This pickup was cancelled.' }

  // Already at `arrived` or past it → success, not an error. Derived from
  // isStageBefore rather than `status === 'scheduled'` so that a job which
  // somehow sits at `offered` doesn't get dragged backwards by a stray tap.
  if (!isStageBefore(pickup.status, 'arrived')) return { error: null }

  const { error: updateError } = await admin
    .from('pickups')
    .update({ status: 'arrived' })
    .eq('id', pickupId)

  if (updateError) {
    console.error('[markArrived] status update failed:', updateError)
    return { error: updateError.message }
  }

  // The audit event — the same write that fires the realtime ping on the
  // vendor's tracking screen, which is how the customer learns the agent turned
  // up. Non-fatal: the status already advanced, so a failed event is logged
  // rather than shown to an agent standing at a gate.
  //
  // TODO (Batch 6): the company doc's chain of custody (§5.3) wants lat/lng and
  // photo proof on the on-site transitions. `status_events` already has the
  // columns and the seed fills them; capturing them needs the geolocation +
  // camera work that lands with collect.
  const { error: eventError } = await admin.from('status_events').insert({
    pickup_id: pickupId,
    status: 'arrived',
    actor_id: user.id,
    actor_role: 'agent',
    notes: 'Agent arrived on site',
  })
  if (eventError) console.error('[markArrived] status_events insert failed:', eventError)

  return { error: null }
}

// ─── markArrivedAndContinue ──────────────────────────────────────────────────
// The form action behind the "Arrived" button, and the only thing that should
// call markArrived().
//
// A POST, deliberately — not a <Link>. The customer app shipped `acceptOffer`
// as a GET until Batch 12 and it advanced the lifecycle for link prefetchers and
// crawlers, which meant the one screen doing a lifecycle write was also the one
// screen `npm run smoke` could never cover. Redirect-after-POST also means a
// refresh on the safety checklist re-renders instead of re-submitting.
export async function markArrivedAndContinue(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  if (!pickupId) redirect('/')

  const { error } = await markArrived(pickupId)

  // Back to the job with the reason, rather than onward to a checklist for a
  // job we never actually arrived at. markArrived has already done the
  // ownership check, so there is nothing to re-verify here.
  if (error) {
    redirect(`/job/${encodeURIComponent(pickupId)}?error=${encodeURIComponent(error)}`)
  }

  // Both the job screen and the day view show this pickup's status.
  revalidatePath(`/job/${pickupId}`)
  revalidatePath('/')

  // The mandatory safety checklist is the gate between `arrived` and intake
  // (W1). Landing on it directly is the point — it should not be something the
  // agent has to go and find.
  redirect(`/job/${encodeURIComponent(pickupId)}/safety`)
}

// ─── scheduleCollection (FV3 · FD0) ──────────────────────────────────────────
// The agent inspected, the vendor accepted, and the load is NOT going in the van
// today — vehicle capacity, safety, or sheer quantity. Books a date instead.
//
// 🔴 WRITES NO STATUS AND ADVANCES NOTHING. The pickup stays at `offered`; only
// `collection_scheduled_at` changes. That is FD0: deferred collection is a
// derived state, not a tenth lifecycle stage, exactly as "pending drop-off" is
// derived from `custody_batch_id` (D5). The nine stages stay locked.
//
// A `status_events` row IS written — with the CURRENT status, not a new one —
// because "we agreed the 20th" is a fact about the custody chain that the
// vendor's timeline should carry. `buildStages` is first-wins, so a second
// `offered` event cannot relabel the first.
//
// Copies the four-point shape at the top of this file. Same idempotency posture
// as `markArrived`: re-booking the same date is a silent success, because an
// agent on one bar of signal will submit twice.
export async function scheduleCollection(
  pickupId: string,
  rawDate: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) return { error: 'Not authenticated.' }

  const { value: date, error: dateError } = parseCollectionDate(rawDate)
  if (dateError !== null) return { error: COLLECTION_DATE_MESSAGES[dateError] }

  const admin = createAdminClient()

  const { data: pickup, error: readError } = await admin
    .from('pickups')
    .select('id, agent_id, status, collection_scheduled_at, offers(accepted_at)')
    .eq('id', pickupId)
    .single()

  if (readError || !pickup) return { error: 'Job not found.' }

  // 🔴 The ownership check, standing in for the absent policy. See note 3.
  if (pickup.agent_id !== user.id) return { error: 'This job is not assigned to you.' }

  if (pickup.status !== 'offered') {
    return pickup.status === 'collected'
      ? { error: 'This job has already been collected.' }
      : { error: 'A collection can only be booked once the vendor has accepted the offer.' }
  }

  // The same gate `/collect` enforces, for the same reason: `offered` means two
  // different things and only the accepted half may be scheduled. A vendor who
  // has not decided yet cannot have a collection booked against them.
  const acceptedAt = Array.isArray(pickup.offers)
    ? pickup.offers[0]?.accepted_at
    : (pickup.offers as { accepted_at: string | null } | null)?.accepted_at
  if (!acceptedAt) return { error: 'The vendor has not accepted this offer yet.' }

  const { error: writeError } = await admin
    .from('pickups')
    .update({ collection_scheduled_at: date.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', pickupId)
    .eq('status', 'offered') // guards the same race markArrived guards against

  if (writeError) return { error: writeError.message }

  const shown = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const { error: eventError } = await admin.from('status_events').insert({
    pickup_id: pickupId,
    // 🔴 The CURRENT status, deliberately. This event records a fact about the
    // pickup, not a transition — writing anything else here would invent a
    // tenth stage through the back door.
    status: 'offered',
    actor_id: user.id,
    actor_role: 'agent',
    notes: `Collection scheduled for ${shown}`,
  })
  if (eventError) console.error('[scheduleCollection] status_events insert failed:', eventError)

  revalidatePath(`/job/${pickupId}`)
  revalidatePath('/')
  return { error: null }
}

export async function scheduleCollectionAndReturn(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  const date = String(formData.get('collectionDate') ?? '')
  if (!pickupId) redirect('/')

  const result = await scheduleCollection(pickupId, date)
  if (result.error) {
    redirect(`/job/${encodeURIComponent(pickupId)}?error=${encodeURIComponent(result.error)}`)
  }
  redirect(`/job/${encodeURIComponent(pickupId)}`)
}
