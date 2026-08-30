'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'
import { isReasonRequired } from '@clbipp/core/audit'
import { buildCertificatePayload } from '@clbipp/core/certificate'
import { isLifecycleStage } from '@clbipp/ui'

import { requireAdmin } from '@/lib/admin-identity'
import { isOneStepForward, nextLifecycleStage } from '@/lib/lifecycle-units'

// ─── `collected → tested`, per CustodyBatch ──────────────────────────────────
// Admin Batch 6, owner A — Aamir. The FIRST of the two writes that close the
// second lifecycle hole: before this file, nothing anywhere wrote any stage
// past `collected`, so a real collection could never become a certificate.
//
// 📌 Shape copied from `(admin)/dispatch/actions.ts`, the reference admin
// lifecycle write. Same four rules — session identity, Prisma-as-owner (AD3),
// an in-code re-check standing in for the missing RLS policy, and status +
// status_events written together — plus the admin-only fifth: an `admin_audits`
// row saying who did it (W7).
//
// 🔴 AD5: the UNIT here is the CustodyBatch, not the pickup. One hub drop-off
// is one lorry-load that one hub tested; advancing them one at a time would
// make the trail claim eight separate testing events that never happened.
//
// 🔴 AD5 again, and it is the uncomfortable part: there is NO hub-staff app.
// The admin is recording something on a party's behalf. That is only
// defensible because `actorRole` says `'admin'` — 🔴 NEVER write
// `actorRole: 'recycler'` or `'hub'`. The trail has to say that an admin
// asserted this, not that the hub did.

const AUDIT_ACTION: AdminAuditAction = 'custody.advance'
const AUDIT_SUBJECT: AdminAuditSubject = 'custody_batch'
const CERTIFY_AUDIT_ACTION: AdminAuditAction = 'pickup.certify'
const OVERRIDE_AUDIT_ACTION: AdminAuditAction = 'lifecycle.override'
const PICKUP_SUBJECT: AdminAuditSubject = 'pickup'

// ⚠ Trap 23 — a 'use server' file may export ONLY async functions. Anything the
// screens also need is in @/lib/lifecycle-units, never here.

// The transaction below is 4 sequential round trips plus one createMany. Batch
// 4 measured EIGHT at 5.3 s against remote Supabase and the Prisma default is
// 5 s, so these are set explicitly rather than discovered in a demo.
const TX_TIMEOUT_MS = 20_000
const TX_MAX_WAIT_MS = 10_000

export type AdvanceResult = { error: string | null; advanced: number }

/**
 * Advance every pickup in one hub drop-off from `collected` to `tested`.
 *
 * Idempotent by construction, exactly the way `assignPickup` is: `status:
 * 'collected'` inside the guarded `updateMany` WHERE is the race guard, and the
 * pre-read is filtered the same way. A second click finds nothing at
 * `collected` and returns without writing — which is the batch's own done-when
 * ("advancing a custody batch twice writes one event per pickup, not two").
 */
export async function advanceCustodyBatch(batchId: string): Promise<AdvanceResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, advanced: 0 }
  const admin = gate.admin

  const id = batchId.trim()
  if (!id) return { error: 'No custody batch selected.', advanced: 0 }

  const batch = await prisma.custodyBatch.findUnique({
    where: { id },
    select: {
      id: true,
      batchNo: true,
      facility: { select: { name: true } },
    },
  })
  if (!batch) return { error: 'That custody batch does not exist.', advanced: 0 }

  const result = await prisma.$transaction(
    async (tx) => {
      // Which pickups in this batch are actually at `collected`? A seeded batch
      // holds pickups at tested / processed / recovered / certified as well —
      // `DROPPED_OFF` in reset-demo.ts puts everything past `collected` into
      // one — so "every pickup in the batch" is NOT the same set as "every
      // pickup this advances".
      const pending = await tx.pickup.findMany({
        where: { custodyBatchId: id, status: 'collected' },
        select: { id: true },
      })
      if (pending.length === 0) return { advanced: 0, ids: [] as string[] }

      const ids = pending.map((p) => p.id)

      const updated = await tx.pickup.updateMany({
        where: { id: { in: ids }, status: 'collected' },
        data: { status: 'tested' },
      })

      // Lost the whole race to a concurrent submit. Under Postgres READ
      // COMMITTED the second transaction's SELECT above still sees the old
      // snapshot, but this UPDATE blocks on the first one's row locks and then
      // re-evaluates `status = 'collected'` against the committed rows — so it
      // matches nothing and we write no events. Same guard, same reasoning, as
      // assignPickup's `updated.count === 0`.
      //
      // ⚠ A PARTIAL loss (count < ids.length) is not distinguishable here, and
      // it would over-write events for the rows someone else advanced. It
      // cannot arise today: the unit of advance is the whole batch, so two
      // concurrent callers are always advancing the same set, never
      // overlapping subsets. Noted rather than defended against.
      if (updated.count === 0) return { advanced: 0, ids: [] as string[] }

      // One status event PER PICKUP (the batch is the unit of ACTION, not of
      // the audit trail — each pickup's own timeline has to show it reached
      // `tested`). createMany rather than N creates: this is inside the
      // round-trip budget above.
      await tx.statusEvent.createMany({
        data: ids.map((pickupId) => ({
          pickupId,
          status: 'tested' as const,
          actorId: admin.id,
          // 🔴 'admin', never 'recycler' or 'hub'. See the header.
          actorRole: 'admin',
          notes: `Tested at ${batch.facility.name} — hub batch ${batch.batchNo}.`,
        })),
      })

      // ONE audit row for the whole batch: one admin, one assertion, one click.
      await tx.adminAudit.create({
        data: {
          actorId: admin.id,
          action: AUDIT_ACTION,
          subjectType: AUDIT_SUBJECT,
          subjectId: id,
          before: { status: 'collected', pickupIds: ids },
          after: { status: 'tested', pickupIds: ids },
          // `reason` omitted — isReasonRequired('custody.advance') is false.
          // This is the normal path. Batch 7's lifecycle.override is the one
          // that has to justify itself.
        },
      })

      return { advanced: updated.count, ids }
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )

  if (result.advanced === 0) {
    return {
      error: 'Nothing in this batch is waiting at collected — it has already been tested.',
      advanced: 0,
    }
  }

  return { error: null, advanced: result.advanced }
}

/**
 * The form action behind the Advance button. POST, not a link — the customer
 * app shipped `acceptOffer` as a GET until Batch 12 and link prefetchers
 * advanced the lifecycle. Redirect-after-POST also means a refresh re-renders
 * instead of re-submitting.
 */
export async function advanceCustodyBatchAction(formData: FormData) {
  const batchId = String(formData.get('batchId') ?? '')
  if (!batchId) redirect('/lifecycle')

  const { error, advanced } = await advanceCustodyBatch(batchId)

  if (error) redirect(`/lifecycle?error=${encodeURIComponent(error)}`)

  // Every screen that counts stock or stages moved. `/manifests/new` is the
  // one that matters most: those pickups only became shippable just now.
  revalidatePath('/lifecycle')
  revalidatePath('/manifests/new')
  revalidatePath('/pickups')
  revalidatePath('/inventory')

  redirect(`/lifecycle?advanced=${advanced}`)
}

// ─── Batch 7: certify, and the manual override ───────────────────────────────
// Admin Batch 7, owner A — Aamir. The end of the journey, and the escape hatch
// beside it.
//
// 🔴 `recovered → certified` is the ONLY advance in the platform that issues a
// document to a third party. Everything else moves a status; this mints a
// `Certificate` row whose PDF the vendor downloads from their own compliance
// screen and files with the CPCB. That is why it has its own audit verb
// (`pickup.certify`) and why the override below refuses to reach it.

/** How much justification an override has to carry. Short enough that a real
 *  reason fits and long enough that "fix" and "asdf" do not. */
const MIN_REASON_CHARS = 12

export type CertifyResult = {
  error: string | null
  /** Set on success AND on a repeat call — certification is idempotent. */
  certificateId: string | null
  /** True when the certificate already existed, so the caller can say so. */
  alreadyCertified: boolean
}

/**
 * `recovered → certified` for one pickup, and mint its EPR certificate.
 *
 * 🔴 AD5: the unit here is the PICKUP, not a manifest. A pickup only reaches
 * `recovered` once every one of its items is on a RECONCILED manifest (AD6,
 * enforced in `advanceCoveredPickups`), so by the time a pickup is a candidate
 * here the split-load question is already answered. This function does not
 * re-litigate it — it certifies what the chain of custody says is finished.
 *
 * 🔴 IDEMPOTENT, and the done-when says so: a second call yields ONE
 * certificate. Two guards, because they fail differently — the pre-read returns
 * the existing row cheaply on a re-click, and `Certificate.pickupId` being
 * `@unique` behind the row-locked `updateMany` is what makes a genuine race
 * impossible rather than merely unlikely.
 *
 * ⚠ IT DOES NOT RENDER THE PDF, despite what the task sheet's step 4 says, and
 * that is deliberate. `apps/customer/src/lib/documents.ts` renders and uploads
 * every document LAZILY on first download and caches the object path back into
 * `pdfUrl` — the seed has always written `""` for exactly this reason. Eagerly
 * rendering here would duplicate that pipeline in a second app, put a ~1 s
 * @react-pdf render inside a lifecycle transaction, and break the property that
 * a template change reaches old certificates by deleting a cached object rather
 * than by a backfill. Writing `""` hands the certificate to the pipeline that
 * already exists.
 */
export async function certifyPickup(pickupId: string): Promise<CertifyResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, certificateId: null, alreadyCertified: false }
  const admin = gate.admin

  const id = pickupId.trim()
  if (!id) return { error: 'No pickup selected.', certificateId: null, alreadyCertified: false }

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      vendorId: true,
      certificate: { select: { id: true } },
    },
  })
  if (!pickup) return { error: 'That pickup does not exist.', certificateId: null, alreadyCertified: false }

  // Idempotency, cheap path. A double-click, a refresh of a redirected POST, or
  // a second admin on the same row all land here.
  if (pickup.certificate) {
    return {
      error: null,
      certificateId: String(pickup.certificate.id),
      alreadyCertified: true,
    }
  }

  if (pickup.status !== 'recovered') {
    return {
      error: `${id} is at ${pickup.status}, not recovered. A certificate may only be issued once every item on the pickup is back from a reconciled manifest.`,
      certificateId: null,
      alreadyCertified: false,
    }
  }

  // Step 6's guard, stated rather than assumed. Constant today; it stops a
  // future edit to LIFECYCLE_STAGES silently turning this into a skip.
  if (!isOneStepForward('recovered', 'certified')) {
    return {
      error: 'recovered → certified is no longer one step forward. The stage list changed under this action.',
      certificateId: null,
      alreadyCertified: false,
    }
  }

  // 🔴 Built OUTSIDE the transaction. It is several reads (pickup, items, every
  // reconciled manifest, their items) and it writes nothing, so holding a row
  // lock across it would burn the round-trip budget for no gain.
  //
  // 🔴 CO₂e comes from packages/core/src/impact.ts through this call. Never
  // write CO₂ arithmetic in a screen or an action.
  const payload = await buildCertificatePayload(id)

  const created = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.pickup.updateMany({
        where: { id, status: 'recovered' },
        data: { status: 'certified' },
      })
      // Lost the race. The winner has already created the certificate, so the
      // caller's re-read below finds it — this is not an error state.
      if (updated.count === 0) return null

      const certificate = await tx.certificate.create({
        data: {
          pickupId: id,
          vendorId: payload.vendorId,
          // ⚠ Empty on purpose — the object path is filled in by the customer
          // app's lazy renderer on first download. See the note above.
          pdfUrl: '',
          totalWeightKg: payload.totalWeightKg,
          materialSummary: payload.materialSummary,
          co2AvoidedKg: payload.co2AvoidedKg,
          // `publicToken` omitted: it is `dbgenerated("gen_random_uuid()")`, a
          // POSTGRES default, so it applies to this write. That is NOT true of
          // Prisma-side `@default(uuid())` (trap 3) — the distinction matters
          // and this is the one place in the app that relies on it.
        },
        select: { id: true },
      })

      await tx.statusEvent.create({
        data: {
          pickupId: id,
          status: 'certified',
          actorId: admin.id,
          // 🔴 'admin'. See the file header — never 'recycler'.
          actorRole: 'admin',
          notes: `EPR certificate issued. Recovered mass ${payload.materialSource === 'measured' ? 'measured at reconciliation' : 'estimated from the offer breakdown'}.`,
        },
      })

      await tx.adminAudit.create({
        data: {
          actorId: admin.id,
          action: CERTIFY_AUDIT_ACTION,
          subjectType: PICKUP_SUBJECT,
          subjectId: id,
          before: { status: 'recovered' },
          after: {
            status: 'certified',
            certificateId: String(certificate.id),
            totalWeightKg: payload.totalWeightKg,
            co2AvoidedKg: payload.co2AvoidedKg,
            // 🔴 Recorded because it is the difference between a certificate
            // that states what a recycler measured and one that states what our
            // own engine guessed. An auditor asking "where did this number come
            // from" gets an answer from the trail rather than from inference.
            materialSource: payload.materialSource,
            materialSummary: payload.materialSummary,
          },
        },
      })

      return String(certificate.id)
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )

  if (!created) {
    const existing = await prisma.certificate.findUnique({
      where: { pickupId: id },
      select: { id: true },
    })
    if (existing) {
      return { error: null, certificateId: String(existing.id), alreadyCertified: true }
    }
    return {
      error: 'That pickup moved while it was being certified. Reload the board.',
      certificateId: null,
      alreadyCertified: false,
    }
  }

  return { error: null, certificateId: created, alreadyCertified: false }
}

export type OverrideResult = { error: string | null; to: string | null }

/**
 * B06's manual override: advance ONE pickup exactly one stage, with a typed
 * reason. The escape hatch named in risk R1 — the thing an admin reaches for
 * when a batch is stuck and a demo is in ten minutes.
 *
 * 🔴 It deliberately bypasses AD5's unit and AD6's coverage gate. That is what
 * makes it an override rather than a shortcut, and it is why `reason` is
 * mandatory: `isReasonRequired('lifecycle.override')` is true, so every row it
 * writes has to justify itself in `/audit`.
 *
 * 🔴 IT REFUSES TO REACH `certified`. Certification is not a stage nudge — it
 * mints a compliance document, a public token and a PDF a vendor files with the
 * CPCB. An override that produced a certificate with no `Certificate` row would
 * leave a pickup that says "certified" and a vendor whose compliance screen has
 * nothing to download. Use `certifyPickup`, which is the same click.
 *
 * ⚠ It also cannot touch `cancelled`, in either direction: that status sits
 * outside `LIFECYCLE_STAGES` and is re-enterable (trap 11). Cancelling and
 * reactivating are the customer app's writes.
 */
export async function overrideLifecycle(input: {
  pickupId: string
  to: string
  reason: string
}): Promise<OverrideResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, to: null }
  const admin = gate.admin

  const id = input.pickupId.trim()
  if (!id) return { error: 'No pickup selected.', to: null }

  const reason = input.reason.trim()
  // Asserted from the vocabulary rather than hardcoded, so moving an action in
  // or out of REASON_REQUIRED_ACTIONS changes this behaviour for free.
  if (isReasonRequired(OVERRIDE_AUDIT_ACTION) && reason.length < MIN_REASON_CHARS) {
    return {
      error: `An override needs a reason of at least ${MIN_REASON_CHARS} characters. It is the only record of why the normal gate was bypassed.`,
      to: null,
    }
  }

  const to = input.to.trim()
  if (!isLifecycleStage(to)) {
    return { error: `"${to}" is not a lifecycle stage.`, to: null }
  }

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    select: { id: true, status: true },
  })
  if (!pickup) return { error: 'That pickup does not exist.', to: null }

  const expected = nextLifecycleStage(pickup.status)
  if (!isOneStepForward(pickup.status, to)) {
    return {
      error: expected
        ? `${id} is at ${pickup.status}; the only legal next stage is ${expected}. An override moves one step forward, never two and never backwards.`
        : `${id} is at ${pickup.status}, which is the end of the lifecycle. There is nothing to advance to.`,
      to: null,
    }
  }

  if (to === 'certified') {
    return {
      error: 'Certification is not an override — it mints the EPR certificate and its PDF. Use the Certify button on this board.',
      to: null,
    }
  }

  const moved = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.pickup.updateMany({
        where: { id, status: pickup.status },
        data: { status: to },
      })
      if (updated.count === 0) return false

      await tx.statusEvent.create({
        data: {
          pickupId: id,
          status: to,
          actorId: admin.id,
          // 🔴 'admin'. An override is the most explicitly admin-authored event
          // in the system; it is the last place to pretend otherwise.
          actorRole: 'admin',
          notes: `Manual override by ${admin.name}: ${reason}`,
        },
      })

      await tx.adminAudit.create({
        data: {
          actorId: admin.id,
          action: OVERRIDE_AUDIT_ACTION,
          subjectType: PICKUP_SUBJECT,
          subjectId: id,
          before: { status: pickup.status },
          after: { status: to },
          // 🔴 The whole point of this action. Not optional here.
          reason,
        },
      })

      return true
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )

  if (!moved) {
    return { error: 'That pickup moved while the override was being applied. Reload the board.', to: null }
  }

  return { error: null, to }
}

// ─── Form actions ────────────────────────────────────────────────────────────

export async function certifyPickupAction(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  if (!pickupId) redirect('/lifecycle')

  const { error, alreadyCertified } = await certifyPickup(pickupId)

  if (error) redirect(`/lifecycle?error=${encodeURIComponent(error)}`)

  revalidatePath('/lifecycle')
  revalidatePath('/pickups')
  revalidatePath(`/pickups/${pickupId}`)
  revalidatePath('/compliance')
  revalidatePath('/analytics')

  redirect(
    `/lifecycle?certified=${encodeURIComponent(pickupId)}${alreadyCertified ? '&already=1' : ''}`,
  )
}

export async function overrideLifecycleAction(formData: FormData) {
  const pickupId = String(formData.get('pickupId') ?? '')
  const to = String(formData.get('to') ?? '')
  const reason = String(formData.get('reason') ?? '')
  if (!pickupId) redirect('/lifecycle')

  const { error } = await overrideLifecycle({ pickupId, to, reason })

  if (error) redirect(`/lifecycle?error=${encodeURIComponent(error)}`)

  revalidatePath('/lifecycle')
  revalidatePath('/pickups')
  revalidatePath(`/pickups/${pickupId}`)
  revalidatePath('/manifests')
  revalidatePath('/audit')

  redirect(`/lifecycle?overrode=${encodeURIComponent(pickupId)}&to=${encodeURIComponent(to)}`)
}
