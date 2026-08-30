'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { formatPaise } from '@clbipp/core/format'
import { LIFECYCLE_STAGES } from '@clbipp/ui'

import { DataTable, FilterChips, StatusPill, type DataTableColumn, type FilterChipOption } from '@/components/console'

// ─── PickupsTable ───────────────────────────────────────────────────────────
// Client half of B04 (/pickups). The server component (page.tsx) does the one
// Prisma fetch; everything past that — the stage filter chips, the search box,
// sorting, pagination — is this component's own state, composed from Batch 2's
// console kit exactly as it was built to be used: chips narrow `rows` first,
// DataTable's own search narrows the result further.
//
// `+cancelled` is a filter chip, not a hidden state (task sheet, Batch 5 step
// 1) — CANCELLED is in FILTER_OPTIONS below even though it is deliberately
// absent from LIFECYCLE_STAGES itself (tokens.ts: it is a terminal side-state,
// not a position in the progression).

export interface PickupRow {
  id: string
  vendorName: string
  vendorCompany: string | null
  agentName: string | null
  status: string
  offerAccepted: boolean
  itemCount: number
  totalWeightKg: number
  linePricePaise: number | null
  createdAtIso: string
  createdAtLabel: string
}

const FILTER_OPTIONS: FilterChipOption[] = [...LIFECYCLE_STAGES, 'cancelled'].map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

export function PickupsTable({
  rows,
  initialQuery,
}: {
  rows: readonly PickupRow[]
  /** From `searchParams.q` — the topbar search posts here (Batch 0 contract 1). */
  initialQuery?: string
}) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1)
    return map
  }, [rows])

  const chipOptions = FILTER_OPTIONS.map((opt) => ({ ...opt, count: counts.get(opt.value) ?? 0 }))

  const filtered = useMemo(
    () => (statusFilter ? rows.filter((r) => r.status === statusFilter) : rows),
    [rows, statusFilter],
  )

  const columns: DataTableColumn<PickupRow>[] = [
    {
      key: 'id',
      header: 'Pickup',
      sortValue: (r) => r.id,
      cell: (r) => (
        <Link href={`/pickups/${encodeURIComponent(r.id)}`} className="font-mono text-[11px] font-bold text-text-primary hover:underline">
          {r.id}
        </Link>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      sortValue: (r) => r.vendorCompany || r.vendorName,
      cell: (r) => (
        <div>
          <div className="font-medium text-text-primary">{r.vendorCompany || r.vendorName}</div>
          {r.vendorCompany ? <div className="text-xs text-text-secondary">{r.vendorName}</div> : null}
        </div>
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      sortValue: (r) => r.agentName ?? '',
      cell: (r) => <span className="text-xs text-text-secondary">{r.agentName ?? '—'}</span>,
      hideBelow: 'md',
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => LIFECYCLE_STAGES.indexOf(r.status as (typeof LIFECYCLE_STAGES)[number]),
      cell: (r) => <StatusPill status={r.status} offerAccepted={r.offerAccepted} />,
    },
    {
      key: 'items',
      header: 'Items',
      align: 'right',
      sortValue: (r) => r.itemCount,
      cell: (r) => (
        <span className="text-xs text-text-primary">
          {r.itemCount} · {r.totalWeightKg.toFixed(1)} kg
        </span>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      sortValue: (r) => r.linePricePaise ?? -1,
      cell: (r) => <span className="font-mono text-xs text-text-primary">{r.linePricePaise === null ? '—' : formatPaise(r.linePricePaise)}</span>,
      hideBelow: 'lg',
    },
    {
      key: 'created',
      header: 'Requested',
      align: 'right',
      sortValue: (r) => r.createdAtIso,
      cell: (r) => <span className="font-mono text-[11px] text-text-secondary">{r.createdAtLabel}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <FilterChips options={chipOptions} value={statusFilter} onChange={(v) => setStatusFilter(v as string | null)} allLabel="All" allCount={rows.length} />
      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.id}
        getSearchText={(r) => `${r.id} ${r.vendorName} ${r.vendorCompany ?? ''} ${r.agentName ?? ''}`}
        searchPlaceholder="Search pickup id, vendor, agent…"
        initialQuery={initialQuery}
        initialSort={{ key: 'created', direction: 'desc' }}
        emptyHeading="No pickups match this filter"
        emptyDescription="Try a different stage, or clear the search box."
        rowNounPlural="pickups"
      />
    </div>
  )
}
