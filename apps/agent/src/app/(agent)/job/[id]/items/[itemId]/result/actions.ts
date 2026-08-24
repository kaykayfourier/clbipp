'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@clbipp/auth/server'
import { createAdminClient } from '@clbipp/auth/admin'

// ─── escalateToAdmin (HOLD branch, Batch 5a) ─────────────────────────────────
// The wireframe's "Escalate to admin" button went nowhere (plan §2, section D
// table). It must actually write something. There's no admin app yet and no
// dedicated "flag" column on Pickup, so this writes a status_events row —
// same append-only log every other transition in this app writes to, which is
// also exactly where an admin surface would look first. The pickup's status is
// NOT changed: a HOLD is a pricing dead-end for this line, not a lifecycle
// transition, and the nine stages stay locked (D5).
export async function escalateToAdmin(
  pickupId: string,
  itemId: string,
  traceId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return { error: 'Not authenticated.' }

  const admin = createAdminClient()

  const { data: pickup, error: pickupError } = await admin
    .from('pickups')
    .select('id, agent_id, status')
    .eq('id', pickupId)
    .single()
  if (pickupError || !pickup) return { error: 'Job not found.' }
  if (pickup.agent_id !== user.id) return { error: 'This job is not assigned to you.' }

  const { error: eventError } = await admin.from('status_events').insert({
    pickup_id: pickupId,
    // Status unchanged — HOLD doesn't move the lifecycle. Re-inserting the
    // current status keeps the event on this pickup's timeline without
    // implying a transition that didn't happen.
    status: pickup.status,
    actor_id: user.id,
    actor_role: 'agent',
    notes: `HOLD escalated to admin: item ${itemId} (trace ${traceId}) has no profitable pathway at current market rates. Needs manual pricing review before an offer can include it.`,
  })

  if (eventError) {
    console.error('[escalateToAdmin] status_events insert failed:', eventError)
    return { error: eventError.message }
  }

  revalidatePath(`/job/${pickupId}/items/${itemId}/result`)
  return { error: null }
}
