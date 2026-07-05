import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentProfile } from '@/lib/supabase/auth'
import { prisma } from '@/lib/prisma'
import { AppShell, PagePadding } from '@/components/layout/app-shell'
import { Timeline } from '@/components/ui/timeline'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import type { LifecycleStage } from '@/lib/tokens'

// Offer.materialBreakdown JSON shape (stable keys — do not rename without
// updating every consumer). value_paise must NEVER be displayed on vendor screens.
type MaterialItem = {
  material: string
  weight_kg: number
  value_paise: number
}

const LIFECYCLE: LifecycleStage[] = [
  'requested', 'scheduled', 'collected', 'tested', 'processed', 'recovered', 'certified',
]

function buildStages(
  events: Array<{ status: string; occurredAt: Date }>
): Partial<Record<LifecycleStage, { timestamp: string }>> {
  const map: Partial<Record<LifecycleStage, { timestamp: string }>> = {}
  for (const e of events) {
    if (LIFECYCLE.includes(e.status as LifecycleStage)) {
      map[e.status as LifecycleStage] = {
        timestamp: new Date(e.occurredAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
        }),
      }
    }
  }
  return map
}

function safeBreakdown(json: unknown): MaterialItem[] {
  return Array.isArray(json) ? (json as MaterialItem[]) : []
}

// Tab bar lives in (app)/layout.tsx. AppShell uses hideNav so it doesn't render
// a second tab bar; bottom padding keeps content clear of the fixed nav.
const NAV_PADDING = 'pb-[calc(4rem+env(safe-area-inset-bottom,0px))]'

// Recovery summary card shared between the recovered and certified screens.
// Renders total weight (kg) and an expandable material breakdown. ₹ values
// and recovery rate are intentionally omitted — lead's instruction.
function RecoverySummary({ breakdown }: { breakdown: MaterialItem[] }) {
  const totalKg = breakdown.reduce((sum, item) => sum + (item.weight_kg ?? 0), 0)
  return (
    <Card>
      <CardTitle>Recovery summary</CardTitle>
      <p className="mt-2 text-sm text-text-secondary">
        Total weight:{' '}
        <span className="font-semibold text-text-primary">{totalKg} kg</span>
      </p>
      {breakdown.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-text-primary">
            Material breakdown
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {breakdown.map((item) => (
              <li key={item.material} className="flex justify-between text-sm text-text-secondary">
                <span>{item.material}</span>
                <span>{item.weight_kg} kg</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const result = await getCurrentProfile()
  if (!result) redirect('/login')

  // Scope by vendorId so a vendor cannot view another vendor's pickup.
  const pickup = await prisma.pickup.findFirst({
    where: { id, vendorId: result.user.id },
    include: {
      statusEvents: { orderBy: { occurredAt: 'asc' } },
      offer: true,
    },
  })
  if (!pickup) notFound()

  const stages = buildStages(pickup.statusEvents)
  const status = pickup.status
  const breakdown = safeBreakdown(pickup.offer?.materialBreakdown)

  // ── Cancelled ─────────────────────────────────────────────────────────────
  if (status === 'cancelled') {
    return (
      <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav contentClassName={NAV_PADDING}>
        <PagePadding>
          <Banner variant="error">This pickup was cancelled.</Banner>
        </PagePadding>
      </AppShell>
    )
  }

  // ── Early (requested / scheduled) ─────────────────────────────────────────
  if (status === 'requested' || status === 'scheduled') {
    return (
      <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav contentClassName={NAV_PADDING}>
        <PagePadding className="flex flex-col gap-4">
          <Timeline currentStage={status} stages={stages} pulse />
          <Banner variant="info">
            Your pickup is confirmed. We&apos;ll be in touch to arrange collection.
          </Banner>
        </PagePadding>
      </AppShell>
    )
  }

  // ── In-progress (collected / tested / processed) ───────────────────────────
  if (status === 'collected' || status === 'tested' || status === 'processed') {
    return (
      <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav contentClassName={NAV_PADDING}>
        <PagePadding className="flex flex-col gap-4">
          <Timeline currentStage={status} stages={stages} pulse />
          <Banner variant="info">
            We&apos;ll notify you as your battery moves through each stage.
          </Banner>
          <Banner variant="tinted">
            Certificate unlocks once your battery is fully recovered.
          </Banner>
        </PagePadding>
      </AppShell>
    )
  }

  // ── Recovered ─────────────────────────────────────────────────────────────
  if (status === 'recovered') {
    return (
      <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav contentClassName={NAV_PADDING}>
        <PagePadding className="flex flex-col gap-4">
          <Timeline currentStage="recovered" stages={stages} endStage="recovered" />
          {pickup.offer && <RecoverySummary breakdown={breakdown} />}
          <Banner variant="tinted">
            Certificate available once your battery is certified.
          </Banner>
        </PagePadding>
      </AppShell>
    )
  }

  // ── Certified ─────────────────────────────────────────────────────────────
  return (
    <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav contentClassName={NAV_PADDING}>
      <PagePadding className="flex flex-col gap-4">
        <Timeline currentStage="certified" stages={stages} />
        {pickup.offer && <RecoverySummary breakdown={breakdown} />}
        <Banner variant="success">Your EPR certificate is ready.</Banner>
        <Link href={`/certificates/${pickup.id}`}>
          <Button fullWidth>View certificate</Button>
        </Link>
      </PagePadding>
    </AppShell>
  )
}
