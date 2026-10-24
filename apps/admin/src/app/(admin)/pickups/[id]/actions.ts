'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { RecoveryPathway } from '@clbipp/database'
import { isPathwayValue, MIN_PATHWAY_REASON_CHARS, destinationOf } from '@clbipp/core/pathway'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'
import { checkOfficePrice, parsePriceRupees, recommendedOfferTotal } from '@clbipp/core'
import { formatPaise } from '@clbipp/core/format'

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

// ─── setOfficePrice (AF5 · FD23) ─────────────────────────────────────────────
// The office's price for a pickup — the ONLY way a price other than the
// engine's recommendation now enters an offer (the agent's typed "Agreed price"
// is gone). The admin sees the recommendation on the Price panel, enters an
// amount and a reason; their name is the session.
//
// 🔴 It does NOT touch the Offer. It appends an `office_prices` row and tells
// the agent (agent_notices); the agent's offer screen picks it up by itself and
// the AGENT presents it (presentOffer / reofferPrice), which is what records
// the acknowledgement. So the vendor never sees a price the agent standing in
// front of them has not seen first.
//
// Allowed while there is a price to set: `arrived` with every line priced
// (before the first offer), or `offered` and not accepted (FD7 — an accepted
// price is fixed). A reason is required (`isReasonRequired('price.office_set')`).
const PRICE_ACTION: AdminAuditAction = 'price.office_set'
const PRICE_SUBJECT: AdminAuditSubject = 'pickup'
const MIN_OFFICE_REASON_CHARS = 8

export async function setOfficePrice(input: {
  pickupId: string
  rupees: string
  reason: string
}): Promise<{ error: string | null }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: auth.error }

  const reason = input.reason.trim().slice(0, 500)
  if (reason.length < MIN_OFFICE_REASON_CHARS) {
    return { error: `Give a reason of at least ${MIN_OFFICE_REASON_CHARS} characters — the agent reads it.` }
  }
  const parsed = parsePriceRupees(input.rupees)
  if (parsed.error !== null) return { error: parsed.error }

  const pickup = await prisma.pickup.findUnique({
    where: { id: input.pickupId },
    select: {
      id: true,
      status: true,
      agentId: true,
      offer: { select: { estimatedPrice: true, acceptedAt: true } },
      items: { select: { id: true, chemistry: true, unitPricePaise: true, linePricePaise: true, quoteData: true } },
    },
  })
  if (!pickup) return { error: 'That pickup does not exist.' }
  const rec = recommendedOfferTotal(pickup.items)
  const open =
    (pickup.status === 'arrived' && rec.canPresent) ||
    (pickup.status === 'offered' && pickup.offer !== null && pickup.offer.acceptedAt === null)
  if (!open) {
    return {
      error:
        pickup.status === 'offered'
          ? 'The vendor has accepted. That price is fixed.'
          : pickup.status === 'arrived'
            ? 'The agent has not priced every line yet.'
            : 'A price can be set only while the agent is on site or the offer is waiting for the vendor.',
    }
  }
  const bound = checkOfficePrice({ pricePaise: parsed.paise, enginePaise: rec.totalPaise })
  if (bound) return { error: bound }
  if (pickup.offer && pickup.status === 'offered' && pickup.offer.estimatedPrice === parsed.paise) {
    return { error: 'That is the price the vendor already has.' }
  }

  await prisma.$transaction(
    async (tx) => {
      const row = await tx.officePrice.create({
        data: {
          pickupId: pickup.id,
          enginePaise: rec.totalPaise,
          previousPaise: pickup.status === 'offered' ? (pickup.offer?.estimatedPrice ?? null) : null,
          pricePaise: parsed.paise,
          reason,
          setBy: auth.admin.id,
        },
      })
      await tx.adminAudit.create({
        data: {
          actorId: auth.admin.id,
          action: PRICE_ACTION,
          subjectType: PRICE_SUBJECT,
          subjectId: pickup.id,
          before: { offerPaise: pickup.offer?.estimatedPrice ?? null, enginePaise: rec.totalPaise },
          after: { officePriceId: row.id, pricePaise: parsed.paise },
          reason,
        },
      })
      if (pickup.agentId) {
        await tx.agentNotice.create({
          data: {
            agentId: pickup.agentId,
            pickupId: pickup.id,
            kind: 'office_price_set',
            message: `The office set ${formatPaise(parsed.paise)} for ${pickup.id}. Present it from the offer screen.`,
          },
        })
      }
    },
    { timeout: 20_000, maxWait: 10_000 },
  )

  revalidatePath(`/pickups/${pickup.id}`)
  revalidatePath('/audit')
  return { error: null }
}

export async function setOfficePriceAction(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  if (!pickupId) redirect('/pickups')
  const { error } = await setOfficePrice({
    pickupId,
    rupees: String(formData.get('rupees') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  })
  const href = `/pickups/${encodeURIComponent(pickupId)}`
  if (error) redirect(`${href}?error=${encodeURIComponent(error)}`)
  redirect(`${href}?price=set`)
}

