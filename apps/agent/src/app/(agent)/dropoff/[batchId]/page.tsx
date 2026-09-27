// /dropoff/[batchId]  —  the chain-of-custody receipt for one hub hand-off
//
// Batch 7b named this screen and left it a stub ("Not built yet") — which is
// where confirmDropoff has always redirected, so every real drop-off ended on a
// placeholder. Built in FV12 (2026-09-27), because the feedback's §6 step 12 —
// "chain-of-custody records … are updated" — is exactly this record: every
// line handed in, the tag it carries, the box it travelled in, and whether the
// hub has checked it in yet.
//
// Watch-only, like the Batch 8 screens, so not behind the safety gate.
// `hideNav` is required — (agent)/layout.tsx owns the nav and the clearance
// under it. Add no bottom padding.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { categoryLabel } from '@clbipp/core/intake'
import { AppShell, Banner, Button, Card, CardContent, DetailRow, PagePadding, SectionLabel } from '@clbipp/ui'

export default async function Page({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const batch = await prisma.custodyBatch.findFirst({
    // 🔴 In-code ownership — the whole access boundary on this read (D10).
    where: { id: batchId, agentId: user.id },
    select: {
      id: true,
      batchNo: true,
      handedOffAt: true,
      receivingStaffName: true,
      totalWeightKg: true,
      facility: { select: { name: true, location: true } },
      pickups: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          status: true,
          vendor: { select: { fullName: true } },
          collectionRun: { select: { runNo: true } },
          items: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              category: true,
              quantity: true,
              weightKg: true,
              confirmedWeightKg: true,
              untaggedReason: true,
              tag: { select: { code: true, container: { select: { code: true } } } },
              custodyCheck: { select: { outcome: true } },
            },
          },
        },
      },
    },
  })
  if (!batch) redirect('/dropoff')

  const lines = batch.pickups.flatMap((p) => p.items)
  const checked = lines.filter((l) => l.custodyCheck?.outcome === 'received').length
  const missing = lines.filter((l) => l.custodyCheck?.outcome === 'missing').length
  const boxes = [...new Set(lines.map((l) => l.tag?.container?.code).filter((c): c is string => Boolean(c)))]
  const runs = [...new Set(batch.pickups.map((p) => p.collectionRun?.runNo).filter((r): r is string => Boolean(r)))]

  return (
    <AppShell title="Chain of custody" showBack backHref="/" hideNav>
      <PagePadding className="flex flex-col gap-4">
        <Banner variant="success">{`Handed in — batch ${batch.batchNo}`}</Banner>

        <Card variant="elevated">
          <CardContent className="flex flex-col">
            <DetailRow label="Facility" value={batch.facility.name} />
            <DetailRow
              label="Handed off"
              value={batch.handedOffAt.toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
            />
            <DetailRow label="Received by" value={`${batch.receivingStaffName} (you recorded)`} />
            <DetailRow label="Load" value={`${batch.pickups.length} job${batch.pickups.length === 1 ? '' : 's'} · ${lines.length} line${lines.length === 1 ? '' : 's'} · ${Number(batch.totalWeightKg).toFixed(1)} kg`} />
            {runs.length > 0 ? <DetailRow label="Run" value={runs.join(', ')} /> : null}
            <DetailRow label="Boxes unloaded" value={boxes.length > 0 ? boxes.join(', ') : '—'} last />
          </CardContent>
        </Card>

        {/* The hub's own count — FV12. Until it starts, this says so rather
            than showing a zero that reads like a problem. */}
        <Banner variant={missing > 0 ? 'warning' : 'info'}>
          {checked === 0 && missing === 0
            ? 'The hub checks each tag in against this list before the load is tested.'
            : `Hub check-in: ${checked} of ${lines.length} lines received${missing > 0 ? `, ${missing} reported missing` : ''}.`}
        </Banner>

        {batch.pickups.map((p) => (
          <div key={p.id} className="flex flex-col gap-2">
            <SectionLabel>{`${p.id} · ${p.vendor.fullName}`}</SectionLabel>
            <Card variant="elevated">
              <CardContent className="flex flex-col">
                {p.items.map((item, idx) => (
                  <DetailRow
                    key={item.id}
                    label={`${categoryLabel(item.category)} · ${item.quantity} · ${Number(item.confirmedWeightKg ?? item.weightKg ?? 0).toFixed(1)} kg`}
                    value={`${item.tag ? item.tag.code : 'untagged'}${item.tag?.container ? ` · ${item.tag.container.code}` : ''}${
                      item.custodyCheck?.outcome === 'received' ? ' ✓' : item.custodyCheck?.outcome === 'missing' ? ' ✗' : ''
                    }`}
                    last={idx === p.items.length - 1}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        ))}

        <a href={`/api/documents/custody/${batch.id}`}>
          <Button variant="secondary" fullWidth>
            Download custody receipt (PDF)
          </Button>
        </a>
        <Link href="/">
          <Button variant="primary" fullWidth>
            Back to today
          </Button>
        </Link>
      </PagePadding>
    </AppShell>
  )
}
