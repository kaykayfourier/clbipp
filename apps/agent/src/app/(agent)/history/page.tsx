// /history  —  Batch 8 · Aamir
//
// Every job this agent has ever been assigned, filterable. `/pickups` is the
// working list (what needs you, what you're watching); this is the archive, and
// it is the only screen that shows cancelled and certified jobs.
//
// Server/client split follows the customer app's /history: the server does the
// scoped read and hands down PLAIN JSON, the client filters. Decimal, Date and
// BigInt don't survive the boundary, and the bucketing rules belong next to
// `isActiveJob` in @/lib/job-nav, not in the browser.

import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { formatPaise } from '@clbipp/core/format'
import { AppShell } from '@clbipp/ui'

import { agentHistoryBucket, jobSubtitle } from '@/lib/job-nav'
import HistoryClient, { type AgentHistoryRow } from './HistoryClient'

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Scoped by `agentId` IN CODE — Prisma bypasses RLS (D10), so this
  // where-clause is the whole access control on this read.
  const jobs = await prisma.pickup.findMany({
    where: { agentId: user.id },
    orderBy: [{ scheduledSlot: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      status: true,
      custodyBatchId: true,
      agentFeePaise: true,
      scheduledSlot: true,
      createdAt: true,
      vendor: { select: { fullName: true } },
      _count: { select: { items: true } },
    },
  })

  const rows: AgentHistoryRow[] = jobs.map((job) => ({
    id: job.id,
    status: job.status,
    subtitle: jobSubtitle(job),
    bucket: agentHistoryBucket(job.status, job.custodyBatchId),
    // The scheduled slot is the date the agent actually worked the job, which
    // is what they are scanning this list for. `createdAt` (when the vendor
    // booked it) is the fallback for a job never scheduled.
    when: (job.scheduledSlot ?? job.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    // Formatted HERE, on the server: `formatPaise` on the client would need the
    // @clbipp/core/format subpath, and a preformatted string is one less thing
    // to get wrong at the boundary.
    fee: job.agentFeePaise === null ? null : formatPaise(job.agentFeePaise),
  }))

  return (
    <AppShell title="History" hideNav>
      <HistoryClient rows={rows} />
    </AppShell>
  )
}
