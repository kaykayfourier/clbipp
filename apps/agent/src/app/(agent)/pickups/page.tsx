// /pickups  —  Batch 8 · Aamir
//
// The agent's own jobs, all of them, in one list. The day view (`/`) shows
// today's slate and the three stats; this is the full picture, and it is the
// only route into the lifecycle timelines at /pickups/[id].
//
// ⚠ This screen and `/` are two views of the SAME rows. Every routing and
// wording decision comes from `@/lib/job-nav` — none of it is re-derived here,
// because two lists that describe the same job differently is a drift bug
// waiting for a demo.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import {
  AppShell,
  Card,
  CardContent,
  EmptyState,
  ListRow,
  PagePadding,
  SectionLabel,
} from '@clbipp/ui'

import { isActiveJob, jobHref, jobNextStep, jobSubtitle } from '@/lib/job-nav'

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The proxy already guarantees an agent session (src/proxy.ts); this is
  // belt-and-braces for a direct render, and must bounce rather than 500.
  if (!user) redirect('/login')

  // Scoped by `agentId` IN CODE. Prisma connects as the table owner and bypasses
  // RLS, so this where-clause is the entire access control on this read — the
  // agent SELECT policy Batch 8 added is for the browser's Realtime channel and
  // is never consulted here.
  const jobs = await prisma.pickup.findMany({
    where: { agentId: user.id },
    select: {
      id: true,
      status: true,
      custodyBatchId: true,
      scheduledSlot: true,
      vendor: { select: { fullName: true } },
      _count: { select: { items: true } },
      items: { select: { quantity: true, confirmedWeightKg: true, weightKg: true } },
    },
    orderBy: [{ scheduledSlot: 'desc' }, { createdAt: 'desc' }],
  })

  const active = jobs.filter((job) => isActiveJob(job.status, job.custodyBatchId))
  // Everything else EXCEPT the archive. `certified` and `cancelled` are what
  // /history is for; repeating them here would make this list grow forever and
  // bury the two rows that actually need attention.
  const watching = jobs.filter(
    (job) =>
      !isActiveJob(job.status, job.custodyBatchId) &&
      job.status !== 'certified' &&
      job.status !== 'cancelled',
  )

  // The derived "pending drop-off" state (D5 — NOT a tenth lifecycle stage):
  // collected by this agent, not yet in a CustodyBatch. These are the loads
  // physically in the agent's vehicle right now, which is why they get a
  // shortcut of their own rather than just a row in the list.
  const pendingDropoff = jobs.filter(
    (job) => job.status === 'collected' && job.custodyBatchId === null,
  )
  const pendingUnits = pendingDropoff.reduce(
    (sum, job) => sum + job.items.reduce((n, item) => n + item.quantity, 0),
    0,
  )
  // The agent's CONFIRMED weight where they have recorded one, falling back to
  // the customer's declaration where they haven't. The two halves of a
  // BatteryItem are allowed to disagree and neither overwrites the other — this
  // is a display preference for the more accurate number, not a merge.
  const pendingKg = pendingDropoff.reduce(
    (sum, job) =>
      sum +
      job.items.reduce(
        (n, item) => n + Number(item.confirmedWeightKg ?? item.weightKg ?? 0),
        0,
      ),
    0,
  )

  return (
    <AppShell title="My pickups" hideNav>
      <PagePadding className="flex flex-col gap-4">
        <div>
          <h1 className="font-serif text-2xl font-medium text-text-primary">My pickups</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Every job assigned to you. Tap any row to see where it has got to.
          </p>
        </div>

        {/* ── Pending drop-off ──────────────────────────────────────────────
            Rendered only when there is something in the van. A permanent card
            reading "0 loads" is noise on a screen an agent checks between
            jobs. */}
        {pendingDropoff.length > 0 && (
          <Link href="/dropoff" className="block">
            <Card variant="elevated">
              <CardContent className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {/* One template literal per line, not interpolation mixed
                      into JSX text. React separates adjacent text nodes with
                      <!-- --> markers in the server-rendered HTML, so
                      `{n} load to drop off` never appears as a contiguous
                      string and `npm run smoke` cannot assert on it. */}
                  <p className="text-[15px] font-bold text-text-primary">
                    {`${pendingDropoff.length} load${
                      pendingDropoff.length === 1 ? '' : 's'
                    } to drop off`}
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {`${pendingUnits} unit${
                      pendingUnits === 1 ? '' : 's'
                    } · ~${pendingKg.toFixed(1)} kg · take them to the hub together`}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-text-primary underline underline-offset-2">
                  Drop off
                </span>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* ── Needs you ─────────────────────────────────────────────────────
            Routed by `jobHref`, so a row lands the agent wherever that job
            wants them next — job detail, the safety gate, the offer, or the
            drop-off flow. Same rule as the day view. */}
        <div className="flex flex-col gap-3">
          <SectionLabel>Needs you</SectionLabel>
          {active.length === 0 ? (
            <EmptyState
              heading="Nothing open"
              description="Every job assigned to you is done or on its way through recovery. New ones appear here the moment they're scheduled."
            />
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

        {/* ── Watching ──────────────────────────────────────────────────────
            Handed over and moving through recovery. These rows go to the
            TIMELINE, not through `jobHref` — there is nothing left to resume,
            and the only question an agent has about one of these is "where has
            it got to". */}
        {watching.length > 0 && (
          <div className="flex flex-col gap-3">
            <SectionLabel>Handed over — in recovery</SectionLabel>
            <div className="flex flex-col gap-2">
              {watching.map((job) => (
                <Link key={job.id} href={`/pickups/${job.id}`}>
                  <ListRow id={job.id} subtitle={jobSubtitle(job)} status={job.status} />
                </Link>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-text-secondary">
              Your part on these is finished. They stay here so you can check
              progress, and move to History once certified.
            </p>
          </div>
        )}
      </PagePadding>
    </AppShell>
  )
}
