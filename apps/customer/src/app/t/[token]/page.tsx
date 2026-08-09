import { notFound } from 'next/navigation'
import { prisma } from '@clbipp/database'
import { AppShell, PagePadding } from '@clbipp/ui'
import { Timeline, Connector } from '@clbipp/ui'
import { Banner } from '@clbipp/ui'
import { Card } from '@clbipp/ui'
import { StatusBadge } from '@clbipp/ui'
import type { LifecycleStage } from '@clbipp/ui'

// Public tracking view for `/t/<publicToken>`. Anyone holding the token can see
// a pickup's lifecycle — no login required (see middleware: `/t` is a public
// path). Prisma bypasses RLS on the service-role connection, so the token itself
// is the capability. This route is deliberately self-contained: it mirrors the
// authenticated /track/[id] screen's structure but strips everything that needs
// a session (back-nav, realtime, the auth-only certificate link). Renders no
// vendor identity and no ₹ value / recovery-rate — same locked rules as the
// authenticated screen.

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

// publicToken is a Postgres uuid column — passing a non-UUID string makes the
// query throw on cast rather than return null. Guard the format so a garbage
// token renders 404, not a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(value: string) {
  return UUID_RE.test(value)
}

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

function LifecycleHeader({ status }: { status: LifecycleStage }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">Lifecycle</p>
      <StatusBadge status={status} />
    </div>
  )
}

// Recovery summary: stat box (kg) + expandable material breakdown.
// ₹ values and recovery rate are intentionally omitted — locked rule.
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
  const breakdown = safeBreakdown(pickup.offer?.materialBreakdown)

  // hideNav drops the bottom tab bar and its padding — anonymous visitors have
  // no dashboard/tabs. No showBack for the same reason.

  // ── Cancelled ─────────────────────────────────────────────────────────────
  if (status === 'cancelled') {
    const lastLifecycleEvent = [...pickup.statusEvents]
      .reverse()
      .find(e => LIFECYCLE.includes(e.status as LifecycleStage))
    const lastStage = (lastLifecycleEvent?.status ?? 'requested') as LifecycleStage
    return (
      <AppShell title={pickup.id} hideNav>
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
        </PagePadding>
      </AppShell>
    )
  }

  // ── Early (requested / scheduled) ─────────────────────────────────────────
  if (status === 'requested' || status === 'scheduled') {
    return (
      <AppShell title={pickup.id} hideNav>
        <PagePadding className="flex flex-col gap-4">
          <LifecycleHeader status={status as LifecycleStage} />
          <Card className="overflow-visible">
            <Timeline currentStage={status} stages={stages} pulse />
          </Card>
          <Banner variant="info">
            This pickup is confirmed. Collection will be arranged shortly.
          </Banner>
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
          <RecoverySummary breakdown={breakdown} />
          <Banner variant="tinted">
            The EPR certificate becomes available once certified.
          </Banner>
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
        <RecoverySummary breakdown={breakdown} />
        <Banner variant="success">This pickup has been certified.</Banner>
      </PagePadding>
    </AppShell>
  )
}
