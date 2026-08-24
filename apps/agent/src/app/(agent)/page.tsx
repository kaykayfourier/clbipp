// /  —  Batch 1 · Aamir
//
// The day view. The agent's own assigned jobs, three stats, and nothing else.
//
// ⚠ There is deliberately NO "New requests nearby" section, even though the
// wireframe draws one with a "2 new" badge. Jobs are PUSHED (D2): `agentId` is
// set when the pickup is scheduled, there is no pool to claim from, no distance
// ranking and no claim race. Adding that feed back would also re-open the RLS
// problem D2 exists to avoid — an agent SELECTing pickups they don't own.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { formatPaise } from '@clbipp/core/format'
import { AppShell, Card, CardContent, InstallPrompt, ListRow, PagePadding, SectionLabel } from '@clbipp/ui'

import { isActiveJob, jobHref, jobNextStep, jobSubtitle } from '@/lib/job-nav'

// Stats are scoped to the local day, not a rolling 24h. "Earned today" resetting
// at 3pm because that is when yesterday's shift started would be wrong on a
// screen an agent checks between jobs.
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfToday(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Card variant="elevated">
      <CardContent>
        <div className="font-serif text-xl font-semibold text-text-primary">{value}</div>
        <div className="mt-1 text-[10px] uppercase tracking-widest text-text-secondary">
          {label}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyQueue() {
  return (
    <Card variant="elevated">
      <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-background">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect
              x="2"
              y="5"
              width="15"
              height="10"
              rx="2"
              stroke="var(--color-text-disabled)"
              strokeWidth="1.5"
            />
            <path
              d="M17 8v4"
              stroke="var(--color-text-disabled)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-sm font-bold text-text-primary">Queue&rsquo;s empty</p>
        <p className="max-w-[240px] text-xs leading-relaxed text-text-secondary">
          No pickups assigned right now. New jobs appear here the moment
          they&rsquo;re scheduled — you don&rsquo;t need to go looking for them.
        </p>
      </CardContent>
    </Card>
  )
}

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The proxy already guarantees a session with role `agent` (src/proxy.ts), so
  // this is belt-and-braces for a direct render rather than the security
  // boundary. It must not throw — an unauthenticated render should bounce, not
  // 500.
  if (!user) redirect('/login')

  // ── The agent's jobs ───────────────────────────────────────────────────────
  // Scoped by `agentId` IN CODE. Prisma connects as the table owner and bypasses
  // RLS by design (D10), so this where-clause is the whole of the access
  // control on this read. Batch 8 added an agent SELECT policy on `pickups`,
  // but ONLY so the browser's Realtime subscription can see rows — Prisma
  // connects as the table owner and never consults it, so this where-clause is
  // still the only thing standing between an agent and someone else's jobs.
  const [profile, jobs, collectedToday, assignedToday] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    }),

    prisma.pickup.findMany({
      where: { agentId: user.id },
      select: {
        id: true,
        status: true,
        custodyBatchId: true,
        scheduledSlot: true,
        vendor: { select: { fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ scheduledSlot: 'asc' }, { createdAt: 'desc' }],
    }),

    // Collected today + earned today come from ONE query. The `collected`
    // status event is the moment of collection; the pickup's `agentFeePaise` is
    // what the agent earned for it (D3 — distinct from what the vendor is paid).
    //
    // ⚠ This reads `agentFeePaise` rather than the agent's wallet ledger,
    // because no `agent_fee` WalletTxn rows exist yet — Batch 6 writes them at
    // collection. When it does, the two MUST agree: WalletTxn is the source of
    // truth and this figure is derived from the same fee column that funds it.
    prisma.statusEvent.findMany({
      where: {
        status: 'collected',
        actorId: user.id,
        occurredAt: { gte: startOfToday() },
      },
      select: { pickup: { select: { agentFeePaise: true } } },
    }),

    prisma.pickup.count({
      where: {
        agentId: user.id,
        scheduledSlot: { gte: startOfToday(), lte: endOfToday() },
      },
    }),
  ])

  const earnedTodayPaise = collectedToday.reduce(
    (sum, event) => sum + (event.pickup.agentFeePaise ?? 0),
    0,
  )

  // Two lists, split by whether the job still wants something from the agent.
  // The split is `isActiveJob`, not a hard-coded status set — see job-nav.ts.
  const active = jobs.filter((job) => isActiveJob(job.status, job.custodyBatchId))
  const recent = jobs.filter((job) => !isActiveJob(job.status, job.custodyBatchId)).slice(0, 3)

  // First name only — "Good morning, Ravi Kumar" reads like a letter, not a
  // greeting. Falls back to the bare greeting rather than to the email.
  const firstName = profile?.fullName?.trim().split(/\s+/)[0]

  return (
    <AppShell hideNav>
      <PagePadding className="flex flex-col gap-4">
        <div>
          <h1 className="font-serif text-2xl font-medium text-text-primary">
            {firstName ? `${greeting()}, ${firstName}` : greeting()}
          </h1>
          <p className="text-sm text-text-secondary">
            {active.length === 0
              ? 'Nothing on your slate right now.'
              : `${active.length} job${active.length === 1 ? '' : 's'} still open.`}
          </p>
        </div>

        {/* Renders only when the browser says the app is installable and the
            agent hasn't dismissed it — see the component. An agent working a
            round is exactly who benefits from a home-screen icon. */}
        <InstallPrompt
          appName="Field Agent"
          mark="FA"
          blurb="Add it to your home screen — one tap to today's jobs, no browser in the way."
        />

        {/* Assigned / Collected / Earned. No "Avg margin" — the wireframe puts
            it here but it is a business figure, and an agent's own margin is an
            odd thing to put on their home screen. It belongs to the admin app. */}
        <div className="grid grid-cols-3 gap-2">
          <StatTile value={String(assignedToday)} label="Assigned today" />
          <StatTile value={String(collectedToday.length)} label="Collected today" />
          <StatTile value={formatPaise(earnedTodayPaise)} label="Earned today" />
        </div>

        {/* TODO (Batch 8): the wireframe's offline banner ("2 items queued,
            synced when connection returned") goes here. Left out on purpose —
            there is no offline queue to report on until the PWA work lands, and
            a hard-coded banner would be a lie on the screen. */}

        <div className="flex flex-col gap-3">
          <SectionLabel>Your jobs</SectionLabel>

          {active.length === 0 ? (
            <EmptyQueue />
          ) : (
            <div className="flex flex-col gap-2">
              {active.map((job) => (
                <Link
                  key={job.id}
                  href={jobHref(job.status, job.custodyBatchId, job.id)}
                  className="flex flex-col gap-1"
                >
                  <ListRow id={job.id} subtitle={jobSubtitle(job)} status={job.status} />
                  <span className="px-1 text-[11px] text-text-secondary">
                    {jobNextStep(job.status, job.custodyBatchId)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {recent.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <SectionLabel>Recently handed over</SectionLabel>
              <Link
                href="/history"
                className="text-[11px] font-semibold text-text-primary underline underline-offset-2"
              >
                View all
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {recent.map((job) => (
                <Link key={job.id} href={jobHref(job.status, job.custodyBatchId, job.id)}>
                  <ListRow id={job.id} subtitle={jobSubtitle(job)} status={job.status} />
                </Link>
              ))}
            </div>
          </div>
        )}
      </PagePadding>
    </AppShell>
  )
}
