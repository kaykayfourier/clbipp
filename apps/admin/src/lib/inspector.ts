import { prisma } from '@clbipp/database'

/**
 * The agent who inspected a pickup: whoever presented its offer.
 *
 * Read from the first agent-written `offered` event rather than Pickup.agentId,
 * because a collection can be handed to a different agent afterwards (feedback
 * round 2) and agentId then names the collector.
 */
export async function inspectorOf(pickupId: string): Promise<{ id: string; fullName: string } | null> {
  const event = await prisma.statusEvent.findFirst({
    where: { pickupId, status: 'offered', actorRole: 'agent', actorId: { not: null } },
    orderBy: { occurredAt: 'asc' },
    select: { actorId: true },
  })
  if (!event?.actorId) return null
  return prisma.profile.findUnique({ where: { id: event.actorId }, select: { id: true, fullName: true } })
}
