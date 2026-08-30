import Link from 'next/link'

import { prisma } from '@clbipp/database'
import type { ManifestStatus } from '@clbipp/database'

import { formatIstDateTime } from '@/lib/ist'
import { MANIFEST_PROGRESSION, MANIFEST_STATUS_LABELS } from '@/lib/lifecycle-units'

// C02 · Dispatch manifests — Batch 6, owner A — Aamir.
//
// The screen W9 says the wireframe is missing: `/facilities` claims "only
// registered recyclers may receive a DispatchManifest" and nothing anywhere
// created one. Facility → recycler is step 6 of 8 in both HR documents.
//
// Grouped by ManifestStatus in progression order, because the four statuses are
// four different jobs: a draft is waiting for a decision, a dispatched one is
// waiting for a recycler, a received one is waiting for reconciliation, and a
// reconciled one is done. A single flat table sorted by date hides all of that.
//
// ⚠ ManifestStatus is NOT the pickup lifecycle. Trap 13 forbids re-declaring
// the nine stages; this is a different four-value enum with no @clbipp/ui
// equivalent, and its order lives in @/lib/lifecycle-units.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell (AD11, trap 15).

export const dynamic = 'force-dynamic'

export default async function ManifestsPage() {
  const manifests = await prisma.dispatchManifest.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      manifestNo: true,
      status: true,
      itemIds: true,
      totalWeightKg: true,
      createdAt: true,
      dispatchedAt: true,
      confirmedAt: true,
      facility: { select: { name: true } },
      recycler: { select: { name: true, isActive: true } },
    },
  })

  const byStatus = new Map<ManifestStatus, typeof manifests>()
  for (const status of MANIFEST_PROGRESSION) byStatus.set(status, [])
  for (const m of manifests) byStatus.get(m.status)?.push(m)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
            Dispatch manifests
          </h1>
          <p className="mt-1 max-w-[620px] text-xs leading-relaxed text-text-secondary">
            Draft, dispatched, received and reconciled shipments to recyclers. A manifest is
            facility → recycler; the agent → facility hand-off is a custody batch, a different
            document on a different edge of the chain of custody.
          </p>
        </div>
        <Link
          href="/manifests/new"
          className="inline-flex shrink-0 items-center rounded-lg bg-primary-black px-3 py-1.5 text-xs font-bold text-primary-green transition-opacity hover:opacity-90"
        >
          New manifest
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        {MANIFEST_PROGRESSION.map((status) => (
          <Stat
            key={status}
            value={String(byStatus.get(status)?.length ?? 0)}
            label={MANIFEST_STATUS_LABELS[status]}
          />
        ))}
      </div>

      {manifests.length === 0 ? (
        <div className="rounded-xl border border-console-line bg-surface px-6 py-12 text-center">
          <p className="text-sm font-bold text-text-primary">No manifests yet</p>
          <p className="mx-auto mt-1 max-w-[420px] text-xs leading-relaxed text-text-secondary">
            Build one from a facility&rsquo;s tested stock and it appears here as a draft.
          </p>
        </div>
      ) : (
        MANIFEST_PROGRESSION.map((status) => {
          const rows = byStatus.get(status) ?? []
          if (rows.length === 0) return null
          return (
            <section key={status} className="flex flex-col gap-2">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.09em] text-text-primary">
                {MANIFEST_STATUS_LABELS[status]}
                <span className="ml-2 font-normal text-text-secondary">{rows.length}</span>
              </h2>
              <div className="overflow-x-auto rounded-xl border border-console-line bg-surface">
                <table className="w-full min-w-[880px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <Th>Manifest</Th>
                      <Th>From</Th>
                      <Th>To</Th>
                      <Th>Load</Th>
                      <Th>Stamped</Th>
                      <Th align="right">{''}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => {
                      const itemCount = Array.isArray(m.itemIds) ? m.itemIds.length : 0
                      // A draft has not left the building, so it has no
                      // dispatchedAt — show what it actually has instead of an
                      // em-dash that says nothing.
                      const stamp =
                        m.confirmedAt ?? m.dispatchedAt ?? m.createdAt
                      const stampLabel = m.confirmedAt
                        ? 'confirmed'
                        : m.dispatchedAt
                          ? 'dispatched'
                          : 'created'

                      return (
                        <tr key={m.id} className="border-t border-console-line align-top">
                          <Td>
                            <Link
                              href={`/manifests/${encodeURIComponent(m.id)}`}
                              className="font-mono text-[11px] font-bold text-text-primary underline-offset-2 hover:underline"
                            >
                              {m.manifestNo}
                            </Link>
                          </Td>
                          <Td>
                            <span className="text-xs text-text-secondary">{m.facility.name}</span>
                          </Td>
                          <Td>
                            <div className="text-xs text-text-primary">{m.recycler.name}</div>
                            {!m.recycler.isActive ? (
                              // AD7 is re-checked at dispatch, so a draft
                              // naming a deactivated recycler is dead — say so
                              // here rather than only on the button.
                              <span className="mt-1 inline-flex rounded-full bg-warning-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-warning-text">
                                Recycler inactive
                              </span>
                            ) : null}
                          </Td>
                          <Td>
                            <span className="text-xs text-text-secondary">
                              {itemCount} item{itemCount === 1 ? '' : 's'}
                              {m.totalWeightKg ? ` · ${Number(m.totalWeightKg).toFixed(1)} kg` : ''}
                            </span>
                          </Td>
                          <Td>
                            <div className="text-xs text-text-secondary">
                              {formatIstDateTime(stamp)}
                            </div>
                            <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
                              {stampLabel}
                            </div>
                          </Td>
                          <Td align="right">
                            <Link
                              href={`/manifests/${encodeURIComponent(m.id)}`}
                              className="text-xs font-bold text-text-primary underline-offset-2 hover:underline"
                            >
                              {status === 'draft' ? 'Review' : 'Open'}
                            </Link>
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })
      )}
    </>
  )
}

// ── Local presentation ───────────────────────────────────────────────────────
// Local for the same reason as the dispatch board's: these are server-rendered
// reads, and C's DataTable is a client component. See docs/LANE_OWNERSHIP.md.

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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-xl border border-console-line bg-surface px-4 py-3">
      <div className="font-display text-xl font-medium text-text-primary">{value}</div>
      <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </div>
    </div>
  )
}
