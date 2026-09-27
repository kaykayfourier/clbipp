import Link from 'next/link'

import { prisma } from '@clbipp/database'
import { RUN_STATUS_LABELS } from '@clbipp/core/run-planning'

import { dbDateKey, formatDateKey, istDateKey } from '@/lib/ist'
import { Chip, PageHead, Panel, Stat, primaryButtonClass } from '@/components/console'

// FV11 · Collection runs — feedback §4.3, decision FD16 (ours, provisional).
//
// Every run, open ones first. A run is a dispatcher's same-day grouping for one
// agent; it is started by the agent scanning a box and completed at the hub
// drop-off. No shell here (AD11, trap 15).
export const dynamic = 'force-dynamic'

const TONE = { planned: 'neutral', in_progress: 'warning', completed: 'success', cancelled: 'muted' } as const

export default async function RunsPage() {
  const runs = await prisma.collectionRun.findMany({
    orderBy: [{ runDate: 'desc' }, { createdAt: 'desc' }],
    take: 60,
    select: {
      id: true,
      runNo: true,
      runDate: true,
      status: true,
      vehicle: true,
      agent: { select: { fullName: true } },
      pickups: { select: { id: true, status: true } },
      containers: { select: { unloadedAt: true, container: { select: { code: true } } } },
    },
  })

  const todayKey = istDateKey(new Date())
  const open = runs.filter((r) => r.status === 'planned' || r.status === 'in_progress')
  const rest = runs.filter((r) => !open.includes(r))
  const overdue = open.filter((r) => dbDateKey(r.runDate) < todayKey)

  return (
    <>
      <PageHead
        title="Collection runs"
        description="Same-day pickups grouped for one agent and one vehicle. Suggested from the dispatch board; built by a dispatcher."
        actions={
          <Link href="/runs/new" className={primaryButtonClass}>
            Plan a run
          </Link>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Stat value={String(open.filter((r) => r.status === 'planned').length)} label="Planned" />
        <Stat value={String(open.filter((r) => r.status === 'in_progress').length)} label="On the road" />
        <Stat
          value={String(overdue.length)}
          label="Open past their day"
          tone={overdue.length > 0 ? 'warning' : 'default'}
        />
        <Stat value={String(rest.filter((r) => r.status === 'completed').length)} label="Completed" />
      </div>

      <Panel title="Runs" aside="Open runs first">
        {runs.length === 0 ? (
          <p className="text-xs text-text-secondary">
            No runs yet. The dispatch board suggests same-day groups of nearby requests — plan one from there or from
            here.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
                <th className="pb-2 font-semibold">Run</th>
                <th className="pb-2 font-semibold">Day</th>
                <th className="pb-2 font-semibold">Agent</th>
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 text-right font-semibold">Stops · collected</th>
                <th className="pb-2 font-semibold">Boxes</th>
              </tr>
            </thead>
            <tbody>
              {[...open, ...rest].map((r) => {
                const collected = r.pickups.filter((p) =>
                  ['collected', 'tested', 'processed', 'recovered', 'certified'].includes(p.status),
                ).length
                return (
                  <tr key={r.id} className="border-t border-console-line">
                    <td className="py-2.5">
                      <Link href={`/runs/${r.id}`} className="font-mono text-[11px] font-bold text-text-primary underline-offset-2 hover:underline">
                        {r.runNo}
                      </Link>
                    </td>
                    <td className="py-2.5 text-xs text-text-primary">{formatDateKey(dbDateKey(r.runDate))}</td>
                    <td className="py-2.5 text-xs text-text-primary">
                      {r.agent.fullName}
                      {r.vehicle ? <div className="text-[11px] text-text-secondary">{r.vehicle}</div> : null}
                    </td>
                    <td className="py-2.5">
                      <Chip tone={TONE[r.status]}>{RUN_STATUS_LABELS[r.status]}</Chip>
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs">
                      {r.pickups.length} · {collected}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-text-secondary">
                      {r.containers.length === 0 ? '—' : r.containers.map((c) => c.container.code).join(', ')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}
