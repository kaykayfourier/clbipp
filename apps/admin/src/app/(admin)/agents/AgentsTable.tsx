'use client'

import { DataTable, type DataTableColumn } from '@/components/console'

import { setAgentDutyAction } from './actions'

// ─── AgentsTable ────────────────────────────────────────────────────────────
// Client half of E02 (/agents). Read-only until FV15, which added the one
// write this roster owns: on duty / off duty (FD19). It is a plain POST form
// per row — the action re-checks role and writes an `agent.duty` audit row.

export interface AgentRow {
  id: string
  name: string
  zone: string | null
  vehicle: string | null
  safetyTrainedLabel: string | null
  rating: number | null
  liveLoad: number
  /** FV15 · FD19 — `Profile.dutyStatus`. */
  onDuty: boolean
}

export function AgentsTable({ rows }: { rows: readonly AgentRow[] }) {
  const columns: DataTableColumn<AgentRow>[] = [
    { key: 'name', header: 'Agent', sortValue: (r) => r.name, cell: (r) => <span className="font-medium text-text-primary">{r.name}</span> },
    {
      key: 'duty',
      header: 'Duty',
      sortValue: (r) => (r.onDuty ? 0 : 1),
      cell: (r) => (
        <form action={setAgentDutyAction} className="flex items-center gap-2">
          <input type="hidden" name="agentId" value={r.id} />
          <input type="hidden" name="onDuty" value={r.onDuty ? '0' : '1'} />
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] ${
              r.onDuty ? 'bg-success-bg text-success-text' : 'bg-background text-text-disabled'
            }`}
          >
            {r.onDuty ? 'On duty' : 'Off duty'}
          </span>
          <button type="submit" className="text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary">
            {r.onDuty ? 'Mark off' : 'Mark on'}
          </button>
        </form>
      ),
    },
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
