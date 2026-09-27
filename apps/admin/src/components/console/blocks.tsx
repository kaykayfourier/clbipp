// ─── Layout blocks for the console's form-and-panel screens ──────────────────
// feedback_logistics (2026-09-27). Six new screens — /tags, /containers, /runs,
// /runs/new, /runs/[id] and /custody/[batchId] — are built from panels, stat
// tiles, notices and small forms. The screens that predate this file each
// declare their own local `Panel`/`Banner`/`Stat` (dispatch/[id]'s header says
// to swap them for kit pieces "when it lands"); these are those pieces, so the
// new screens share one definition instead of six more copies.
//
// Server-safe: no hooks, no 'use client'. 🔴 Desktop console only (AD11) —
// never re-exported from packages/ui.

export function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-console-line bg-surface p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.09em] text-text-secondary">
          {title}
        </h2>
        {aside ? <span className="text-xs text-text-secondary">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

const NOTICE_TONES = {
  success: 'border-success-border bg-success-bg text-success-text',
  error: 'border-error-border bg-error-bg text-error-text',
  warning: 'border-warning-border bg-warning-bg text-warning-text',
  info: 'border-console-line bg-surface text-text-primary',
} as const

export function Notice({
  tone,
  children,
}: {
  tone: keyof typeof NOTICE_TONES
  children: React.ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${NOTICE_TONES[tone]}`}
    >
      {children}
    </div>
  )
}

export function Stat({
  value,
  label,
  tone = 'default',
}: {
  value: string
  label: string
  tone?: 'default' | 'warning' | 'success'
}) {
  const box =
    tone === 'warning'
      ? 'border-warning-border bg-warning-bg'
      : tone === 'success'
        ? 'border-success-border bg-success-bg'
        : 'border-console-line bg-surface'
  return (
    <div className={`min-w-[150px] flex-1 rounded-xl border px-4 py-3 ${box}`}>
      <div className="font-display text-xl font-medium text-text-primary">{value}</div>
      <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">{label}</div>
    </div>
  )
}

const CHIP_TONES = {
  neutral: 'bg-background text-text-primary',
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  error: 'bg-error-bg text-error-text',
  muted: 'bg-background text-text-disabled',
  ink: 'bg-primary-black text-primary-green',
} as const

export function Chip({ tone = 'neutral', children }: { tone?: keyof typeof CHIP_TONES; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  )
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-secondary"
    >
      {children}
    </label>
  )
}

/** Shared class strings — kept as strings so a plain server-rendered <form>
 *  can use them without a client component. */
export const inputClass =
  'rounded-lg border border-console-line bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green'

export const primaryButtonClass =
  'inline-flex items-center justify-center rounded-lg bg-primary-black px-4 py-2 text-xs font-bold text-primary-green transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green focus-visible:ring-offset-2 disabled:opacity-40'

export const secondaryButtonClass =
  'inline-flex items-center justify-center rounded-lg border border-console-line px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-background'
