import 'server-only'

import { prisma } from '@clbipp/database'
import { rankAgents, type AgentSignals, type RankedAgent } from '@clbipp/core/dispatch-ranking'

import { LIVE_JOB_STATUSES } from './job-load'

// ─── Gathering the three dispatch signals (FV8) ──────────────────────────────
// The data half of the company's ranked-agent selector. The ranking itself is
// pure and lives in @clbipp/core/dispatch-ranking; this file only fetches.
//
// 🔴 "Live" is NOT redefined here. `LIVE_JOB_STATUSES` from ./job-load is the
// one definition, shared with /agents, the dispatch board and this screen —
// which is exactly what the notes ask for: "follow CLBIPP's existing lifecycle
// rather than creating a second definition of lifecycle just for dispatch."

/**
 * An agent's last known operational position.
 *
 * 🔴 PHASE 2 OF THE NOTES, NOT PHASE 3. There is no continuous tracking in this
 * build and none is promised: "For now last known operational location +
 * timestamp should be used rather than promising continuous real-time
 * tracking immediately."
 *
 * The agent app already writes `lat`/`lng` onto `status_events` when an agent
 * taps Arrived and when they confirm a collection, so the most recent such row
 * IS the last place we genuinely know they were — with a real timestamp
 * attached. No new column, no new tracking, and nothing presented as live that
 * isn't.
 */
async function lastKnownLocations(
  agentIds: readonly string[],
): Promise<Map<string, { lat: number; lng: number; at: Date }>> {
  if (agentIds.length === 0) return new Map()

  const events = await prisma.statusEvent.findMany({
    where: {
      actorId: { in: [...agentIds] },
      actorRole: 'agent',
      lat: { not: null },
      lng: { not: null },
    },
    select: { actorId: true, lat: true, lng: true, occurredAt: true },
    orderBy: { occurredAt: 'desc' },
    // One row per agent is all we need, but Prisma has no per-group limit —
    // take a bounded slice of recent events and keep the first per agent.
    // Bounded rather than unbounded because this runs on every dispatch open.
    take: 200,
  })

  const out = new Map<string, { lat: number; lng: number; at: Date }>()
  for (const e of events) {
    if (!e.actorId || out.has(e.actorId)) continue
    out.set(e.actorId, { lat: Number(e.lat), lng: Number(e.lng), at: e.occurredAt })
  }
  return out
}

/** Midnight-to-midnight bounds for one local day. */
function dayBounds(day: Date): { start: Date; end: Date } {
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

/**
 * Every agent, ranked for one pickup.
 *
 * `targetDay` is the day the dispatcher is assigning FOR — which is what
 * "jobs that day" has to be counted against. Defaults to today when the
 * dispatcher has not chosen a slot yet.
 */
export async function rankedAgentsFor(pickup: {
  addressLat: number | null
  addressLng: number | null
  targetDay: Date
}): Promise<RankedAgent[]> {
  const agents = await prisma.profile.findMany({
    where: { role: 'agent' },
    select: {
      id: true,
      fullName: true,
      agentZone: true,
      agentVehicle: true,
      safetyTrainedAt: true,
    },
    orderBy: { fullName: 'asc' },
  })
  if (agents.length === 0) return []

  const ids = agents.map((a) => a.id)
  const { start, end } = dayBounds(pickup.targetDay)

  const [liveRows, dayRows, locations] = await Promise.all([
    prisma.pickup.groupBy({
      by: ['agentId'],
      where: { agentId: { in: ids }, status: { in: [...LIVE_JOB_STATUSES] } },
      _count: { _all: true },
    }),
    // Jobs already booked for the target day. Counts `scheduledSlot` — the
    // confirmed slot the dispatcher sets — and `collectionScheduledAt`, the
    // date an agent booked for a deferred collection (FV3). Both are real
    // commitments on that agent's day.
    prisma.pickup.findMany({
      where: {
        agentId: { in: ids },
        status: { in: [...LIVE_JOB_STATUSES] },
        OR: [
          { scheduledSlot: { gte: start, lt: end } },
          { collectionScheduledAt: { gte: start, lt: end } },
        ],
      },
      select: { agentId: true },
    }),
    lastKnownLocations(ids),
  ])

  const live = new Map(liveRows.filter((r) => r.agentId).map((r) => [r.agentId as string, r._count._all]))
  const onDay = new Map<string, number>()
  for (const row of dayRows) {
    if (row.agentId) onDay.set(row.agentId, (onDay.get(row.agentId) ?? 0) + 1)
  }

  const signals: AgentSignals[] = agents.map((a) => ({
    agentId: a.id,
    fullName: a.fullName,
    zone: a.agentZone,
    vehicle: a.agentVehicle,
    safetyTrainedAt: a.safetyTrainedAt,
    liveJobs: live.get(a.id) ?? 0,
    jobsOnTargetDay: onDay.get(a.id) ?? 0,
    lastLocation: locations.get(a.id) ?? null,
  }))

  const destination =
    pickup.addressLat !== null && pickup.addressLng !== null
      ? { lat: pickup.addressLat, lng: pickup.addressLng }
      : null

  return rankAgents(signals, destination)
}

/**
 * Re-read ONE agent's signals at confirm time.
 *
 * 🔴 EDGE CASE 5 FROM THE NOTES, and the reason this is separate from the list
 * above: "Two admins assign simultaneously — the backend should re-check
 * workload/assignment state when the admin confirms, rather than trusting
 * information loaded when the dropdown was first opened."
 *
 * The list is decision support rendered minutes ago. This is the check that
 * happens against the database at the moment of the write.
 */
export async function agentStateAtConfirm(
  agentId: string,
  targetDay: Date,
): Promise<{ exists: boolean; safetyTrained: boolean; liveJobs: number; jobsOnTargetDay: number }> {
  const { start, end } = dayBounds(targetDay)

  const [agent, liveJobs, jobsOnTargetDay] = await Promise.all([
    prisma.profile.findFirst({
      where: { id: agentId, role: 'agent' },
      select: { id: true, safetyTrainedAt: true },
    }),
    prisma.pickup.count({ where: { agentId, status: { in: [...LIVE_JOB_STATUSES] } } }),
    prisma.pickup.count({
      where: {
        agentId,
        status: { in: [...LIVE_JOB_STATUSES] },
        OR: [
          { scheduledSlot: { gte: start, lt: end } },
          { collectionScheduledAt: { gte: start, lt: end } },
        ],
      },
    }),
  ])

  return {
    exists: agent !== null,
    safetyTrained: agent?.safetyTrainedAt !== null && agent?.safetyTrainedAt !== undefined,
    liveJobs,
    jobsOnTargetDay,
  }
}
