'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { prisma, ExceptionResolution } from '@clbipp/database'
import type { AdminAuditAction, AdminAuditSubject } from '@clbipp/core/audit'

import { requireAdmin } from '@/lib/admin-identity'

// ─── Resolve an ItemException ────────────────────────────────────────────────
//
// D05 / W4, Batch 14, owner A — Aamir. The screen the wireframe drew with no
// table under it: `HOLD` and `REVIEW` are ENGINE DECISION FLAGS
// (`decision.pathway === null` plus `flags`), and until Admin Batch 1 added
// `ItemException` there was nowhere to record that an admin had cleared one.
//
// 📌 Shape copied from (admin)/dispatch/actions.ts, this app's reference
// service-role write. Same four rules: session identity (never a form field),
// Prisma as the table owner (AD3 — no RLS to fall back on), `requireAdmin()`
// re-verifying the caller because RLS is bypassed, and the audit row written in
// the SAME transaction as the thing it records.
//
// 🔴 ONE RULE THIS FILE HAS THAT NO OTHER ADMIN WRITE HAS: it advances NOTHING.
//
//   Resolving an exception changes no `PickupStatus`, writes no `StatusEvent`,
//   and touches no `BatteryItem.pathway`. An ItemException is an engine flag and
//   its resolution, PER BATTERY ITEM — it is not a lifecycle stage (AD4), and
//   there is no per-item status column (AD6) for it to move. `override` here
//   means "the engine's hold was wrong about this item", NOT "advance this
//   pickup".
//
//   If a `reject` ought to stop a pickup advancing, that is B06's per-pickup
//   manual override with a typed reason (`lifecycle.override`) — a different
//   action, in (admin)/lifecycle/actions.ts. Wiring a lifecycle write in here
//   would put one behind a screen that does not own one, and `/exceptions`
//   would quietly become a second, undocumented way to move the lifecycle.
//
// 🔴 "Open" is `resolvedAt: null`. There is no open/closed boolean and none is
// being added — the schema comment says so, and a second source of truth would
// drift out of step with the resolution fields the moment one write missed it.

// The closed audit vocabulary, typed rather than typed-out — a typo is then a
// compile error rather than a row that every `where: { action }` read misses.
const AUDIT_ACTION: AdminAuditAction = 'exception.resolve'
const AUDIT_SUBJECT: AdminAuditSubject = 'item_exception'

// ⚠ Trap 23 — a 'use server' file may export ONLY async functions. Everything
// below stays module-private; the screen builds its own <select> from the same
// Prisma enum object, so there is no second list to drift.

/**
 * The three legal resolutions, straight off the Prisma enum rather than
 * re-typed. `ExceptionResolution` is a runtime object (`{ retest, override,
 * reject }`), so this list cannot fall out of step with the database's own
 * CHECK — and a fourth value added by a migration is accepted here for free.
 *
 * Safe to import as a VALUE only because this file is server-only. In a client
 * component the same import would pull the query engine into the browser bundle
 * (trap 4's reasoning, applied to the enum rather than to `formatPaise`).
 */
const RESOLUTIONS = Object.values(ExceptionResolution) as readonly string[]

/** Notes are optional, but a runaway paste should not become a table column. */
const MAX_NOTES_CHARS = 600

export type ResolveResult = { error: string | null; already: boolean }

/**
 * Close one exception.
 *
 * Idempotent by construction, exactly the way `assignPickup` is: `resolvedAt:
 * null` inside the updateMany WHERE is the race guard. A double-submit, a
 * refresh, or two admins clicking at once updates ZERO rows on the second
 * attempt rather than overwriting the first admin's resolution and notes with
 * the second's — and because the audit row is inside the same transaction, the
 * losing write leaves no trace at all rather than a second `exception.resolve`
 * row claiming a resolution that never happened.
 */
export async function resolveException(input: {
  exceptionId: string
  resolution: string
  notes: string
}): Promise<ResolveResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { error: gate.error, already: false }
  const admin = gate.admin

  const id = input.exceptionId.trim()
  if (!id) return { error: 'No exception selected.', already: false }

  // Validated against the enum, not against the <select> that produced it — the
  // form is attacker-controlled and an unknown string would otherwise reach
  // Prisma and throw a 500 inside the POST, losing the form.
  const resolution = input.resolution.trim()
  if (!RESOLUTIONS.includes(resolution)) {
    return {
      error: `"${resolution}" is not a resolution. It has to be one of ${RESOLUTIONS.join(', ')}.`,
      already: false,
    }
  }

  const notes = input.notes.trim()
  if (notes.length > MAX_NOTES_CHARS) {
    return { error: `Notes are limited to ${MAX_NOTES_CHARS} characters.`, already: false }
  }

  // The "before" for the audit row. Read outside the transaction because it is
  // only used to describe the change — the guarded updateMany below, not this
  // read, is what makes the write safe against a concurrent resolution.
  const before = await prisma.itemException.findUnique({
    where: { id },
    select: { id: true, resolution: true, resolvedBy: true, resolvedAt: true, notes: true },
  })
  if (!before) return { error: 'That exception does not exist.', already: false }
  if (before.resolvedAt !== null) {
    return {
      error: null,
      already: true,
    }
  }

  const resolvedAt = new Date()

  const closed = await prisma.$transaction(async (tx) => {
    const updated = await tx.itemException.updateMany({
      // 🔴 `resolvedAt: null` is the idempotency story. Keep it.
      where: { id, resolvedAt: null },
      data: {
        resolution: resolution as ExceptionResolution,
        resolvedBy: admin.id,
        resolvedAt,
        // Empty notes are stored as SQL NULL rather than as "", so "no note
        // was written" and "a note was written and then blanked" stay
        // distinguishable on the screen.
        notes: notes === '' ? null : notes,
      },
    })
    if (updated.count === 0) return false

    await tx.adminAudit.create({
      data: {
        actorId: admin.id,
        action: AUDIT_ACTION,
        subjectType: AUDIT_SUBJECT,
        subjectId: id,
        // The CHANGED FIELDS only, not the whole row (the column's own comment)
        // — the cause, the detail and the item are unchanged by a resolution
        // and are one join away on /exceptions anyway. `before` is four nulls
        // for every real resolution; that is the point, and it is what makes a
        // re-resolution visible if one ever slips past the guard above.
        before: {
          resolution: before.resolution,
          resolvedBy: before.resolvedBy,
          resolvedAt: before.resolvedAt?.toISOString() ?? null,
          notes: before.notes,
        },
        after: {
          resolution,
          resolvedBy: admin.id,
          resolvedAt: resolvedAt.toISOString(),
          notes: notes === '' ? null : notes,
        },
        // `reason` deliberately omitted: isReasonRequired('exception.resolve')
        // is false. The typed reason belongs to the three escape hatches
        // (lifecycle.override, market.override, supplier.margin); an exception
        // resolution is the NORMAL way an exception ends, and the notes field
        // above is its own record.
      },
    })

    // 🔴 NOTHING ELSE. No pickup.update, no statusEvent.create, no
    // batteryItem.update. See the header — this is the mistake the screen
    // invites, and the done-when check asserts the absence directly.

    return true
  })

  if (!closed) {
    // Lost the race with a concurrent submit. Not an error the admin caused, so
    // it reads as a statement of fact rather than a failure.
    return { error: null, already: true }
  }

  return { error: null, already: false }
}

/**
 * The form action behind the Resolve button — a POST, and the only thing that
 * should call resolveException().
 *
 * POST rather than a <Link>, for the reason every write in this console
 * carries: the customer app shipped `acceptOffer` as a GET until Batch 12 and
 * link prefetchers advanced the lifecycle. Redirect-after-POST also means a
 * refresh re-renders instead of re-submitting.
 */
export async function resolveExceptionAction(formData: FormData) {
  const exceptionId = String(formData.get('exceptionId') ?? '')
  if (!exceptionId) redirect('/exceptions')

  const { error, already } = await resolveException({
    exceptionId,
    resolution: String(formData.get('resolution') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  })

  if (error) redirect(`/exceptions?error=${encodeURIComponent(error)}`)

  // The dashboard's "In exception" tile and the pickup detail's open-exception
  // banner both count `resolvedAt: null`, so both go stale on this write.
  revalidatePath('/exceptions')
  revalidatePath('/audit')
  revalidatePath('/')

  const pickupId = String(formData.get('pickupId') ?? '')
  if (pickupId) revalidatePath(`/pickups/${pickupId}`)

  if (already) redirect(`/exceptions?already=${encodeURIComponent(exceptionId)}`)
  redirect(`/exceptions?resolved=${encodeURIComponent(exceptionId)}`)
}
