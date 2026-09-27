// /run/[id]  —  FV11 · a collection run, the agent's side (FD14, FD16)
//
// Feedback §4.1 + §4.3: one agent, one vehicle, the day's nearby stops, and a
// QR-tracked box. Scanning a box is what STARTS the run; the tags bound at each
// stop record which box each line went into; the hub drop-off empties the boxes
// and completes the run.
//
// Watch-and-act, not intake: this screen handles no battery, so — like the
// Batch 8 screens — it is not behind the safety gate. Every stop it links to
// IS, because the job screens themselves call requireSafetyChecklist.
//
// `hideNav` is required — (agent)/layout.tsx owns the nav and the clearance
// under it. Add no bottom padding.

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { RUN_STATUS_LABELS } from '@clbipp/core/run-planning'
import { AppShell, Banner, Button, Card, CardContent, ListRow, PagePadding, SectionLabel } from '@clbipp/ui'

import { CodeField } from '@/components/qr-scanner'
import { jobHref, jobNextStep } from '@/lib/job-nav'

import { finishRunAction, loadContainerAction } from '../actions'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const { id } = await params
  const { ok, error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const run = await prisma.collectionRun.findFirst({
    // 🔴 In-code ownership — the whole access boundary on this read (D10).
    where: { id, agentId: user.id },
    select: {
      id: true,
      runNo: true,
      runDate: true,
      status: true,
      vehicle: true,
      notes: true,
      containers: {
        orderBy: { loadedAt: 'asc' },
        select: { unloadedAt: true, container: { select: { code: true, label: true } } },
      },
      pickups: {
        orderBy: { runSequence: 'asc' },
        select: {
          id: true,
          status: true,
          runSequence: true,
          custodyBatchId: true,
          collectionScheduledAt: true,
          scheduledSlot: true,
          location: true,
          vendor: { select: { fullName: true } },
          _count: { select: { items: true } },
          items: { select: { tag: { select: { code: true } }, untaggedReason: true } },
        },
      },
    },
  })
  if (!run) redirect('/')

  const open = run.status === 'planned' || run.status === 'in_progress'
  const loaded = run.containers.filter((c) => c.unloadedAt === null)
  const dayLabel = run.runDate.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <AppShell title={run.runNo} showBack backHref="/" hideNav>
      <PagePadding className="flex flex-col gap-4">
        {ok && <Banner variant="success">{ok}</Banner>}
        {error && <Banner variant="error">{error}</Banner>}

        <div>
          <h1 className="font-serif text-2xl font-medium text-text-primary">{`Collection run · ${dayLabel}`}</h1>
          <p className="text-sm text-text-secondary">
            {`${RUN_STATUS_LABELS[run.status]} · ${run.pickups.length} stop${run.pickups.length === 1 ? '' : 's'}${run.vehicle ? ` · ${run.vehicle}` : ''}`}
          </p>
          {run.notes ? <p className="mt-1 text-xs text-text-secondary">{`Office notes: ${run.notes}`}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>{`Boxes on the van — ${loaded.length}`}</SectionLabel>
          <Card variant="elevated">
            <CardContent className="flex flex-col gap-3">
              {loaded.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {loaded.map((c) => (
                    <li key={c.container.code} className="flex items-center justify-between text-sm">
                      <span className="font-mono font-bold text-text-primary">{c.container.code}</span>
                      <span className="text-xs text-text-secondary">{c.container.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-secondary">
                  {open
                    ? 'No box yet. Scan the QR on the box you are loading — that starts the run, and every battery you tag goes on record as in that box.'
                    : 'No boxes were loaded on this run.'}
                </p>
              )}
              {open ? (
                <form action={loadContainerAction} className="flex flex-col gap-2">
                  <input type="hidden" name="runId" value={run.id} />
                  <CodeField
                    placeholder="BX-…"
                    scanLabel="Scan box"
                    submitLabel={loaded.length === 0 ? 'Load box & start run' : 'Load another box'}
                  />
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Stops — suggested order</SectionLabel>
          <div className="flex flex-col gap-2">
            {run.pickups.map((p) => {
              const tagged = p.items.filter((i) => i.tag).length
              return (
                <Link key={p.id} href={jobHref(p.status, p.custodyBatchId, p.id)} className="flex flex-col gap-1">
                  <ListRow
                    id={`${p.runSequence ?? '·'}. ${p.id}`}
                    subtitle={`${p.vendor.fullName} · ${p.location}`}
                    status={p.status}
                  />
                  <span className="px-1 text-[11px] text-text-secondary">
                    {`${jobNextStep(p.status, p.custodyBatchId, p.collectionScheduledAt)}${
                      tagged > 0 || p.items.some((i) => i.untaggedReason) ? ` · tags ${tagged}/${p._count.items}` : ''
                    }`}
                  </span>
                </Link>
              )
            })}
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-text-secondary">
            The order is a suggestion — nearest first from the hub, straight-line — not an optimised route. Drive
            it however the roads say.
          </p>
        </div>

        {open ? (
          <form action={finishRunAction} className="flex flex-col gap-2">
            <input type="hidden" name="runId" value={run.id} />
            <Button type="submit" variant="secondary" fullWidth>
              Finish run with nothing to hand in
            </Button>
            <p className="text-center text-[11px] text-text-secondary">
              Batteries in the van go to the hub first. A drop-off with no stop left to visit closes the run itself.
            </p>
          </form>
        ) : null}
      </PagePadding>
    </AppShell>
  )
}
