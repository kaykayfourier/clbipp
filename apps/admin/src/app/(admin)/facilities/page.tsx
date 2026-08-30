import { prisma } from '@clbipp/database'

import { PageHead } from '@/components/console'
import { computeFacilityStock } from '@/lib/facility-stock'
import { FacilitiesTables, type FacilityRow, type RecyclerRow } from './FacilitiesTables'

// E03 · Facilities & recyclers — Batch 9, owner C — Ali.
//
// Hubs we operate, and the CPCB-registered recyclers we ship to. Read-only.
// The capacity gauge's numerator comes from computeFacilityStock() (§ Batch
// 10's own derivation) — see @/lib/facility-stock for why that is a query,
// not a stored counter.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).
export const dynamic = 'force-dynamic'

export default async function FacilitiesPage() {
  const [facilities, recyclers, stock] = await Promise.all([
    prisma.facility.findMany({
      select: { id: true, name: true, location: true, capacityKg: true, isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.recycler.findMany({
      select: { id: true, name: true, cpcbRegNo: true, acceptedChemistries: true, capacityKg: true, isActive: true },
      orderBy: { name: 'asc' },
    }),
    computeFacilityStock(),
  ])

  const onHandByFacility = new Map<string, number>()
  for (const item of stock) {
    onHandByFacility.set(item.facilityId, (onHandByFacility.get(item.facilityId) ?? 0) + item.weightKg)
  }

  const facilityRows: FacilityRow[] = facilities.map((f) => ({
    id: f.id,
    name: f.name,
    location: f.location,
    capacityKg: f.capacityKg !== null ? Number(f.capacityKg) : null,
    onHandKg: onHandByFacility.get(f.id) ?? 0,
    isActive: f.isActive,
  }))

  const recyclerRows: RecyclerRow[] = recyclers.map((r) => ({
    id: r.id,
    name: r.name,
    cpcbRegNo: r.cpcbRegNo,
    acceptedChemistries: r.acceptedChemistries,
    capacityKg: r.capacityKg !== null ? Number(r.capacityKg) : null,
    isActive: r.isActive,
  }))

  return (
    <>
      <PageHead title="Facilities & recyclers" description="Hubs we operate, and the CPCB-registered recyclers we ship to." />
      <FacilitiesTables facilities={facilityRows} recyclers={recyclerRows} />
    </>
  )
}
