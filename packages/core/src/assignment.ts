/**
 * Who may be moved to another agent, and when (AF3 · FD21, 2026-10-24).
 *
 * The company asked for an admin to be able to reassign a job. FD21 (ours,
 * provisional): only an admin, only BEFORE collection — `scheduled`, or
 * `offered` in any of its three sub-states. Not `arrived` (the agent is
 * standing at the vendor's site with the batteries in front of them), and not a
 * stop on an open collection run (the run is one agent's van and day; cancel
 * the run instead). A typed reason is required — that is the action's job.
 *
 * One rule, used by the panel that decides whether to render and by
 * `reassignPickup`, which refuses with the same words.
 *
 * Pure: no Prisma, no I/O.
 *
 *     import { reassignEligibility } from "@clbipp/core/assignment"
 */

/** Below this, a reason is a shrug, not a record. */
export const MIN_REASSIGN_REASON_CHARS = 8

export type ReassignEligibility = { ok: true } | { ok: false; reason: string }

export function reassignEligibility({
  status,
  openRunNo,
}: {
  status: string
  /** Set when the pickup is a stop on a `planned` or `in_progress` run. */
  openRunNo?: string | null
}): ReassignEligibility {
  if (status === 'arrived') {
    return { ok: false, reason: 'The agent is on site. A job cannot be reassigned once the agent has arrived.' }
  }
  if (status !== 'scheduled' && status !== 'offered') {
    return { ok: false, reason: 'Only a scheduled job, or one with an offer that is not yet collected, can be reassigned.' }
  }
  if (openRunNo) {
    return { ok: false, reason: `This job is a stop on ${openRunNo}. Cancel the run first, or change the stop from the run.` }
  }
  return { ok: true }
}
