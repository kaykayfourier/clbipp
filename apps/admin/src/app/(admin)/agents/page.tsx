import { prisma } from '@clbipp/database'

import { PageHead } from '@/components/console'
import { formatIstDate } from '@/lib/ist'
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
// No shell here — (admin)/layout.tsx renders ConsoleShell for the whole group.
// 🔴 Never import AppShell, PhoneFrame or hideNav (AD11, trap 15).
export const dynamic = 'force-dynamic'

const ACTIVE_STATUSES = ['scheduled', 'arrived', 'offered', 'collected'] as const

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
      _count: { select: { assignedPickups: { where: { status: { in: [...ACTIVE_STATUSES] } } } } },
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
