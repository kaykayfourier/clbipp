'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'

import { requireAdmin } from '@/lib/admin-identity'
import { parseIstLocal } from '@/lib/ist'

// ─── Dispatch: `requested → scheduled` + Pickup.agentId ──────────────────────
// 🔴 THE TRANSITION THIS PROJECT HAS BEEN MISSING SINCE DAY ONE. Nothing in any
// of the three apps wrote it before this file: a pickup booked in the customer
// app sat at `requested` with a null `agentId` forever, and the agent app's day
// view (`where: { agentId: user.id }`) could never see it. `npm run assign-job`
// was the CLI stopgap, and it stays as the fallback — see its header.
//
// 📌 THIS IS THE REFERENCE SERVICE-ROLE ACTION FOR THE ADMIN APP. Batches 6
// (custody batch → tested, manifest dispatch) and 7 (manifest confirm,
// certification) copy this shape. It is the admin-side mirror of
// apps/agent/src/app/(agent)/job/[id]/actions.ts, and it keeps all four of that
// file's rules — with one deliberate substitution:
//
//   1. The CALLER's identity comes from the SESSION (requireAdmin), never from
//      a form field.
//   2. The WRITE bypasses RLS. The agent app does that with the service-role
//      Supabase client; here it is PRISMA, which connects as the table OWNER
//      and never consults RLS at all. Same privilege, and it buys the one thing
//      supabase-js cannot do: `pickups`, `status_events` and `admin_audits` in a
//      SINGLE TRANSACTION. AD3 names Prisma as this app's write path, and
//      packages/database/prisma/assign-job.ts — the CLI this screen replaces —
//      already writes this exact transition through it.
//   3. Because RLS is bypassed, the action re-verifies the caller itself. That
//      is `requireAdmin()`; deleting it hands every logged-in session the
//      dispatch board.
//   4. Status and event are written TOGETHER. `pickups.status` is a
//      denormalised cache of the `status_events` log, and drift between them is
//      invisible until a timeline renders wrong weeks later.
//
// 🔴 And one rule the agent app has no equivalent of: an admin write also
// records WHO did it, in `admin_audits` (W7). Every action string comes from
// @clbipp/core/audit — never a bare literal, or the log grows typo-variants and
// every `where: { action }` read silently under-counts.

// 🔴 The closed audit vocabulary, typed rather than typed-out. Annotating the
// constants is what makes a typo a compile error — @clbipp/core/audit exists
// precisely so that `where: { action: 'pickup.asign' }` can never happen.
const AUDIT_ACTION: AdminAuditAction = 'pickup.assign'
const AUDIT_SUBJECT: AdminAuditSubject = 'pickup'

// ⚠ Nothing but async functions may be EXPORTED from a 'use server' file — Next
// rejects the module otherwise. Shared constants for the screens live in
// @/lib/job-load.

// The customer app books with a 45-minute ETA, the seed mirrors it, and
// assign-job.ts uses the same number — so a dispatched job is indistinguishable
// from a seeded one on the agent's day view.
const DEFAULT_ETA_MINUTES = 45
const MIN_ETA_MINUTES = 5
const MAX_ETA_MINUTES = 480

export type AssignResult = { error: string | null }

// Remote Supabase makes every round trip in a transaction expensive: the
// measured ceiling on this console's multi-write transactions is ~5.3 s, which
// is over Prisma's 5 s default. lifecycle/actions.ts and manifests/actions.ts
// have always set these; dispatch did not, and dispatch is the FIRST write in
// the whole flow and the one most likely to be shown live.
const TX_TIMEOUT_MS = 20_000
const TX_MAX_WAIT_MS = 10_000

/**
 * The transition itself.
 *
 * Idempotent by construction: `status: 'requested'` inside the updateMany WHERE
 * is the race guard. A double-submit, a refresh or two admins clicking at once
 * updates ZERO rows on the second attempt rather than reassigning a job an
 * agent is already standing in the middle of — and because the status event and
 * the audit row are inside the same transaction, a losing write leaves no trace
 * at all rather than a second `scheduled` event.
 */
export async function assignPickup(input: {
  pickupId: string
  agentId: string
  scheduledSlot: string
  etaMinutes: string
}): Promise<AssignResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error }
  const admin = gate.admin

  const pickupId = input.pickupId.trim()
  const agentId = input.agentId.trim()
  if (!pickupId) return { error: 'No pickup selected.' }
  if (!agentId) return { error: 'Choose an agent to assign this job to.' }

  const slot = parseIstLocal(input.scheduledSlot)
  if (!slot) return { error: 'Pick a valid collection slot (date and time).' }

  const eta = input.etaMinutes.trim() === '' ? DEFAULT_ETA_MINUTES : Number(input.etaMinutes)
  if (!Number.isInteger(eta) || eta < MIN_ETA_MINUTES || eta > MAX_ETA_MINUTES) {
    return { error: `ETA must be a whole number of minutes between ${MIN_ETA_MINUTES} and ${MAX_ETA_MINUTES}.` }
  }

  // 🔴 The agent is re-verified server-side, not trusted from the <select>.
  // Role is the real gate: apps/agent/src/proxy.ts admits on profiles.role, so
  // assigning to a non-agent creates a row the agent app can never open while
  // the customer app cheerfully shows the pickup as "assigned".
  const agent = await prisma.profile.findUnique({
    where: { id: agentId },
    select: { id: true, role: true, fullName: true },
  })
  if (!agent) return { error: 'That agent does not exist.' }
  if (agent.role !== 'agent') {
    const article = agent.role === 'admin' ? 'an' : 'a'
    return { error: `That account is ${article} ${agent.role}, not an agent.` }
  }

  // Read the "before" for the audit row — and, with it, the stale-assignment
  // fields (trap 11) this action has to clear.
  const before = await prisma.pickup.findUnique({
    where: { id: pickupId },
    select: { id: true, status: true, agentId: true, agentFeePaise: true },
  })
  if (!before) return { error: 'That pickup does not exist.' }
  if (before.status !== 'requested') {
    return {
      error:
        before.status === 'cancelled'
          ? 'That pickup is cancelled. The vendor has to reactivate it before it can be dispatched.'
          : `That pickup is already ${before.status} — dispatch only assigns a request.`,
    }
  }

  const assigned = await prisma.$transaction(async (tx) => {
    const updated = await tx.pickup.updateMany({
      where: { id: pickupId, status: 'requested' },
      data: {
        status: 'scheduled',
        agentId: agent.id,
        scheduledSlot: slot,
        etaMinutes: eta,
        // 🔴 TRAP 11 / seed fixture 8. `reschedulePickup` writes
        // `cancelled → requested` and voids Offer.acceptedAt, but leaves
        // `agentId` and `agentFeePaise` pointing at the agent who was on the
        // job before the vendor cancelled. `agentId` is overwritten just above;
        // the FEE is the one that would survive silently and pay the NEW agent
        // whatever the OLD job was worth. B's Batch 4 computes it at collection,
        // so null is the correct value for a job that has not been done yet.
        agentFeePaise: null,
      },
    })
    if (updated.count === 0) return false

    // actorRole 'admin', actorId the real admin — the two apps' custody label
    // maps already render it ("Recorded by CLBIPP" in packages/ui's ROLE_LABELS
    // and in the agent app's AGENT_ROLE_LABELS), so this shows up correctly on
    // /track/[id] and /t/[token] with no UI change.
    //
    // ⚠ Note the difference from assign-job.ts, which writes actorId: null
    // because nobody authenticated to run a CLI. Here somebody did, and the
    // whole point of the screen is that the trail can say who.
    await tx.statusEvent.create({
      data: {
        pickupId,
        status: 'scheduled',
        actorId: admin.id,
        actorRole: 'admin',
        notes: `Assigned to ${agent.fullName} for collection.`,
      },
    })

    await tx.adminAudit.create({
      data: {
        actorId: admin.id,
        action: AUDIT_ACTION,
        subjectType: AUDIT_SUBJECT,
        subjectId: pickupId,
        // The CHANGED FIELDS only, not the whole row (the column's own comment).
        // `before.agentId` non-null here is the reactivated-pickup case, and
        // this is the only record that it was cleared.
        before: {
          status: before.status,
          agentId: before.agentId,
          agentFeePaise: before.agentFeePaise,
        },
        after: {
          status: 'scheduled',
          agentId: agent.id,
          scheduledSlot: slot.toISOString(),
          etaMinutes: eta,
          agentFeePaise: null,
        },
        // `reason` deliberately omitted: isReasonRequired('pickup.assign') is
        // false. Dispatch is the normal path, not a correction.
      },
    })

    return true
  },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )

  if (!assigned) {
    // Lost the race with a concurrent submit. Not an error the admin caused, so
    // it reads as a statement of fact rather than a failure.
    return { error: 'This request was assigned by someone else a moment ago. Reload to see who.' }
  }

  return { error: null }
}

/**
 * The form action behind the Assign button — a POST, and the only thing that
 * should call assignPickup().
 *
 * POST rather than a <Link>, for the reason the agent app's markArrived carries:
 * the customer app shipped `acceptOffer` as a GET until Batch 12 and it advanced
 * the lifecycle for link prefetchers and crawlers. Redirect-after-POST also
 * means a refresh re-renders instead of re-submitting.
 */
export async function assignPickupAction(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  if (!pickupId) redirect('/dispatch')

  const { error } = await assignPickup({
    pickupId,
    agentId: String(formData.get('agentId') ?? ''),
    scheduledSlot: String(formData.get('scheduledSlot') ?? ''),
    etaMinutes: String(formData.get('etaMinutes') ?? ''),
  })

  const href = `/dispatch/${encodeURIComponent(pickupId)}`
  if (error) redirect(`${href}?error=${encodeURIComponent(error)}`)

  // Both dispatch screens show this row, and /pickups (C, Batch 5) lists it.
  revalidatePath('/dispatch')
  revalidatePath(href)
  revalidatePath('/pickups')

  // Back to the request, which now renders as scheduled with the agent on it.
  // The confirmation IS the screen — there is no toast in this console yet.
  redirect(`${href}?assigned=1`)
}
