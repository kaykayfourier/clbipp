import type { PickupStatus } from '@clbipp/database'
import { isLithium } from '@clbipp/core/intake'
import { isStageBefore } from '@clbipp/ui'

// ─── Where an agent's job row goes, and what it says ─────────────────────────
// The agent-side mirror of apps/customer/src/lib/pickup-nav.ts, and it exists
// for the same reason: /  (day view) and /pickups (Batch 8) are two lists of the
// SAME rows, and two lists that route differently — or describe the same job
// differently — is a drift bug waiting to happen.
//
// This lives in the app rather than @clbipp/ui because it is app ROUTING: the UI
// package knows what a status is, not what URL it means in this app. The
// customer app maps the identical statuses onto completely different screens.
//
// ⚠ Never re-declare the stage list here or in a screen. `isStageBefore` from
// @clbipp/ui is the one source of order (CLAUDE.md, and PickupStatus in
// schema.prisma is the enum it must agree with).

/** The minimum a row needs to describe itself on the day view. */
export type JobRowLike = {
  id: string
  status: PickupStatus
  custodyBatchId: string | null
  vendor: { fullName: string }
  _count: { items: number }
}

/**
 * Status-routed destination for one of the agent's jobs.
 *
 * The rule is "where does this job want me next", not "show me this job":
 *
 * - `scheduled` — nothing has happened yet. Job detail, where **Arrived** is.
 * - `arrived` — on site. Straight to the safety checklist, which is the
 *   mandatory gate in front of intake (W1/Batch 2). Deliberately NOT the items
 *   screen: routing past the gate would make the row a way around it.
 * - `offered` — the quote is with the vendor; the offer screen is the one that
 *   shows its state.
 * - `collected` with no `custodyBatchId` — the derived "pending drop-off" state
 *   (D5 — it is NOT a tenth lifecycle stage), so the next action is the hub
 *   drop-off flow.
 * - everything else — the agent's part is done; watch-only tracking.
 *
 * `requested` never reaches here in practice (no `agentId` is set until a
 * pickup is scheduled) but falls through to tracking rather than 404ing.
 */
export function jobHref(
  status: PickupStatus,
  custodyBatchId: string | null,
  id: string,
): string {
  if (status === 'scheduled') return `/job/${id}`
  if (status === 'arrived') return `/job/${id}/safety`
  if (status === 'offered') return `/job/${id}/offer`
  if (status === 'collected' && custodyBatchId === null) return '/dropoff'
  return `/pickups/${id}`
}

/**
 * True while the job still needs something from the agent.
 *
 * Drives which list a row lands in on the day view. Derived from `isStageBefore`
 * rather than a hard-coded set so that a future stage can't leave a job in
 * neither list — the mistake the customer app's history filters were written to
 * avoid.
 *
 * A `collected` job is still active *only* until it is dropped off: once it has
 * a `custodyBatchId` the chain of custody has moved on and the agent is just
 * watching. `cancelled` is off the linear lifecycle, so `isStageBefore` returns
 * false for it and it correctly reads as inactive.
 */
export function isActiveJob(status: PickupStatus, custodyBatchId: string | null): boolean {
  if (status === 'collected') return custodyBatchId === null
  return isStageBefore(status, 'collected')
}

/**
 * Row subtitle: who it's for, and how big it is.
 *
 * The vendor's name leads because that is what an agent is actually looking for
 * in a list of their own jobs — the pickup id is already the row's title.
 */
export function jobSubtitle(job: JobRowLike): string {
  const lines = job._count.items
  if (lines === 0) return job.vendor.fullName
  return `${job.vendor.fullName} · ${lines} line${lines === 1 ? '' : 's'}`
}

/**
 * The row's one-line "what happens next", paired with `jobHref` above.
 *
 * Phrased as the agent's next action rather than as a status name — the
 * StatusBadge next to it already says the status, so repeating it would waste
 * the line. "Resume" on `arrived` is what the wireframe drew as a resumable
 * *draft* row; the draft is derived from the lifecycle (D5), not a stored state.
 */
export function jobNextStep(status: PickupStatus, custodyBatchId: string | null): string {
  if (status === 'scheduled') return 'Head over and tap Arrived'
  if (status === 'arrived') return 'Resume — safety checklist, then intake'
  if (status === 'offered') return 'Awaiting the vendor’s decision'
  if (status === 'collected' && custodyBatchId === null) return 'Pending drop-off at the hub'
  if (status === 'cancelled') return 'Cancelled'
  return 'In recovery — nothing to do'
}

/**
 * Where ONE ITEM goes once the agent has confirmed it — the D1 branch, as a URL.
 *
 * Li-ion (`li_ion_nmc` / `li_ion_lfp` / `li_ion_nca`) takes the full path:
 * damage rubric → decision engine → pathway + price band. Everything else is
 * priced straight off `PricingRate` with no rubric and no engine, so it skips
 * to the result. `isLithium` from @clbipp/core/intake is the one definition of
 * which is which — never re-list the chemistries here.
 *
 * An UNCONFIRMED item (`chemistry === null`) is not lithium, so it falls to the
 * result href. That never renders: the item list only offers a next step on rows
 * `itemConfirmationState` calls confirmed.
 *
 * 📌 BATCH 5a: both destinations are stubs today, which is why Batch 3's confirm
 * action redirects back to the item LIST rather than into one of them — landing
 * an agent on an empty page after every item makes the loop untestable. When 5a
 * builds the rubric and the result screens, change that one redirect in
 * `items/actions.ts` to call this function. The branch logic itself does not
 * move.
 */
export function itemNextHref(
  pickupId: string,
  itemId: string,
  chemistry: string | null,
): string {
  const base = `/job/${encodeURIComponent(pickupId)}/items/${encodeURIComponent(itemId)}`
  return isLithium(chemistry) ? `${base}/damage` : `${base}/result`
}

/** The label on that link, so the list and the item screen word it identically. */
export function itemNextLabel(chemistry: string | null): string {
  return isLithium(chemistry) ? 'Continue to damage rubric' : 'Continue to price'
}

// ─── History buckets ─────────────────────────────────────────────────────────
// The agent-side mirror of `historyBucket` in the customer app's pickup-nav.ts,
// and it splits differently ON PURPOSE. The vendor cares whether their pickup is
// finished (`certified`) or not; the agent cares where THEIR part of it ended —
// which is at drop-off, four stages before the vendor's story finishes.

export const AGENT_HISTORY_FILTERS = ['all', 'open', 'handed_over', 'cancelled'] as const
export type AgentHistoryFilter = (typeof AGENT_HISTORY_FILTERS)[number]

export const AGENT_HISTORY_FILTER_LABELS: Record<AgentHistoryFilter, string> = {
  all: 'All',
  open: 'Still open',
  handed_over: 'Handed over',
  cancelled: 'Cancelled',
}

/**
 * Which history bucket a job falls in.
 *
 * Derived from `isActiveJob` rather than a hard-coded status set, so a job can
 * never fall into neither bucket — the same reasoning that shape has in
 * `isActiveJob` itself, and the mistake the customer app's filters were written
 * to avoid.
 *
 * ⚠ `cancelled` is re-enterable (2026-08-23): a cancelled pickup can go back to
 * `requested` when the vendor reschedules. So this is "where is it now", not a
 * permanent filing — a row can legitimately move out of `cancelled` later.
 */
export function agentHistoryBucket(
  status: PickupStatus,
  custodyBatchId: string | null,
): Exclude<AgentHistoryFilter, 'all'> {
  if (status === 'cancelled') return 'cancelled'
  return isActiveJob(status, custodyBatchId) ? 'open' : 'handed_over'
}

// ─── Directions ──────────────────────────────────────────────────────────────

/**
 * Google Maps deep link for a job's address.
 *
 * Lifted out of `/job/[id]/page.tsx` in Batch 8 so the job screen and the map
 * screen build the identical URL. Two screens with a "get me there" button that
 * disagree on where "there" is would be a genuinely dangerous kind of drift.
 *
 * ⚠ `Address.lat` and `Address.lng` are BOTH nullable — manual address entry has
 * to stay possible when a vendor denies location permission at booking, so a
 * coordinate pair is never guaranteed. Falling back to a text destination keeps
 * the button working instead of sending the agent to 0°N 0°E.
 *
 * Turn-by-turn navigation in-app is CUT (D4); this link and a static map are
 * what replaced it.
 */
export function mapsHref(
  lat: number | null,
  lng: number | null,
  textAddress: string,
): string {
  const destination = lat !== null && lng !== null ? `${lat},${lng}` : textAddress
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

/**
 * Prisma `Decimal | null` → `number | null`, for the coordinate pair above.
 *
 * Returns null rather than NaN for anything unparseable, so a corrupt value
 * degrades to "no coordinates" (address text + working deep link) instead of
 * rendering a marker in the Gulf of Guinea.
 */
export function toCoord(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
