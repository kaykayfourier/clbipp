import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'
import { AppShell, PagePadding } from '@clbipp/ui'
import { Timeline, Connector } from '@clbipp/ui'
import { Banner } from '@clbipp/ui'
import { Button } from '@clbipp/ui'
import { Card } from '@clbipp/ui'
import { StatusBadge } from '@clbipp/ui'
import { CustodyLog, PartnerCard } from '@clbipp/ui'
import { TrackingRealtime } from './TrackingRealtime'
import { isLifecycleStage } from '@clbipp/ui'
import type { LifecycleStage } from '@clbipp/ui'
import { buildCustodyEntries } from '@/lib/custody'

// Offer.materialBreakdown JSON shape (stable keys — do not rename without
// updating every consumer). value_paise must NEVER be displayed on vendor screens.
type MaterialItem = {
  material: string
  weight_kg: number
  value_paise: number
}

// No local copy of the stage list — `isLifecycleStage` reads LIFECYCLE_STAGES
// from @clbipp/ui, which is the same array Timeline renders and the same order
// as `enum PickupStatus`. Batch 7A removed the duplicate that used to live here.

function buildStages(
  events: Array<{ status: string; occurredAt: Date }>
): Partial<Record<LifecycleStage, { timestamp: string }>> {
  const map: Partial<Record<LifecycleStage, { timestamp: string }>> = {}
  for (const e of events) {
    if (isLifecycleStage(e.status)) {
      map[e.status] = {
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

/**
 * The ETA line on the partner card. Wording depends on the stage, not just on
 * the number of minutes — "arriving in 45 min" is wrong once they're standing
 * at the gate, and `etaMinutes` is deliberately null from `arrived` onward.
 */
function etaLine(status: string, etaMinutes: number | null): string | null {
  if (status === 'arrived') return 'On site now.'
  if (status === 'scheduled' && etaMinutes != null) {
    return `Arriving in about ${etaMinutes} min.`
  }
  if (status === 'scheduled') return 'On the way — we’ll show an ETA closer to the slot.'
  return null
}

// Tab bar lives in (app)/layout.tsx, which also owns the bottom clearance for
// it — so AppShell only needs hideNav here to avoid rendering a second bar.

function LifecycleHeader({ status }: { status: LifecycleStage }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">Lifecycle</p>
      <StatusBadge status={status} />
    </div>
  )
}

// Recovery summary: stat box (kg) + expandable material breakdown.
// ₹ values and recovery rate are intentionally omitted — lead's instruction.
function RecoverySummary({ breakdown }: { breakdown: MaterialItem[] }) {
  const totalKg = breakdown.length > 0
    ? breakdown.reduce((sum, item) => sum + (item.weight_kg ?? 0), 0)
    : null
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-3">
        Recovery summary
      </p>
      <div className="inline-flex flex-col rounded-lg border border-border px-4 py-3">
        <span className="text-2xl font-bold text-text-primary">
          {totalKg !== null ? `${totalKg} kg` : '—'}
        </span>
        <span className="text-xs text-text-secondary mt-0.5">
          {totalKg !== null ? 'Recovered' : 'Pending finalisation'}
        </span>
      </div>
      {breakdown.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer select-none text-sm font-medium text-text-primary">
            View material breakdown
          </summary>
          <ul className="mt-3 flex flex-col">
            {breakdown.map((item) => (
              <li
                key={item.material}
                className="flex justify-between border-t border-border py-2 text-sm"
              >
                <span className="text-text-secondary">{item.material}</span>
                <span className="font-medium text-text-primary">{item.weight_kg} kg</span>
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
      // Only the fields the partner card shows. Selecting the whole agent
      // Profile would pull agentZone, kyc and wallet columns into a customer
      // page's payload for no reason.
      agent: {
        select: { fullName: true, phone: true, agentVehicle: true, agentRating: true },
      },
    },
  })
  if (!pickup) notFound()

  const stages = buildStages(pickup.statusEvents)
  const status = pickup.status
  const breakdown = safeBreakdown(pickup.offer?.materialBreakdown)

  // The query above is already scoped by vendorId, which is what makes signing
  // these photo paths safe — see the ownership note in @/lib/custody.
  const custody = await buildCustodyEntries(pickup.statusEvents)

  const partner = pickup.agent ? (
    <PartnerCard
      name={pickup.agent.fullName}
      phone={pickup.agent.phone}
      vehicle={pickup.agent.agentVehicle}
      rating={pickup.agent.agentRating ? Number(pickup.agent.agentRating) : null}
      eta={etaLine(status, pickup.etaMinutes)}
    />
  ) : null

  // ── Cancelled ─────────────────────────────────────────────────────────────
  if (status === 'cancelled') {
    // Show timeline up to the last recorded lifecycle stage, then the error banner.
    const lastLifecycleEvent = [...pickup.statusEvents]
      .reverse()
      .find(e => isLifecycleStage(e.status))
    // Fall back to 'requested' so the timeline always renders, even with no events
    const lastStage = (lastLifecycleEvent?.status ?? 'requested') as LifecycleStage
    return (
      <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav>
        <PagePadding className="flex flex-col gap-4">
          <Card className="overflow-visible">
            <Timeline currentStage={lastStage} stages={stages} />
            <Connector completed={false} />
            <div className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-error">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M3 3l4 4M7 3l-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <div className="flex-1 min-h-[1.75rem] pb-0.5">
                <span className="block text-sm font-semibold leading-tight text-error">Cancelled</span>
              </div>
            </div>
          </Card>
          <Banner variant="error">This pickup was cancelled.</Banner>
          {/* No partner card — there is nobody coming. The custody log stays:
              what was recorded before the cancellation is still the record. */}
          <CustodyLog entries={custody} />
        </PagePadding>
      </AppShell>
    )
  }

  // ── Pre-collection (requested / scheduled / arrived / offered) ────────────
  // One branch, four stages, because the layout is identical — only the banner
  // and the call to action differ. `arrived` and `offered` were added in Batch
  // 7A; before that, "an offer exists" had no status of its own.
  if (
    status === 'requested' ||
    status === 'scheduled' ||
    status === 'arrived' ||
    status === 'offered'
  ) {
    const banner: Record<typeof status, string> = {
      requested: "Your request is in. We'll confirm a collection slot shortly.",
      scheduled: 'Collection is scheduled. Track this screen on the day.',
      arrived: 'Your collection agent is on site and assessing the batteries.',
      offered: 'Your offer is ready. Review it to confirm handover.',
    }

    return (
      <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav>
        <TrackingRealtime pickupId={pickup.id} />
        <PagePadding className="flex flex-col gap-4">
          <LifecycleHeader status={status} />
          <Card className="overflow-visible">
            <Timeline currentStage={status} stages={stages} pulse />
          </Card>
          <Banner variant={status === 'offered' ? 'success' : 'info'}>
            {banner[status]}
          </Banner>
          {partner}
          {/* Both conditions, not just the status: the offer screen itself
              redirects when no Offer row exists, so linking on status alone
              would send the customer on a round trip to /scheduled. */}
          {status === 'offered' && pickup.offer && (
            <Link href={`/offer?id=${pickup.id}`} className="block">
              <Button fullWidth>View offer</Button>
            </Link>
          )}
          <CustodyLog entries={custody} />
        </PagePadding>
      </AppShell>
    )
  }

  // ── In-progress (collected / tested / processed) ───────────────────────────
  if (status === 'collected' || status === 'tested' || status === 'processed') {
    return (
      <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav>
        <TrackingRealtime pickupId={pickup.id} />
        <PagePadding className="flex flex-col gap-4">
          <LifecycleHeader status={status as LifecycleStage} />
          <Card className="overflow-visible">
            <Timeline currentStage={status} stages={stages} pulse />
          </Card>
          {/* B7 — say what we actually do. There is no SMS/WhatsApp/push
              notification pipeline (Plan v2 §1.3 A3, not built), so promising
              one was a promise the app can't keep. */}
          <Banner variant="info">
            This screen updates itself as your batteries move through each stage.
          </Banner>
          <Banner variant="tinted">
            Recovery breakdown and certificate unlock once recovered.
          </Banner>
          {partner}
          <CustodyLog entries={custody} />
        </PagePadding>
      </AppShell>
    )
  }

  // ── Recovered ─────────────────────────────────────────────────────────────
  if (status === 'recovered') {
    return (
      <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav>
        <TrackingRealtime pickupId={pickup.id} />
        <PagePadding className="flex flex-col gap-4">
          <LifecycleHeader status="recovered" />
          <Card className="overflow-visible">
            {/* No endStage — certified shows as the next pending step.
                pulse: recovered is the active frontier (certified still pending). */}
            <Timeline currentStage="recovered" stages={stages} pulse />
          </Card>
          <RecoverySummary breakdown={breakdown} />
          <Banner variant="tinted">
            Your EPR certificate becomes available once certified.
          </Banner>
          <CustodyLog entries={custody} />
        </PagePadding>
      </AppShell>
    )
  }

  // ── Certified ─────────────────────────────────────────────────────────────
  return (
    <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav>
      <PagePadding className="flex flex-col gap-4">
        <LifecycleHeader status="certified" />
        <Card>
          <Timeline currentStage="certified" stages={stages} />
        </Card>
        <RecoverySummary breakdown={breakdown} />
        <Banner variant="success">Certificate ready — added to your compliance log.</Banner>
        <Link href={`/certificates/${pickup.id}`}>
          <Button fullWidth>View certificate</Button>
        </Link>
        <CustodyLog entries={custody} />
      </PagePadding>
    </AppShell>
  )
}
