import 'server-only'

import { prisma } from '@clbipp/database'
import type { BatteryCategory, BatteryType, ManifestStatus } from '@clbipp/database'

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
export async function loadItemManifestIndex(): Promise<Map<string, ItemManifestRef>> {
  const manifests = await prisma.dispatchManifest.findMany({
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
