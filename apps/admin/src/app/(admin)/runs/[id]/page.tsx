import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { RUN_STATUS_LABELS } from '@clbipp/core/run-planning'
import { STAGE_LABELS, isLifecycleStage } from '@clbipp/ui'

import { dbDateKey, formatDateKey, formatIstDateTime } from '@/lib/ist'
import { Chip, Notice, PageHead, Panel, Stat, secondaryButtonClass } from '@/components/console'

import { cancelCollectionRunAction } from '../actions'

// FV11 · One collection run — feedback §4.1 + §4.3.
//
// The run sheet: stops in suggested order with where each one has got to, how
// many of its lines are tagged, which boxes went out, and — once the load is at
// the hub — how much of it has been checked in. A run's progress is DERIVED
// from its stops, never stored on the run. No shell here (AD11, trap 15).
export const dynamic = 'force-dynamic'

const TONE = { planned: 'neutral', in_progress: 'warning', completed: 'success', cancelled: 'muted' } as const
const PAST_COLLECTION = ['collected', 'tested', 'processed', 'recovered', 'certified']

export default async function RunDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; cancelled?: string; error?: string }>
}) {
  const { id } = await params
  const { created, cancelled, error } = await searchParams

  const run = await prisma.collectionRun.findUnique({
    where: { id },
    select: {
      id: true,
      runNo: true,
      runDate: true,
      status: true,
      vehicle: true,
      notes: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      agent: { select: { fullName: true, phone: true } },
      containers: {
        orderBy: { loadedAt: 'asc' },
        select: {
          loadedAt: true,
          unloadedAt: true,
          container: { select: { code: true, label: true } },
        },
      },
      pickups: {
        orderBy: { runSequence: 'asc' },
        select: {
          id: true,
          status: true,
          runSequence: true,
          scheduledSlot: true,
          location: true,
          custodyBatchId: true,
          vendor: { select: { fullName: true, companyName: true } },
          items: {
            select: {
              untaggedReason: true,
              tag: { select: { code: true, container: { select: { code: true } } } },
              custodyCheck: { select: { outcome: true } },
            },
          },
        },
      },
    },
  })
  if (!run) notFound()

  const collected = run.pickups.filter((p) => PAST_COLLECTION.includes(p.status)).length
  const lines = run.pickups.flatMap((p) => p.items)
  const tagged = lines.filter((l) => l.tag).length
  const checkedIn = lines.filter((l) => l.custodyCheck?.outcome === 'received').length

  return (
    <>
      <PageHead
        title={`Run ${run.runNo}`}
        description={`${formatDateKey(dbDateKey(run.runDate))} · ${run.agent.fullName}${run.vehicle ? ` · ${run.vehicle}` : ''}`}
        actions={
          <>
            <Chip tone={TONE[run.status]}>{RUN_STATUS_LABELS[run.status]}</Chip>
            <Link href="/runs" className={secondaryButtonClass}>
              All runs
            </Link>
          </>
        }
      />

      {created ? (
        <Notice tone="success">
          Run built. {run.agent.fullName} sees it on their day view; it starts when they scan a box.
        </Notice>
      ) : null}
      {cancelled ? (
        <Notice tone="warning">
          Run cancelled. Its stops left the run but kept their agent and slot — reassign them from the dispatch board
          if needed.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex flex-wrap gap-3">
        <Stat value={`${collected} / ${run.pickups.length}`} label="Stops collected" />
        <Stat value={`${tagged} / ${lines.length}`} label="Lines tagged" />
        <Stat value={String(run.containers.length)} label="Boxes loaded" />
        <Stat value={`${checkedIn} / ${lines.length}`} label="Checked in at the hub" />
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Stops" aside="Suggested order — nearest first from the hub, not an optimised route">
          <ol className="flex flex-col divide-y divide-console-line">
            {run.pickups.map((p) => {
              const pTagged = p.items.filter((i) => i.tag).length
              const untagged = p.items.filter((i) => i.untaggedReason).length
              const boxes = [...new Set(p.items.map((i) => i.tag?.container?.code).filter(Boolean))]
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-3 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-black font-mono text-[10px] font-bold text-primary-green">
                    {p.runSequence ?? '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/pickups/${encodeURIComponent(p.id)}`} className="font-mono text-[11px] font-bold text-text-primary underline-offset-2 hover:underline">
                        {p.id}
                      </Link>
                      <Chip tone={p.status === 'cancelled' ? 'error' : 'neutral'}>
                        {isLifecycleStage(p.status) ? STAGE_LABELS[p.status] : 'Cancelled'}
                      </Chip>
                      {p.scheduledSlot ? (
                        <span className="text-[11px] text-text-secondary">{formatIstDateTime(p.scheduledSlot)}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-text-primary">{p.vendor.companyName || p.vendor.fullName}</div>
                    <div className="text-[11px] text-text-secondary">{p.location}</div>
                    <div className="mt-1 text-[11px] text-text-secondary">
                      Tags {pTagged}/{p.items.length}
                      {untagged > 0 ? ` · ${untagged} left untagged` : ''}
                      {boxes.length > 0 ? ` · in ${boxes.join(', ')}` : ''}
                      {p.custodyBatchId ? (
                        <>
                          {' · '}
                          <Link href={`/custody/${p.custodyBatchId}`} className="underline underline-offset-2">
                            at the hub
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </Panel>

        <div className="flex flex-col gap-[18px]">
          <Panel title="Boxes">
            {run.containers.length === 0 ? (
              <p className="text-xs text-text-secondary">
                None loaded yet. The run starts when {run.agent.fullName} scans a box in the field agent app.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {run.containers.map((c) => (
                  <li key={c.container.code} className="text-xs">
                    <span className="font-mono font-bold text-text-primary">{c.container.code}</span>{' '}
                    <span className="text-text-secondary">{c.container.label}</span>
                    <div className="text-[11px] text-text-secondary">
                      Loaded {formatIstDateTime(c.loadedAt)}
                      {c.unloadedAt ? ` · unloaded ${formatIstDateTime(c.unloadedAt)}` : ' · still on the van'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Run">
            <dl className="flex flex-col gap-2 text-xs">
              <div>
                <dt className="text-text-secondary">Built</dt>
                <dd className="text-text-primary">{formatIstDateTime(run.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Started</dt>
                <dd className="text-text-primary">{run.startedAt ? formatIstDateTime(run.startedAt) : '—'}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Completed</dt>
                <dd className="text-text-primary">{run.completedAt ? formatIstDateTime(run.completedAt) : '—'}</dd>
              </div>
              {run.agent.phone ? (
                <div>
                  <dt className="text-text-secondary">Agent phone</dt>
                  <dd className="font-mono text-text-primary">{run.agent.phone}</dd>
                </div>
              ) : null}
              {run.notes ? (
                <div>
                  <dt className="text-text-secondary">Notes</dt>
                  <dd className="text-text-primary">{run.notes}</dd>
                </div>
              ) : null}
            </dl>
            {run.status === 'planned' ? (
              <form action={cancelCollectionRunAction} className="mt-4 border-t border-console-line pt-4">
                <input type="hidden" name="runId" value={run.id} />
                <button type="submit" className={secondaryButtonClass}>
                  Cancel run
                </button>
                <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
                  Only before the agent loads a box. Stops keep their agent and slot.
                </p>
              </form>
            ) : null}
          </Panel>
        </div>
      </div>
    </>
  )
}
