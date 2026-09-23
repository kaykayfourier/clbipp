'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { RecoveryPathway } from '@clbipp/database'
import { isPathwayValue, MIN_PATHWAY_REASON_CHARS, destinationOf } from '@clbipp/core/pathway'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'

import { requireAdmin } from '@/lib/admin-identity'

// ─── setItemPathway (FV5 · FD4) ──────────────────────────────────────────────
// An admin overriding the engine's verdict about where ONE battery goes.
//
// 🔴 THIS IS A ROUTING DECISION, NOT A LIFECYCLE ONE. It writes no
// `PickupStatus`, no `status_events`, and advances nothing — the same posture
// as `resolveException` (Batch 14), and for a sharper reason: those two look
// similar and mean opposite things.
//
//   exception.resolve  — "the engine's FLAG was wrong about this item."
//   item.pathway       — "the engine's VERDICT was wrong", and the battery
//                        physically goes somewhere else as a result.
//
// The consequence is real: `loadManifestBuildStock` refuses to put a
// second-life item on a recycler manifest, so flipping an item to `reuse` here
// removes it from the shippable pool, and flipping it back returns it.
//
// 🔴 A reason is MANDATORY (`isReasonRequired('item.pathway')` is true). It is
// the only record of why a machine decision was set aside, and this particular
// decision is the difference between a battery being reused and being shredded.
const AUDIT_ACTION: AdminAuditAction = 'item.pathway'
const AUDIT_SUBJECT: AdminAuditSubject = 'battery_item'

export type SetPathwayResult = { ok: true } | { ok: false; error: string }

export async function setItemPathway(input: {
  itemId: string
  pathway: string
  reason: string
}): Promise<SetPathwayResult> {
  // 🔴 The write gate. Under AD3 this and src/proxy.ts are the entire access
  // boundary — there is no RLS policy behind them.
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!isPathwayValue(input.pathway)) {
    return { ok: false, error: 'Pick one of the four pathways.' }
  }

  const reason = input.reason.trim()
  if (reason.length < MIN_PATHWAY_REASON_CHARS) {
    return {
      ok: false,
      error: `Give a reason of at least ${MIN_PATHWAY_REASON_CHARS} characters — it is the only record of why the engine's decision was overridden.`,
    }
  }

  const item = await prisma.batteryItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, pickupId: true, pathway: true, pickup: { select: { status: true } } },
  })
  if (!item) return { ok: false, error: 'Item not found.' }

  if (item.pathway === input.pathway) {
    // Idempotent: re-submitting the same verdict is a no-op success rather than
    // a second audit row claiming a change that did not happen.
    return { ok: true }
  }

  // 🔴 Too late to re-route once the battery has left. Past `tested` an item is
  // either on a dispatched manifest or already at a recycler, and changing the
  // label then would describe a journey that did not happen — on a record that
  // feeds a compliance certificate.
  if (item.pickup.status === 'processed' || item.pickup.status === 'recovered' || item.pickup.status === 'certified') {
    return {
      ok: false,
      error: 'This pickup has already been processed. Its pathway is part of the compliance record now and cannot be re-routed.',
    }
  }

  const before = item.pathway

  await prisma.$transaction(async (tx) => {
    await tx.batteryItem.update({
      where: { id: item.id },
      data: {
        pathway: input.pathway as RecoveryPathway,
        // FV2 shipped these columns for exactly this moment. Null in either
        // means "the engine chose this, unattended".
        pathwaySetBy: auth.admin.id,
        pathwayReason: reason,
      },
    })

    await tx.adminAudit.create({
      data: {
        actorId: auth.admin.id,
        action: AUDIT_ACTION,
        subjectType: AUDIT_SUBJECT,
        subjectId: item.id,
        before: { pathway: before, destination: destinationOf(before) },
        after: { pathway: input.pathway, destination: destinationOf(input.pathway) },
        reason,
      },
    })
  })

  revalidatePath(`/pickups/${item.pickupId}`)
  revalidatePath('/lifecycle')
  revalidatePath('/manifests/new')
  return { ok: true }
}
