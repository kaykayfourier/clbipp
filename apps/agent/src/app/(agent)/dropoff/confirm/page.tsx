// /dropoff/confirm  —  Batch 7a · Ali
//
// Hub, batch summary, GPS + timestamp, staff signature. AGENT-ATTESTED ONLY —
// there is no hub-staff app, so the receiving staff name is typed, not
// authenticated. ConfirmDropoffForm says so before the agent submits.

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { AppShell, Banner, Card, CardContent, PagePadding, SectionLabel } from '@clbipp/ui'

import { ConfirmDropoffForm } from './ConfirmDropoffForm'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ pickups?: string; error?: string }>
}) {
  const { pickups: pickupsParam, error } = await searchParams
  const pickupIds = (pickupsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (pickupIds.length === 0) redirect('/dropoff')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [pickups, facilities] = await Promise.all([
    prisma.pickup.findMany({
      where: { id: { in: pickupIds }, agentId: user.id, status: 'collected', custodyBatchId: null },
      select: {
        id: true,
        vendor: { select: { fullName: true } },
        items: { select: { confirmedWeightKg: true, weightKg: true } },
        receipt: { select: { itemCount: true } },
      },
    }),
    prisma.facility.findMany({ where: { isActive: true }, select: { id: true, name: true, location: true } }),
  ])

  if (pickups.length === 0) redirect('/dropoff')

  const totalWeightKg = pickups.reduce(
    (sum, p) => sum + p.items.reduce((s, i) => s + Number(i.confirmedWeightKg ?? i.weightKg ?? 0), 0),
    0,
  )
  const itemCount = pickups.reduce((sum, p) => sum + (p.receipt?.itemCount ?? p.items.length), 0)

  return (
    <AppShell title="Confirm hand-off" showBack backHref="/dropoff" hideNav>
      <PagePadding className="flex flex-col gap-4">
        {error && <Banner variant="error">{error}</Banner>}

        <SectionLabel>This batch</SectionLabel>
        <Card variant="elevated">
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-text-primary">
              {pickups.length} job{pickups.length === 1 ? '' : 's'} · {itemCount} item
              {itemCount === 1 ? '' : 's'} · {totalWeightKg.toFixed(1)} kg
            </p>
            <p className="text-xs text-text-secondary">
              {pickups.map((p) => p.vendor.fullName).join(', ')}
            </p>
          </CardContent>
        </Card>

        {facilities.length === 0 ? (
          <Banner variant="error">No active facility is configured — contact admin.</Banner>
        ) : (
          <ConfirmDropoffForm pickupIds={pickups.map((p) => p.id)} userId={user.id} facilities={facilities} />
        )}
      </PagePadding>
    </AppShell>
  )
}
