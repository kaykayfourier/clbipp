'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { classifyEscalation } from '@clbipp/core/exception-classify'

import type { LithiumOutput } from './data'

// ─── escalateToAdmin (HOLD branch, Batch 5a · producer added 2026-08-31) ─────
// The wireframe's "Escalate to admin" button went nowhere (plan §2, section D
// table). It must actually write something. The pickup's status is NOT changed:
// a HOLD is a pricing dead-end for this line, not a lifecycle transition, and
// the nine stages stay locked (D5).
//
// 🔴 This now writes TWO rows, and the second one is the point.
//
//   1. a `status_events` note — the append-only log every other transition in
//      this app writes to, so the escalation shows on the pickup's own timeline
//      in all three apps.
//   2. an `ItemException` row — which is what the ADMIN CONSOLE actually reads.
//
// Until today only (1) existed, and the original comment here said "There's no
// admin app yet". There is now: `/exceptions` (Admin Batch 14) lists
// `ItemException` rows and `resolveException()` closes them, and the dashboard
// counts them. Without (2) an agent could flag a HOLD in the field and it would
// reach none of those — the board had a reader and a resolver but no producer,
// the same shape as the `requested → scheduled` hole Admin Batch 3 closed.
//
// ⚠ Two reasons this uses `prisma.$transaction` rather than the raw
// admin-client pattern most writes in this app use (see job/[id]/actions.ts):
//
//   * The two rows must land together. A note without an exception is an
//     escalation the admin never sees; an exception without a note is one
//     missing from the pickup's timeline.
//   * `item_exceptions.id` is plain `TEXT NOT NULL` with **no database
//     default** — `@default(uuid())` is a Prisma-client-side default, so a
//     service-role insert through the Supabase client would have to mint the id
//     itself. Same trap as `safety_checklists.id` (agent Batch 2). Prisma
//     applies the default; PostgREST does not.
//
// D10 still holds: Prisma connects as the table owner and consults no policy,
// so the in-code `agentId === user.id` scoping below IS the access boundary.

// Prisma's default transaction timeout is 5s. Every other multi-write path in
// the repo sets these after the 8-round-trip / 5.3s measurement against remote
// Supabase (see payment-actions.ts). Three round trips here, but the ceiling is
// set from the start rather than discovered in a demo.
const TX_TIMEOUT_MS = 20_000
const TX_MAX_WAIT_MS = 10_000

// 🔴 The classification is derived server-side from `BatteryItem.quoteData`,
// never passed in from the screen. The button only renders on HOLD, but a
// client-supplied `kind` / `cause` would let any agent's browser file an
// arbitrarily-labelled exception — the same posture as AD9's `supplier_id` and
// AD7's recycler check: the form is not the boundary.
//
// The mapping itself lives in `@clbipp/core/exception-classify` (pure, 13
// tests) because /exceptions renders those `cause` values, so the vocabulary is
// decided in one place rather than in this screen.

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

  // Ownership re-check in code — this is the entire access boundary (D10).
  // Scoped by agentId in the query rather than fetched-then-compared so there
  // is no window between the two.
  const item = await prisma.batteryItem.findFirst({
    where: { id: itemId, pickupId, pickup: { agentId: user.id } },
    select: { id: true, quoteData: true, pickup: { select: { status: true } } },
  })
  if (!item) return { error: 'This item is not on a job assigned to you.' }

  const output = (item.quoteData as { output?: LithiumOutput } | null)?.output
  if (!output) {
    // Nothing to classify from. The result screen redirects to /computing
    // before rendering the button, so this is a direct-call guard, not a path
    // a person reaches.
    return { error: 'This item has not been assessed yet.' }
  }

  const { kind, cause, detail } = classifyEscalation({
    flags: output.decision.flags,
    eligiblePathways: output.decision.eligible_pathways,
    rationale: output.decision.rationale,
    netValue: output.economics?.net_value,
  })

  try {
    await prisma.$transaction(
      async (tx) => {
        // Idempotent on an OPEN exception for this item — "open" is
        // `resolvedAt IS NULL`, there is no open/closed column. A double-tap or
        // a second tab must not put the same item on the board twice, and an
        // item an admin already RESOLVED is allowed to be escalated again: that
        // is a new finding, not a duplicate.
        const alreadyOpen = await tx.itemException.findFirst({
          where: { batteryItemId: itemId, resolvedAt: null },
          select: { id: true },
        })
        if (alreadyOpen) return

        await tx.statusEvent.create({
          data: {
            pickupId,
            // Status unchanged — HOLD doesn't move the lifecycle. Re-inserting
            // the current status keeps the event on this pickup's timeline
            // without implying a transition that didn't happen.
            status: item.pickup.status,
            actorId: user.id,
            actorRole: 'agent',
            notes: `HOLD escalated to admin: item ${itemId} (trace ${traceId}) has no profitable pathway at current market rates. Needs manual pricing review before an offer can include it.`,
          },
        })

        await tx.itemException.create({
          data: { batteryItemId: itemId, kind, cause, detail },
        })
      },
      { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
    )
  } catch (e) {
    console.error('[escalateToAdmin] transaction failed:', e)
    return { error: 'Could not record the escalation. Nothing was saved — try again.' }
  }

  revalidatePath(`/job/${pickupId}/items/${itemId}/result`)
  return { error: null }
}
