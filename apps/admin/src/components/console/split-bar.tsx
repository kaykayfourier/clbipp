import { cn } from '@clbipp/ui'

// ─── SplitBar ───────────────────────────────────────────────────────────────
// The pathway-mix stacked bar from the wireframe's dashboard — REUSE /
// REFURBISH / RECYCLE as proportions of a whole. Generic over any small set
// of named segments (not hardcoded to three) so it also works for e.g. a
// KYC-status mix on Suppliers, but ships with pathway-appropriate tone
// defaults since that is its main use (AD12: only admin ever shows a pathway
// mix like this — it never reaches a vendor screen).

export interface SplitBarSegment {
  key: string
  label: string
  value: number
  /** Tailwind background class. Defaults are provided for the three canonical
   * pathway keys ('reuse' | 'refurbish' | 'recycle'); anything else needs one. */
  colorClass?: string
}

const DEFAULT_TONE: Record<string, string> = {
  reuse: 'bg-primary-green',
  refurbish: 'bg-warning',
  recycle: 'bg-[#6B3FB8]', // plum — matches the wireframe's RECYCLE segment; no token for it yet
  dispose: 'bg-text-disabled',
}

export interface SplitBarProps {
  segments: readonly SplitBarSegment[]
  height?: number
  showLegend?: boolean
}

export function SplitBar({ segments, height = 32, showLegend = true }: SplitBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  if (total <= 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg bg-background text-[11px] text-text-disabled"
      >
        No data
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex overflow-hidden rounded-lg" style={{ height }}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const pct = (s.value / total) * 100
            return (
              <div
                key={s.key}
                style={{ width: `${pct}%` }}
                className={cn(
                  'flex items-center justify-center text-[10.5px] font-bold text-white',
                  s.colorClass ?? DEFAULT_TONE[s.key] ?? 'bg-text-disabled',
                )}
                title={`${s.label} ${pct.toFixed(0)}%`}
              >
                {pct >= 10 ? `${s.label.toUpperCase()} ${pct.toFixed(0)}%` : null}
              </div>
            )
          })}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap gap-3">
          {segments.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[10.5px] text-text-secondary">
              <span className={cn('h-2 w-2 rounded-full', s.colorClass ?? DEFAULT_TONE[s.key] ?? 'bg-text-disabled')} />
              {s.label} · {total > 0 ? ((s.value / total) * 100).toFixed(0) : 0}%
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
