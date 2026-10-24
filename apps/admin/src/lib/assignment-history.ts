import { prisma } from '@clbipp/database'
import type { AdminAuditAction } from '@clbipp/core/audit'

/**
 * Who a pickup was given to, and by whom, oldest first (AF3).
 *
 * Read from the audit trail rather than status_events: the audit row carries
 * the agent ids before and after, and the REASON, which the status event
 * deliberately does not (the vendor's token reads status_events). Shown on
 * /dispatch/[id] and /pickups/[id].
 */
const ASSIGNMENT_ACTIONS: readonly AdminAuditAction[] = ['pickup.assign', 'pickup.reassign', 'pickup.assign_collector']

export type AssignmentEntry = {
  id: string
  at: Date
  action: string
  fromName: string | null
  toName: string | null
  byName: string
  reason: string | null
}

const agentIdOf = (json: unknown): string | null => {
  if (typeof json !== 'object' || json === null) return null
  const v = (json as Record<string, unknown>).agentId
  return typeof v === 'string' ? v : null
}

export async function assignmentHistory(pickupId: string): Promise<AssignmentEntry[]> {
  const rows = await prisma.adminAudit.findMany({
    where: { subjectType: 'pickup', subjectId: pickupId, action: { in: [...ASSIGNMENT_ACTIONS] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, action: true, before: true, after: true, reason: true, createdAt: true, actor: { select: { fullName: true } } },
  })
  const ids = [...new Set(rows.flatMap((r) => [agentIdOf(r.before), agentIdOf(r.after)]).filter((x): x is string => x !== null))]
  const names = new Map(
    ids.length
      ? (await prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((p) => [p.id, p.fullName])
      : [],
  )
  const nameOf = (json: unknown) => {
    const id = agentIdOf(json)
    return id ? (names.get(id) ?? 'unknown agent') : null
  }
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt,
    action: r.action,
    fromName: nameOf(r.before),
    toName: nameOf(r.after),
    byName: r.actor.fullName,
    reason: r.reason,
  }))
}

export const ASSIGNMENT_VERBS: Record<string, string> = {
  'pickup.assign': 'Assigned',
  'pickup.reassign': 'Reassigned',
  'pickup.assign_collector': 'Collector changed',
}
