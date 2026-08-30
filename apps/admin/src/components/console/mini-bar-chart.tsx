// ─── MiniBarChart ───────────────────────────────────────────────────────────
// A small trend chart — throughput or net-value over the last N days on the
// dashboard (B01) and analytics (F02). Plain inline SVG, no chart library:
// the data is always a short static array by the time it reaches this
// component (the caller aggregates it), so a real charting dependency buys
// nothing here that ~30 lines of SVG doesn't already cover, and it is one
// fewer package for a P2 screen to justify at review time.

export interface MiniBarChartPoint {
  label: string
  value: number
}

export interface MiniBarChartProps {
  points: readonly MiniBarChartPoint[]
  height?: number
  /** Format a value for the tooltip-free hover title attribute, e.g. formatPaise.
   * Left to the caller — this component never assumes money. */
  formatValue?: (value: number) => string
}

export function MiniBarChart({ points, height = 72, formatValue }: MiniBarChartProps) {
  if (points.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-[11px] text-text-disabled">No data</div>
  }
  const max = Math.max(...points.map((p) => p.value), 1)
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {points.map((p, i) => {
        const h = Math.max(2, (p.value / max) * (height - 16))
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1" title={formatValue ? formatValue(p.value) : String(p.value)}>
            <div
              className="w-full rounded-t-[3px] bg-primary-green transition-[height]"
              style={{ height: h }}
            />
            <span className="font-mono text-[8.5px] text-text-disabled">{p.label}</span>
          </div>
        )
      })}
    </div>
  )
}
