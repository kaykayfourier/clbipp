import 'server-only'

import { prisma } from '@clbipp/database'

// ─── Facility stock — derived, not counted ───────────────────────────────────
// Batch 10's own trap: "Stock is derived from CustodyBatch + item state, not a
// stored counter. Dwell alerts compute off handedOffAt." Shared between E03
// (/facilities, which only needs the total for a capacity gauge) and C01
// (/inventory, which needs the full per-chemistry, per-item breakdown) so the
// two screens can never quietly disagree about what "on hand" means.
//
// There is no per-item status column (AD6) and no stock counter anywhere in
// the schema — deliberately (§3's "not added"). An item counts as on-hand
// stock at a facility if:
//   1. its pickup has a CustodyBatch pointing at that facility (it arrived), and
//   2. its id is NOT inside the itemIds snapshot of any manifest that has
//      actually left — 'dispatched', 'received', or 'reconciled'. A 'draft'
//      manifest is just an admin building a shipment; nothing has physically
//      moved yet, so those items are still on hand (Batch 6/7's own language:
//      dispatch is "it left the building", and draft is before that).
//
// Dwell is time since the item's CustodyBatch.handedOffAt — when it physically
// arrived at the facility — never since the pickup was created or collected.

export interface StockItem {
  itemId: string
  pickupId: string
  chemistry: string | null
  weightKg: number
  facilityId: string
  handedOffAt: Date
}

export async function computeFacilityStock(): Promise<StockItem[]> {
  const [custodyBatches, shippedManifests] = await Promise.all([
    prisma.custodyBatch.findMany({
      select: { id: true, facilityId: true, handedOffAt: true },
    }),
    prisma.dispatchManifest.findMany({
      where: { status: { in: ['dispatched', 'received', 'reconciled'] } },
      select: { itemIds: true },
    }),
  ])

  const shippedItemIds = new Set<string>()
  for (const m of shippedManifests) {
    // Json column — an immutable snapshot of BatteryItem ids (schema comment
    // on DispatchManifest.itemIds). Defensive Array.isArray: a malformed row
    // should not crash this screen, just under-count that one manifest.
    const ids = Array.isArray(m.itemIds) ? (m.itemIds as unknown[]) : []
    for (const id of ids) if (typeof id === 'string') shippedItemIds.add(id)
  }

  const batchById = new Map(custodyBatches.map((b) => [b.id, b]))
  const batchIds = custodyBatches.map((b) => b.id)
  if (batchIds.length === 0) return []

  const pickups = await prisma.pickup.findMany({
    where: { custodyBatchId: { in: batchIds } },
    select: {
      id: true,
      custodyBatchId: true,
      items: { select: { id: true, chemistry: true, weightKg: true, confirmedWeightKg: true } },
    },
  })

  const stock: StockItem[] = []
  for (const pickup of pickups) {
    const batch = pickup.custodyBatchId ? batchById.get(pickup.custodyBatchId) : undefined
    if (!batch) continue
    for (const item of pickup.items) {
      if (shippedItemIds.has(item.id)) continue // left the building already
      stock.push({
        itemId: item.id,
        pickupId: pickup.id,
        chemistry: item.chemistry,
        weightKg: Number(item.confirmedWeightKg ?? item.weightKg ?? 0),
        facilityId: batch.facilityId,
        handedOffAt: batch.handedOffAt,
      })
    }
  }

  return stock
}
