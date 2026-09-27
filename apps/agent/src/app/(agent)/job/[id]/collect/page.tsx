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
import { chemistryLabel } from '@clbipp/core/intake'
import { AppShell, Banner, Button, PagePadding } from '@clbipp/ui'

import { requireSafetyChecklist } from '@/lib/safety-gate'
import { CollectForm } from './CollectForm'
import { TagLoad } from './TagLoad'
import { computeAgentFeePaise } from './agent-fee'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { id } = await params
  const { error, ok } = await searchParams

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
      // FV10–FV11 — the lines to tag, and the boxes loaded on this job's run.
      items: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          category: true,
          quantity: true,
          chemistry: true,
          weightKg: true,
          confirmedWeightKg: true,
          untaggedReason: true,
          tag: { select: { code: true, container: { select: { code: true } } } },
        },
      },
      collectionRun: {
        select: {
          runNo: true,
          agentId: true,
          containers: {
            where: { unloadedAt: null },
            orderBy: { loadedAt: 'asc' },
            select: { container: { select: { id: true, code: true, label: true } } },
          },
        },
      },
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

  const lines = pickup.items.map((i) => ({
    id: i.id,
    category: i.category,
    quantity: i.quantity,
    chemistryLabel: i.chemistry ? (chemistryLabel(i.chemistry) ?? i.chemistry) : null,
    weightKg: Number(i.confirmedWeightKg ?? i.weightKg ?? 0),
    tagCode: i.tag?.code ?? null,
    boxCode: i.tag?.container?.code ?? null,
    untaggedReason: i.untaggedReason,
  }))
  // 🔴 FD13 — every line tagged OR explained. confirmCollection re-checks.
  const tagsComplete = lines.length > 0 && lines.every((l) => l.tagCode || l.untaggedReason)
  const run = pickup.collectionRun && pickup.collectionRun.agentId === user.id ? pickup.collectionRun : null

  return (
    <AppShell title="Collect" showBack backHref={`/job/${id}/offer`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        {error && <Banner variant="error">{error}</Banner>}
        {ok && <Banner variant="success">{ok}</Banner>}
        <TagLoad
          pickupId={id}
          lines={lines}
          boxes={run ? run.containers.map((c) => c.container) : []}
          runNo={run?.runNo ?? null}
          returnTo={`/job/${id}/collect`}
        />
        <CollectForm
          pickupId={id}
          userId={user.id}
          vendorName={pickup.vendor.fullName}
          agentFeePaise={computeAgentFeePaise(pickup._count.items)}
          tagsComplete={tagsComplete}
        />
      </PagePadding>
    </AppShell>
  )
}
