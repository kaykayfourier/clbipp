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
    return {
      ok: false,
      reason: `This job is a stop on ${openRunNo}. Reassign the whole run from its page (only before a box is loaded), or cancel the run first.`,
    }
  }
  return { ok: true }
}

// ─── Reassigning a whole run (round 3, 2026-11-17) ───────────────────────────
// A single stop never leaves its run (the run is one agent's van and day), but
// the run itself can move, intact, to another agent. The company asked for it
// as an option alongside per-job reassignment; nothing forces its use.
//
// Only a `planned` run: once the agent loads a box it is `in_progress` and
// there are batteries in THEIR van — that is a physical hand-over, not a
// reassignment (the same line cancelCollectionRun draws). And every live stop
// must itself be reassignable (scheduled or offered): one stop the agent is
// standing at, or has already collected, holds the whole run. A cancelled stop
// is ignored — it is not anyone's job any more.

export type RunReassignEligibility = ReassignEligibility

export function runReassignEligibility({
  runStatus,
  runNo,
  stops,
}: {
  runStatus: string
  runNo: string
  stops: ReadonlyArray<{ id: string; status: string }>
}): RunReassignEligibility {
  if (runStatus === 'in_progress') {
    return {
      ok: false,
      reason: `${runNo} is on the road. The agent has loaded a box, so the batteries are in their vehicle.`,
    }
  }
  if (runStatus !== 'planned') {
    return { ok: false, reason: `${runNo} is ${runStatus === 'completed' ? 'complete' : runStatus}.` }
  }
  const live = stops.filter((s) => s.status !== 'cancelled')
  if (live.length === 0) return { ok: false, reason: `${runNo} has no live stops to move.` }
  for (const s of live) {
    const stop = reassignEligibility({ status: s.status })
    if (!stop.ok) {
      return {
        ok: false,
        reason:
          s.status === 'arrived'
            ? `The agent is on site at ${s.id}, so the run cannot move.`
            : `${s.id} is past the point where a job can be reassigned, so the run cannot move.`,
      }
    }
  }
  return { ok: true }
}
