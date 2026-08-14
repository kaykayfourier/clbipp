import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'

import { historyBucket, pickupHref, pickupSubtitle } from '@/lib/pickup-nav'
import HistoryClient, { type HistoryRow } from './HistoryClient'

// ─── /history — every pickup, filterable, with "book again" ──────────────────
// The P2 list screen (Plan v2 §4). Pure UI over data that already exists — the
// dashboard shows the most recent five, this is all of them.
//
// Server/client split follows compliance/page.tsx + ComplianceClient.tsx: the
// server does the scoped read and hands down PLAIN JSON, the client does the
// filtering. Everything the row needs (href, subtitle, bucket) is computed here
// rather than shipped as logic — Decimal, Date and BigInt don't survive the
// boundary, and the routing rules have no business being in the browser.

export default async function HistoryPage() {
  const current = await getCurrentProfile()
  if (!current?.profile) redirect('/login')

  const pickups = await prisma.pickup.findMany({
    where: { vendorId: current.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      category: true,
      batteryType: true,
      approxQuantity: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  })

  const rows: HistoryRow[] = pickups.map((pickup) => ({
    id: pickup.id,
    status: pickup.status,
    subtitle: pickupSubtitle(pickup),
    href: pickupHref(pickup.status, pickup.id),
    bucket: historyBucket(pickup.status),
    createdAt: pickup.createdAt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    // "Book again" prefills the wizard from this pickup's BatteryItem rows, so
    // a legacy pickup with none of them has nothing to copy.
    canRebook: pickup._count.items > 0,
  }))

  return <HistoryClient rows={rows} />
}
