import { cn } from '@clbipp/ui'

// ─── PathwayChip ─────────────────────────────────────────────────────────────
// A pathway badge for /quotes and /trace/[traceId]. Not part of Batch 2's
// console kit (that batch is closed and delivered) — small and local to this
// batch's two screens instead, exported so both files share one definition.
//
// Colour convention borrowed directly from <SplitBar>'s DEFAULT_TONE so a
// pathway reads the same colour whether it is a stacked-bar segment on the
// dashboard or a chip in this table — reuse green, refurbish amber, recycle
// plum (SplitBar's own comment: "no token for it yet", so this uses the same
// arbitrary hex rather than inventing a second one).
//
// 🔴 W2/AD1's trap: a flat-rate (non-li-ion) item has `pathway: null` on
// BatteryItem — that is not a missing value to hide, it is the correct state
// for roughly a quarter of all items (lead-acid, NiMH, other), and the one
// thing this batch is explicitly told not to let go missing from the queue.
// Pass `null` and this renders the FLAT RATE chip instead of guessing.

const PATHWAY_TONE: Record<string, string> = {
  REUSE: 'bg-success-bg text-success-text',
  REFURBISH: 'bg-warning-bg text-warning-text',
  RECYCLE: 'bg-[#6B3FB8]/10 text-[#6B3FB8]',
  DISPOSE: 'bg-background text-text-disabled',
}

export function PathwayChip({ pathway, className }: { pathway: string | null; className?: string }) {
  if (!pathway) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-background px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-text-secondary',
          className,
        )}
      >
        Flat rate
      </span>
    )
  }

  const tone = PATHWAY_TONE[pathway.toUpperCase()] ?? 'bg-background text-text-secondary'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em]',
        tone,
        className,
      )}
    >
      {pathway}
    </span>
  )
}

/** A small red HOLD / amber REVIEW chip — only rendered when the engine
 * actually raised the flag, never a hand-decided badge. */
export function EngineFlagChip({ flag }: { flag: string }) {
  const upper = flag.toUpperCase()
  const hold = upper === 'HOLD'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em]',
        hold ? 'bg-error-bg text-error-text' : 'bg-warning-bg text-warning-text',
      )}
    >
      {upper}
    </span>
  )
}
