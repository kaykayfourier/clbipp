// /pickups/[id]  —  Batch 8 · Aamir
//
// The agent's watch-only lifecycle timeline for one job. This is where a job
// goes once there is nothing left to do to it, and it is the only screen in
// this app that subscribes to Realtime.
//
// ⚠ The timeline is `lifecycle-view.tsx` from @clbipp/ui — the SAME component
// the customer's /track/[id] and the public /t/[token] render. The wireframe
// drew a parallel six-stage vocabulary here (Collected → Transit → Warehouse →
// Refurb/QA → Done); none of those are lifecycle stages, and building them
// would mean re-declaring the stage list in a screen. Resolved by D5/W4 — see
// §0 of PLAN_FIELD_AGENT_APP.md before "fixing" this back.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { formatPaise } from '@clbipp/core/format'
import {
  AppShell,
  Banner,
  Button,
  Card,
  CardContent,
  CancelledTimeline,
  CustodyLog,
  LifecycleHeader,
  PagePadding,
  Timeline,
  buildStages,
  isStageBefore,
  lastRecordedStage,
} from '@clbipp/ui'
import type { LifecycleStage } from '@clbipp/ui'

import { AGENT_ROLE_LABELS, buildAgentCustodyEntries } from '@/lib/custody'
import { PickupRealtime } from './PickupRealtime'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    select: {
      id: true,
      agentId: true,
      status: true,
      custodyBatchId: true,
      agentFeePaise: true,
      vendor: { select: { fullName: true, companyName: true } },
      statusEvents: {
        orderBy: { occurredAt: 'asc' },
        select: {
          id: true,
          status: true,
          occurredAt: true,
          actorRole: true,
          notes: true,
          lat: true,
          lng: true,
          photoUrls: true,
        },
      },
      // Batch 5b: the acceptance timestamp, not the status, is what says whether
      // the vendor has decided. See the banner block below.
      offer: { select: { acceptedAt: true, estimatedPrice: true } },
      custodyBatch: { select: { batchNo: true, handedOffAt: true } },
    },
  })

  // 🔴 Ownership in code — Prisma bypasses RLS (D10). `notFound()` rather than
  // a "not yours" message, so the screen doesn't confirm to an agent that some
  // other agent's pickup id exists. Same call every other agent screen makes.
  if (!pickup || pickup.agentId !== user.id) notFound()

  const status = pickup.status
  const stages = buildStages(pickup.statusEvents)
  // Signing happens AFTER the ownership check above, deliberately: a signed URL
  // is a live capability, so minting one for a pickup you haven't verified
  // hands out access.
  const custody = await buildAgentCustodyEntries(pickup.statusEvents)
  const vendorName = pickup.vendor.companyName ?? pickup.vendor.fullName

  const header = (
    <Card variant="elevated">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-text-primary">{vendorName}</p>
          <p className="mt-0.5 font-mono text-xs text-text-secondary">{pickup.id}</p>
        </div>
        {/* The agent's own fee, plainly — the inverse of the vendor-visibility
            rule, and the same figure the job screen shows. */}
        {pickup.agentFeePaise !== null && (
          <div className="shrink-0 text-right">
            <p className="font-serif text-lg font-semibold text-text-primary">
              {formatPaise(pickup.agentFeePaise)}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-text-secondary">Your fee</p>
          </div>
        )}
      </CardContent>
    </Card>
  )

  // ── Cancelled ─────────────────────────────────────────────────────────────
  // ⚠ NOT a dead end. `cancelled` has been re-enterable since 2026-08-23 — the
  // vendor rescheduling writes `cancelled → requested` on this same row. So the
  // copy says "called off", not "closed", and this screen has to survive the
  // pickup coming back to life under it.
  if (status === 'cancelled') {
    return (
      <AppShell title={pickup.id} showBack backHref="/pickups" hideNav>
        <PickupRealtime pickupId={pickup.id} />
        <PagePadding className="flex flex-col gap-4">
          {header}
          <CancelledTimeline lastStage={lastRecordedStage(pickup.statusEvents)} stages={stages} />
          <Banner variant="error">
            The vendor called this pickup off. Nothing more to do — if they
            reschedule it, it comes back to your day view.
          </Banner>
          <CustodyLog entries={custody} roleLabels={AGENT_ROLE_LABELS} />
        </PagePadding>
      </AppShell>
    )
  }

  // ── What this job wants the agent to know ─────────────────────────────────
  // 🔴 `offered` is TWO states and only `Offer.acceptedAt` separates them
  // (Batch 5b / D7). Switching on the status alone here would tell an agent to
  // go and collect a load the vendor has not agreed to sell yet, which is the
  // exact mistake that batch existed to make impossible.
  const offerAccepted = Boolean(pickup.offer?.acceptedAt)
  const handedOver = !isStageBefore(status, 'collected') && status !== 'collected'
  const inVan = status === 'collected' && pickup.custodyBatchId === null

  let banner: { variant: 'info' | 'success' | 'tinted'; text: string }
  if (status === 'offered' && !offerAccepted) {
    banner = {
      variant: 'info',
      text: 'Offer is with the vendor. Nothing to do until they accept — you will see it here.',
    }
  } else if (status === 'offered' && offerAccepted) {
    banner = {
      variant: 'success',
      text: 'The vendor accepted. Load the batteries and confirm the collection on site.',
    }
  } else if (inVan) {
    banner = {
      variant: 'info',
      text: 'Collected and in your vehicle. It stays your responsibility until the hub signs for it.',
    }
  } else if (handedOver) {
    // The "your role ends at drop-off" lock. Everything from here is the
    // recovery hub's work, and there is deliberately no control on this screen
    // that could advance it — agents write `arrived`, `offered` and
    // `collected`, and nothing else (D7).
    banner = {
      variant: 'tinted',
      text: 'Handed over — your part is done. Testing, processing and certification happen at the hub.',
    }
  } else {
    banner = {
      variant: 'info',
      text: 'This screen updates itself as the job moves. No need to refresh.',
    }
  }

  return (
    <AppShell title={pickup.id} showBack backHref="/pickups" hideNav>
      <PickupRealtime pickupId={pickup.id} />
      <PagePadding className="flex flex-col gap-4">
        {header}

        <LifecycleHeader status={status as LifecycleStage} />
        {/* overflow-visible: Card's default overflow-hidden clips the
            timeline's animate-ping glow. */}
        <Card className="overflow-visible">
          <Timeline
            currentStage={status as LifecycleStage}
            stages={stages}
            pulse={status !== 'certified'}
          />
        </Card>

        <Banner variant={banner.variant}>{banner.text}</Banner>

        {pickup.custodyBatch && (
          <Card>
            <CardContent className="flex flex-col gap-1">
              <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                Handed over
              </p>
              <p className="text-sm font-semibold text-text-primary">
                {pickup.custodyBatch.batchNo}
              </p>
              <p className="text-xs text-text-secondary">
                {pickup.custodyBatch.handedOffAt.toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </CardContent>
          </Card>
        )}

        <Link href={`/pickups/${pickup.id}/map`} className="block">
          <Button variant="secondary" fullWidth>
            See the collection point
          </Button>
        </Link>

        <CustodyLog entries={custody} roleLabels={AGENT_ROLE_LABELS} />
      </PagePadding>
    </AppShell>
  )
}
