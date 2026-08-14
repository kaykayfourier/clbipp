import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'
import { formatPaise } from '@clbipp/core'
import { AppShell, PagePadding, SectionLabel } from '@clbipp/ui'
import { Banner, Button, Card, DetailRow, ErrorState } from '@clbipp/ui'
import { CATEGORY_LABELS } from '../../book/copy'

// ─── Pickup receipt ──────────────────────────────────────────────────────────
// Company doc §4 step 4: the acknowledgement handed over AT COLLECTION. It is
// NOT the EPR certificate (step 8) — that can only exist once recycling has
// happened. The screen says so out loud, because a customer holding a receipt
// and believing they are compliant is the expensive misunderstanding here.
//
// The ₹ payout IS shown. Plan v2 D6 relaxed the "no value to the vendor"
// default for exactly this class of document; the offer and tracking screens
// are untouched and stay weight-only.

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const current = await getCurrentProfile()
  if (!current?.profile) redirect('/login')

  // Scoped through the pickup relation — PickupReceipt has no vendorId of its
  // own, and filtering in the query means a foreign id matches zero rows rather
  // than being fetched and then rejected.
  const receipt = await prisma.pickupReceipt.findFirst({
    where: { pickupId: id, pickup: { vendorId: current.user.id } },
    include: {
      pickup: {
        select: {
          id: true,
          category: true,
          status: true,
          agent: { select: { fullName: true } },
          _count: { select: { items: true } },
        },
      },
    },
  })

  if (!receipt) {
    return (
      <AppShell title="Receipt" showBack backHref="/dashboard" hideNav>
        <PagePadding>
          <ErrorState
            heading="No receipt yet"
            message="A receipt is issued when your batteries are collected. Track this pickup to see where it is."
          />
        </PagePadding>
      </AppShell>
    )
  }

  const lat = receipt.capturedLat === null ? null : Number(receipt.capturedLat)
  const lng = receipt.capturedLng === null ? null : Number(receipt.capturedLng)
  const hasGps = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)

  return (
    <AppShell title={receipt.receiptNo} showBack backHref={`/track/${receipt.pickupId}`} hideNav>
      <PagePadding className="flex flex-col gap-5">
        <div>
          <h1 className="font-serif text-2xl font-medium text-text-primary">Pickup receipt</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Confirmation that we collected your batteries.
          </p>
        </div>

        <Card variant="elevated" className="flex flex-col">
          <SectionLabel>Collection</SectionLabel>
          <div className="mt-2 flex flex-col">
            <DetailRow label="Receipt number" value={receipt.receiptNo} />
            <DetailRow label="Pickup reference" value={receipt.pickupId} />
            <DetailRow label="Collected on" value={formatDateTime(receipt.collectedAt)} />
            <DetailRow
              label="Collected by"
              value={receipt.pickup.agent?.fullName ?? 'Back2Basics collection partner'}
              last
            />
          </div>
        </Card>

        <Card variant="elevated" className="flex flex-col">
          <SectionLabel>What we took</SectionLabel>
          <div className="mt-2 flex flex-col">
            <DetailRow label="Category" value={CATEGORY_LABELS[receipt.pickup.category]} />
            <DetailRow label="Units" value={receipt.itemCount.toLocaleString('en-IN')} />
            <DetailRow
              label="Total weight"
              value={`${Number(receipt.totalWeightKg).toLocaleString('en-IN')} kg`}
              last={receipt.amountPaise === null}
            />
            {receipt.amountPaise !== null && (
              <DetailRow label="Agreed payout" value={formatPaise(receipt.amountPaise)} strong last />
            )}
          </div>
        </Card>

        {hasGps && (
          <Card variant="tinted" className="flex flex-col gap-2">
            <SectionLabel>Where</SectionLabel>
            <p className="text-sm text-text-secondary">
              The handover location was recorded as part of the chain of custody.
            </p>
            {/* Plain maps URL — no API key, no billing, same as the custody log. */}
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-text-primary underline"
            >
              View location
            </a>
          </Card>
        )}

        <Banner variant="info">
          This is not your EPR certificate. That is issued once your batteries
          have been tested and recycled, and appears in your compliance log.
        </Banner>

        <div className="flex flex-col gap-3">
          <a href={`/api/documents/receipt/${receipt.pickupId}`} target="_blank" rel="noreferrer">
            <Button variant="primary" fullWidth>
              Download receipt (PDF)
            </Button>
          </a>
          <Link href={`/track/${receipt.pickupId}`}>
            <Button variant="secondary" fullWidth>
              Track this pickup
            </Button>
          </Link>
        </div>
      </PagePadding>
    </AppShell>
  )
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
