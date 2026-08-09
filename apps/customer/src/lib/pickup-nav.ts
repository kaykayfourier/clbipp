import type { BatteryCategory, PickupStatus } from '@clbipp/database'
import { CATEGORY_LABELS } from '@/app/(app)/book/copy'

// ─── Where a pickup row goes, and what it says ───────────────────────────────
// Lifted out of dashboard/page.tsx in Batch 10 when /history became a second
// list of the same rows. Two pickup lists that route differently — or describe
// the same pickup differently — is a drift bug waiting to happen, and the
// status routing below is a Batch 7A decision that deserves one home.
//
// This lives in the app rather than @clbipp/ui because it is app ROUTING, not a
// UI primitive: the UI package knows what a status is, not what URL it means.

/** The minimum a row needs to describe itself. */
export type PickupRowLike = {
  category: BatteryCategory
  batteryType: string | null
  approxQuantity: string | null
  _count: { items: number }
}

/**
 * Status-routed destination for a pickup row.
 *
 * `requested` → the request confirmation screen; `offered` → straight to the
 * offer, because it is the one stage waiting on the CUSTOMER and the row should
 * land on the decision rather than on tracking; everything else → tracking.
 */
export function pickupHref(status: PickupStatus, id: string): string {
  if (status === 'requested') return `/scheduled?id=${id}`
  if (status === 'offered') return `/offer?id=${id}`
  return `/track/${id}`
}

/**
 * Row subtitle: category + line count.
 *
 * Schema v2 superseded `batteryType` / `approxQuantity` and the Batch 5 wizard
 * leaves both null, so a new pickup used to render "null · null". Those two
 * columns are only read as a fallback for the handful of legacy rows written by
 * the old request form, which have no BatteryItem children at all.
 */
export function pickupSubtitle(pickup: PickupRowLike): string {
  if (pickup._count.items === 0) {
    return (
      [pickup.batteryType, pickup.approxQuantity].filter(Boolean).join(' · ') || 'Pickup'
    )
  }
  const lines = pickup._count.items
  return `${CATEGORY_LABELS[pickup.category]} · ${lines} line${lines === 1 ? '' : 's'}`
}

// ─── History grouping ────────────────────────────────────────────────────────
// The /history filter buckets. Derived from a status rather than hard-coded per
// screen so adding a lifecycle stage can't leave a pickup in no bucket at all —
// `isStageBefore`-style thinking applied to the filter chips.

export const HISTORY_FILTERS = ['all', 'active', 'completed', 'cancelled'] as const
export type HistoryFilter = (typeof HISTORY_FILTERS)[number]

export const HISTORY_FILTER_LABELS: Record<HistoryFilter, string> = {
  all: 'All',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/**
 * Which bucket a pickup falls in. `certified` is the only status that counts as
 * completed: `recovered` means the materials are out but the EPR certificate —
 * the thing the customer is actually waiting for — hasn't been issued, so
 * filing it under "completed" would tell them the job is done when it isn't.
 */
export function historyBucket(status: PickupStatus): Exclude<HistoryFilter, 'all'> {
  if (status === 'cancelled') return 'cancelled'
  if (status === 'certified') return 'completed'
  return 'active'
}
