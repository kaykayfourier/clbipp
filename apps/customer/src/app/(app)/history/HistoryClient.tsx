'use client'

import { useState } from 'react'
import Link from 'next/link'

import { EmptyState, ListRow } from '@clbipp/ui'
import type { PickupStatus } from '@clbipp/ui'

import {
  HISTORY_FILTERS,
  HISTORY_FILTER_LABELS,
  type HistoryFilter,
} from '@/lib/pickup-nav'

// Everything here is plain JSON computed on the server (see ./page.tsx) — this
// component only filters and renders. No Decimal, no Date, no routing logic.
export type HistoryRow = {
  id: string
  status: PickupStatus
  subtitle: string
  href: string
  bucket: Exclude<HistoryFilter, 'all'>
  createdAt: string
  canRebook: boolean
}

export default function HistoryClient({ rows }: { rows: HistoryRow[] }) {
  const [active, setActive] = useState<HistoryFilter>('all')

  // Derived from the data, not hard-coded — the lesson from Batch 9's
  // `["All", "2026"]` year filter. A bucket with nothing in it is a chip that
  // can only ever show an empty list, so it isn't offered.
  const present = new Set(rows.map((row) => row.bucket))
  const filters = HISTORY_FILTERS.filter((f) => f === 'all' || present.has(f))

  const filtered = active === 'all' ? rows : rows.filter((row) => row.bucket === active)

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="font-serif text-2xl font-medium text-text-primary">Pickup history</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every request you&apos;ve made, and a shortcut to book the same load again.
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
              {HISTORY_FILTER_LABELS[filter]}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          heading="No pickups yet"
          description="Once you request your first battery pickup it will show up here, along with everything that happened to it."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((row) => (
            <div key={row.id} className="flex flex-col gap-1.5">
              <Link href={row.href}>
                <ListRow id={row.id} subtitle={row.subtitle} status={row.status} />
              </Link>
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] text-text-disabled">{row.createdAt}</span>
                {row.canRebook && (
                  <Link
                    href={`/book?from=${row.id}`}
                    className="text-[11px] font-semibold text-text-primary underline underline-offset-2"
                  >
                    Book this again
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
