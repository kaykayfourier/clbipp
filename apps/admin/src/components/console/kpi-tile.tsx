import { cn } from '@clbipp/ui'

// ─── KpiTile ────────────────────────────────────────────────────────────────
// A single stat card — the "five KPI tiles" the wireframe's dashboard and
// half the other screens open with. Pure/static-prop.
//
// `tone="exception"` is the dark card the wireframe uses for "in exception"
// counts — visually distinct on purpose, so a number that means "something
// needs a human" never reads like just another metric next to it.

export interface KpiTileProps {
  label: string
  value: string
  /** A short trend line under the value, e.g. "▲ 12% vs yesterday". Rendered
   * as plain text — the caller decides the arrow/wording, this component does
   * not compute a delta. */
  delta?: string
  deltaTone?: 'up' | 'down' | 'neutral'
  tone?: 'default' | 'exception' | 'warning'
}

const DELTA_CLASS: Record<NonNullable<KpiTileProps['deltaTone']>, string> = {
  up: 'text-success-text',
  down: 'text-error-text',
  neutral: 'text-text-secondary',
}

export function KpiTile({ label, value, delta, deltaTone = 'neutral', tone = 'default' }: KpiTileProps) {
  const isExc = tone === 'exception'
  return (
    <div
      className={cn(
        'min-w-[150px] flex-1 rounded-xl border px-4 py-3.5',
        tone === 'default' && 'border-console-line bg-surface',
        tone === 'warning' && 'border-warning-border bg-warning-bg',
        isExc && 'border-primary-black bg-primary-black',
      )}
    >
      <div
        className={cn(
          'font-mono text-[9.5px] uppercase tracking-[0.09em]',
          isExc ? 'text-console-rail-muted' : 'text-text-secondary',
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'mt-1.5 font-display text-[26px] font-medium leading-none',
          isExc ? 'text-hazard' : 'text-text-primary',
        )}
      >
        {value}
      </div>
      {delta ? (
        <div
          className={cn(
            'mt-1.5 text-[10.5px] font-semibold',
            isExc ? 'text-console-rail-muted' : DELTA_CLASS[deltaTone],
          )}
        >
          {delta}
        </div>
      ) : null}
    </div>
  )
}
