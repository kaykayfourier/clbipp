import { STAGE_LABELS, isLifecycleStage, cn } from '@clbipp/ui'
import type { LifecycleStage } from '@clbipp/ui'

// ─── StatusPill ─────────────────────────────────────────────────────────────
// A pickup-status chip for the console. NOT @clbipp/ui's <StatusBadge> — that
// component carries its own hand-written, customer-voiced label set
// ("AGENT ON SITE", "OFFER READY") for the vendor/agent apps' tone. Batch 2's
// own rule is explicit: "Status chips render from STAGE_LABELS. Never a
// hand-written label" (trap 13) — so this reads the label straight out of
// STAGE_LABELS instead, which keeps every admin screen's wording in lockstep
// with the schema enum by construction: add a stage to LIFECYCLE_STAGES and
// this chip's vocabulary is already correct, with nothing to update here.
//
// `cancelled` is handled explicitly — it is deliberately absent from
// LIFECYCLE_STAGES (tokens.ts's own comment: it is a terminal side-state, not
// a position in the progression) so it needs its own label and colour rather
// than a STAGE_LABELS lookup that would return undefined.
//
// 🔴 Trap 10: `offered` is TWO states, separated only by `Offer.acceptedAt`.
// Pass `offerAccepted` when the status is `offered` so this can render
// "Offer made" vs "Offer accepted" — a screen that only ever passes `status`
// renders the ambiguous case, which is the bug trap 10 warns about.

export type PickupStatusValue = LifecycleStage | 'cancelled'

export interface StatusPillProps {
  status: PickupStatusValue | string
  /** Only meaningful when status === 'offered'. See trap 10 above. */
  offerAccepted?: boolean
  className?: string
}

const TONE: Record<'blue' | 'amber' | 'green' | 'grey', string> = {
  blue: 'bg-info-bg text-info-text',
  amber: 'bg-warning-bg text-warning-text',
  green: 'bg-success-bg text-success-text',
  grey: 'bg-background text-text-secondary',
}

function toneFor(status: string, offerAccepted?: boolean): keyof typeof TONE {
  if (status === 'cancelled') return 'grey'
  if (status === 'requested' || status === 'scheduled' || status === 'arrived') return 'blue'
  // Waiting on the vendor reads amber (matches StatusBadge's reasoning for
  // `offered` in @clbipp/ui — a state pending someone else's action, not
  // passive progress); once accepted it is progress again.
  if (status === 'offered') return offerAccepted ? 'blue' : 'amber'
  if (status === 'collected' || status === 'tested' || status === 'processed') return 'amber'
  if (status === 'recovered' || status === 'certified') return 'green'
  return 'grey'
}

export function StatusPill({ status, offerAccepted, className }: StatusPillProps) {
  let label: string
  if (status === 'cancelled') {
    label = 'Cancelled'
  } else if (isLifecycleStage(status)) {
    label = STAGE_LABELS[status]
    if (status === 'offered') {
      label = offerAccepted ? 'Offer accepted' : 'Offer made — awaiting vendor'
    }
  } else {
    // Unrecognised string — render it rather than throw. A stray value here is
    // a data problem worth SEEING on screen, not a screen that 500s on it.
    label = status
  }

  const tone = toneFor(status, offerAccepted)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold',
        TONE[tone],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
      {label}
    </span>
  )
}
