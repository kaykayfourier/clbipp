// /job/[id]/receipt  —  Batch 6 · Ali
//
// Read-only. The actual writes (offered → collected, PickupReceipt, the
// agent-fee WalletTxn) happen in ../collect/actions.ts's confirmCollection —
// this screen just displays what landed, which is why it's safe to reach by
// refresh, back-navigation, or a stale bookmark.
//
// pdfUrl (Batch 7b) isn't built — this build renders the receipt as a screen,
// not a downloadable PDF.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { createSignedUrls } from '@clbipp/auth/storage-server'
import { formatPaise } from '@clbipp/core/format'
import { chemistryLabel } from '@clbipp/core/intake'
import { AppShell, Banner, Button, Card, CardContent, DetailRow, PagePadding, SectionLabel } from '@clbipp/ui'

import { TagLoad } from '../collect/TagLoad'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const { id } = await params
  const { ok, error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const pickup = await prisma.pickup.findFirst({
    where: { id, agentId: user.id },
    select: {
      id: true,
      status: true,
      custodyBatchId: true,
      vendor: { select: { fullName: true } },
      // FV10 — the tags this load left with.
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
      receipt: {
        select: {
          receiptNo: true,
          totalWeightKg: true,
          itemCount: true,
          amountPaise: true,
          signatureUrl: true,
          collectedAt: true,
        },
      },
    },
  })
  if (!pickup) redirect('/')

  // Not collected yet — nothing to show here.
  if (!pickup.receipt) redirect(`/job/${id}/collect`)

  let signatureUrl: string | null = null
  if (pickup.receipt.signatureUrl) {
    const { urls } = await createSignedUrls('pickup-photos', [pickup.receipt.signatureUrl])
    signatureUrl = urls[0]?.url ?? null
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
  const untagged = lines.filter((l) => !l.tagCode)
  // FD13 — a line that left without a tag can still be tagged in the van, up
  // to the hub drop-off; after that the hub owns it.
  const canStillTag = pickup.status === 'collected' && pickup.custodyBatchId === null && untagged.length > 0

  return (
    <AppShell title="Receipt" showBack backHref={`/job/${id}`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        <Banner variant="success">Collected — receipt {pickup.receipt.receiptNo}</Banner>
        {ok && <Banner variant="success">{ok}</Banner>}
        {error && <Banner variant="error">{error}</Banner>}

        <SectionLabel>{pickup.vendor.fullName}</SectionLabel>
        <Card variant="elevated">
          <CardContent className="flex flex-col">
            <DetailRow label="Receipt no." value={pickup.receipt.receiptNo} />
            <DetailRow
              label="Items"
              value={`${pickup.receipt.itemCount} line${pickup.receipt.itemCount === 1 ? '' : 's'}`}
            />
            <DetailRow label="Total weight" value={`${Number(pickup.receipt.totalWeightKg).toFixed(1)} kg`} />
            <DetailRow
              label="Amount"
              value={pickup.receipt.amountPaise === null ? '—' : formatPaise(pickup.receipt.amountPaise)}
            />
            <DetailRow
              label="Collected"
              value={pickup.receipt.collectedAt.toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
              last
            />
          </CardContent>
        </Card>

        {/* FV10 — the tag on each line, as the hub will scan them. */}
        <SectionLabel>Tags</SectionLabel>
        <Card variant="elevated">
          <CardContent className="flex flex-col">
            {lines.map((l, idx) => (
              <DetailRow
                key={l.id}
                label={`Line ${idx + 1}${l.boxCode ? ` · box ${l.boxCode}` : ''}`}
                value={l.tagCode ?? 'Untagged — hub tags on receipt'}
                last={idx === lines.length - 1}
              />
            ))}
          </CardContent>
        </Card>

        {canStillTag ? (
          <TagLoad
            pickupId={pickup.id}
            lines={untagged}
            boxes={[]}
            runNo={null}
            returnTo={`/job/${id}/receipt`}
          />
        ) : null}

        {signatureUrl && (
          <div className="flex flex-col gap-2">
            <SectionLabel>{pickup.vendor.fullName}&rsquo;s signature</SectionLabel>
            <Card variant="elevated">
              <CardContent className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureUrl} alt="Vendor's signature" className="h-24 w-full object-contain" />
              </CardContent>
            </Card>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-text-secondary">
          This job now waits for the hub drop-off — you&rsquo;ll see it in your pending
          drop-off list until then.
        </p>

        <Link href="/">
          <Button variant="primary" fullWidth>
            Back to today
          </Button>
        </Link>
      </PagePadding>
    </AppShell>
  )
}

