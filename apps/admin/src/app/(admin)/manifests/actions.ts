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
