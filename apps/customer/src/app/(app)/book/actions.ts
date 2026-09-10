'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@clbipp/auth/server'
import { prisma } from '@clbipp/database'
import {
  bookingSubmissionSchema,
  createPickupWithItems,
  getQuote,
  type BookingLineItem,
} from '@clbipp/core'

// ─── Booking wizard — server boundary ────────────────────────────────────────
// `packages/core` deliberately does NOT authenticate (see the note at the top of
// booking-actions.ts): `createPickupWithItems` takes `vendorId` as an input so
// core never depends on @clbipp/auth and stays callable from a seed or a test.
// This file is the wrapper that owes it a trustworthy `vendorId` — it resolves
// the caller from their own session cookie and never reads an id from the
// payload.
//
// Everything else here exists because the payload is client-authored JSON:
//   - the shape is re-parsed with the zod schema in @clbipp/core
//   - photo paths are checked to live under the caller's own storage folder
//   - the address is re-fetched scoped to the caller
//   - THE QUOTE IS COMPUTED HERE AND NOWHERE ELSE. `Pickup.indicativeQuotePaise`
//     is calculated from the submitted lines on the server. A client-supplied
//     price is a price the customer can set themselves.
//
// 🔴 THE CUSTOMER NEVER SEES THAT NUMBER (FV1 · FD2, 2026-09-10). The
// `quoteBooking` action that fed step 4 of the wizard is GONE, and so is the
// estimate on /submitted. The column is retained because operations triage
// against it on the dispatch board, where it is labelled as an internal
// estimate. The customer's first price is the agent's offer, after inspection.

/** Failure only — success redirects, so it never returns. */
export type SubmitActionResult = { ok: false; error: string }

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

/**
 * Storage RLS scopes every object to `storage.foldername(name)[1] = auth.uid()`,
 * and `buildObjectPath` writes that prefix. Re-checking it here stops a
 * hand-rolled payload from attaching another customer's photo to its own
 * booking — the path would still be unreadable to them, but it would leak into
 * the agent's and the certificate's view of this pickup.
 */
function pathsBelongToCaller(items: { photoUrls: string[] }[], userId: string): boolean {
  return items.every((item) => item.photoUrls.every((p) => p.startsWith(`${userId}/`)))
}

function toLineItems(items: BookingLineItem[]): BookingLineItem[] {
  return items.map((item) => ({
    category: item.category,
    quantity: item.quantity,
    weightKg: item.weightKg,
    condition: item.condition,
    photoUrls: item.photoUrls,
  }))
}

// ─── submitBooking ───────────────────────────────────────────────────────────
// Writes the pickup. Redirects on success (so it returns only on failure) —
// the redirect stays outside the try/catch because `redirect()` works by
// throwing, and catching it would turn a successful booking into an error.
export async function submitBooking(payload: unknown): Promise<SubmitActionResult> {
  const userId = await requireUserId()
  if (!userId) redirect('/login')

  const parsed = bookingSubmissionSchema.safeParse(payload)
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? 'Please check the pickup details.'
    return { ok: false, error: first }
  }

  const booking = parsed.data

  if (!pathsBelongToCaller(booking.items, userId)) {
    return { ok: false, error: 'One of those photos could not be attached. Please re-add it.' }
  }

  // `createPickupWithItems` already scopes the address by vendorId, so this
  // second read is only about the STATUS: an address marked not-operational is
  // on file but can't be collected from, and the picker hides it — a stale open
  // tab could still submit one.
  const address = await prisma.address.findFirst({
    where: { id: booking.addressId, profileId: userId },
    select: { status: true },
  })

  if (!address) {
    return { ok: false, error: 'Pickup address not found. Choose another address.' }
  }

  if (address.status !== 'operational') {
    return {
      ok: false,
      error: 'That address is marked not operational. Choose another one.',
    }
  }

  const items = toLineItems(booking.items)

  // Computed server-side, never taken from the client, and never shown back to
  // the customer (FD2) — this is the operations team's triage figure. If
  // pricing fails the booking still goes through unpriced: the agent prices it
  // on site either way, so an unpriced row costs the customer nothing.
  let indicativeQuotePaise: number | null = null
  try {
    const quote = await getQuote(items)
    indicativeQuotePaise = quote.totalPaise
  } catch (error) {
    console.error('[submitBooking] quote failed, booking unpriced', error)
  }

  const result = await createPickupWithItems({
    vendorId: userId,
    category: booking.category,
    addressId: booking.addressId,
    items,
    preferredDate: booking.preferredDate,
    // The customer states a PREFERRED date; `scheduledSlot` is the confirmed
    // slot and stays null until ops accept the request.
    scheduledSlot: null,
    notes: booking.notes ?? null,
    indicativeQuotePaise,
  })

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  redirect(`/submitted?id=${result.pickupId}`)
}
