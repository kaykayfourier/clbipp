import { prisma } from '@clbipp/database'

import { PageHead } from '@/components/console'
import { computeFacilityStock } from '@/lib/facility-stock'
import { InventoryView, type ChemistryBreakdownRow, type DwellAlertRow, type FacilityGaugeRow } from './InventoryView'

// C01 · Inventory — Batch 10, owner C — Ali.
//
// Facility stock by chemistry, capacity gauges, dwell alerts, custody
// batches. The derivation itself lives in @/lib/facility-stock, shared with
// E03 (/facilities) — see that file for why this is a query over
// CustodyBatch + DispatchManifest rather than a stored counter (AD6: no
// per-item status column exists to count against).
//
// ⚠ DWELL_THRESHOLD_HOURS is a placeholder, not a company-set figure — this
// sprint's docs never state one. 48h is a reasonable starting point (two
// working days at a hub before a battery should be moving toward dispatch),
// flagged here rather than asserted as policy. TODO: replace once the
// company gives a real number.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).
export const dynamic = 'force-dynamic'

const DWELL_THRESHOLD_HOURS = 48

export default async function InventoryPage() {
  const [facilities, stock] = await Promise.all([
    prisma.facility.findMany({
      where: { isActive: true },
      select: { id: true, name: true, capacityKg: true },
      orderBy: { name: 'asc' },
    }),
    computeFacilityStock(),
  ])

  const facilityById = new Map(facilities.map((f) => [f.id, f]))
  const now = new Date()

  const onHandByFacility = new Map<string, number>()
  const breakdownMap = new Map<string, { facilityId: string; facilityName: string; chemistry: string; itemCount: number; weightKg: number; oldestHandedOffAt: Date }>()
  const alerts: DwellAlertRow[] = []

  for (const item of stock) {
    const facility = facilityById.get(item.facilityId)
    if (!facility) continue // inactive or unknown facility — excluded from the active view

    onHandByFacility.set(item.facilityId, (onHandByFacility.get(item.facilityId) ?? 0) + item.weightKg)

    const dwellHours = (now.getTime() - item.handedOffAt.getTime()) / 3_600_000
    const chemistry = item.chemistry ?? 'unknown'
    const key = `${item.facilityId}-${chemistry}`
    const existing = breakdownMap.get(key)
    if (existing) {
      existing.itemCount += 1
      existing.weightKg += item.weightKg
      if (item.handedOffAt < existing.oldestHandedOffAt) existing.oldestHandedOffAt = item.handedOffAt
    } else {
      breakdownMap.set(key, {
        facilityId: item.facilityId,
        facilityName: facility.name,
        chemistry,
        itemCount: 1,
        weightKg: item.weightKg,
        oldestHandedOffAt: item.handedOffAt,
      })
    }

    if (dwellHours >= DWELL_THRESHOLD_HOURS) {
      alerts.push({
        itemId: item.itemId,
        pickupId: item.pickupId,
        facilityName: facility.name,
        chemistry,
        weightKg: item.weightKg,
        dwellHours,
      })
    }
  }

  const facilityGauges: FacilityGaugeRow[] = facilities.map((f) => ({
    id: f.id,
    name: f.name,
    onHandKg: onHandByFacility.get(f.id) ?? 0,
    capacityKg: f.capacityKg !== null ? Number(f.capacityKg) : null,
  }))

  const breakdown: ChemistryBreakdownRow[] = Array.from(breakdownMap.values()).map((b) => ({
    facilityId: b.facilityId,
    facilityName: b.facilityName,
    chemistry: b.chemistry,
    itemCount: b.itemCount,
    weightKg: b.weightKg,
    oldestDwellHours: (now.getTime() - b.oldestHandedOffAt.getTime()) / 3_600_000,
  }))

  return (
    <>
      <PageHead title="Inventory" description="Facility stock by chemistry, capacity gauges, and dwell alerts — derived from custody batches, not a stored counter." />
      {facilities.length === 0 ? (
        <p className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
          No active facilities are configured.
        </p>
      ) : (
        <InventoryView facilityGauges={facilityGauges} breakdown={breakdown} alerts={alerts} dwellThresholdHours={DWELL_THRESHOLD_HOURS} />
      )}
    </>
  )
}
