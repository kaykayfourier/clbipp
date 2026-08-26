import Link from 'next/link'

import { prisma } from '@clbipp/database'
import { categoryLabel } from '@clbipp/core/intake'

import { formatAge, formatIstDate } from '@/lib/ist'

// B02 · Dispatch board — Batch 3, owner A — Aamir.
//
// 🔴 The screen the wireframe does not have (W1) and the demo cannot start
// without. Everything at `requested` is a booking the customer app made that no
// agent can see yet; assigning it here is the ONLY in-app route from a vendor's
// request to an agent's day view. `npm run assign-job` remains the CLI fallback.
//
// Sorted OLDEST FIRST, deliberately: this is a queue, and the row that has been
// waiting three days is the one that matters, not the newest one.
//
// 🔴 It does NOT filter on `agentId: null`. A pickup reactivated after a
// cancellation (`cancelled → requested`) keeps its old `agentId` and
// `agentFeePaise` — trap 11, seed fixture 8, PKP-2026-000114 — so filtering the
// obvious way would hide exactly the row that is most stuck, from the only
// screen that can unstick it. It is listed like any other request, with the
// stale agent called out.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).

// Every read on this screen goes through Prisma as the table owner, so no RLS
// policy is involved (AD3). The access boundary is src/proxy.ts plus the
// ConsoleShell's own session check, not the database.
export const dynamic = 'force-dynamic'

export default async function DispatchPage() {
  const requests = await prisma.pickup.findMany({
    where: { status: 'requested' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      preferredDate: true,
      location: true,
      category: true,
      notes: true,
      agentId: true,
      agentFeePaise: true,
      vendor: { select: { fullName: true, companyName: true } },
      agent: { select: { fullName: true } },
      items: { select: { id: true, category: true, quantity: true, weightKg: true } },
    },
  })

  const now = new Date()
  const staleCount = requests.filter((r) => r.agentId !== null).length

  return (
    <>
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          Dispatch board
        </h1>
        <p className="mt-1 text-xs text-text-secondary">
          Unassigned requests waiting for an agent. Oldest first.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Stat value={String(requests.length)} label="Waiting" />
        <Stat
          value={requests.length ? formatAge(requests[0].createdAt, now) : '—'}
          label="Oldest request"
        />
        <Stat
          value={String(staleCount)}
          label="Carrying a stale agent"
          tone={staleCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-console-line bg-surface px-6 py-12 text-center">
          <p className="text-sm font-bold text-text-primary">Nothing waiting</p>
          <p className="mx-auto mt-1 max-w-[380px] text-xs leading-relaxed text-text-secondary">
            Every request has an agent on it. New bookings from the vendor app land here the moment
            they are made.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-console-line bg-surface">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <Th>Pickup</Th>
                <Th>Vendor</Th>
                <Th>Location</Th>
                <Th>Declared</Th>
                <Th>Preferred date</Th>
                <Th>Waiting</Th>
                <Th align="right">{''}</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                // `weightKg` is the TOTAL weight of a line, not per unit
                // (packages/core/src/booking.ts). Summing it is correct;
                // multiplying by quantity would double-count.
                const units = r.items.reduce((sum, i) => sum + i.quantity, 0)
                const kg = r.items.reduce((sum, i) => sum + Number(i.weightKg ?? 0), 0)
                const categories = [...new Set(r.items.map((i) => categoryLabel(i.category)))]

                return (
                  <tr key={r.id} className="border-t border-console-line align-top">
                    <Td>
                      <Link
                        href={`/dispatch/${encodeURIComponent(r.id)}`}
                        className="font-mono text-[11px] font-bold text-text-primary underline-offset-2 hover:underline"
                      >
                        {r.id}
                      </Link>
                      {r.agentId ? (
                        // 🔴 Trap 11 made visible. Without this the row looks
                        // like any other request and the stale agent gets
                        // silently overwritten — or worse, left in place.
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-warning-text">
                            Previously assigned to {r.agent?.fullName ?? 'an agent'}
                          </span>
                        </div>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="font-medium text-text-primary">
                        {r.vendor.companyName || r.vendor.fullName}
                      </div>
                      {r.vendor.companyName ? (
                        <div className="text-xs text-text-secondary">{r.vendor.fullName}</div>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="max-w-[260px] text-xs leading-relaxed text-text-secondary">
                        {r.location}
                      </div>
                    </Td>
                    <Td>
                      <div className="text-xs text-text-primary">
                        {r.items.length} line{r.items.length === 1 ? '' : 's'} · {units} unit
                        {units === 1 ? '' : 's'}
                        {kg > 0 ? ` · ${kg.toFixed(1)} kg` : ''}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {categories.join(' · ') || categoryLabel(r.category)}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-xs text-text-secondary">
                        {r.preferredDate ? formatIstDate(r.preferredDate) : 'No preference'}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11px] text-text-primary">
                        {formatAge(r.createdAt, now)}
                      </span>
                    </Td>
                    <Td align="right">
                      <Link
                        href={`/dispatch/${encodeURIComponent(r.id)}`}
                        className="inline-flex items-center rounded-lg bg-primary-black px-3 py-1.5 text-xs font-bold text-primary-green transition-opacity hover:opacity-90"
                      >
                        Assign
                      </Link>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-text-secondary">
        Assigning writes <span className="font-mono text-[11px]">requested → scheduled</span> and
        puts the job on that agent&rsquo;s day view. The CLI fallback,{' '}
        <span className="font-mono text-[11px]">npm run assign-job</span>, still works and does the
        same thing without an audit trail.
      </p>
    </>
  )
}

// ── Local presentation ───────────────────────────────────────────────────────
// Deliberately local to this screen, not a new file under
// src/components/console/: that directory is C's console kit (Batch 2), it does
// not exist yet, and Batch 3 is not allowed to block on it. When DataTable and
// KpiTile land, these three are the things to delete — the markup below is
// intentionally plain so that swap is mechanical. See docs/LANE_OWNERSHIP.md.

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className={`px-3 pt-3 pb-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <td className={`px-3 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</td>
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
