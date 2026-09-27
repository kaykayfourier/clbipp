import Link from 'next/link'

import { prisma } from '@clbipp/database'
import { RUN_STATUS_LABELS } from '@clbipp/core/run-planning'

import { formatIstDateTime } from '@/lib/ist'
import {
  Chip,
  FieldLabel,
  Notice,
  PageHead,
  Panel,
  Stat,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/console'

import { registerContainerAction, setContainerActiveAction } from './actions'

// FV11 · Transport boxes — feedback §4.1, decision FD14 (ours, provisional).
//
// Reusable boxes with a permanent QR. An agent scans one at the start of a
// collection run; every battery tag bound on that run records which box it went
// into; the hub drop-off unloads it. Whether a box is "in use" is DERIVED from
// its load history (`run_containers.unloaded_at IS NULL` on an open run), never
// a stored flag that could disagree with it.
//
// No shell here — (admin)/layout.tsx renders ConsoleShell (AD11, trap 15).
export const dynamic = 'force-dynamic'

export default async function ContainersPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; error?: string }>
}) {
  const { registered, error } = await searchParams

  const boxes = await prisma.transportContainer.findMany({
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      label: true,
      capacityKg: true,
      isActive: true,
      _count: { select: { loads: true, tags: true } },
      loads: {
        orderBy: { loadedAt: 'desc' },
        take: 1,
        select: {
          loadedAt: true,
          unloadedAt: true,
          run: { select: { id: true, runNo: true, status: true, agent: { select: { fullName: true } } } },
        },
      },
    },
  })

  const isLoaded = (b: (typeof boxes)[number]) => {
    const last = b.loads[0]
    return Boolean(last && last.unloadedAt === null && (last.run.status === 'planned' || last.run.status === 'in_progress'))
  }
  const active = boxes.filter((b) => b.isActive)
  const loaded = boxes.filter(isLoaded)

  return (
    <>
      <PageHead
        title="Transport boxes"
        description="Reusable QR-labelled boxes. Scanned onto a collection run by the agent, emptied at the hub drop-off."
        actions={
          active.length > 0 ? (
            <a href="/api/labels/containers" className={secondaryButtonClass}>
              Print all labels
            </a>
          ) : null
        }
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {registered ? (
        <Notice tone="success">
          Registered <span className="font-mono text-[12px] font-bold">{registered}</span>. Print its label from the
          table and stick it on the box — the code is permanent.
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Stat value={String(active.length)} label="Active boxes" />
        <Stat value={String(loaded.length)} label="On a run right now" />
        <Stat value={String(active.length - loaded.length)} label="Free at the hub" />
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Boxes">
          {boxes.length === 0 ? (
            <p className="text-xs text-text-secondary">No boxes registered yet. A collection run needs at least one.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-secondary">
                  <th className="pb-2 font-semibold">Code</th>
                  <th className="pb-2 font-semibold">Box</th>
                  <th className="pb-2 font-semibold">Now</th>
                  <th className="pb-2 text-right font-semibold">Runs · lines</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {boxes.map((b) => {
                  const last = b.loads[0]
                  const onRun = isLoaded(b)
                  return (
                    <tr key={b.id} className="border-t border-console-line align-top">
                      <td className="py-2.5 font-mono text-[11px] font-bold text-text-primary">{b.code}</td>
                      <td className="py-2.5">
                        <div className="text-xs text-text-primary">{b.label}</div>
                        <div className="text-[11px] text-text-secondary">
                          {b.capacityKg !== null ? `${Number(b.capacityKg)} kg capacity` : 'No capacity set'}
                        </div>
                      </td>
                      <td className="py-2.5 text-xs">
                        {!b.isActive ? (
                          <Chip tone="muted">Retired</Chip>
                        ) : onRun && last ? (
                          <>
                            <Chip tone="warning">{RUN_STATUS_LABELS[last.run.status]}</Chip>{' '}
                            <Link href={`/runs/${last.run.id}`} className="font-mono underline underline-offset-2">
                              {last.run.runNo}
                            </Link>
                            <div className="mt-0.5 text-[11px] text-text-secondary">
                              {last.run.agent.fullName} · loaded {formatIstDateTime(last.loadedAt)}
                            </div>
                          </>
                        ) : (
                          <Chip tone="success">Free</Chip>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs">
                        {b._count.loads} · {b._count.tags}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            href={`/api/labels/containers?id=${encodeURIComponent(b.id)}`}
                            className="text-xs font-bold text-text-primary underline underline-offset-2"
                          >
                            Label
                          </a>
                          <form action={setContainerActiveAction}>
                            <input type="hidden" name="containerId" value={b.id} />
                            <input type="hidden" name="active" value={b.isActive ? '0' : '1'} />
                            <button type="submit" className="text-xs text-text-secondary underline underline-offset-2">
                              {b.isActive ? 'Retire' : 'Reinstate'}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Register a box">
          <form action={registerContainerAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="label">Name</FieldLabel>
              <input id="label" name="label" required maxLength={60} placeholder="Blue crate 60 L #5" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="capacityKg">Capacity (kg, optional)</FieldLabel>
              <input id="capacityKg" name="capacityKg" type="number" min={1} step={1} className={inputClass} />
            </div>
            <button type="submit" className={primaryButtonClass}>
              Register &amp; mint code
            </button>
            <p className="text-[11px] leading-relaxed text-text-secondary">
              The code is minted here and never changes — print the label and fix it to the box. Retire a box that is
              lost or broken; its history stays.
            </p>
          </form>
        </Panel>
      </div>
    </>
  )
}
