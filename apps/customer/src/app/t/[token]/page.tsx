import { notFound } from 'next/navigation'
import { prisma } from '@clbipp/database'
import { parseMaterialWeights } from '@clbipp/core'
import { AppShell, PagePadding } from '@clbipp/ui'
import { Timeline } from '@clbipp/ui'
import { Banner } from '@clbipp/ui'
import { Card } from '@clbipp/ui'
import { CustodyLog } from '@clbipp/ui'
import {
  buildStages,
  CancelledTimeline,
  lastRecordedStage,
  LifecycleHeader,
  RecoverySummary,
} from '@clbipp/ui'
import type { LifecycleStage } from '@clbipp/ui'
import { buildCustodyEntries } from '@/lib/custody'

// ─── /t/<publicToken> — the public tracking view ─────────────────────────────
// Anyone holding the token can see a pickup's lifecycle — no login (see
// middleware: `/t` is a public path). Prisma bypasses RLS on the service-role
// connection, so THE TOKEN ITSELF IS THE CAPABILITY.
//
// Batch 10: the lifecycle presentation is now shared with /track/[id] via
// @clbipp/ui/lifecycle-view instead of being a copy of it. That is the parity
// fix — this page had drifted behind the authenticated one three times, always
// because a change was made in one file and not the other.
//
// ⚠ SHARING THE LAYOUT DOES NOT SHARE THE DATA. Everything withheld from an
// anonymous viewer is still withheld, and it is withheld deliberately:
//
//   · NO PHOTOS. `includePhotos: false` SKIPS MINTING THE SIGNED URLS ENTIRELY
//     rather than hiding rendered images — an unrendered signed URL is still a
//     live capability if it reaches the client. This token is a bearer
//     capability that can be forwarded to anyone, and photos of a customer's
//     premises and stock are more sensitive than the stage timestamps and
//     recovered weights this page already shows.
//   · NO PARTNER CARD. An anonymous link must not hand out an agent's personal
//     phone number.
//   · NO REALTIME. The subscription runs on the anon browser client, which RLS
//     scopes to the owning vendor — it would silently no-op here.
//   · NO AUTH-ONLY CTAs. /offer, /certificates, /payment and /receipt would all
//     bounce an anonymous viewer to /login.
//   · NO VENDOR IDENTITY, and no ₹ / recovery-rate — same locked rules as the
//     authenticated screen.
//
// Deliberate defaults. Flag them if the company wants otherwise; don't relax
// one because the layouts now match.

// publicToken is a Postgres uuid column — passing a non-UUID string makes the
// query throw on cast rather than return null. Guard the format so a garbage
// token renders 404, not a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(value: string) {
  return UUID_RE.test(value)
}

export default async function PublicTrackPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!isUuid(token)) notFound()

  // No vendorId scoping — the token is the scope. Prisma bypasses RLS.
  const pickup = await prisma.pickup.findFirst({
    where: { publicToken: token },
    include: {
      statusEvents: { orderBy: { occurredAt: 'asc' } },
      offer: true,
    },
  })
  if (!pickup) notFound()

  const stages = buildStages(pickup.statusEvents)
  const status = pickup.status
  const materials = parseMaterialWeights(pickup.offer?.materialBreakdown)

  // Timestamps and GPS, but NOT photos — see the isolation note above.
  const custody = await buildCustodyEntries(pickup.statusEvents, { includePhotos: false })

  // hideNav drops the bottom tab bar and its padding — anonymous visitors have
  // no dashboard/tabs. No showBack for the same reason.

  // ── Cancelled ─────────────────────────────────────────────────────────────
  if (status === 'cancelled') {
    return (
      <AppShell title={pickup.id} hideNav>
        <PagePadding className="flex flex-col gap-4">
          <CancelledTimeline lastStage={lastRecordedStage(pickup.statusEvents)} stages={stages} />
          <Banner variant="error">This pickup was cancelled.</Banner>
          <CustodyLog entries={custody} showPhotos={false} />
        </PagePadding>
      </AppShell>
    )
  }

  // ── Pre-collection (requested / scheduled / arrived / offered) ────────────
  // Mirrors the authenticated screen's bucket, minus the offer call to action:
  // /offer is auth-only and would bounce an anonymous viewer to /login. The
  // copy is third-person throughout — this reader is not the vendor.
  if (
    status === 'requested' ||
    status === 'scheduled' ||
    status === 'arrived' ||
    status === 'offered'
  ) {
    // Batch 5b (D7): `offered` covers both "awaiting the vendor" and "the
    // vendor has accepted, awaiting collection". Read off the acceptance
    // timestamp, same as the authenticated screen. No new data reaches this
    // page — `offer` was already in the query — and a boolean "did they say
    // yes" is not a price, so the no-value-to-strangers rule is untouched.
    const offerAccepted = Boolean(pickup.offer?.acceptedAt)

    const banner: Record<typeof status, string> = {
      requested: 'This pickup is confirmed. Collection will be arranged shortly.',
      scheduled: 'Collection is scheduled.',
      arrived: 'The collection agent is on site.',
      offered: offerAccepted
        ? 'The offer has been accepted. The agent will collect the batteries on site.'
        : 'An offer has been made and is awaiting the vendor.',
    }

    return (
      <AppShell title={pickup.id} hideNav>
        <PagePadding className="flex flex-col gap-4">
          <LifecycleHeader status={status} />
          <Card className="overflow-visible">
            <Timeline currentStage={status} stages={stages} pulse />
          </Card>
          <Banner variant="info">{banner[status]}</Banner>
          <CustodyLog entries={custody} showPhotos={false} />
        </PagePadding>
      </AppShell>
    )
  }

  // ── In-progress (collected / tested / processed) ───────────────────────────
  if (status === 'collected' || status === 'tested' || status === 'processed') {
    return (
      <AppShell title={pickup.id} hideNav>
        <PagePadding className="flex flex-col gap-4">
          <LifecycleHeader status={status as LifecycleStage} />
          <Card className="overflow-visible">
            <Timeline currentStage={status} stages={stages} pulse />
          </Card>
          <Banner variant="tinted">
            Recovery breakdown and certificate unlock once recovered.
          </Banner>
          <CustodyLog entries={custody} showPhotos={false} />
        </PagePadding>
      </AppShell>
    )
  }

  // ── Recovered ─────────────────────────────────────────────────────────────
  if (status === 'recovered') {
    return (
      <AppShell title={pickup.id} hideNav>
        <PagePadding className="flex flex-col gap-4">
          <LifecycleHeader status="recovered" />
          <Card className="overflow-visible">
            <Timeline currentStage="recovered" stages={stages} pulse />
          </Card>
          <RecoverySummary materials={materials} />
          <Banner variant="tinted">
            The EPR certificate becomes available once certified.
          </Banner>
          <CustodyLog entries={custody} showPhotos={false} />
        </PagePadding>
      </AppShell>
    )
  }

  // ── Certified ─────────────────────────────────────────────────────────────
  // No "View certificate" button here: it links to the auth-only /certificates
  // route, which would bounce an anonymous viewer to /login.
  return (
    <AppShell title={pickup.id} hideNav>
      <PagePadding className="flex flex-col gap-4">
        <LifecycleHeader status="certified" />
        <Card>
          <Timeline currentStage="certified" stages={stages} />
        </Card>
        <RecoverySummary materials={materials} />
        <Banner variant="success">This pickup has been certified.</Banner>
        <CustodyLog entries={custody} showPhotos={false} />
      </PagePadding>
    </AppShell>
  )
}
