'use client'

import { useState } from 'react'
import Link from 'next/link'

import { EmptyState, ListRow } from '@clbipp/ui'
import type { PickupStatus } from '@clbipp/ui'

import {
  AGENT_HISTORY_FILTERS,
  AGENT_HISTORY_FILTER_LABELS,
  type AgentHistoryFilter,
} from '@/lib/job-nav'

// Everything here is plain JSON computed on the server (see ./page.tsx) — this
// component only filters and renders. No Decimal, no Date, no routing logic:
// none of those survive the server/client boundary, and the routing rules have
// no business being in the browser.
export type AgentHistoryRow = {
  id: string
  status: PickupStatus
  subtitle: string
  bucket: Exclude<AgentHistoryFilter, 'all'>
  when: string
  /** Preformatted ₹, or null on a job that never carried a fee. */
  fee: string | null
}

export default function HistoryClient({ rows }: { rows: AgentHistoryRow[] }) {
  const [active, setActive] = useState<AgentHistoryFilter>('all')

  // Derived from the data, not hard-coded — the customer app's Batch 9 lesson.
  // A bucket with nothing in it is a chip that can only ever show an empty
  // list, so it isn't offered.
  const present = new Set(rows.map((row) => row.bucket))
  const filters = AGENT_HISTORY_FILTERS.filter((f) => f === 'all' || present.has(f))

  const filtered = active === 'all' ? rows : rows.filter((row) => row.bucket === active)

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="font-serif text-2xl font-medium text-text-primary">History</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every job you have been assigned, and what you earned on it.
        </p>
      </div>

      {filters.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActive(filter)}
              aria-pressed={active === filter}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                active === filter
                  ? 'border-primary-black bg-primary-black text-primary-green'
                  : 'border-border bg-surface text-text-secondary'
              }`}
            >
              {AGENT_HISTORY_FILTER_LABELS[filter]}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          heading="No jobs yet"
          description="Once a pickup is scheduled and assigned to you it shows up here, along with everything that happened to it."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((row) => (
            <div key={row.id} className="flex flex-col gap-1.5">
              {/* 🔴 A REAL detail view. The wireframe's history rows link to
                  themselves (W-list, §0 of the plan) — this is that defect
                  fixed, and /pickups/[id] is the timeline those rows always
                  implied. */}
              <Link href={`/pickups/${row.id}`}>
                <ListRow id={row.id} subtitle={row.subtitle} status={row.status} />
              </Link>
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] text-text-disabled">{row.when}</span>
                {row.fee && (
                  <span className="text-[11px] font-semibold text-text-primary">
                    {row.fee}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
