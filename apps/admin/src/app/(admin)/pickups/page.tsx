import { prisma } from '@clbipp/database'

import { PageHead } from '@/components/console'
import { PickupsTable, type PickupRow } from './PickupsTable'

// B04 · Pickups — Batch 5, owner C — Ali.
//
// The spine (AD1) — the screen the wireframe forgot entirely (W2). Every
// pickup, every one of the nine real stages plus `cancelled`, filterable,
// searchable, paginated.
//
// Fetches every pickup unbounded, same posture as B02 (dispatch/page.tsx) —
// this is an internal console over a demo-scale dataset, not a public
// endpoint, and DataTable's own pagination (Batch 2) is what actually limits
// what renders per page. If this table needs to serve a genuinely large
// pickup volume later, the fix is server-side pagination on this query, not a
// client-side one — flagged here rather than guessed at now.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).
export const dynamic = 'force-dynamic'

export default async function PickupsPage() {
  const pickups = await prisma.pickup.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      vendor: { select: { fullName: true, companyName: true } },
      agent: { select: { fullName: true } },
      offer: { select: { acceptedAt: true, estimatedPrice: true } },
      items: { select: { quantity: true, weightKg: true, confirmedWeightKg: true, linePricePaise: true } },
    },
  })

  const rows: PickupRow[] = pickups.map((p) => {
    const totalWeightKg = p.items.reduce((sum, i) => sum + Number(i.confirmedWeightKg ?? i.weightKg ?? 0), 0)
    const itemCount = p.items.length
    // Value shown is what has actually been priced so far — the sum of each
    // item's own linePricePaise (set once that item is quoted/priced), not the
    // pickup-level Offer.estimatedPrice, which only exists once EVERY item is
    // priced and the offer has been presented (see the agent app's offer
    // roll-up). Before that point this column is a running total, not a quote.
    const pricedLines = p.items.filter((i) => i.linePricePaise !== null)
    const linePricePaise = pricedLines.length > 0 ? pricedLines.reduce((sum, i) => sum + (i.linePricePaise ?? 0), 0) : null

    return {
      id: p.id,
      vendorName: p.vendor.fullName,
      vendorCompany: p.vendor.companyName,
      agentName: p.agent?.fullName ?? null,
      status: p.status,
      offerAccepted: p.offer?.acceptedAt != null,
      itemCount,
      totalWeightKg,
      linePricePaise,
      createdAtIso: p.createdAt.toISOString(),
      createdAtLabel: p.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    }
  })

  return (
    <>
      <PageHead title="Pickups" description="Every pickup, every stage. The spine of this console (AD1)." />
      <PickupsTable rows={rows} />
    </>
  )
}
