import { cn } from '@clbipp/ui'

// ─── EmptyState / LoadingState / ErrorState ──────────────────────────────────
// The wireframe has none of these three (W14) and every screen needs them —
// a table with zero rows, a screen still waiting on its first Prisma query,
// and a screen whose query threw are all real states this console will hit.
//
// NOT @clbipp/ui's versions. Those are built for a single full mobile screen
// (a centred illustration, a 280px-wide primary button) — right for "no
// pickups yet" on a phone, wrong for a nine-column table that just has no
// rows matching this filter. `compact` toggles between a full-panel treatment
// (a screen with literally nothing to show) and an inline one (a single
// table cell, `colSpan`-ed across every column — see DataTable's own use of
// this).

export interface EmptyStateProps {
  heading: string
  description?: string
  action?: React.ReactNode
  /** Inline, single-row treatment — for use inside a table body. Default is
   * the fuller panel treatment for a screen with nothing at all to show. */
  compact?: boolean
}

export function EmptyState({ heading, description, action, compact = false }: EmptyStateProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
        <p className="text-[13px] font-semibold text-text-primary">{heading}</p>
        {description ? <p className="max-w-[360px] text-xs leading-relaxed text-text-secondary">{description}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-console-line bg-surface px-6 py-16 text-center">
      <p className="text-sm font-bold text-text-primary">{heading}</p>
      {description ? (
        <p className="max-w-[420px] text-xs leading-relaxed text-text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export interface LoadingStateProps {
  /** How many placeholder rows/lines to render. */
  rows?: number
  compact?: boolean
  className?: string
}

export function LoadingState({ rows = 4, compact = false, className }: LoadingStateProps) {
  if (compact) {
    return (
      <div className={cn('flex flex-col gap-2 px-3 py-3', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-background" style={{ width: `${72 - i * 8}%` }} />
        ))}
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border border-console-line bg-surface p-4', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-background" />
      ))}
    </div>
  )
}

export interface ErrorStateProps {
  heading?: string
  description?: string
  action?: React.ReactNode
  compact?: boolean
}

export function ErrorState({
  heading = 'Something went wrong',
  description,
  action,
  compact = false,
}: ErrorStateProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
        <p className="text-[13px] font-semibold text-error-text">{heading}</p>
        {description ? <p className="max-w-[360px] text-xs leading-relaxed text-text-secondary">{description}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-error-border bg-error-bg px-6 py-16 text-center">
      <p className="text-sm font-bold text-error-text">{heading}</p>
      {description ? (
        <p className="max-w-[420px] text-xs leading-relaxed text-text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
