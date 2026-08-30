'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'

import { requireAdmin } from '@/lib/admin-identity'

// ─── `collected → tested`, per CustodyBatch ──────────────────────────────────
// Admin Batch 6, owner A — Aamir. The FIRST of the two writes that close the
// second lifecycle hole: before this file, nothing anywhere wrote any stage
// past `collected`, so a real collection could never become a certificate.
//
// 📌 Shape copied from `(admin)/dispatch/actions.ts`, the reference admin
// lifecycle write. Same four rules — session identity, Prisma-as-owner (AD3),
// an in-code re-check standing in for the missing RLS policy, and status +
// status_events written together — plus the admin-only fifth: an `admin_audits`
// row saying who did it (W7).
//
// 🔴 AD5: the UNIT here is the CustodyBatch, not the pickup. One hub drop-off
// is one lorry-load that one hub tested; advancing them one at a time would
// make the trail claim eight separate testing events that never happened.
//
// 🔴 AD5 again, and it is the uncomfortable part: there is NO hub-staff app.
// The admin is recording something on a party's behalf. That is only
// defensible because `actorRole` says `'admin'` — 🔴 NEVER write
// `actorRole: 'recycler'` or `'hub'`. The trail has to say that an admin
// asserted this, not that the hub did.

const AUDIT_ACTION: AdminAuditAction = 'custody.advance'
const AUDIT_SUBJECT: AdminAuditSubject = 'custody_batch'

// ⚠ Trap 23 — a 'use server' file may export ONLY async functions. Anything the
// screens also need is in @/lib/lifecycle-units, never here.

// The transaction below is 4 sequential round trips plus one createMany. Batch
// 4 measured EIGHT at 5.3 s against remote Supabase and the Prisma default is
// 5 s, so these are set explicitly rather than discovered in a demo.
const TX_TIMEOUT_MS = 20_000
const TX_MAX_WAIT_MS = 10_000

export type AdvanceResult = { error: string | null; advanced: number }

/**
 * Advance every pickup in one hub drop-off from `collected` to `tested`.
 *
 * Idempotent by construction, exactly the way `assignPickup` is: `status:
 * 'collected'` inside the guarded `updateMany` WHERE is the race guard, and the
 * pre-read is filtered the same way. A second click finds nothing at
 * `collected` and returns without writing — which is the batch's own done-when
 * ("advancing a custody batch twice writes one event per pickup, not two").
 */
export async function advanceCustodyBatch(batchId: string): Promise<AdvanceResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, advanced: 0 }
  const admin = gate.admin

  const id = batchId.trim()
  if (!id) return { error: 'No custody batch selected.', advanced: 0 }

  const batch = await prisma.custodyBatch.findUnique({
    where: { id },
    select: {
      id: true,
      batchNo: true,
      facility: { select: { name: true } },
    },
  })
  if (!batch) return { error: 'That custody batch does not exist.', advanced: 0 }

  const result = await prisma.$transaction(
    async (tx) => {
      // Which pickups in this batch are actually at `collected`? A seeded batch
      // holds pickups at tested / processed / recovered / certified as well —
      // `DROPPED_OFF` in reset-demo.ts puts everything past `collected` into
      // one — so "every pickup in the batch" is NOT the same set as "every
      // pickup this advances".
      const pending = await tx.pickup.findMany({
        where: { custodyBatchId: id, status: 'collected' },
        select: { id: true },
      })
      if (pending.length === 0) return { advanced: 0, ids: [] as string[] }

      const ids = pending.map((p) => p.id)

      const updated = await tx.pickup.updateMany({
        where: { id: { in: ids }, status: 'collected' },
        data: { status: 'tested' },
      })

      // Lost the whole race to a concurrent submit. Under Postgres READ
      // COMMITTED the second transaction's SELECT above still sees the old
      // snapshot, but this UPDATE blocks on the first one's row locks and then
      // re-evaluates `status = 'collected'` against the committed rows — so it
      // matches nothing and we write no events. Same guard, same reasoning, as
      // assignPickup's `updated.count === 0`.
      //
      // ⚠ A PARTIAL loss (count < ids.length) is not distinguishable here, and
      // it would over-write events for the rows someone else advanced. It
      // cannot arise today: the unit of advance is the whole batch, so two
      // concurrent callers are always advancing the same set, never
      // overlapping subsets. Noted rather than defended against.
      if (updated.count === 0) return { advanced: 0, ids: [] as string[] }

      // One status event PER PICKUP (the batch is the unit of ACTION, not of
      // the audit trail — each pickup's own timeline has to show it reached
      // `tested`). createMany rather than N creates: this is inside the
      // round-trip budget above.
      await tx.statusEvent.createMany({
        data: ids.map((pickupId) => ({
          pickupId,
          status: 'tested' as const,
          actorId: admin.id,
          // 🔴 'admin', never 'recycler' or 'hub'. See the header.
          actorRole: 'admin',
          notes: `Tested at ${batch.facility.name} — hub batch ${batch.batchNo}.`,
        })),
      })

      // ONE audit row for the whole batch: one admin, one assertion, one click.
      await tx.adminAudit.create({
        data: {
          actorId: admin.id,
          action: AUDIT_ACTION,
          subjectType: AUDIT_SUBJECT,
          subjectId: id,
          before: { status: 'collected', pickupIds: ids },
          after: { status: 'tested', pickupIds: ids },
          // `reason` omitted — isReasonRequired('custody.advance') is false.
          // This is the normal path. Batch 7's lifecycle.override is the one
          // that has to justify itself.
        },
      })

      return { advanced: updated.count, ids }
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )

  if (result.advanced === 0) {
    return {
      error: 'Nothing in this batch is waiting at collected — it has already been tested.',
      advanced: 0,
    }
  }

  return { error: null, advanced: result.advanced }
}

/**
 * The form action behind the Advance button. POST, not a link — the customer
 * app shipped `acceptOffer` as a GET until Batch 12 and link prefetchers
 * advanced the lifecycle. Redirect-after-POST also means a refresh re-renders
 * instead of re-submitting.
 */
export async function advanceCustodyBatchAction(formData: FormData) {
  const batchId = String(formData.get('batchId') ?? '')
  if (!batchId) redirect('/lifecycle')

  const { error, advanced } = await advanceCustodyBatch(batchId)

  if (error) redirect(`/lifecycle?error=${encodeURIComponent(error)}`)

  // Every screen that counts stock or stages moved. `/manifests/new` is the
  // one that matters most: those pickups only became shippable just now.
  revalidatePath('/lifecycle')
  revalidatePath('/manifests/new')
  revalidatePath('/pickups')
  revalidatePath('/inventory')

  redirect(`/lifecycle?advanced=${advanced}`)
}
