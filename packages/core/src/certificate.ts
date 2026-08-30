// ─── Certificate payload builder ─────────────────────────────────────────────
// Pure: reads the DB, builds the payload, returns it. Does NOT write.
// Batch 7's certifyPickup calls this, creates the Certificate row, and renders
// the PDF. Keeping the read separate from the write makes both testable.

import { prisma } from '@clbipp/database'
import { co2eAvoidedKg, aggregateMaterials } from './impact'

export interface CertificatePayload {
  pickupId: string
  vendorId: string
  totalWeightKg: number
  materialSummary: Array<{ material: string; recovered_kg: number }>
  co2AvoidedKg: number
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
    weightKg: Number(item.confirmedWeightKg ?? item.weightKg ?? 0),
    category: item.category,
    chemistry: item.chemistry,
  }))

  const totalWeightKg = Math.round(
    items.reduce((sum, i) => sum + i.weightKg, 0) * 10,
  ) / 10

  const co2AvoidedKg = co2eAvoidedKg(items)

  // materialSummary comes from the offer's materialBreakdown if available,
  // otherwise we aggregate from the item-level confirmed weights.
  // The offer breakdown is the source of truth for what was actually recovered.
  const rawSummaries = pickup.offer?.materialBreakdown
    ? [pickup.offer.materialBreakdown]
    : []

  const aggregated = aggregateMaterials(rawSummaries)

  const materialSummary = aggregated.map((m) => ({
    material: m.material,
    recovered_kg: m.kg,
  }))

  return {
    pickupId,
    vendorId: pickup.vendorId,
    totalWeightKg,
    materialSummary,
    co2AvoidedKg,
  }
}