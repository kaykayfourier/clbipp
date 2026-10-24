import { prisma } from '@clbipp/database'
import type { AgentNoticeKind } from '@clbipp/database'

// ─── In-app notices to an agent (AF3 · FD21) ─────────────────────────────────
// Written by the admin console (a reassignment, an office price, a decision on
// an untagged battery) and shown at the top of the day view until the agent
// taps "Got it". There is no push (§12.5 of docs/PLAN_FEEDBACK_V2.md): the
// agent sees a notice the next time a screen renders.
//
// 🔴 Scoped by `agentId` IN CODE. agent_notices is RLS-closed with zero
// policies and Prisma bypasses RLS (D10), so this where-clause is the boundary.

export type AgentNoticeRow = {
  id: string
  kind: AgentNoticeKind
  message: string
  pickupId: string | null
  createdAt: Date
}

export async function unreadNotices(agentId: string): Promise<AgentNoticeRow[]> {
  return prisma.agentNotice.findMany({
    where: { agentId, readAt: null },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, kind: true, message: true, pickupId: true, createdAt: true },
  })
}

/**
 * Where a notice's link goes. A job moved AWAY has no link: it is not this
 * agent's any more, and every job screen would 404 for them.
 */
export function noticeHref(notice: Pick<AgentNoticeRow, 'kind' | 'pickupId'>): string | null {
  if (!notice.pickupId) return null
  const job = `/job/${encodeURIComponent(notice.pickupId)}`
  switch (notice.kind) {
    case 'job_reassigned_to_you':
      return job
    case 'office_price_set':
      return `${job}/offer`
    case 'tag_exception_decided':
      return `${job}/collect`
    case 'job_reassigned_away':
      return null
  }
}
