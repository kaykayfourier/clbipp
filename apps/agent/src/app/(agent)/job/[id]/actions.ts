'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'
import { isStageBefore } from '@clbipp/ui'

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
