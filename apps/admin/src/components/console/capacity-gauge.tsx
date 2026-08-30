import { cn } from '@clbipp/ui'

// ─── CapacityGauge ──────────────────────────────────────────────────────────
// A facility's stock-vs-capacity reading (Inventory, C01) — "68% of 12,000 kg".
// A horizontal bar rather than a radial dial: at the small sizes a table row
// or a KPI-adjacent card actually has room for, an SVG arc reads worse than a
// bar at a glance, and a bar composes into a table cell without an aspect-
// ratio fight. Pure/static-prop — the caller computes the percentage.

export interface CapacityGaugeProps {
  /** 0–100. Values outside that range are clamped, not rejected — a stale
   * capacity figure showing 104% should still render as "full", not throw. */
  percent: number
  label?: string
  /** e.g. "8,160 / 12,000 kg" — the caller formats this, the gauge just draws
   * the bar under it. */
  sublabel?: string
  size?: 'sm' | 'md'
}

export function CapacityGauge({ percent, label, sublabel, size = 'md' }: CapacityGaugeProps) {
  const clamped = Math.max(0, Math.min(100, percent))
  const tone = clamped >= 90 ? 'bg-hazard' : clamped >= 70 ? 'bg-warning' : 'bg-primary-green'

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11.5px] font-semibold text-text-primary">{label}</span>
          <span className="font-mono text-[11px] font-bold text-text-primary">{Math.round(clamped)}%</span>
        </div>
      ) : null}
      <div className={cn('w-full overflow-hidden rounded-full bg-background', size === 'sm' ? 'h-1.5' : 'h-2')}>
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${clamped}%` }} />
      </div>
      {sublabel ? <span className="font-mono text-[10px] text-text-secondary">{sublabel}</span> : null}
    </div>
  )
}
