'use client'

import { DataTable, type DataTableColumn } from '@/components/console'

// ─── AgentsTable ────────────────────────────────────────────────────────────
// Client half of E02 (/agents). Read-only — no trap in this batch's table row
// names an agent-side mutation, unlike Suppliers' margin override.

export interface AgentRow {
  id: string
  name: string
  zone: string | null
  vehicle: string | null
  safetyTrainedLabel: string | null
  rating: number | null
  liveLoad: number
}

export function AgentsTable({ rows }: { rows: readonly AgentRow[] }) {
  const columns: DataTableColumn<AgentRow>[] = [
    { key: 'name', header: 'Agent', sortValue: (r) => r.name, cell: (r) => <span className="font-medium text-text-primary">{r.name}</span> },
    { key: 'zone', header: 'Zone', sortValue: (r) => r.zone ?? '', cell: (r) => <span className="text-xs text-text-secondary">{r.zone ?? '—'}</span> },
    { key: 'vehicle', header: 'Vehicle', sortValue: (r) => r.vehicle ?? '', cell: (r) => <span className="text-xs text-text-secondary">{r.vehicle ?? '—'}</span>, hideBelow: 'md' },
    {
      key: 'trained',
      header: 'Safety trained',
      sortValue: (r) => r.safetyTrainedLabel ?? '',
      cell: (r) => <span className="font-mono text-[11px] text-text-secondary">{r.safetyTrainedLabel ?? 'Not recorded'}</span>,
      hideBelow: 'lg',
    },
    {
      key: 'rating',
      header: 'Rating',
      align: 'right',
      sortValue: (r) => r.rating ?? -1,
      cell: (r) => <span className="font-mono text-xs text-text-primary">{r.rating !== null ? `★ ${r.rating.toFixed(1)}` : '—'}</span>,
    },
    {
      key: 'load',
      header: 'Live load',
      align: 'right',
      sortValue: (r) => r.liveLoad,
      cell: (r) => (
        <span className={`font-mono text-xs font-bold ${r.liveLoad > 0 ? 'text-text-primary' : 'text-text-disabled'}`}>
          {r.liveLoad} job{r.liveLoad === 1 ? '' : 's'}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      getSearchText={(r) => `${r.name} ${r.zone ?? ''}`}
      searchPlaceholder="Search agent, zone…"
      initialSort={{ key: 'load', direction: 'desc' }}
      emptyHeading="No agents"
      emptyDescription="No agent accounts match this search."
    />
  )
}
