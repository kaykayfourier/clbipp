import 'server-only'

import { Prisma, prisma } from '@clbipp/database'
import type { BatteryCategory, BatteryType, ManifestStatus, PickupStatus } from '@clbipp/database'
import { LIFECYCLE_STAGES, isLifecycleStage } from '@clbipp/ui'
import type { LifecycleStage } from '@clbipp/ui'

// ─── AD5's "unit of advance", expressed once ─────────────────────────────────
// Admin Batch 6, owner A — Aamir. Shared by `/lifecycle`, the three
// `/manifests` screens and their actions, and 🔴 by Batch 7 — which is why the
// AD6 coverage machinery lives here and not inside a screen.
//
// AD5: the unit of advance differs by stage, because the ACTOR differs.
//
//   collected → tested                per CustodyBatch   (one hub drop-off)
//   tested → processed → recovered    per DispatchManifest, and only on a
//                                     CONFIRMED one (Batch 7)
//   recovered → certified             per Pickup, and it mints the Certificate
//
// 🔴 AD6 is the rule that makes the middle row correct: a pickup advances only
// when EVERY one of its BatteryItems is covered. Chemistry segregation sends
// one pickup's items to different recyclers on different manifests (seed
// fixture 4, PKP-2026-000113), so "advance the pickups on this manifest" is
// WRONG — it would advance a pickup half of whose load is still at the hub.
// `pickupCoverage()` below is the shape that gets it right; Batch 7's
// confirm/reconcile actions gate on it, and Batch 6 renders it so an admin can
// SEE why a pickup is not ready.
//
// There is deliberately no per-item status column (AD6), so every "where is
// this item?" answer is derived from the manifest snapshots.

/**
 * Manifest statuses in the order they actually happen. 🔴 This is NOT a second
 * copy of the pickup lifecycle (trap 13 forbids that) — it is `ManifestStatus`,
 * a different, four-value enum, and `@clbipp/ui` has no equivalent list for it.
 */
export const MANIFEST_PROGRESSION: readonly ManifestStatus[] = [
  'draft',
  'dispatched',
  'received',
  'reconciled',
]

/** Is `status` at or past `floor` on the manifest progression? */
export function isManifestAtOrPast(status: ManifestStatus, floor: ManifestStatus): boolean {
  return MANIFEST_PROGRESSION.indexOf(status) >= MANIFEST_PROGRESSION.indexOf(floor)
}

export const MANIFEST_STATUS_LABELS: Record<ManifestStatus, string> = {
  draft: 'Draft',
  dispatched: 'Dispatched',
  received: 'Received',
  reconciled: 'Reconciled',
}

/** Where one BatteryItem currently sits, as far as the manifest snapshots know. */
export interface ItemManifestRef {
  manifestId: string
  manifestNo: string
  status: ManifestStatus
  recyclerName: string
}

/**
 * itemId → the FURTHEST-PROGRESSED manifest carrying it.
 *
 * `DispatchManifest.itemIds` is a Json snapshot, not a join table (the schema
 * comment says why: a dispatched manifest is immutable), so there is no
 * queryable edge from an item back to its manifest. This builds that index in
 * one read.
 *
 * ⚠ "Furthest-progressed" rather than "the one manifest": nothing in the schema
 * stops an item id appearing on two manifests, and a draft built by mistake
 * next to a real dispatched one must not be what an AD6 check sees.
 * `createManifest` refuses to build that situation in the first place; this is
 * the belt to its braces.
 */
export async function loadItemManifestIndex(
  /**
   * 🔴 Pass the TRANSACTION CLIENT when calling this from inside a
   * `$transaction`. Batch 7's confirm/reconcile update the manifest's own
   * status and then ask "is this pickup covered now?" — the default `prisma`
   * client is a different connection and cannot see that uncommitted UPDATE, so
   * it would answer against the manifest's OLD status and refuse to advance
   * anything. That failure is silent and looks exactly like AD6 working.
   */
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Map<string, ItemManifestRef>> {
  const manifests = await client.dispatchManifest.findMany({
    select: {
      id: true,
      manifestNo: true,
      status: true,
      itemIds: true,
      recycler: { select: { name: true } },
    },
  })

  const index = new Map<string, ItemManifestRef>()
  for (const m of manifests) {
    // Defensive Array.isArray, same reasoning as computeFacilityStock's: a
    // malformed row should under-count one manifest, not crash the screen.
    const ids = Array.isArray(m.itemIds) ? (m.itemIds as unknown[]) : []
    for (const raw of ids) {
      if (typeof raw !== 'string') continue
      const existing = index.get(raw)
      if (existing && isManifestAtOrPast(existing.status, m.status)) continue
      index.set(raw, {
        manifestId: m.id,
        manifestNo: m.manifestNo,
        status: m.status,
        recyclerName: m.recycler.name,
      })
    }
  }
  return index
}

/** One pickup's items, answered against a manifest floor. */
export interface PickupCoverage {
  pickupId: string
  /** Every item on the pickup, with where it currently is. */
  items: Array<{ itemId: string; chemistry: BatteryType | null; at: ItemManifestRef | null }>
  /** Items NOT yet covered to the requested floor — the reason it cannot advance. */
  uncovered: Array<{ itemId: string; chemistry: BatteryType | null; at: ItemManifestRef | null }>
  /** 🔴 AD6. True only when EVERY item is on a manifest at or past `floor`. */
  covered: boolean
}

/**
 * 🔴 THE AD6 QUERY. Batch 7's `confirmManifestReceived` and `reconcileManifest`
 * both gate on this, and `/lifecycle` renders it.
 *
 * `floor` is the manifest state the caller is asserting: `'received'` for
 * `tested → processed`, `'reconciled'` for `processed → recovered`.
 *
 * Pure given its inputs — the caller supplies the items and the index — so it
 * is callable from inside a `$transaction` without opening a second connection.
 */
export function pickupCoverage(
  pickupId: string,
  items: readonly { id: string; chemistry: BatteryType | null }[],
  index: Map<string, ItemManifestRef>,
  floor: ManifestStatus,
): PickupCoverage {
  const mapped = items.map((item) => ({
    itemId: item.id,
    chemistry: item.chemistry,
    at: index.get(item.id) ?? null,
  }))

  const uncovered = mapped.filter((i) => !i.at || !isManifestAtOrPast(i.at.status, floor))

  return {
    pickupId,
    items: mapped,
    uncovered,
    // A pickup with NO items cannot be "covered" — that would advance an empty
    // shell through the chain of custody on the strength of nothing.
    covered: mapped.length > 0 && uncovered.length === 0,
  }
}

// ─── Buildable stock: what `/manifests/new` is allowed to offer ──────────────

export interface BuildableItem {
  itemId: string
  pickupId: string
  vendorName: string
  chemistry: BatteryType | null
  category: BatteryCategory
  quantity: number
  weightKg: number
  facilityId: string
  facilityName: string
  handedOffAt: Date
}

/**
 * Items that may go onto a NEW manifest: at a facility, on a pickup that has
 * reached `tested`, and not already on ANY manifest.
 *
 * ⚠ This is deliberately a NARROWER rule than `computeFacilityStock()` in
 * `@/lib/facility-stock`, and the two are both right for their own screen:
 *
 *   - `/inventory` and `/facilities` ask "what is physically on hand?", so a
 *     `draft` manifest does not remove an item — nothing has moved yet. That
 *     helper's header says so explicitly.
 *   - `/manifests/new` asks "what may I ship?", and an item already sitting on
 *     someone's draft is spoken for. Offering it again lets two drafts claim
 *     one battery, and dispatching both would ship it twice.
 *
 * So this excludes drafts too, and it adds the `tested` floor that a stock
 * count has no reason to care about. Do not "unify" them — the divergence is
 * the point, and each file states its own rule.
 */
export async function loadManifestBuildStock(): Promise<BuildableItem[]> {
  const [batches, manifests] = await Promise.all([
    prisma.custodyBatch.findMany({
      select: {
        id: true,
        facilityId: true,
        handedOffAt: true,
        facility: { select: { name: true } },
      },
    }),
    // EVERY manifest, drafts included — see the note above.
    prisma.dispatchManifest.findMany({ select: { itemIds: true } }),
  ])

  if (batches.length === 0) return []

  const claimed = new Set<string>()
  for (const m of manifests) {
    const ids = Array.isArray(m.itemIds) ? (m.itemIds as unknown[]) : []
    for (const id of ids) if (typeof id === 'string') claimed.add(id)
  }

  const batchById = new Map(batches.map((b) => [b.id, b]))

  const pickups = await prisma.pickup.findMany({
    // 🔴 The `tested` floor lives here, on the PICKUP, because there is no
    // per-item status column (AD6). An item is shippable when its pickup has
    // been tested at the hub — which is exactly what advanceCustodyBatch wrote.
    where: { status: 'tested', custodyBatchId: { in: batches.map((b) => b.id) } },
    select: {
      id: true,
      custodyBatchId: true,
      vendor: { select: { fullName: true, companyName: true } },
      items: {
        select: {
          id: true,
          chemistry: true,
          category: true,
          quantity: true,
          weightKg: true,
          confirmedWeightKg: true,
        },
      },
    },
  })

  const stock: BuildableItem[] = []
  for (const pickup of pickups) {
    const batch = pickup.custodyBatchId ? batchById.get(pickup.custodyBatchId) : undefined
    if (!batch) continue
    for (const item of pickup.items) {
      if (claimed.has(item.id)) continue
      stock.push({
        itemId: item.id,
        pickupId: pickup.id,
        vendorName: pickup.vendor.companyName || pickup.vendor.fullName,
        chemistry: item.chemistry,
        category: item.category,
        quantity: item.quantity,
        // The agent's confirmed weight wins over the customer's declaration —
        // the same precedence computeFacilityStock and the certificate payload
        // builder use. `weightKg` is the TOTAL for the line, not per unit.
        weightKg: Number(item.confirmedWeightKg ?? item.weightKg ?? 0),
        facilityId: batch.facilityId,
        facilityName: batch.facility.name,
        handedOffAt: batch.handedOffAt,
      })
    }
  }

  return stock
}

// ─── Batch 7: recovered mass, the one-step guard, and the AD6-gated advance ──
// Admin Batch 7, owner A — Aamir. Everything below is what turns a CONFIRMED
// manifest into a pickup that has actually moved.

/**
 * The metals the reconcile form collects. Not an enum and not a constraint —
 * `recovery_data` is untyped jsonb precisely so an unexpected metal can be
 * recorded — this is the list the FORM renders, so an admin does not free-type
 * "nickle" next to "Nickel" and split one line into two on the certificate.
 *
 * Chosen to match what the seed's `materialSummary` and the engine's
 * `materialBreakdown` already name, so `aggregateMaterials()` folds a measured
 * line and an estimated line of the same metal together rather than listing
 * both. 🔴 Renaming one of these does not migrate the rows already written.
 */
export const RECOVERY_METALS = ['Nickel', 'Cobalt', 'Lithium', 'Copper', 'Lead', 'Manganese', 'Aluminium', 'Steel'] as const
export type RecoveryMetal = (typeof RECOVERY_METALS)[number]

/** One line of `DispatchManifest.recoveryData`. Stable keys — shared with
 *  `Certificate.materialSummary`, which is what lets `aggregateMaterials()`
 *  read both. 🔴 NOT `weight_kg`; that is `Offer.materialBreakdown`'s key, and
 *  confusing the two is the defect Batch 7 found in buildCertificatePayload. */
export interface RecoveryLine {
  material: string
  recovered_kg: number
}

/** Read `recoveryData` back out of the column. Defensive for the usual reason:
 *  a malformed row should render as "no figures", not throw on a detail page. */
export function parseRecoveryData(raw: unknown): RecoveryLine[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { material, recovered_kg } = entry as Record<string, unknown>
    if (typeof material !== 'string' || material.length === 0) return []
    const kg = Number(recovered_kg)
    if (!Number.isFinite(kg) || kg <= 0) return []
    return [{ material, recovered_kg: Math.round(kg * 100) / 100 }]
  })
}

// ─── The one-step-forward guard (Batch 7 step 6, trap 13) ────────────────────

/**
 * The stage after `stage`, or null at the end of the line.
 *
 * 🔴 Derived from `LIFECYCLE_STAGES` in `@clbipp/ui`, never from a local list
 * (trap 13). There is one source of truth per layer and they must agree; a
 * tenth stage added there has to reach this file for free.
 */
export function nextLifecycleStage(stage: string): LifecycleStage | null {
  if (!isLifecycleStage(stage)) return null
  const i = LIFECYCLE_STAGES.indexOf(stage)
  return i >= 0 && i < LIFECYCLE_STAGES.length - 1 ? LIFECYCLE_STAGES[i + 1] : null
}

/**
 * 🔴 Batch 7 step 6: EVERY advance in this app validates one step forward.
 * No skipping (`tested → certified` would issue a compliance document for
 * batteries nobody confirmed a recycler ever received) and no reversing (the
 * lifecycle is a claim trail, not a state machine you can rewind).
 *
 * ⚠ `cancelled` is deliberately not reachable through this. It is re-enterable
 * (trap 11) and sits outside `LIFECYCLE_STAGES` entirely, so `isLifecycleStage`
 * rejects it and every caller here refuses — cancelling and reactivating are
 * the customer app's writes, not this console's.
 */
export function isOneStepForward(from: string, to: string): boolean {
  return nextLifecycleStage(from) === to
}

// ─── The AD6-gated advance, shared by confirm and reconcile ──────────────────

export interface AdvancedPickup {
  pickupId: string
  itemCount: number
}

export interface HeldPickup {
  pickupId: string
  status: PickupStatus
  /** How many of its items are still short of `floor` — the reason it is held. */
  uncovered: number
  itemCount: number
}

export interface CoveredAdvanceResult {
  advanced: AdvancedPickup[]
  held: HeldPickup[]
}

/**
 * 🔴 THE AD6 GATE, APPLIED. This is the function Batch 7 exists to get right.
 *
 * Given a manifest that has just moved to `floor`, advance `from → to` exactly
 * those pickups EVERY one of whose items now sits on a manifest at or past
 * `floor` — and leave the rest alone, with a reason.
 *
 * The obvious implementation ("advance the pickups on this manifest") is WRONG
 * and this is the whole point of the batch. Chemistry segregation sends one
 * pickup's items to different recyclers on different manifests: seed fixture 4,
 * `PKP-2026-000113`, has its li-ion item on one manifest and its lead-acid item
 * on another. Confirming the first must NOT advance it — half its load is still
 * at the hub, and saying otherwise puts a false statement in a chain of custody.
 *
 * 🔴 MUST be called inside the same `$transaction` that moved the manifest, and
 * with that transaction's client, or the index it builds cannot see the move.
 *
 * Four round trips (index · touched pickups · updateMany · createMany). With the
 * caller's own manifest update and audit row that is SIX — inside the eight
 * measured at 5.3 s in Batch 4. Do not add a fifth read here without checking
 * that budget again.
 */
export async function advanceCoveredPickups(
  tx: Prisma.TransactionClient,
  input: {
    /** The manifest's item-id snapshot. Passed in rather than re-read: the
     *  caller already has it, and re-reading costs a round trip for nothing. */
    snapshotIds: readonly string[]
    /** The manifest state being asserted: `'received'` or `'reconciled'`. */
    floor: ManifestStatus
    from: LifecycleStage
    to: LifecycleStage
    actorId: string
    /** The `status_events.notes` line, per pickup. */
    note: (pickupId: string) => string
  },
): Promise<CoveredAdvanceResult> {
  // Step 6's guard, applied to the caller's own arguments rather than trusted.
  // A future edit that passes `tested → recovered` should fail loudly here, not
  // quietly skip a stage on a compliance trail.
  if (!isOneStepForward(input.from, input.to)) {
    throw new Error(
      `Refusing to advance ${input.from} → ${input.to}: not one step forward on LIFECYCLE_STAGES.`,
    )
  }

  if (input.snapshotIds.length === 0) return { advanced: [], held: [] }

  const index = await loadItemManifestIndex(tx)

  // Every pickup this manifest touches, WITH ALL OF ITS ITEMS — including the
  // ones that are not on this manifest. That "including" is AD6: the question
  // is never "did this manifest carry the pickup?", it is "is every item of the
  // pickup accounted for?". One query rather than items→pickupIds→pickups,
  // which keeps this inside the round-trip budget above.
  const touched = await tx.pickup.findMany({
    where: { items: { some: { id: { in: [...input.snapshotIds] } } } },
    select: {
      id: true,
      status: true,
      items: { select: { id: true, chemistry: true } },
    },
  })

  const advanced: AdvancedPickup[] = []
  const held: HeldPickup[] = []

  for (const pickup of touched) {
    const coverage = pickupCoverage(pickup.id, pickup.items, index, input.floor)
    // Only pickups actually sitting at `from` are candidates. One already past
    // it is not "held" — it is finished, and reporting it would make a correct
    // confirmation read like a partial failure.
    if (pickup.status !== input.from) continue
    if (coverage.covered) {
      advanced.push({ pickupId: pickup.id, itemCount: pickup.items.length })
    } else {
      held.push({
        pickupId: pickup.id,
        status: pickup.status,
        uncovered: coverage.uncovered.length,
        itemCount: pickup.items.length,
      })
    }
  }

  if (advanced.length === 0) return { advanced: [], held }

  const ids = advanced.map((a) => a.pickupId)

  // Guarded on `status: from` for the same reason every other write in this app
  // is: a concurrent caller may have advanced these between the read above and
  // this UPDATE, and the WHERE re-evaluates against committed rows.
  const updated = await tx.pickup.updateMany({
    where: { id: { in: ids }, status: input.from },
    data: { status: input.to },
  })
  if (updated.count === 0) return { advanced: [], held }

  await tx.statusEvent.createMany({
    data: ids.map((pickupId) => ({
      pickupId,
      status: input.to,
      actorId: input.actorId,
      // 🔴 'admin', NEVER 'recycler'. There is no recycler portal; this is an
      // admin recording something on a party's behalf, and the trail has to say
      // so (AD5). Writing 'recycler' would be a fabricated attestation.
      actorRole: 'admin' as const,
      notes: input.note(pickupId),
    })),
  })

  return { advanced, held }
}
