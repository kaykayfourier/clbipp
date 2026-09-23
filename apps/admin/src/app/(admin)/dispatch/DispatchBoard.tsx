'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { DataTable, FilterChips, type DataTableColumn } from '@/components/console'

// ─── The dispatch board's filters, sorting and table (FV4) ───────────────────
// The company's feedback: "the Admin Dispatch screen should provide operational
// filters and sorting rather than functioning only as a basic job list."
//
// Until FV4 this screen was a hardcoded `status: 'requested'` query rendered
// into a hand-rolled <table>, with a comment saying to swap that table for the
// console kit once it existed. It exists, so this is that swap as well.
//
// 🔴 TWO TRAPS THE OLD BOARD EXISTED TO DEFEND, both preserved:
//   1. It must NOT filter on `agentId: null`. A pickup reactivated after a
//      cancellation (`cancelled → requested`) keeps its old agent — seed
//      fixture 8, PKP-2026-000114 — so filtering the obvious way hides exactly
//      the row that is most stuck, from the only screen that can unstick it.
//      It is listed like any other request with the stale agent called out.
//   2. Flat-rate (non-li-ion) items have no `traceId`. Nothing here keys on
//      one; the counts are over every item.
//
// Client-side filtering over rows the server already fetched. The live pipeline
// is tens of rows, not thousands — DataTable's own note says a screen may hand
// it everything and let it paginate, and doing that keeps every filter instant
// and the whole board one round trip.

export type DispatchRow = {
  id: string
  status: string
  vendorName: string
  vendorCompany: string | null
  location: string
  city: string | null
  agentId: string | null
  agentName: string | null
  /** 🔴 A stale agent on a `requested` row — the residue of a cancellation. */
  staleAgent: boolean
  lines: number
  units: number
  kg: number
  categories: string
  /** ISO date strings — a Date crossing the server/client boundary is a
   *  serialisation hazard, and every use here is display or comparison. */
  createdAt: string
  preferredDate: string | null
  collectionScheduledAt: string | null
  waitingLabel: string
}

/** The operational buckets a dispatcher actually works in. Deliberately NOT the
 *  nine lifecycle stages — "needs action" spans two of them, and a dispatcher
 *  thinks in work, not in schema. */
const BUCKETS = [
  { value: 'unassigned', label: 'Needs an agent' },
  { value: 'assigned', label: 'Assigned, not started' },
  { value: 'in_progress', label: 'On site / quoting' },
  { value: 'booked', label: 'Booked for later' },
] as const

function bucketOf(row: DispatchRow): string {
  if (row.status === 'requested') return 'unassigned'
  if (row.status === 'scheduled') return 'assigned'
  // FV3: an accepted offer with a date is not "in progress", it is diarised.
  if (row.status === 'offered' && row.collectionScheduledAt) return 'booked'
  return 'in_progress'
}

export function DispatchBoard({ rows }: { rows: readonly DispatchRow[] }) {
  // Defaults to the queue this screen has always been: things needing an agent.
  const [bucket, setBucket] = useState<string | null>('unassigned')
  const [agent, setAgent] = useState<string>('')
  const [city, setCity] = useState<string>('')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')

  const agents = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) if (r.agentId && r.agentName) seen.set(r.agentId, r.agentName)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const cities = useMemo(
    () => [...new Set(rows.map((r) => r.city).filter((c): c is string => Boolean(c)))].sort(),
    [rows],
  )

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rows) m[bucketOf(r)] = (m[bucketOf(r)] ?? 0) + 1
    return m
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (bucket && bucketOf(r) !== bucket) return false
      if (agent && r.agentId !== agent) return false
      if (city && r.city !== city) return false
      // The date range reads whichever date this row is actually waiting on:
      // a booked collection is filtered by its collection date, everything
      // else by the vendor's preferred date. Filtering both against one column
      // would make the range silently empty for half the board.
      const key = r.collectionScheduledAt ?? r.preferredDate
      if (from && (!key || key < from)) return false
      if (to && (!key || key > to)) return false
      return true
    })
  }, [rows, bucket, agent, city, from, to])

  const columns: readonly DataTableColumn<DispatchRow>[] = useMemo(
    () => [
      {
        key: 'id',
        header: 'Pickup',
        sortValue: (r) => r.id,
        cell: (r) => (
          <div>
            <Link
              href={`/dispatch/${encodeURIComponent(r.id)}`}
              className="font-mono text-[11px] font-bold text-text-primary underline-offset-2 hover:underline"
            >
              {r.id}
            </Link>
            {r.staleAgent ? (
              <div className="mt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-warning-text">
                  Previously assigned to {r.agentName ?? 'an agent'}
                </span>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'vendor',
        header: 'Vendor',
        sortValue: (r) => r.vendorCompany || r.vendorName,
        cell: (r) => (
          <div>
            <div className="font-medium text-text-primary">{r.vendorCompany || r.vendorName}</div>
            {r.vendorCompany ? (
              <div className="text-xs text-text-secondary">{r.vendorName}</div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'location',
        header: 'Location',
        sortValue: (r) => r.city ?? r.location,
        hideBelow: 'lg',
        cell: (r) => (
          <div className="max-w-[240px] text-xs leading-relaxed text-text-secondary">
            {r.location}
          </div>
        ),
      },
      {
        key: 'declared',
        header: 'Declared',
        sortValue: (r) => r.kg,
        cell: (r) => (
          <div>
            <div className="text-xs text-text-primary">
              {r.lines} line{r.lines === 1 ? '' : 's'} · {r.units} unit{r.units === 1 ? '' : 's'}
              {r.kg > 0 ? ` · ${r.kg.toFixed(1)} kg` : ''}
            </div>
            <div className="text-xs text-text-secondary">{r.categories}</div>
          </div>
        ),
      },
      {
        key: 'agent',
        header: 'Agent',
        sortValue: (r) => r.agentName ?? '',
        cell: (r) =>
          r.agentName && !r.staleAgent ? (
            <span className="text-xs text-text-primary">{r.agentName}</span>
          ) : (
            <span className="text-xs text-text-disabled">—</span>
          ),
      },
      {
        key: 'when',
        header: 'Date',
        sortValue: (r) => r.collectionScheduledAt ?? r.preferredDate ?? '',
        cell: (r) =>
          r.collectionScheduledAt ? (
            <span className="text-xs font-medium text-text-primary">
              Collect {fmt(r.collectionScheduledAt)}
            </span>
          ) : r.preferredDate ? (
            <span className="text-xs text-text-secondary">Prefers {fmt(r.preferredDate)}</span>
          ) : (
            <span className="text-xs text-text-disabled">No preference</span>
          ),
      },
      {
        key: 'waiting',
        header: 'Waiting',
        sortValue: (r) => r.createdAt,
        cell: (r) => (
          <span className="font-mono text-[11px] text-text-primary">{r.waitingLabel}</span>
        ),
      },
      {
        key: 'action',
        header: '',
        align: 'right',
        cell: (r) => (
          <Link
            href={`/dispatch/${encodeURIComponent(r.id)}`}
            className="inline-flex items-center rounded-lg bg-primary-black px-3 py-1.5 text-xs font-bold text-primary-green transition-opacity hover:opacity-90"
          >
            {r.status === 'requested' ? 'Assign' : 'Open'}
          </Link>
        ),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-3">
      <FilterChips
        options={BUCKETS.map((b) => ({ ...b, count: counts[b.value] ?? 0 }))}
        value={bucket}
        onChange={(v) => setBucket(v as string | null)}
        allLabel="All live"
        allCount={rows.length}
      />

      <div className="flex flex-wrap items-end gap-3">
        <Select label="Agent" value={agent} onChange={setAgent} placeholder="Any agent">
          {agents.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>

        <Select label="City" value={city} onChange={setCity} placeholder="Any city">
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>

        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />

        {(agent || city || from || to) && (
          <button
            type="button"
            onClick={() => {
              setAgent('')
              setCity('')
              setFrom('')
              setTo('')
            }}
            className="h-9 rounded-lg border border-console-line px-3 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.id}
        getSearchText={(r) => `${r.id} ${r.vendorName} ${r.vendorCompany ?? ''} ${r.location}`}
        searchPlaceholder="Search pickup, vendor or address…"
        initialSort={{ key: 'waiting', direction: 'asc' }}
        rowNounPlural="pickups"
        emptyHeading="Nothing matches those filters"
        emptyDescription="Clear a filter, or switch to All live to see the whole pipeline."
      />
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  placeholder,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-[150px] rounded-lg border border-console-line bg-surface px-2 text-xs text-text-primary"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
    </label>
  )
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-console-line bg-surface px-2 text-xs text-text-primary"
      />
    </label>
  )
}

/** "2026-09-20" → "20 Sep". Parsed as parts, never `new Date(string)`, so a
 *  browser timezone cannot render the chosen date as the day before. */
function fmt(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
