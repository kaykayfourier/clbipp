'use client'

import { CapacityGauge, DataTable, type DataTableColumn } from '@/components/console'

// ─── FacilitiesTables ───────────────────────────────────────────────────────
// Client half of E03 (/facilities). Two independent tables — facilities we
// operate, and the CPCB-registered recyclers we ship to — bundled in one file
// since neither needs to share state with the other. Read-only.

export interface FacilityRow {
  id: string
  name: string
  location: string
  capacityKg: number | null
  onHandKg: number
  isActive: boolean
}

export interface RecyclerRow {
  id: string
  name: string
  cpcbRegNo: string
  acceptedChemistries: string[]
  capacityKg: number | null
  isActive: boolean
}

export function FacilitiesTables({ facilities, recyclers }: { facilities: readonly FacilityRow[]; recyclers: readonly RecyclerRow[] }) {
  const facilityColumns: DataTableColumn<FacilityRow>[] = [
    { key: 'name', header: 'Facility', sortValue: (r) => r.name, cell: (r) => <span className="font-medium text-text-primary">{r.name}</span> },
    { key: 'location', header: 'Location', sortValue: (r) => r.location, cell: (r) => <span className="text-xs text-text-secondary">{r.location}</span> },
    {
      key: 'capacity',
      header: 'Capacity',
      width: 'w-[200px]',
      sortValue: (r) => (r.capacityKg ? r.onHandKg / r.capacityKg : 0),
      cell: (r) =>
        r.capacityKg ? (
          <CapacityGauge percent={(r.onHandKg / r.capacityKg) * 100} sublabel={`${r.onHandKg.toFixed(0)} / ${r.capacityKg.toFixed(0)} kg`} size="sm" />
        ) : (
          <span className="text-xs text-text-disabled">No capacity set</span>
        ),
    },
    { key: 'active', header: 'Status', cell: (r) => <StatusDot active={r.isActive} /> },
  ]

  const recyclerColumns: DataTableColumn<RecyclerRow>[] = [
    { key: 'name', header: 'Recycler', sortValue: (r) => r.name, cell: (r) => <span className="font-medium text-text-primary">{r.name}</span> },
    { key: 'cpcb', header: 'CPCB reg. no.', sortValue: (r) => r.cpcbRegNo, cell: (r) => <span className="font-mono text-[11px] text-text-secondary">{r.cpcbRegNo}</span> },
    {
      key: 'chem',
      header: 'Accepted chemistries',
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.acceptedChemistries.map((c) => (
            <span key={c} className="rounded-full bg-background px-2 py-0.5 font-mono text-[10px] text-text-secondary">
              {c}
            </span>
          ))}
        </div>
      ),
    },
    { key: 'capacity', header: 'Capacity', align: 'right', sortValue: (r) => r.capacityKg ?? 0, cell: (r) => <span className="font-mono text-xs text-text-primary">{r.capacityKg ? `${r.capacityKg.toLocaleString('en-IN')} kg` : '—'}</span> },
    { key: 'active', header: 'Status', cell: (r) => <StatusDot active={r.isActive} /> },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">Facilities we operate</h2>
        <DataTable columns={facilityColumns} rows={facilities} getRowKey={(r) => r.id} emptyHeading="No facilities" pageSize={10} />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">CPCB-registered recyclers</h2>
        <DataTable
          columns={recyclerColumns}
          rows={recyclers}
          getRowKey={(r) => r.id}
          getSearchText={(r) => `${r.name} ${r.cpcbRegNo} ${r.acceptedChemistries.join(' ')}`}
          searchPlaceholder="Search recycler, CPCB reg., chemistry…"
          emptyHeading="No recyclers"
          pageSize={10}
        />
      </div>
    </div>
  )
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${active ? 'text-success-text' : 'text-text-disabled'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success-text' : 'bg-text-disabled'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}
