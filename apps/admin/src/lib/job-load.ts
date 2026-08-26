import 'server-only'

import { prisma } from '@clbipp/database'

// ─── How busy is each agent right now? ───────────────────────────────────────
// The dispatch picker (B03) needs a live job count next to every agent, and
// Batch 3 is explicitly told NOT to wait on C's /agents screen for it — so this
// is the count, in one place, rather than a subquery inlined into a page.
//
// "Live" means the job is in the agent's hands and not yet handed over:
// scheduled → arrived → offered. `collected` and everything past it are the
// hub's problem, not the agent's day.
//
// ⚠ A pickup still at `requested` with a stale `agentId` (seed fixture 8) is
// deliberately NOT counted. It is not work — it is the residue of a cancelled
// job, and dispatch's whole job here is to clear it. It IS surfaced, loudly, on
// both dispatch screens.
export const LIVE_JOB_STATUSES = ['scheduled', 'arrived', 'offered'] as const

/** agentId → number of live jobs. Agents with none are simply absent from the map. */
export async function liveJobCounts(): Promise<Map<string, number>> {
  const rows = await prisma.pickup.groupBy({
    by: ['agentId'],
    where: { agentId: { not: null }, status: { in: [...LIVE_JOB_STATUSES] } },
    _count: { _all: true },
  })

  return new Map(rows.filter((r) => r.agentId).map((r) => [r.agentId as string, r._count._all]))
}
