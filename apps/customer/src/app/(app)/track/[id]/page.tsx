import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentProfile } from '@clbipp/auth'
import { prisma } from '@clbipp/database'
import { parseMaterialWeights } from '@clbipp/core'
import { AppShell, PagePadding } from '@clbipp/ui'
import { Timeline } from '@clbipp/ui'
import { Banner } from '@clbipp/ui'
import { Button } from '@clbipp/ui'
import { Card } from '@clbipp/ui'
import { CustodyLog, PartnerCard } from '@clbipp/ui'
import {
  buildStages,
  CancelledTimeline,
  lastRecordedStage,
  LifecycleHeader,
  RecoverySummary,
} from '@clbipp/ui'
import type { LifecycleStage } from '@clbipp/ui'
import { TrackingRealtime } from './TrackingRealtime'
import { buildCustodyEntries } from '@/lib/custody'

// ─── /track/[id] — the authenticated tracking screen ─────────────────────────
// Batch 10 moved the shared presentation (LifecycleHeader, RecoverySummary, the
// cancelled card, buildStages) into @clbipp/ui/lifecycle-view, because
// /t/[token] rendered its own copy of all of it and kept falling behind. What
// stays here is what is genuinely authenticated-only: the partner card, the
// realtime subscription, the document CTAs, and this screen's own banner copy.
//
// Material weights come from `parseMaterialWeights` (@clbipp/core), which
// already drops `value_paise` defensively. This screen used to declare its own
// `MaterialItem` type that NAMED value_paise — a type spelling out the one
// field the locked rule forbids rendering is a footgun, and it is gone.

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
      // Batch 8. Existence only — the receipt and payout screens re-read and
      // re-scope their own rows, so there is nothing to gain by pulling the
      // detail into this page's payload.
      receipt: { select: { receiptNo: true } },
      payment: { select: { status: true } },
    },
  })
  if (!pickup) notFound()

  const stages = buildStages(pickup.statusEvents)
  const status = pickup.status
  const materials = parseMaterialWeights(pickup.offer?.materialBreakdown)

  // The query above is already scoped by vendorId, which is what makes signing
  // these photo paths safe — see the ownership note in @/lib/custody.
  const custody = await buildCustodyEntries(pickup.statusEvents)

  // Batch 8: the two things a collected pickup gives the customer to act on.
  // Both render from `collected` onward, so they appear once and stay — a
  // receipt doesn't stop existing because the batteries moved on to testing.
  const documents = (
    <>
      {pickup.payment?.status === 'pending' && (
        <Link href={`/payment/${pickup.id}`} className="block">
          <Button fullWidth>Choose how you get paid</Button>
        </Link>
      )}
      {pickup.receipt && (
        <Link href={`/receipt/${pickup.id}`} className="block">
          <Button variant="secondary" fullWidth>
            View collection receipt
          </Button>
        </Link>
      )}
      {pickup.payment?.status === 'paid' && (
        <Link href={`/payment/${pickup.id}`} className="block">
          <Button variant="secondary" fullWidth>
            View payout
          </Button>
        </Link>
      )}
    </>
  )

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
    return (
      <AppShell title={pickup.id} showBack backHref="/dashboard" hideNav>
        <PagePadding className="flex flex-col gap-4">
          <CancelledTimeline lastStage={lastRecordedStage(pickup.statusEvents)} stages={stages} />
          <Banner variant="error">This pickup was cancelled.</Banner>
          {/* Cancelling isn't a dead end — rescheduling reactivates this same
              pickup with a new date instead of making the customer start a
              fresh request. */}
          <Link href={`/reschedule/${pickup.id}`} className="block">
            <Button fullWidth>Reschedule this pickup</Button>
          </Link>
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
    // Batch 5b (D7): accepting an offer leaves the status at `offered`, so this
    // one stage covers two very different situations — the vendor still has a
    // decision to make, or they've made it and the agent hasn't arrived to
    // collect yet. Both are read off the acceptance timestamp, never the status.
    const offerAccepted = Boolean(pickup.offer?.acceptedAt)

    const banner: Record<typeof status, string> = {
      requested: "Your request is in. We'll confirm a collection slot shortly.",
      scheduled: 'Collection is scheduled. Track this screen on the day.',
      arrived: 'Your collection agent is on site and assessing the batteries.',
      offered: offerAccepted
        ? 'Offer accepted. Your agent will load the batteries and confirm the handover on site.'
        : 'Your offer is ready. Review it to confirm handover.',
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
              would send the customer on a round trip to /scheduled.

              Once accepted, /offer redirects to /handover anyway — link there
              directly rather than sending the customer through a bounce. */}
          {status === 'offered' && pickup.offer && (
            <Link
              href={offerAccepted ? `/handover?id=${pickup.id}` : `/offer?id=${pickup.id}`}
              className="block"
            >
              <Button fullWidth>{offerAccepted ? 'View acceptance' : 'View offer'}</Button>
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
          {documents}
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
          <RecoverySummary materials={materials} />
          <Banner variant="tinted">
            Your EPR certificate becomes available once certified.
          </Banner>
          {documents}
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
        <RecoverySummary materials={materials} />
        <Banner variant="success">Certificate ready — added to your compliance log.</Banner>
        <Link href={`/certificates/${pickup.id}`}>
          <Button fullWidth>View certificate</Button>
        </Link>
        {documents}
        <CustodyLog entries={custody} />
      </PagePadding>
    </AppShell>
  )
}
