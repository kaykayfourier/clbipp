'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@clbipp/auth/server'
import { prisma, type AddressStatus } from '@clbipp/database'
import { addressSchema } from '@clbipp/core'

// ─── Address book — write path ───────────────────────────────────────────────
// `addresses` is the one new table the customer writes DIRECTLY: RLS grants the
// owner all four verbs (supabase/policies.sql), scoped `auth.uid() = profile_id`.
// We still write from a server action, and with Prisma, for one reason:
// ATOMICITY. "Exactly one default address per profile" is a two-statement
// invariant (clear the old default, set the new one) and a session-client write
// has no transaction — a failure between the two statements leaves the profile
// with zero defaults or two.
//
// The trade is that PRISMA BYPASSES RLS — it connects as the database owner, so
// none of those policies apply here. Ownership is therefore enforced in code:
// every query below is scoped by `profileId`, and every mutation uses
// `updateMany`/`deleteMany` with `{ id, profileId }` rather than a bare `id`,
// so a guessed address id from another user matches zero rows instead of
// mutating someone else's data. Same discipline as ../handover/actions.ts.

export type AddressActionResult = { error: string | null }

/** Resolves the caller from their own session cookie. Never trust a client-supplied id. */
async function requireUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

// ─── createAddress ───────────────────────────────────────────────────────────
// Form action for /addresses/new. On success it redirects; on failure it
// re-renders the form with ?error= so the customer doesn't lose what they typed
// to a thrown exception.
export async function createAddress(formData: FormData): Promise<void> {
  const profileId = await requireUserId()
  if (!profileId) redirect('/login')

  const parsed = addressSchema.safeParse({
    label: formData.get('label'),
    line1: formData.get('line1'),
    line2: formData.get('line2'),
    city: formData.get('city'),
    state: formData.get('state'),
    pincode: formData.get('pincode'),
    lat: formData.get('lat'),
    lng: formData.get('lng'),
    isDefault: formData.get('isDefault') === 'on',
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? 'Please check the address details.'
    redirect(`/addresses/new?error=${encodeURIComponent(first)}`)
  }

  const { lat, lng, isDefault, ...fields } = parsed.data

  // The first address a profile ever adds becomes the default whether or not
  // the box was ticked — otherwise the booking flow opens with nothing selected.
  const existingCount = await prisma.address.count({ where: { profileId } })
  const makeDefault = isDefault || existingCount === 0

  try {
    await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({
          where: { profileId, isDefault: true },
          data: { isDefault: false },
        })
      }

      await tx.address.create({
        data: {
          profileId,
          ...fields,
          // Decimal(10,7) columns — pass strings, not JS floats, so the value
          // that reaches Postgres is the one the browser reported.
          lat: lat === undefined ? null : lat.toString(),
          lng: lng === undefined ? null : lng.toString(),
          isDefault: makeDefault,
        },
      })
    })
  } catch (e) {
    console.error('[createAddress] failed:', e)
    redirect(`/addresses/new?error=${encodeURIComponent("Couldn't save that address. Try again.")}`)
  }

  revalidatePath('/addresses')
  revalidatePath('/dashboard')
  redirect('/addresses')
}

// ─── setDefaultAddress ───────────────────────────────────────────────────────
// Clear-then-set in one transaction, both halves scoped to the caller.
export async function setDefaultAddress(addressId: string): Promise<AddressActionResult> {
  const profileId = await requireUserId()
  if (!profileId) return { error: 'Not authenticated.' }

  try {
    const promoted = await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { profileId, isDefault: true },
        data: { isDefault: false },
      })

      // updateMany + profileId: another user's id matches nothing and the
      // count comes back 0, which we surface as "not found" rather than a
      // silent success.
      const { count } = await tx.address.updateMany({
        where: { id: addressId, profileId },
        data: { isDefault: true },
      })

      return count
    })

    if (promoted === 0) return { error: 'Address not found.' }
  } catch (e) {
    console.error('[setDefaultAddress] failed:', e)
    return { error: 'Could not update the default address.' }
  }

  revalidatePath('/addresses')
  revalidatePath('/dashboard')
  return { error: null }
}

// ─── updateAddressStatus ─────────────────────────────────────────────────────
// `not_operational` keeps the address on file but takes it out of the booking
// address picker — a depot that's closed, not one that's gone.
export async function updateAddressStatus(
  addressId: string,
  status: AddressStatus,
): Promise<AddressActionResult> {
  const profileId = await requireUserId()
  if (!profileId) return { error: 'Not authenticated.' }

  const { count } = await prisma.address.updateMany({
    where: { id: addressId, profileId },
    data: { status },
  })

  if (count === 0) return { error: 'Address not found.' }

  revalidatePath('/addresses')
  revalidatePath('/dashboard')
  return { error: null }
}

// ─── deleteAddress ───────────────────────────────────────────────────────────
// Deleting the default must promote a replacement, or the profile is left with
// addresses but no default and the booking address step preselects nothing.
export async function deleteAddress(addressId: string): Promise<AddressActionResult> {
  const profileId = await requireUserId()
  if (!profileId) return { error: 'Not authenticated.' }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const target = await tx.address.findFirst({
        where: { id: addressId, profileId },
        select: { id: true, isDefault: true },
      })

      if (!target) return 'not_found' as const

      // Pickup.addressId is a nullable FK with no cascade, so deleting an
      // address that a pickup already points at would orphan that pickup's
      // location history. Retire it instead of destroying the audit trail.
      const referencing = await tx.pickup.count({ where: { addressId, vendorId: profileId } })
      if (referencing > 0) return 'in_use' as const

      await tx.address.deleteMany({ where: { id: addressId, profileId } })

      if (target.isDefault) {
        const next = await tx.address.findFirst({
          where: { profileId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })

        if (next) {
          await tx.address.updateMany({
            where: { id: next.id, profileId },
            data: { isDefault: true },
          })
        }
      }

      return 'deleted' as const
    })

    if (outcome === 'not_found') return { error: 'Address not found.' }
    if (outcome === 'in_use') {
      return {
        error: "This address is used by a pickup, so it can't be deleted. Mark it not operational instead.",
      }
    }
  } catch (e) {
    console.error('[deleteAddress] failed:', e)
    return { error: 'Could not delete that address.' }
  }

  revalidatePath('/addresses')
  revalidatePath('/dashboard')
  return { error: null }
}
