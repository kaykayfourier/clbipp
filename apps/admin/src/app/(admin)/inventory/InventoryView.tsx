'use client'

import { CapacityGauge, DataTable, type DataTableColumn } from '@/components/console'

// ─── InventoryView ──────────────────────────────────────────────────────────
// Client half of C01 (/inventory). Three things stacked: a capacity gauge per
// facility, the chemistry breakdown (facility × chemistry → items, weight,
// oldest dwell), and a dwell-alerts table for anything past the threshold —
// all pre-computed server-side by @/lib/facility-stock, this component just
// renders it.

export interface FacilityGaugeRow {
  id: string
  name: string
  onHandKg: number
  capacityKg: number | null
}

export interface ChemistryBreakdownRow {
  facilityId: string
  facilityName: string
  chemistry: string
  itemCount: number
  weightKg: number
  oldestDwellHours: number
}

export interface DwellAlertRow {
  itemId: string
  pickupId: string
  facilityName: string
  chemistry: string
  weightKg: number
  dwellHours: number
}

function formatDwell(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  return `${days}d ${Math.round(hours % 24)}h`
}

export function InventoryView({
  facilityGauges,
  breakdown,
  alerts,
  dwellThresholdHours,
}: {
  facilityGauges: readonly FacilityGaugeRow[]
  breakdown: readonly ChemistryBreakdownRow[]
  alerts: readonly DwellAlertRow[]
  dwellThresholdHours: number
}) {
  const breakdownColumns: DataTableColumn<ChemistryBreakdownRow>[] = [
    { key: 'facility', header: 'Facility', sortValue: (r) => r.facilityName, cell: (r) => <span className="font-medium text-text-primary">{r.facilityName}</span> },
    { key: 'chemistry', header: 'Chemistry', sortValue: (r) => r.chemistry, cell: (r) => <span className="font-mono text-xs text-text-secondary">{r.chemistry}</span> },
    { key: 'items', header: 'Items', align: 'right', sortValue: (r) => r.itemCount, cell: (r) => <span className="font-mono text-xs text-text-primary">{r.itemCount}</span> },
    { key: 'weight', header: 'Weight', align: 'right', sortValue: (r) => r.weightKg, cell: (r) => <span className="font-mono text-xs text-text-primary">{r.weightKg.toFixed(1)} kg</span> },
    {
      key: 'dwell',
      header: 'Oldest dwell',
      align: 'right',
      sortValue: (r) => r.oldestDwellHours,
      cell: (r) => (
        <span className={`font-mono text-xs font-bold ${r.oldestDwellHours >= dwellThresholdHours ? 'text-error-text' : 'text-text-primary'}`}>
          {formatDwell(r.oldestDwellHours)}
        </span>
      ),
    },
  ]

  const alertColumns: DataTableColumn<DwellAlertRow>[] = [
    { key: 'pickup', header: 'Pickup', sortValue: (r) => r.pickupId, cell: (r) => <span className="font-mono text-[11px] font-bold text-text-primary">{r.pickupId}</span> },
    { key: 'facility', header: 'Facility', sortValue: (r) => r.facilityName, cell: (r) => <span className="text-xs text-text-secondary">{r.facilityName}</span> },
    { key: 'chemistry', header: 'Chemistry', sortValue: (r) => r.chemistry, cell: (r) => <span className="font-mono text-xs text-text-secondary">{r.chemistry}</span> },
    { key: 'weight', header: 'Weight', align: 'right', sortValue: (r) => r.weightKg, cell: (r) => <span className="font-mono text-xs text-text-primary">{r.weightKg.toFixed(1)} kg</span> },
    { key: 'dwell', header: 'Dwell', align: 'right', sortValue: (r) => r.dwellHours, cell: (r) => <span className="font-mono text-xs font-bold text-error-text">{formatDwell(r.dwellHours)}</span> },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {facilityGauges.map((f) => (
          <div key={f.id} className="rounded-xl border border-console-line bg-surface p-4">
            <CapacityGauge
              label={f.name}
              percent={f.capacityKg ? (f.onHandKg / f.capacityKg) * 100 : 0}
              sublabel={f.capacityKg ? `${f.onHandKg.toFixed(0)} / ${f.capacityKg.toFixed(0)} kg` : `${f.onHandKg.toFixed(0)} kg · no capacity set`}
            />
          </div>
        ))}
      </div>

      {alerts.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-error-text">
            Dwell alerts — past {dwellThresholdHours}h on hand
          </h2>
          <DataTable columns={alertColumns} rows={alerts} getRowKey={(r) => r.itemId} initialSort={{ key: 'dwell', direction: 'desc' }} pageSize={10} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">Stock by facility and chemistry</h2>
        <DataTable
          columns={breakdownColumns}
          rows={breakdown}
          getRowKey={(r) => `${r.facilityId}-${r.chemistry}`}
          initialSort={{ key: 'weight', direction: 'desc' }}
          emptyHeading="No stock on hand"
          emptyDescription="Every custody batch's items have already been dispatched, or none has arrived yet."
        />
      </div>
    </div>
  )
}
