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
import { AppShell, Banner, Button, Card, CardContent, DetailRow, PagePadding, SectionLabel } from '@clbipp/ui'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

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
      vendor: { select: { fullName: true } },
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

  return (
    <AppShell title="Receipt" showBack backHref={`/job/${id}`} hideNav>
      <PagePadding className="flex flex-col gap-4">
        <Banner variant="success">Collected — receipt {pickup.receipt.receiptNo}</Banner>

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

