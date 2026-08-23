// /dropoff  —  Batch 7a · Ali
//
// Batch select — the collected pickups going to the hub in one CustodyBatch.
// The set itself is derived, not stored (D5): `status = collected AND
// custodyBatchId IS NULL`, the same query jobHref/isActiveJob already use to
// decide a job belongs here at all.

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { AppShell, Banner, PagePadding } from '@clbipp/ui'

import { BatchSelectForm, type PendingJob } from './BatchSelectForm'

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const pickups = await prisma.pickup.findMany({
    where: { agentId: user.id, status: 'collected', custodyBatchId: null },
    select: {
      id: true,
      vendor: { select: { fullName: true } },
      items: { select: { confirmedWeightKg: true, weightKg: true, linePricePaise: true } },
      receipt: { select: { itemCount: true } },
    },
    orderBy: { id: 'asc' },
  })

  const jobs: PendingJob[] = pickups.map((p) => ({
    id: p.id,
    vendorName: p.vendor.fullName,
    itemCount: p.receipt?.itemCount ?? p.items.length,
    totalWeightKg: p.items.reduce((s, i) => s + Number(i.confirmedWeightKg ?? i.weightKg ?? 0), 0),
    linePricePaise: p.items.reduce((s, i) => s + (i.linePricePaise ?? 0), 0),
  }))

  return (
    <AppShell title="Drop-off" showBack backHref="/" hideNav>
      <PagePadding className="flex flex-col gap-4">
        {jobs.length === 0 ? (
          <Banner variant="info">Nothing pending drop-off — every collected job has been handed off.</Banner>
        ) : (
          <BatchSelectForm jobs={jobs} />
        )}
      </PagePadding>
    </AppShell>
  )
}
