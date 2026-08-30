import Link from 'next/link'

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
  /**
   * Where this number can be read in full. When given, the whole tile becomes
   * a link to the screen that AGGREGATES it.
   *
   * 🔴 Batch 15's rule: a KPI with no drill-through is decoration. Every tile
   * on the dashboard is a roll-up of a screen that already exists, so an admin
   * who reads "4 awaiting dispatch" must be one click from the four rows. Left
   * optional because the tile is also used inside screens (/quotes, /manifests)
   * where the number's own screen is the one you are already on.
   */
  href?: string
}

const DELTA_CLASS: Record<NonNullable<KpiTileProps['deltaTone']>, string> = {
  up: 'text-success-text',
  down: 'text-error-text',
  neutral: 'text-text-secondary',
}

export function KpiTile({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  tone = 'default',
  href,
}: KpiTileProps) {
  const isExc = tone === 'exception'

  // The card's own classes, shared by both branches below so a linked tile and
  // an unlinked one are pixel-identical in the flex row.
  //
  // ⚠ Two explicit branches rather than `const Tile = href ? Link : 'div'`.
  // That form does not type-check: `LinkProps.href` is required, so the union
  // of the two element types has no assignable prop set once `href` is
  // `string | undefined`. Spreading `{...(href ? { href } : {})}` does not
  // narrow it either — TypeScript still sees the optional. Caught by
  // `npm run build`, which type-checks; `npm run lint` did not.
  const className = cn(
    'min-w-[150px] flex-1 rounded-xl border px-4 py-3.5',
    tone === 'default' && 'border-console-line bg-surface',
    tone === 'warning' && 'border-warning-border bg-warning-bg',
    isExc && 'border-primary-black bg-primary-black',
    href && 'block transition-colors hover:border-text-secondary',
  )

  const body = (
    <>
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
    </>
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    )
  }

  return <div className={className}>{body}</div>
}
