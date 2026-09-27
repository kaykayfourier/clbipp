'use server'

import { randomUUID } from 'node:crypto'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { Prisma, prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'
import {
  DEFAULT_STOP_GAP_MINUTES,
  MAX_RUN_STOPS,
  orderStops,
  runNumber,
  runStopEligibility,
  slotTimes,
} from '@clbipp/core/run-planning'

import { requireAdmin } from '@/lib/admin-identity'
import { agentStateAtConfirm } from '@/lib/agent-selection'
import { dateKeyToDbDate, istDateKey, istInstant } from '@/lib/ist'
import { depotLocation, loadStopRows } from '@/lib/runs'

// ─── Collection runs (FV11 · FD16) ───────────────────────────────────────────
// Feedback §4.3: "Select compatible nearby pickups. Assign one field
// agent/team. Associate a vehicle or collection run." A run is a dispatcher's
// same-day grouping of pickups for one agent. The board SUGGESTS groups; this
// action is only ever called by a person who chose the stops and the agent.
//
// 🔴 A RUN IS NOT A LIFECYCLE STAGE. Its `requested` stops ARE assigned by it
// (`requested → scheduled`, exactly what /dispatch writes, with the same
// status event and the same `pickup.assign` audit row), and every other stop
// keeps its status. Nothing else about any pickup's nine stages changes.
//
// 📌 Shape copied from (admin)/dispatch/actions.ts, the reference admin
// lifecycle write: session identity (requireAdmin), Prisma as table owner (AD3),
// an in-code re-check standing in for the missing RLS, status + status_events
// together, and an AdminAudit row naming who.

const CREATE_ACTION: AdminAuditAction = 'run.create'
const CANCEL_ACTION: AdminAuditAction = 'run.cancel'
const ASSIGN_ACTION: AdminAuditAction = 'pickup.assign'
const RUN_SUBJECT: AdminAuditSubject = 'collection_run'
const PICKUP_SUBJECT: AdminAuditSubject = 'pickup'

// Same as /dispatch and assign-job.ts, so a run-assigned job is
// indistinguishable from a singly dispatched one on the agent's day view.
const DEFAULT_ETA_MINUTES = 45

// One update per stop plus four fixed writes: up to twelve round trips at the
// eight-stop cap. Batch 4 measured eight at 5.3 s against remote Supabase, so
// the ceiling is set explicitly — the same values every multi-write here uses.
const TX_TIMEOUT_MS = 20_000
const TX_MAX_WAIT_MS = 10_000
const NUMBER_ATTEMPTS = 3

export type CreateRunResult = { error: string | null; runId: string | null }

export async function createCollectionRun(input: {
  dateKey: string
  agentId: string
  pickupIds: readonly string[]
  startTime: string
  gapMinutes: string
  vehicle: string
  notes: string
}): Promise<CreateRunResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, runId: null }
  const admin = gate.admin

  const runDate = dateKeyToDbDate(input.dateKey)
  if (!runDate) return { error: 'Pick a valid date for the run.', runId: null }
  const todayKey = istDateKey(new Date())
  if (input.dateKey < todayKey) return { error: 'A run cannot be planned for a day that has passed.', runId: null }

  const ids = [...new Set(input.pickupIds.map((i) => i.trim()).filter(Boolean))]
  if (ids.length === 0) return { error: 'Choose at least one pickup for the run.', runId: null }
  if (ids.length > MAX_RUN_STOPS) {
    return { error: `A run holds at most ${MAX_RUN_STOPS} stops — one van, one day. Split it in two.`, runId: null }
  }

  const start = istInstant(input.dateKey, input.startTime.trim() || '10:00')
  if (!start) return { error: 'Pick a valid start time.', runId: null }
  const gap = input.gapMinutes.trim() === '' ? DEFAULT_STOP_GAP_MINUTES : Number(input.gapMinutes)
  if (!Number.isInteger(gap) || gap < 15 || gap > 240) {
    return { error: 'Time between stops must be 15–240 minutes.', runId: null }
  }

  // 🔴 The agent is re-verified server-side, never trusted from the form — the
  // same three checks assignPickup makes, at the moment of the write.
  const agentId = input.agentId.trim()
  const agent = agentId
    ? await prisma.profile.findUnique({
        where: { id: agentId },
        select: { id: true, role: true, fullName: true, agentVehicle: true },
      })
    : null
  if (!agent || agent.role !== 'agent') return { error: 'Choose an agent for the run.', runId: null }
  const confirm = await agentStateAtConfirm(agent.id, runDate)
  if (confirm.offDuty) return { error: `${agent.fullName} is marked off duty.`, runId: null }
  if (!confirm.safetyTrained) {
    return { error: `${agent.fullName} has no safety training on file and cannot start an intake.`, runId: null }
  }

  // Every stop re-checked against the SAME rule the builder rendered with.
  const rows = await loadStopRows(ids)
  if (rows.length !== ids.length) {
    return { error: 'One of those pickups is no longer in the live pipeline. Reload and rebuild.', runId: null }
  }
  const refused = rows
    .map((r) => ({ r, e: runStopEligibility(r.facts, { agentId: agent.id, dateKey: input.dateKey, todayKey }) }))
    .filter((x) => !x.e.ok)
  if (refused.length > 0) {
    const first = refused[0]
    return {
      error: `${first.r.id} cannot join this run: ${first.e.ok ? '' : first.e.reason}.${refused.length > 1 ? ` (${refused.length - 1} more.)` : ''}`,
      runId: null,
    }
  }

  // Suggested stop order: nearest-neighbour from the hub. A suggestion, and the
  // run sheet says so — this is not route optimisation (FD16).
  const ordered = orderStops(rows, await depotLocation())
  const slots = slotTimes(start, ordered.length, gap)
  const vehicle = input.vehicle.trim() || agent.agentVehicle || null
  const notes = input.notes.trim() || null

  for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
    const runId = randomUUID()
    const runNo = runNumber({ runId, runDate })
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.collectionRun.create({
            data: { id: runId, runNo, agentId: agent.id, runDate, vehicle, notes, createdBy: admin.id },
          })

          const assigned: Array<{ pickupId: string; slot: Date; before: { agentId: string | null } }> = []

          for (let i = 0; i < ordered.length; i += 1) {
            const stop = ordered[i]
            if (stop.status === 'requested') {
              // Exactly /dispatch's write, plus the run fields. Guarded on
              // `requested` so a concurrent assignment wins cleanly.
              const updated = await tx.pickup.updateMany({
                where: { id: stop.id, status: 'requested' },
                data: {
                  status: 'scheduled',
                  agentId: agent.id,
                  scheduledSlot: slots[i],
                  etaMinutes: DEFAULT_ETA_MINUTES,
                  // Trap 11 — a rebooked pickup's stale fee must not pay the
                  // new agent. Same as assignPickup.
                  agentFeePaise: null,
                  collectionRunId: runId,
                  runSequence: i + 1,
                },
              })
              if (updated.count === 0) throw new Error(`RACE:${stop.id}`)
              assigned.push({ pickupId: stop.id, slot: slots[i], before: { agentId: stop.facts.agentId } })
            } else {
              // Already this agent's, on this day (the eligibility rule said
              // so). Its slot is the one the vendor was told — left alone.
              const updated = await tx.pickup.updateMany({
                where: { id: stop.id, agentId: agent.id, status: stop.status as 'scheduled' | 'offered' },
                data: { collectionRunId: runId, runSequence: i + 1 },
              })
              if (updated.count === 0) throw new Error(`RACE:${stop.id}`)
            }
          }

          if (assigned.length > 0) {
            await tx.statusEvent.createMany({
              data: assigned.map((a) => ({
                pickupId: a.pickupId,
                status: 'scheduled' as const,
                actorId: admin.id,
                actorRole: 'admin',
                notes: `Assigned to ${agent.fullName} as a stop on collection run ${runNo}.`,
              })),
            })
          }

          await tx.adminAudit.createMany({
            data: [
              {
                actorId: admin.id,
                action: CREATE_ACTION,
                subjectType: RUN_SUBJECT,
                subjectId: runId,
                after: {
                  runNo,
                  runDate: input.dateKey,
                  agentId: agent.id,
                  vehicle,
                  stops: ordered.map((s) => s.id),
                  assigned: assigned.map((a) => a.pickupId),
                },
              },
              // 🔴 One `pickup.assign` per newly assigned stop, so the audit
              // log's assignment history stays complete however the job was
              // dispatched.
              ...assigned.map((a) => ({
                actorId: admin.id,
                action: ASSIGN_ACTION,
                subjectType: PICKUP_SUBJECT,
                subjectId: a.pickupId,
                before: { status: 'requested', agentId: a.before.agentId },
                after: {
                  status: 'scheduled',
                  agentId: agent.id,
                  scheduledSlot: a.slot.toISOString(),
                  etaMinutes: DEFAULT_ETA_MINUTES,
                  agentFeePaise: null,
                  collectionRunId: runId,
                },
              })),
            ],
          })
        },
        { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
      )
      return { error: null, runId }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('RACE:')) {
        return {
          error: `${err.message.slice(5)} changed while the run was being built — someone else assigned it. Reload and rebuild.`,
          runId: null,
        }
      }
      const collision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
      if (!collision || attempt === NUMBER_ATTEMPTS - 1) throw err
    }
  }
  return { error: 'Could not mint a run number. Try again.', runId: null }
}

/**
 * Cancel a run that has not started. Its stops leave the run but KEEP their
 * agent and slot — cancelling the grouping is not un-dispatching the jobs, and
 * silently unassigning a vendor's pickup is the worse surprise. Reassign them
 * individually from /dispatch if that is what is wanted.
 */
export async function cancelCollectionRun(runId: string): Promise<{ error: string | null }> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error }
  const admin = gate.admin

  const run = await prisma.collectionRun.findUnique({
    where: { id: runId },
    select: { id: true, runNo: true, status: true, pickups: { select: { id: true } } },
  })
  if (!run) return { error: 'That run does not exist.' }
  if (run.status !== 'planned') {
    return {
      error:
        run.status === 'in_progress'
          ? `${run.runNo} is already on the road — the agent has loaded a box. It completes at the hub drop-off.`
          : `${run.runNo} is already ${run.status}.`,
    }
  }

  const moved = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.collectionRun.updateMany({
        where: { id: runId, status: 'planned' },
        data: { status: 'cancelled' },
      })
      if (updated.count === 0) return false
      await tx.pickup.updateMany({
        where: { collectionRunId: runId },
        data: { collectionRunId: null, runSequence: null },
      })
      await tx.adminAudit.create({
        data: {
          actorId: admin.id,
          action: CANCEL_ACTION,
          subjectType: RUN_SUBJECT,
          subjectId: runId,
          before: { status: 'planned', stops: run.pickups.map((p) => p.id) },
          after: { status: 'cancelled' },
        },
      })
      return true
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )
  return moved ? { error: null } : { error: 'That run changed a moment ago. Reload.' }
}

export async function createCollectionRunAction(formData: FormData) {
  const dateKey = String(formData.get('date') ?? '')
  const { error, runId } = await createCollectionRun({
    dateKey,
    agentId: String(formData.get('agentId') ?? ''),
    pickupIds: formData.getAll('pickupIds').map((v) => String(v)),
    startTime: String(formData.get('startTime') ?? ''),
    gapMinutes: String(formData.get('gapMinutes') ?? ''),
    vehicle: String(formData.get('vehicle') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  })

  if (error || !runId) {
    const back = new URLSearchParams({ date: dateKey, error: error ?? 'Could not create the run.' })
    for (const id of formData.getAll('pickupIds')) back.append('pickups', String(id))
    redirect(`/runs/new?${back.toString()}`)
  }

  revalidatePath('/runs')
  revalidatePath('/dispatch')
  revalidatePath('/pickups')
  redirect(`/runs/${runId}?created=1`)
}

export async function cancelCollectionRunAction(formData: FormData) {
  const runId = String(formData.get('runId') ?? '')
  if (!runId) redirect('/runs')
  const { error } = await cancelCollectionRun(runId)
  if (error) redirect(`/runs/${runId}?error=${encodeURIComponent(error)}`)
  revalidatePath('/runs')
  revalidatePath('/dispatch')
  redirect(`/runs/${runId}?cancelled=1`)
}
