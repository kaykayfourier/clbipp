import { prisma } from '@clbipp/database'

import { PageHead } from '@/components/console'
import { formatIstDate } from '@/lib/ist'
import { LIVE_JOB_STATUSES } from '@/lib/job-load'
import { AgentsTable, type AgentRow } from './AgentsTable'

// E02 · Agent roster — Batch 9, owner C — Ali.
//
// Zone, vehicle, safety training, rating, live job load. Read-only.
//
// "Live load" = jobs this agent still has to act on — scheduled through
// collected. Once a pickup reaches `tested` it has moved to the hub side of
// the chain (Batch 6/7's territory); it stops counting against the agent even
// though `Pickup.agentId` still points at them for the record.
//
// 🔴 That list is LIVE_JOB_STATUSES from @/lib/job-load, not a local copy.
// This screen originally declared its own four-status ACTIVE_STATUSES while
// job-load.ts declared three, so /agents and /dispatch/[id] reported different
// live loads for the same agent — the exact drift a shared helper exists to
// prevent. Unified 2026-08-31 on this screen's (correct) four-status reading;
// see the note in job-load.ts.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).
export const dynamic = 'force-dynamic'

export default async function AgentsPage() {
  const agents = await prisma.profile.findMany({
    where: { role: 'agent' },
    select: {
      id: true,
      fullName: true,
      agentZone: true,
      agentVehicle: true,
      safetyTrainedAt: true,
      agentRating: true,
      _count: { select: { assignedPickups: { where: { status: { in: [...LIVE_JOB_STATUSES] } } } } },
    },
    orderBy: { fullName: 'asc' },
  })

  const rows: AgentRow[] = agents.map((a) => ({
    id: a.id,
    name: a.fullName,
    zone: a.agentZone,
    vehicle: a.agentVehicle,
    safetyTrainedLabel: a.safetyTrainedAt ? formatIstDate(a.safetyTrainedAt) : null,
    rating: a.agentRating !== null ? Number(a.agentRating) : null,
    liveLoad: a._count.assignedPickups,
  }))

  return (
    <>
      <PageHead title="Agent roster" description="Zone, vehicle, safety training, rating and live job load." />
      <AgentsTable rows={rows} />
    </>
  )
}
