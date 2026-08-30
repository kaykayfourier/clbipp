'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'

import { Prisma, prisma } from '@clbipp/database'
import type { BatteryType } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'
import { manifestNumber } from '@clbipp/core/format'
import { chemistryLabel } from '@clbipp/core/intake'

import { requireAdmin } from '@/lib/admin-identity'
import {
  advanceCoveredPickups,
  parseRecoveryData,
  RECOVERY_METALS,
  type RecoveryLine,
} from '@/lib/lifecycle-units'

// ─── Manifests: build a draft, then dispatch it ──────────────────────────────
// Admin Batch 6, owner A — Aamir. The screens the wireframe has none of (W9),
// and facility → recycler is step 6 of 8 in both HR documents.
//
// 📌 Shape copied from `(admin)/dispatch/actions.ts` (the reference admin write)
// and from `lifecycle/actions.ts` next door.
//
// 🔴 The line this file must not cross: DISPATCH DOES NOT ADVANCE A PICKUP.
// Dispatch is "it left the building". `tested → processed` happens on
// CONFIRMATION, in Batch 7, and only for pickups every one of whose items is
// covered (AD6). A `dispatchManifest` that also advanced pickups would claim a
// recycler received a load that is still on the lorry.

const CREATE_AUDIT_ACTION: AdminAuditAction = 'manifest.dispatch'
const CONFIRM_AUDIT_ACTION: AdminAuditAction = 'manifest.confirm'
const AUDIT_SUBJECT: AdminAuditSubject = 'dispatch_manifest'

// ⚠ Trap 23 — only async functions may be EXPORTED from a 'use server' file.
// The shared reads live in @/lib/lifecycle-units.

const TX_TIMEOUT_MS = 20_000
const TX_MAX_WAIT_MS = 10_000

/** `manifestNo` is @unique and derived from 6 hex characters of the id. A
 *  collision is astronomically unlikely and trivially recoverable: generate a
 *  new uuid and try again. Three attempts, then it is not luck any more. */
const NUMBER_ATTEMPTS = 3

export type ManifestResult = { error: string | null; manifestId: string | null }

/**
 * What createManifest's transaction hands back. An explicit DISCRIMINATED union
 * rather than `{ error } | { manifestId }` narrowed with `in`: the callback has
 * eight early returns, and TypeScript widens that many branches into optional
 * properties rather than keeping a clean union. `ok` makes the narrowing exact.
 */
type CreateTxResult =
  | { ok: true; manifestId: string; manifestNo: string }
  | { ok: false; error: string }

/**
 * Build a `draft` manifest from a facility's tested, unclaimed stock.
 *
 * 🔴 AD7 IS ENFORCED HERE, not only in the picker: "a manifest may name only an
 * `isActive` recycler whose `acceptedChemistries` covers EVERY item on it."
 * The `/manifests/new` client component greys out the recyclers that do not
 * qualify, but that is a convenience — under AD3 there is no RLS behind any of
 * this, so a hand-crafted POST is exactly as likely as a real one and the
 * screen's help is worth nothing as a control.
 */
export async function createManifest(input: {
  recyclerId: string
  itemIds: readonly string[]
}): Promise<ManifestResult> {
  // 🔴 The write gate still runs, even though nothing below reads the admin's
  // identity: creating a draft writes no AdminAudit row (see the note at the
  // end of this function), so there is no actorId to record. requireAdmin() is
  // here for the ACCESS check, not the attribution — under AD3 it and proxy.ts
  // are the entire boundary, and deleting it would let any logged-in session
  // build manifests.
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, manifestId: null }

  const recyclerId = input.recyclerId.trim()
  if (!recyclerId) return { error: 'Choose a recycler for this manifest.', manifestId: null }

  // De-duplicate: a hand-crafted POST can repeat an id, and repeating one would
  // double-count its weight on the manifest total.
  const itemIds = [...new Set(input.itemIds.map((i) => i.trim()).filter(Boolean))]
  if (itemIds.length === 0) return { error: 'Select at least one item to ship.', manifestId: null }

  const recycler = await prisma.recycler.findUnique({
    where: { id: recyclerId },
    select: { id: true, name: true, isActive: true, acceptedChemistries: true },
  })
  if (!recycler) return { error: 'That recycler does not exist.', manifestId: null }
  // AD7, half one. An inactive recycler is one we may not ship to at all.
  if (!recycler.isActive) {
    return { error: `${recycler.name} is not an active recycler.`, manifestId: null }
  }

  const created: CreateTxResult = await prisma.$transaction(
    async (tx): Promise<CreateTxResult> => {
      // Re-read the items INSIDE the transaction. Everything the form knew is
      // attacker-controlled and, more mundanely, stale: another admin may have
      // put these items on a manifest since the page rendered.
      const items = await tx.batteryItem.findMany({
        where: { id: { in: itemIds } },
        select: {
          id: true,
          chemistry: true,
          weightKg: true,
          confirmedWeightKg: true,
          pickup: {
            select: { id: true, status: true, custodyBatchId: true },
          },
        },
      })

      if (items.length !== itemIds.length) {
        return { ok: false as const, error: 'One of those items no longer exists. Reload and rebuild.' }
      }

      // Every item must still be shippable: its pickup tested, and physically
      // at a facility. Mirrors loadManifestBuildStock()'s rule — restated as a
      // CHECK here rather than reused as a query, because the check has to run
      // against the transaction's own snapshot.
      const notTested = items.filter((i) => i.pickup.status !== 'tested')
      if (notTested.length > 0) {
        return {
          ok: false as const,
          error: `${notTested.length} selected item${notTested.length === 1 ? ' is' : 's are'} on a pickup that is not at tested. Only tested stock can be shipped.`,
        }
      }

      const batchIds = [...new Set(items.map((i) => i.pickup.custodyBatchId))]
      if (batchIds.some((b) => b === null)) {
        return { ok: false as const, error: 'One of those items has never been handed in at a hub.' }
      }

      const batches = await tx.custodyBatch.findMany({
        where: { id: { in: batchIds.filter((b): b is string => b !== null) } },
        select: { id: true, facilityId: true },
      })
      const facilityIds = [...new Set(batches.map((b) => b.facilityId))]
      // 🔴 One manifest is one shipment leaving ONE building. Items sitting at
      // two facilities cannot be on the same lorry, and `DispatchManifest` has
      // a single `facilityId` column to say so.
      if (facilityIds.length !== 1) {
        return { ok: false as const, error: 'Those items are at different facilities. Build one manifest per facility.' }
      }
      const facilityId = facilityIds[0]

      // Nothing already spoken for. Drafts count — see loadManifestBuildStock's
      // note on why this is stricter than computeFacilityStock. This doubles as
      // the double-submit guard: the second POST finds its own draft.
      const existing = await tx.dispatchManifest.findMany({ select: { itemIds: true } })
      const claimed = new Set<string>()
      for (const m of existing) {
        const ids = Array.isArray(m.itemIds) ? (m.itemIds as unknown[]) : []
        for (const id of ids) if (typeof id === 'string') claimed.add(id)
      }
      const alreadyOn = itemIds.filter((id) => claimed.has(id))
      if (alreadyOn.length > 0) {
        return {
          ok: false as const,
          error: `${alreadyOn.length} of those items ${alreadyOn.length === 1 ? 'is' : 'are'} already on a manifest. Reload to see the current stock.`,
        }
      }

      // 🔴 AD7, half two — chemistry-wise segregation, expressed as code. The
      // seeded recyclers' acceptedChemistries are NON-OVERLAPPING on purpose so
      // that this can actually fail.
      const accepted = new Set<BatteryType>(recycler.acceptedChemistries)
      const rejected = items.filter((i) => i.chemistry === null || !accepted.has(i.chemistry))
      if (rejected.length > 0) {
        const names = [
          ...new Set(
            rejected.map((i) => (i.chemistry ? (chemistryLabel(i.chemistry) ?? i.chemistry) : 'unrecorded chemistry')),
          ),
        ]
        return {
          ok: false as const,
          error: `${recycler.name} does not accept ${names.join(', ')}. A manifest may only name a recycler that accepts every chemistry on it.`,
        }
      }

      const totalWeightKg = items.reduce(
        (sum, i) => sum + Number(i.confirmedWeightKg ?? i.weightKg ?? 0),
        0,
      )
      const createdAt = new Date()

      for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
        // 🔴 Trap 3 — `@default(uuid())` does NOT apply to a service-role write.
        // Generate the id here, and derive the number from it.
        const id = randomUUID()
        try {
          const manifest = await tx.dispatchManifest.create({
            data: {
              id,
              manifestNo: manifestNumber({ manifestId: id, createdAt }),
              facilityId,
              recyclerId: recycler.id,
              status: 'draft',
              // The immutable snapshot. Json, not a join table, so a dispatched
              // manifest does not change when the underlying items do.
              itemIds,
              totalWeightKg: new Prisma.Decimal(totalWeightKg.toFixed(2)),
              // A draft has not left the building. Both timestamps stay null
              // until dispatchManifest and Batch 7's confirm stamp them.
              dispatchedAt: null,
              confirmedAt: null,
              createdAt,
            },
            select: { id: true, manifestNo: true },
          })
          return { ok: true as const, manifestId: manifest.id, manifestNo: manifest.manifestNo }
        } catch (err) {
          // P2002 is the unique-constraint violation on manifest_no. Anything
          // else is a real failure and must not be swallowed into a retry.
          const isNumberCollision =
            err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
          if (!isNumberCollision || attempt === NUMBER_ATTEMPTS - 1) throw err
        }
      }

      // Unreachable: the loop either returns or throws on its last attempt.
      return { ok: false as const, error: 'Could not mint a manifest number. Try again.' }
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )

  if (!created.ok) return { error: created.error, manifestId: null }

  // 🔴 No AdminAudit row for creating a DRAFT, deliberately. A draft asserts
  // nothing — nothing has moved, no party has been told anything, and it can be
  // built and abandoned freely. The audit trail starts at `manifest.dispatch`,
  // which is the point the claim becomes real. PLAN_ADMIN_APP.md §3's
  // vocabulary has no `manifest.create` verb and this is why.
  return { error: null, manifestId: created.manifestId }
}

/**
 * `draft → dispatched`. It left the building.
 *
 * 🔴 Advances NO pickup. See the file header.
 *
 * A dispatched manifest is immutable from here — that is the whole reason
 * `itemIds` is a Json snapshot (the schema comment says so). Nothing in this
 * app edits one after this write.
 */
export async function dispatchManifest(manifestId: string): Promise<ManifestResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, manifestId: null }
  const admin = gate.admin

  const id = manifestId.trim()
  if (!id) return { error: 'No manifest selected.', manifestId: null }

  const before = await prisma.dispatchManifest.findUnique({
    where: { id },
    select: {
      id: true,
      manifestNo: true,
      status: true,
      itemIds: true,
      recycler: { select: { id: true, name: true, isActive: true, acceptedChemistries: true } },
    },
  })
  if (!before) return { error: 'That manifest does not exist.', manifestId: null }
  if (before.status !== 'draft') {
    return {
      error: `${before.manifestNo} is already ${before.status} — only a draft can be dispatched.`,
      manifestId: null,
    }
  }

  // 🔴 AD7 re-checked at DISPATCH, not just at creation. A recycler can be
  // deactivated between building a draft and sending it, and this is the last
  // moment anyone can stop the lorry. Re-reading `acceptedChemistries` too:
  // E03 can edit a recycler's accepted list, which would silently invalidate a
  // draft built yesterday.
  if (!before.recycler.isActive) {
    return {
      error: `${before.recycler.name} is no longer an active recycler. This manifest cannot be dispatched.`,
      manifestId: null,
    }
  }

  const snapshotIds = Array.isArray(before.itemIds)
    ? (before.itemIds as unknown[]).filter((i): i is string => typeof i === 'string')
    : []
  if (snapshotIds.length === 0) {
    return { error: 'That manifest has no items on it.', manifestId: null }
  }

  const items = await prisma.batteryItem.findMany({
    where: { id: { in: snapshotIds } },
    select: { id: true, chemistry: true },
  })
  const accepted = new Set<BatteryType>(before.recycler.acceptedChemistries)
  const rejected = items.filter((i) => i.chemistry === null || !accepted.has(i.chemistry))
  if (rejected.length > 0) {
    const names = [
      ...new Set(
        rejected.map((i) => (i.chemistry ? (chemistryLabel(i.chemistry) ?? i.chemistry) : 'unrecorded chemistry')),
      ),
    ]
    return {
      error: `${before.recycler.name} no longer accepts ${names.join(', ')}. Rebuild this manifest.`,
      manifestId: null,
    }
  }

  const dispatchedAt = new Date()

  const sent = await prisma.$transaction(
    async (tx) => {
      // Guarded updateMany — the whole idempotency story, same as assignPickup.
      // A double-submit updates zero rows rather than re-stamping dispatchedAt.
      const updated = await tx.dispatchManifest.updateMany({
        where: { id, status: 'draft' },
        data: { status: 'dispatched', dispatchedAt },
      })
      if (updated.count === 0) return false

      // 🔴 No statusEvent. `status_events` is keyed to a PICKUP and this write
      // touches no pickup — that is exactly the gap AdminAudit exists to fill
      // (W7). Writing one here would put a stage on a pickup's timeline that
      // the pickup has not reached.
      await tx.adminAudit.create({
        data: {
          actorId: admin.id,
          action: CREATE_AUDIT_ACTION,
          subjectType: AUDIT_SUBJECT,
          subjectId: id,
          before: { status: 'draft', dispatchedAt: null },
          after: {
            status: 'dispatched',
            dispatchedAt: dispatchedAt.toISOString(),
            manifestNo: before.manifestNo,
            recyclerId: before.recycler.id,
            itemCount: snapshotIds.length,
          },
          // isReasonRequired('manifest.dispatch') is false — this is the normal
          // path, not a correction.
        },
      })

      return true
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )

  if (!sent) {
    return {
      error: 'This manifest was dispatched by someone else a moment ago. Reload to see it.',
      manifestId: null,
    }
  }

  return { error: null, manifestId: id }
}

// ─── Batch 7: confirm, then reconcile ────────────────────────────────────────
// Admin Batch 7, owner A — Aamir. The second half of AD5 and the end of the
// road for a manifest.
//
//   dispatched → received    the recycler has the load. Advances the covered
//                            pickups `tested → processed`.
//   received → reconciled    what actually came back, per metal. Advances the
//                            covered pickups `processed → recovered`.
//
// 🔴 "The covered pickups", not "the pickups on this manifest" — see
// advanceCoveredPickups() in @/lib/lifecycle-units. That distinction IS AD6 and
// it is the single thing this batch has to get right.
//
// 🔴 Both write `actorRole: 'admin'`, never `'recycler'`. There is no recycler
// portal and no hub-staff app: an admin is recording an assertion on a party's
// behalf, and a compliance trail that claimed otherwise would be a fabrication
// (AD5). This is the uncomfortable part of the design and it is deliberate.

export type ManifestAdvanceResult = {
  error: string | null
  /** Pickups that moved a stage. */
  advanced: number
  /** Pickups this manifest touched that AD6 held back, with items elsewhere. */
  held: number
}

/**
 * `dispatched → received`. The recycler has it.
 *
 * Stamps `confirmedAt` and advances `tested → processed` for every pickup all
 * of whose items now sit on a manifest at or past `received`.
 *
 * Idempotent the way every other write in this app is: the guarded `updateMany`
 * on `status: 'dispatched'` is the race guard, so a double-submit moves nothing
 * and writes no second event.
 */
export async function confirmManifestReceived(manifestId: string): Promise<ManifestAdvanceResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, advanced: 0, held: 0 }
  const admin = gate.admin

  const id = manifestId.trim()
  if (!id) return { error: 'No manifest selected.', advanced: 0, held: 0 }

  const before = await prisma.dispatchManifest.findUnique({
    where: { id },
    select: {
      id: true,
      manifestNo: true,
      status: true,
      itemIds: true,
      recycler: { select: { name: true } },
    },
  })
  if (!before) return { error: 'That manifest does not exist.', advanced: 0, held: 0 }
  if (before.status !== 'dispatched') {
    return {
      error:
        before.status === 'draft'
          ? `${before.manifestNo} has not been dispatched yet — it cannot have been received.`
          : `${before.manifestNo} is already ${before.status}.`,
      advanced: 0,
      held: 0,
    }
  }

  const snapshotIds = Array.isArray(before.itemIds)
    ? (before.itemIds as unknown[]).filter((i): i is string => typeof i === 'string')
    : []
  if (snapshotIds.length === 0) {
    return { error: 'That manifest has no items on it.', advanced: 0, held: 0 }
  }

  const confirmedAt = new Date()

  const result = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.dispatchManifest.updateMany({
        where: { id, status: 'dispatched' },
        data: { status: 'received', confirmedAt },
      })
      if (updated.count === 0) return null

      // 🔴 AD6. Called with `tx`, and it MUST be — the index it builds has to
      // see the UPDATE above, which no other connection can.
      const moved = await advanceCoveredPickups(tx, {
        snapshotIds,
        floor: 'received',
        from: 'tested',
        to: 'processed',
        actorId: admin.id,
        note: () =>
          `Received by ${before.recycler.name} — manifest ${before.manifestNo}. Recorded by an admin; there is no recycler portal.`,
      })

      await tx.adminAudit.create({
        data: {
          actorId: admin.id,
          action: CONFIRM_AUDIT_ACTION,
          subjectType: AUDIT_SUBJECT,
          subjectId: id,
          before: { status: 'dispatched', confirmedAt: null },
          after: {
            status: 'received',
            confirmedAt: confirmedAt.toISOString(),
            manifestNo: before.manifestNo,
            itemCount: snapshotIds.length,
            // 🔴 Both lists, not just the winners. "Which pickups did this
            // confirmation NOT advance, and why" is the question an auditor
            // asks about a split load, and AdminAudit is the only place that
            // can answer it — status_events by definition has no row for a
            // pickup that did not move.
            advancedPickupIds: moved.advanced.map((a) => a.pickupId),
            heldPickupIds: moved.held.map((h) => h.pickupId),
          },
        },
      })

      return moved
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )

  if (!result) {
    return {
      error: 'This manifest was confirmed by someone else a moment ago. Reload to see it.',
      advanced: 0,
      held: 0,
    }
  }

  return { error: null, advanced: result.advanced.length, held: result.held.length }
}

/**
 * `received → reconciled`, capturing what actually came back.
 *
 * Advances `processed → recovered` for every pickup all of whose items now sit
 * on a manifest at or past `reconciled`.
 *
 * 🔴 `recoveryData` is the only MEASURED recovery figure the platform holds —
 * everything upstream of it is an engine estimate made before a battery was
 * opened — and `buildCertificatePayload` prefers it over that estimate. So this
 * refuses to reconcile with no figures at all: an empty reconciliation would
 * silently send every downstream certificate back to the estimate while looking
 * like it had been measured.
 */
export async function reconcileManifest(
  manifestId: string,
  recovery: readonly RecoveryLine[],
): Promise<ManifestAdvanceResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, advanced: 0, held: 0 }
  const admin = gate.admin

  const id = manifestId.trim()
  if (!id) return { error: 'No manifest selected.', advanced: 0, held: 0 }

  // Re-parse rather than trust the caller: this runs the same defensive filter
  // the column is read back through, so what is stored is exactly what will
  // parse. It also folds away zeroes and blanks the form submits for the metals
  // nobody typed into.
  const lines = parseRecoveryData(recovery)
  if (lines.length === 0) {
    return {
      error: `Enter the recovered mass for at least one metal (${RECOVERY_METALS.slice(0, 4).join(', ')}, …). Reconciling with no figures would leave every certificate from this load quoting an estimate.`,
      advanced: 0,
      held: 0,
    }
  }

  const before = await prisma.dispatchManifest.findUnique({
    where: { id },
    select: {
      id: true,
      manifestNo: true,
      status: true,
      itemIds: true,
      totalWeightKg: true,
      recycler: { select: { name: true } },
    },
  })
  if (!before) return { error: 'That manifest does not exist.', advanced: 0, held: 0 }
  if (before.status !== 'received') {
    return {
      error:
        before.status === 'reconciled'
          ? `${before.manifestNo} has already been reconciled.`
          : `${before.manifestNo} is ${before.status} — confirm receipt before reconciling it.`,
      advanced: 0,
      held: 0,
    }
  }

  // 🔴 Mass conservation, as a control. You cannot recover more metal than you
  // shipped, and a fat-fingered "1240" where "124.0" was meant would otherwise
  // land on a vendor's EPR certificate and on a CPCB return. Checked against
  // the manifest's own frozen `totalWeightKg` rather than a live item sum: the
  // shipped weight is what was shipped, whatever the item rows say now.
  const recoveredKg = lines.reduce((sum, l) => sum + l.recovered_kg, 0)
  const shippedKg = Number(before.totalWeightKg ?? 0)
  if (shippedKg > 0 && recoveredKg > shippedKg) {
    return {
      error: `Recovered mass (${recoveredKg.toFixed(1)} kg) exceeds what was shipped (${shippedKg.toFixed(1)} kg). Check the figures — a recycler cannot return more than it received.`,
      advanced: 0,
      held: 0,
    }
  }

  const snapshotIds = Array.isArray(before.itemIds)
    ? (before.itemIds as unknown[]).filter((i): i is string => typeof i === 'string')
    : []

  const result = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.dispatchManifest.updateMany({
        where: { id, status: 'received' },
        // ⚠ No second timestamp column: the schema stamps `confirmedAt` at
        // `received` and has no `reconciledAt`. The AdminAudit row below is
        // where "when was this reconciled" lives, which is what that table is
        // for (W7). Adding a column for it would be a migration for a value the
        // trail already holds.
        // The cast is the price of a typed shape meeting an untyped column:
        // `InputJsonValue` wants an index signature that a named interface does
        // not carry. `parseRecoveryData` above is what actually guarantees the
        // contents, and the same function reads them back.
        data: { status: 'reconciled', recoveryData: lines as unknown as Prisma.InputJsonValue },
      })
      if (updated.count === 0) return null

      const moved = await advanceCoveredPickups(tx, {
        snapshotIds,
        floor: 'reconciled',
        from: 'processed',
        to: 'recovered',
        actorId: admin.id,
        note: () =>
          `Reconciled against ${before.recycler.name}'s recovery report — manifest ${before.manifestNo}. Recorded by an admin; there is no recycler portal.`,
      })

      await tx.adminAudit.create({
        data: {
          actorId: admin.id,
          action: CONFIRM_AUDIT_ACTION,
          subjectType: AUDIT_SUBJECT,
          subjectId: id,
          before: { status: 'received' },
          after: {
            status: 'reconciled',
            manifestNo: before.manifestNo,
            reconciledAt: new Date().toISOString(),
            recoveredKg: Math.round(recoveredKg * 100) / 100,
            shippedKg,
            recovery: lines as unknown as Prisma.InputJsonValue,
            advancedPickupIds: moved.advanced.map((a) => a.pickupId),
            heldPickupIds: moved.held.map((h) => h.pickupId),
          },
        },
      })

      return moved
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  )

  if (!result) {
    return {
      error: 'This manifest was reconciled by someone else a moment ago. Reload to see it.',
      advanced: 0,
      held: 0,
    }
  }

  return { error: null, advanced: result.advanced.length, held: result.held.length }
}

// ─── Form actions ────────────────────────────────────────────────────────────
// POST, never a <Link>. Redirect-after-POST so a refresh re-renders instead of
// re-submitting.

export async function createManifestAction(formData: FormData) {
  // getAll — the builder submits one checkbox per item, all named `itemIds`.
  const itemIds = formData.getAll('itemIds').map((v) => String(v))
  const recyclerId = String(formData.get('recyclerId') ?? '')

  const { error, manifestId } = await createManifest({ recyclerId, itemIds })

  if (error || !manifestId) {
    redirect(`/manifests/new?error=${encodeURIComponent(error ?? 'Could not build that manifest.')}`)
  }

  revalidatePath('/manifests')
  revalidatePath('/manifests/new')
  revalidatePath('/lifecycle')
  // The items are spoken for now, so the stock screens move too.
  revalidatePath('/inventory')

  redirect(`/manifests/${encodeURIComponent(manifestId)}?created=1`)
}

export async function dispatchManifestAction(formData: FormData) {
  const manifestId = String(formData.get('manifestId') ?? '')
  if (!manifestId) redirect('/manifests')

  const href = `/manifests/${encodeURIComponent(manifestId)}`
  const { error } = await dispatchManifest(manifestId)

  if (error) redirect(`${href}?error=${encodeURIComponent(error)}`)

  revalidatePath('/manifests')
  revalidatePath(href)
  revalidatePath('/lifecycle')
  revalidatePath('/inventory')

  redirect(`${href}?dispatched=1`)
}

export async function confirmManifestReceivedAction(formData: FormData) {
  const manifestId = String(formData.get('manifestId') ?? '')
  if (!manifestId) redirect('/manifests')

  const href = `/manifests/${encodeURIComponent(manifestId)}`
  const { error, advanced, held } = await confirmManifestReceived(manifestId)

  if (error) redirect(`${href}?error=${encodeURIComponent(error)}`)

  revalidatePath('/manifests')
  revalidatePath(href)
  revalidatePath('/lifecycle')
  revalidatePath('/pickups')
  revalidatePath('/inventory')

  redirect(`${href}?confirmed=1&advanced=${advanced}&held=${held}`)
}

export async function reconcileManifestAction(formData: FormData) {
  const manifestId = String(formData.get('manifestId') ?? '')
  if (!manifestId) redirect('/manifests')

  const href = `/manifests/${encodeURIComponent(manifestId)}`

  // One numeric field per metal, named `kg:<Metal>`. Read from RECOVERY_METALS
  // rather than from whatever the form happened to send: a hand-crafted POST
  // must not be able to invent a material name that then appears verbatim on a
  // vendor's EPR certificate.
  const recovery = RECOVERY_METALS.flatMap((metal) => {
    const raw = formData.get(`kg:${metal}`)
    if (raw === null) return []
    const kg = Number(String(raw).trim())
    if (!Number.isFinite(kg) || kg <= 0) return []
    return [{ material: metal, recovered_kg: kg }]
  })

  const { error, advanced, held } = await reconcileManifest(manifestId, recovery)

  if (error) redirect(`${href}?error=${encodeURIComponent(error)}`)

  revalidatePath('/manifests')
  revalidatePath(href)
  revalidatePath('/lifecycle')
  revalidatePath('/pickups')
  revalidatePath('/inventory')

  redirect(`${href}?reconciled=1&advanced=${advanced}&held=${held}`)
}
