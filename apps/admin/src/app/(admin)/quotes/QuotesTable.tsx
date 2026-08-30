'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { formatPaise } from '@clbipp/core/format'

import { DataTable, FilterChips, type DataTableColumn, type FilterChipOption } from '@/components/console'
import { PathwayChip, EngineFlagChip } from './pathway-chip'

// Client half of D03 (/quotes). Same composition PickupsTable established for
// B04: a chip row narrows `rows` in memory, DataTable's own search narrows
// the result further. See that file for why the split works this way.

export interface QuoteRow {
  itemId: string
  pickupId: string
  pickupStatus: string
  vendorName: string
  category: string
  chemistry: string | null
  pathway: string | null
  traceId: string | null
  pricePaise: number | null
  flags: readonly string[]
  updatedAgo: string
}

type FilterValue = 'engine' | 'flat' | 'flagged'

const FILTER_OPTIONS: FilterChipOption[] = [
  { value: 'engine', label: 'Engine-priced' },
  { value: 'flat', label: 'Flat rate' },
  { value: 'flagged', label: 'Flagged' },
]

export function QuotesTable({ rows }: { rows: readonly QuoteRow[] }) {
  const [filter, setFilter] = useState<string | null>(null)

  const counts = useMemo(
    () => ({
      engine: rows.filter((r) => r.traceId !== null).length,
      flat: rows.filter((r) => r.traceId === null).length,
      flagged: rows.filter((r) => r.flags.length > 0).length,
    }),
    [rows],
  )

  const chipOptions = FILTER_OPTIONS.map((opt) => ({ ...opt, count: counts[opt.value as FilterValue] }))

  const filtered = useMemo(() => {
    if (filter === 'engine') return rows.filter((r) => r.traceId !== null)
    if (filter === 'flat') return rows.filter((r) => r.traceId === null)
    if (filter === 'flagged') return rows.filter((r) => r.flags.length > 0)
    return rows
  }, [rows, filter])

  const columns: DataTableColumn<QuoteRow>[] = [
    {
      key: 'item',
      header: 'Item',
      sortValue: (r) => r.traceId ?? r.itemId,
      cell: (r) =>
        r.traceId ? (
          <Link
            href={`/trace/${encodeURIComponent(r.traceId)}`}
            className="font-mono text-[11px] font-bold text-text-primary hover:underline"
          >
            {r.traceId}
          </Link>
        ) : (
          <span className="font-mono text-[11px] text-text-disabled" title="Flat-rate items are not routed through the engine — nothing to trace.">
            No trace
          </span>
        ),
    },
    {
      key: 'pickup',
      header: 'Pickup',
      sortValue: (r) => r.pickupId,
      cell: (r) => (
        <Link href={`/pickups/${encodeURIComponent(r.pickupId)}`} className="font-mono text-[11px] text-text-secondary hover:text-text-primary hover:underline">
          {r.pickupId}
        </Link>
      ),
      hideBelow: 'md',
    },
    {
      key: 'vendor',
      header: 'Vendor',
      sortValue: (r) => r.vendorName,
      cell: (r) => <span className="text-text-primary">{r.vendorName}</span>,
    },
    {
      key: 'item-type',
      header: 'Category',
      sortValue: (r) => r.category,
      cell: (r) => (
        <div>
          <div className="text-xs text-text-primary">{r.category}</div>
          {r.chemistry ? <div className="text-xs text-text-secondary">{r.chemistry}</div> : null}
        </div>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'pathway',
      header: 'Pathway',
      sortValue: (r) => r.pathway ?? '',
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <PathwayChip pathway={r.pathway} />
          {r.flags.map((f) => (
            <EngineFlagChip key={f} flag={f} />
          ))}
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sortValue: (r) => r.pricePaise ?? -1,
      cell: (r) => <span className="font-mono text-xs font-bold text-text-primary">{r.pricePaise === null ? '—' : formatPaise(r.pricePaise)}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      align: 'right',
      sortValue: (r) => r.updatedAgo,
      cell: (r) => <span className="font-mono text-[11px] text-text-secondary">{r.updatedAgo} ago</span>,
      hideBelow: 'md',
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <FilterChips
        options={chipOptions}
        value={filter}
        onChange={(v) => setFilter(v as string | null)}
        allLabel="All"
        allCount={rows.length}
      />
      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.itemId}
        getSearchText={(r) => `${r.pickupId} ${r.vendorName} ${r.traceId ?? ''} ${r.category} ${r.chemistry ?? ''}`}
        searchPlaceholder="Search pickup id, vendor, trace id…"
        emptyHeading="No items match this filter"
        emptyDescription="Try a different filter, or clear the search box."
        rowNounPlural="items"
      />
    </div>
  )
}
