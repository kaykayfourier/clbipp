// ─── Certificate payload builder ─────────────────────────────────────────────
// Pure in the sense that matters: it READS the database, builds the payload,
// and returns it. It writes nothing. Admin Batch 7's `certifyPickup` calls it,
// creates the Certificate row from what comes back, and leaves the PDF to be
// rendered lazily on first download (apps/customer/src/lib/documents.ts).
// Keeping the read separate from the write makes both testable.
//
// 🔴 WHERE THE MATERIAL NUMBERS COME FROM, and why it is not one source.
//
// A certificate is a COMPLIANCE document. It should state what was actually
// recovered, not what we predicted at quote time — so this prefers, in order:
//
//   1. `DispatchManifest.recoveryData` on every RECONCILED manifest carrying
//      this pickup's items. Measured, by the recycler, after the batteries were
//      opened. Added by the `manifest_recovery_data` migration (Batch 7).
//   2. `Offer.materialBreakdown` — the ESTIMATE the decision engine made before
//      anything was opened. Only reached when no covering manifest was ever
//      reconciled, which today means a back-filled seed row.
//
// `materialSource` says which one was used, so a caller can record it and a
// screen can be honest about it. 🔴 Do not collapse the two: presenting an
// engine estimate as a measured recovery on a compliance document is the exact
// failure this distinction exists to prevent.
//
// ⚠ A manifest carries items from SEVERAL pickups and `recoveryData` is for the
// whole load, so each line is PRO-RATED by this pickup's share of the manifest
// weight. That is an allocation, not a measurement — see the note on
// `prorate()` below.

import { prisma } from '@clbipp/database'
import { co2eAvoidedKg, aggregateMaterials } from './impact'

export interface CertificatePayload {
  pickupId: string
  vendorId: string
  totalWeightKg: number
  materialSummary: Array<{ material: string; recovered_kg: number }>
  co2AvoidedKg: number
  /**
   * `measured` — from at least one reconciled manifest's `recoveryData`.
   * `estimated` — fell back to the offer's engine breakdown.
   * `none` — neither existed; the certificate carries weight and CO₂e only.
   *
   * 🔴 Recorded on the `pickup.certify` audit row. A certificate that says
   * `estimated` is defensible; one that silently pretends is not.
   */
  materialSource: 'measured' | 'estimated' | 'none'
}

/** The weight one BatteryItem contributes. The agent's confirmed figure wins
 *  over the customer's declaration, the same precedence `loadManifestBuildStock`
 *  and `computeFacilityStock` use. `weightKg` is the TOTAL for the line. */
function itemWeight(item: { confirmedWeightKg: unknown; weightKg: unknown }): number {
  const n = Number(item.confirmedWeightKg ?? item.weightKg ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** A `DispatchManifest.itemIds` / `recoveryData` Json blob → a string array.
 *  Defensive rather than trusting the column: a malformed row should cost one
 *  manifest's contribution, not crash a certification. */
function stringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string')
}

/**
 * Scale one manifest's `recoveryData` down to this pickup's share of the load.
 *
 * ⚠ This is an ALLOCATION and it is worth being clear-eyed about it: a recycler
 * reports "this lorry-load yielded 41 kg of nickel", not "your customer's four
 * batteries yielded 6.2 kg of it". Splitting by mass share is the only division
 * the data supports, and it is the same convention the CPCB return uses when a
 * consignment is aggregated. It is exactly right when a manifest holds one
 * pickup (the common case, share = 1) and an approximation otherwise.
 *
 * 🟠 If the company later wants per-consignor assay figures, that is a richer
 * `recoveryData` shape keyed by pickup — a change in this one function plus the
 * reconcile form, not a redesign.
 */
function prorate(
  lines: Array<{ material: string; recovered_kg: number }>,
  share: number,
): Array<{ material: string; recovered_kg: number }> {
  return lines.map((l) => ({ material: l.material, recovered_kg: l.recovered_kg * share }))
}

export async function buildCertificatePayload(
  pickupId: string,
): Promise<CertificatePayload> {
  const pickup = await prisma.pickup.findUniqueOrThrow({
    where: { id: pickupId },
    select: {
      vendorId: true,
      items: {
        select: {
          id: true,
          confirmedWeightKg: true,
          weightKg: true,
          chemistry: true,
          category: true,
        },
      },
      offer: {
        select: {
          materialBreakdown: true,
        },
      },
    },
  })

  const items = pickup.items.map((item) => ({
    id: item.id,
    weightKg: itemWeight(item),
    category: item.category,
    chemistry: item.chemistry,
  }))

  const totalWeightKg =
    Math.round(items.reduce((sum, i) => sum + i.weightKg, 0) * 10) / 10

  // 🔴 Never CO₂ arithmetic outside impact.ts. This is the one call.
  const co2AvoidedKg = co2eAvoidedKg(items)

  // ── 1. Measured recovery, from every reconciled manifest that carried a
  //       piece of this pickup ─────────────────────────────────────────────
  const ourItemIds = new Set(items.map((i) => i.id))

  // Filtered in JS rather than by a Json containment query: `item_ids` is an
  // untyped Json array with no GIN index behind it, and the manifest table is
  // demo-sized. If it ever is not, this is the read to index, not to inline.
  // ⚠ No `recoveryData: { not: null }` filter, deliberately. `recovery_data` is
  // a `Json?` column, and Prisma distinguishes SQL NULL (`Prisma.DbNull`) from
  // the JSON value `null` (`Prisma.JsonNull`) — a bare `null` there is a type
  // error, not a filter (trap 21). Rows with no figures are dropped below by
  // `lines.length === 0` instead, which also catches a malformed blob that a
  // NOT NULL check would have let through.
  const reconciled = await prisma.dispatchManifest.findMany({
    where: { status: 'reconciled' },
    select: { id: true, itemIds: true, recoveryData: true },
  })

  const covering = reconciled
    .map((m) => ({ ...m, ids: stringIds(m.itemIds) }))
    .filter((m) => m.ids.some((id) => ourItemIds.has(id)))

  const measured: Array<Array<{ material: string; recovered_kg: number }>> = []

  if (covering.length > 0) {
    // One read for every item on every covering manifest, so the numerator and
    // the denominator of each share are computed from the SAME figures. Reusing
    // `DispatchManifest.totalWeightKg` for the denominator would mix a value
    // frozen at creation with live item weights.
    const allIds = [...new Set(covering.flatMap((m) => m.ids))]
    const rows = await prisma.batteryItem.findMany({
      where: { id: { in: allIds } },
      select: { id: true, confirmedWeightKg: true, weightKg: true },
    })
    const weightById = new Map(rows.map((r) => [r.id, itemWeight(r)]))

    for (const m of covering) {
      const loadKg = m.ids.reduce((sum, id) => sum + (weightById.get(id) ?? 0), 0)
      const oursKg = m.ids.reduce(
        (sum, id) => sum + (ourItemIds.has(id) ? (weightById.get(id) ?? 0) : 0),
        0,
      )
      // A zero-weight load cannot be divided. Skipping it loses one manifest's
      // contribution; dividing by it would produce Infinity on a compliance
      // document.
      if (loadKg <= 0) continue

      const lines = aggregateMaterials([m.recoveryData]).map((x) => ({
        material: x.material,
        recovered_kg: x.kg,
      }))
      if (lines.length === 0) continue

      measured.push(prorate(lines, Math.min(oursKg / loadKg, 1)))
    }
  }

  if (measured.length > 0) {
    return {
      pickupId,
      vendorId: pickup.vendorId,
      totalWeightKg,
      materialSummary: aggregateMaterials(measured).map((m) => ({
        material: m.material,
        recovered_kg: m.kg,
      })),
      co2AvoidedKg,
      materialSource: 'measured',
    }
  }

  // ── 2. Fall back to the offer's engine estimate ───────────────────────────
  //
  // 🔴 THE KEY IS `weight_kg` HERE, NOT `recovered_kg`. `Offer.materialBreakdown`
  // writes `{ material, weight_kg }` (see reset-demo.ts and packages/core/offer)
  // while `Certificate.materialSummary` — and therefore `aggregateMaterials` —
  // reads `{ material, recovered_kg }`. Feeding the offer blob straight into
  // `aggregateMaterials` silently yields an EMPTY list, which is how this file
  // shipped before Admin Batch 7: every certificate it minted would have had a
  // blank materials table on the vendor's EPR PDF, with nothing throwing.
  // Map the key explicitly; do not "simplify" this back into one call.
  const estimate = Array.isArray(pickup.offer?.materialBreakdown)
    ? (pickup.offer.materialBreakdown as unknown[]).flatMap((raw) => {
        if (typeof raw !== 'object' || raw === null) return []
        const { material, weight_kg, recovered_kg } = raw as Record<string, unknown>
        if (typeof material !== 'string' || material.length === 0) return []
        // Accept either key: an offer written by a future engine version may
        // already speak the certificate's dialect.
        const kg = Number(recovered_kg ?? weight_kg)
        if (!Number.isFinite(kg) || kg <= 0) return []
        return [{ material, recovered_kg: kg }]
      })
    : []

  const materialSummary = aggregateMaterials([estimate]).map((m) => ({
    material: m.material,
    recovered_kg: m.kg,
  }))

  return {
    pickupId,
    vendorId: pickup.vendorId,
    totalWeightKg,
    materialSummary,
    co2AvoidedKg,
    materialSource: materialSummary.length > 0 ? 'estimated' : 'none',
  }
}
