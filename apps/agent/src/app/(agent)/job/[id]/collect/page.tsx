// /job/[id]/collect  —  Batch 6 · Ali
//
// Gated on Offer.acceptedAt (D7) — the vendor accepts in apps/customer and
// status STAYS `offered` until the write below moves it. "Vendor declined" has
// no dedicated schema flag (Offer only has acceptedAt, no declinedAt) — the
// only place that state can show up in this schema is the pickup being
// cancelled, so that's the branch this screen checks for it.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { formatPaise } from '@clbipp/core/format'
import { AppShell, Banner, Button, PagePadding } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { CollectForm } from './CollectForm'
import { computeAgentFeePaise } from './agent-fee'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 🔴 THE GATE.
  await requireSafetyChecklist(id, user.id)

  const pickup = await prisma.pickup.findFirst({
    where: { id, agentId: user.id },
    select: {
      id: true,
      status: true,
      vendor: { select: { fullName: true } },
      offer: { select: { acceptedAt: true, estimatedPrice: true } },
      _count: { select: { items: true } },
    },
  })
  if (!pickup) redirect('/')

  if (pickup.status === 'cancelled') {
    return (
      <AppShell title="Collect" showBack backHref={`/job/${id}`} hideNav>
        <PagePadding className="flex flex-col gap-4">
          <Banner variant="error">
            This pickup was cancelled — the vendor declined the offer. Nothing
            to collect.
          </Banner>
          <Link href="/">
            <Button variant="primary" fullWidth>
              Back to today
            </Button>
          </Link>
        </PagePadding>
      </AppShell>
    )
  }

  if (pickup.status !== 'offered' && pickup.status !== 'collected') {
    // Nothing to collect yet — send them to wherever this job actually is.
    redirect(`/job/${id}`)
  }

  if (pickup.status === 'collected') {
    redirect(`/job/${id}/receipt`)
  }

  if (!pickup.offer?.acceptedAt) {
    return (
      <AppShell title="Collect" showBack backHref={`/job/${id}/offer`} hideNav>
        <PagePadding className="flex flex-col gap-4">
          <Banner variant="info">
            Waiting on {pickup.vendor.fullName} to accept the offer
            {pickup.offer ? ` (${formatPaise(pickup.offer.estimatedPrice)})` : ''} before you
            can collect.
          </Banner>
          <Link href={`/job/${id}/offer`}>
            <Button variant="primary" fullWidth>
              Back to offer
            </Button>
          </Link>
        </PagePadding>
      </AppShell>
    )
  }

  return (
    <AppShell title="Collect" showBack backHref={`/job/${id}/offer`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        {error && <Banner variant="error">{error}</Banner>}
        <CollectForm
          pickupId={id}
          userId={user.id}
          vendorName={pickup.vendor.fullName}
          agentFeePaise={computeAgentFeePaise(pickup._count.items)}
        />
      </PagePadding>
    </AppShell>
  )
}
