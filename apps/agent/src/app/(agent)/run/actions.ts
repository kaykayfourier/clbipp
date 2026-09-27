'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import { createClient } from '@clbipp/auth/server'
import { parseCode } from '@clbipp/core/tags'

// ─── The agent's side of a collection run (FV11 · FD14) ─────────────────────
// Feedback §4.1: "At the start of a collection run, the agent scans the
// container, and batteries collected during that run are digitally associated
// with it." Scanning a box onto a run is what STARTS the run (planned →
// in_progress); every tag bound on the run records the box its line went into
// (collect/tag-actions.ts); the hub drop-off that leaves no stop to visit
// completes the run and frees its boxes (dropoff/confirm/actions.ts).
//
// Same write rules as every agent action: session identity, the in-code
// `agentId === user.id` re-check standing in for RLS (D10), POST only.

const OPEN = ['planned', 'in_progress'] as const

function back(runId: string, result: { error?: string; ok?: string }): never {
  revalidatePath(`/run/${runId}`)
  revalidatePath('/')
  const q = result.error ? `error=${encodeURIComponent(result.error)}` : `ok=${encodeURIComponent(result.ok ?? 'Done.')}`
  redirect(`/run/${encodeURIComponent(runId)}?${q}`)
}

async function sessionAgent() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return user
}

export async function loadContainerAction(formData: FormData) {
  const runId = String(formData.get('runId') ?? '')
  if (!runId) redirect('/')
  const user = await sessionAgent()

  const run = await prisma.collectionRun.findFirst({
    // 🔴 In-code ownership (D10).
    where: { id: runId, agentId: user.id },
    select: { id: true, runNo: true, status: true },
  })
  if (!run) back(runId, { error: 'That run is not yours.' })
  if (!(OPEN as readonly string[]).includes(run.status)) back(runId, { error: `${run.runNo} is ${run.status}.` })

  const parsed = parseCode(String(formData.get('code') ?? ''))
  if (!parsed.ok) back(runId, { error: parsed.error })
  if (parsed.kind !== 'container') {
    back(runId, { error: `${parsed.code} is a battery tag. Scan the QR on the box itself.` })
  }

  const box = await prisma.transportContainer.findUnique({
    where: { code: parsed.code },
    select: {
      id: true,
      code: true,
      label: true,
      isActive: true,
      loads: {
        where: { unloadedAt: null, run: { status: { in: [...OPEN] } } },
        select: { runId: true, run: { select: { runNo: true } } },
      },
    },
  })
  if (!box) back(runId, { error: `${parsed.code} is not a registered box. Ask the office to register it.` })
  if (!box.isActive) back(runId, { error: `${box.code} has been retired. Use another box.` })

  const elsewhere = box.loads.find((l) => l.runId !== run.id)
  if (elsewhere) {
    back(runId, {
      error: `${box.code} is still on ${elsewhere.run.runNo}. A box is on one run at a time — it comes free at that run's hub drop-off.`,
    })
  }
  if (box.loads.some((l) => l.runId === run.id)) back(runId, { ok: `${box.code} is already on this run.` })

  await prisma.$transaction(async (tx) => {
    // Upsert: a box unloaded earlier in the day and loaded again is the same
    // box on the same run, not a second row.
    await tx.runContainer.upsert({
      where: { runId_containerId: { runId: run.id, containerId: box.id } },
      create: { runId: run.id, containerId: box.id, loadedBy: user.id },
      update: { unloadedAt: null, loadedAt: new Date(), loadedBy: user.id },
    })
    // The first box scanned is the start of the run.
    await tx.collectionRun.updateMany({
      where: { id: run.id, status: 'planned' },
      data: { status: 'in_progress', startedAt: new Date() },
    })
  })

  back(runId, { ok: `${box.code} (${box.label}) loaded.${run.status === 'planned' ? ' Run started.' : ''}` })
}

export async function finishRunAction(formData: FormData) {
  const runId = String(formData.get('runId') ?? '')
  if (!runId) redirect('/')
  const user = await sessionAgent()

  const run = await prisma.collectionRun.findFirst({
    where: { id: runId, agentId: user.id },
    select: {
      id: true,
      runNo: true,
      status: true,
      pickups: { where: { status: 'collected', custodyBatchId: null }, select: { id: true } },
    },
  })
  if (!run) back(runId, { error: 'That run is not yours.' })
  if (!(OPEN as readonly string[]).includes(run.status)) back(runId, { error: `${run.runNo} is already ${run.status}.` })

  // 🔴 A run with batteries still in the van is not finished — its boxes are
  // full. The hub drop-off is what empties them, and it completes the run
  // itself. This button is for a run that ends with nothing to hand in (every
  // vendor declined, or every stop was an inspection only).
  if (run.pickups.length > 0) {
    back(runId, {
      error: `${run.pickups.length} collected load${run.pickups.length === 1 ? ' is' : 's are'} still in the van. Hand ${run.pickups.length === 1 ? 'it' : 'them'} in at the hub first.`,
    })
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.collectionRun.update({ where: { id: run.id }, data: { status: 'completed', completedAt: now } }),
    prisma.runContainer.updateMany({ where: { runId: run.id, unloadedAt: null }, data: { unloadedAt: now } }),
  ])
  back(runId, { ok: `${run.runNo} finished. Any boxes on it are free again.` })
}
