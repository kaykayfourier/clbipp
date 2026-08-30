// ─── PageHead ─────────────────────────────────────────────────────────────
// The heading block every console screen opens with — title, one line of
// description, and an optional right-aligned action slot (a button, a range
// picker, whatever the screen needs). Pure/static-prop (Batch 2 rule): it
// renders what it is given and calls nothing.
//
// Deliberately NOT swallowing the `<h1>` text into a fixed pattern — Batch 0's
// stubs assert on the exact heading text in scripts/smoke.mjs (trap 9), so the
// caller must still control it precisely.

export interface PageHeadProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function PageHead({ title, description, actions }: PageHeadProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-text-primary">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-[560px] text-xs leading-relaxed text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
