import { prisma } from '@clbipp/database'
import { categoryLabel } from '@clbipp/core/intake'

import { formatAge } from '@/lib/ist'
import { liveJobCounts } from '@/lib/job-load'
import { PageHead } from '@/components/console'

import { DispatchBoard, type DispatchRow } from './DispatchBoard'

// B02 · Dispatch board — Batch 3 (owner A), reworked by FV4.
//
// 🔴 The screen the wireframe does not have (W1) and the demo cannot start
// without. Everything at `requested` is a booking the customer app made that no
// agent can see yet; assigning it here is the ONLY in-app route from a vendor's
// request to an agent's day view. `npm run assign-job` remains the CLI fallback.
//
// ── What FV4 changed ─────────────────────────────────────────────────────────
// The company's feedback asked for operational filters and sorting rather than
// "a basic job list". This page was a hardcoded `status: 'requested'` query
// rendered into a hand-rolled table. It now reads the whole LIVE PIPELINE and
// hands it to <DispatchBoard>, which filters and sorts client-side; the default
// view is still the unassigned queue, so the screen opens on the same rows it
// always did.
//
// 🔴 It STILL does not filter on `agentId: null`, and that is deliberate. A
// pickup reactivated after a cancellation (`cancelled → requested`) keeps its
// old `agentId` and `agentFeePaise` — trap 11, seed fixture 8, PKP-2026-000114.
// Filtering the obvious way would hide exactly the row that is most stuck from
// the only screen that can unstick it.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).

// Every read goes through Prisma as the table owner, so no RLS policy is
// involved (AD3). The access boundary is src/proxy.ts plus ConsoleShell's own
// session check, not the database.
export const dynamic = 'force-dynamic'

/** The pipeline a dispatcher can still act on. Past `collected` the load is in
 *  the hub's hands and belongs to /lifecycle, not to this board. */
const LIVE = ['requested', 'scheduled', 'arrived', 'offered'] as const

export default async function DispatchPage() {
  const [pickups, loads] = await Promise.all([
    prisma.pickup.findMany({
      where: { status: { in: [...LIVE] } },
      // Oldest first: this is a queue, and the row that has been waiting three
      // days matters more than the newest one. DataTable re-sorts from here.
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        preferredDate: true,
        collectionScheduledAt: true,
        location: true,
        category: true,
        agentId: true,
        vendor: { select: { fullName: true, companyName: true } },
        agent: { select: { fullName: true } },
        address: { select: { city: true } },
        items: { select: { id: true, category: true, quantity: true, weightKg: true } },
      },
    }),
    liveJobCounts(),
  ])

  const now = new Date()

  const rows: DispatchRow[] = pickups.map((p) => {
    // `weightKg` is the TOTAL weight of a line, not per unit
    // (packages/core/src/booking.ts). Summing is correct; multiplying by
    // quantity would double-count.
    const units = p.items.reduce((sum, i) => sum + i.quantity, 0)
    const kg = p.items.reduce((sum, i) => sum + Number(i.weightKg ?? 0), 0)
    const categories = [...new Set(p.items.map((i) => categoryLabel(i.category)))]

    return {
      id: p.id,
      status: p.status,
      vendorName: p.vendor.fullName,
      vendorCompany: p.vendor.companyName,
      location: p.location,
      city: p.address?.city ?? null,
      agentId: p.agentId,
      agentName: p.agent?.fullName ?? null,
      // 🔴 Trap 11 made visible: an agent on a row still at `requested` is not
      // an assignment, it is the residue of a cancelled job.
      staleAgent: p.status === 'requested' && p.agentId !== null,
      lines: p.items.length,
      units,
      kg,
      categories: categories.join(' · ') || categoryLabel(p.category),
      createdAt: p.createdAt.toISOString(),
      preferredDate: p.preferredDate ? p.preferredDate.toISOString().slice(0, 10) : null,
      collectionScheduledAt: p.collectionScheduledAt
        ? toDateKey(p.collectionScheduledAt)
        : null,
      waitingLabel: formatAge(p.createdAt, now),
    }
  })

  const waiting = rows.filter((r) => r.status === 'requested')
  const staleCount = waiting.filter((r) => r.staleAgent).length
  const booked = rows.filter((r) => r.collectionScheduledAt !== null)

  // FV4 / feedback §2.2. The dispatcher's other half of the assignment
  // decision: who is already carrying what. One definition, `lib/job-load.ts`,
  // shared with /dispatch/[id] and /agents — the three screens disagreeing
  // about the same agent's load is the bug that file was written to end.
  const byLoad = [...loads.entries()]
    .map(([id, count]) => ({
      name: pickups.find((p) => p.agentId === id)?.agent?.fullName ?? null,
      count,
    }))
    .filter((a): a is { name: string; count: number } => a.name !== null)
    .sort((a, b) => b.count - a.count)

  return (
    <>
      <PageHead
        title="Dispatch board"
        description="The live pipeline — requests waiting for an agent, jobs in progress, and collections booked for a later date."
      />

      <div className="flex flex-wrap gap-3">
        <Stat value={String(waiting.length)} label="Waiting for an agent" />
        <Stat
          value={waiting.length ? waiting[0].waitingLabel : '—'}
          label="Oldest request"
        />
        <Stat value={String(booked.length)} label="Booked for a later date" />
        <Stat
          value={String(staleCount)}
          label="Carrying a stale agent"
          tone={staleCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {byLoad.length > 0 && (
        <div className="rounded-xl border border-console-line bg-surface px-4 py-3">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
            Agent workload right now
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
            {byLoad.map((a) => (
              <span key={a.name} className="text-xs text-text-primary">
                {a.name} — <span className="font-mono font-bold">{a.count}</span> live job
                {a.count === 1 ? '' : 's'}
              </span>
            ))}
          </div>
        </div>
      )}

      <DispatchBoard rows={rows} />

      <p className="text-xs leading-relaxed text-text-secondary">
        Assigning writes <span className="font-mono text-[11px]">requested → scheduled</span> and
        puts the job on that agent&rsquo;s day view. A collection booked for a later date stays at{' '}
        <span className="font-mono text-[11px]">offered</span> — the date is a fact about the job,
        not a tenth lifecycle stage.
      </p>
    </>
  )
}

/** A DateTime column rendered as a plain date key ("YYYY-MM-DD") in the server's
 *  own zone. `toISOString().slice(0,10)` would be wrong: it converts to UTC
 *  first, so a collection booked for the 20th reads as the 19th all evening. */
function toDateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function Stat({
  value,
  label,
  tone = 'default',
}: {
  value: string
  label: string
  tone?: 'default' | 'warning'
}) {
  return (
    <div
      className={`min-w-[170px] flex-1 rounded-xl border px-4 py-3 ${
        tone === 'warning'
          ? 'border-warning-border bg-warning-bg'
          : 'border-console-line bg-surface'
      }`}
    >
      <div className="font-display text-xl font-medium text-text-primary">{value}</div>
      <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </div>
    </div>
  )
}
