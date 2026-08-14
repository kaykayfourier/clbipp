'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { signOut } from '@clbipp/auth'
import { createClient } from '@clbipp/auth/server'
import { normaliseIndianPhone } from '@clbipp/core'

export async function logout() {
  await signOut()
  redirect('/login')
}

// ─── updatePhone (Batch 10) ──────────────────────────────────────────────────
// The first customer-facing write to their own `profiles` row since signup.
//
// Deliberately goes through the SERVER SUPABASE CLIENT rather than Prisma,
// which is the opposite of the choice addresses/actions.ts made — and for the
// opposite reason. Addresses needed a transaction (the one-default invariant),
// so it took Prisma and re-enforced ownership in code. This is a single-column
// write with no invariant, and the thing worth keeping is the defence that
// Prisma would bypass: `supabase/grants.sql` revoked table-level UPDATE on
// `profiles` and re-granted it column by column. `phone` is on that allowlist;
// `role`, `kyc_status`, `wallet_balance_paise` and `phone_verified` are not.
// So even a bug here cannot escalate — the database refuses the column.
//
// `phone_verified` stays untouched on purpose: editing a number does not verify
// it, and it is not writable by `authenticated` anyway. It flips when SMS OTP
// exists (Plan v2 D2).

export type PhoneActionResult = { error: string | null; ok: boolean }

export async function updatePhone(
  _prev: PhoneActionResult,
  formData: FormData,
): Promise<PhoneActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const raw = formData.get('phone')
  const input = typeof raw === 'string' ? raw.trim() : ''

  // Clearing the field is a legitimate answer — phone is nullable and optional
  // at signup, so "I'd rather not give you one" has to stay expressible.
  let phone: string | null = null
  if (input !== '') {
    // The SAME normaliser signup uses, so a number saved here and one saved at
    // signup are stored in identical form (+91XXXXXXXXXX). Two formats for one
    // column is how a later SMS integration breaks on half the rows.
    phone = normaliseIndianPhone(input)
    if (phone === null) {
      return { error: 'Enter a valid 10-digit Indian mobile number.', ok: false }
    }
  }

  // RLS scopes this to the caller's own row; the eq() is belt-and-braces so the
  // statement is correct on its own terms rather than relying on the policy.
  const { error } = await supabase.from('profiles').update({ phone }).eq('id', user.id)

  if (error) {
    console.error('[profile] phone update failed:', error.message)
    return { error: 'Could not save that just now. Try again.', ok: false }
  }

  revalidatePath('/profile')
  return { error: null, ok: true }
}
