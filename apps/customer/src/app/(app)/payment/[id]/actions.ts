'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentProfile } from '@clbipp/auth'
import { isCustomerPaymentMethod, settlePayment } from '@clbipp/core'

// ─── Payment server actions ──────────────────────────────────────────────────
// The app's half of the payments contract: resolve the session, hand the id
// down. `packages/core` deliberately does not authenticate (same rule as
// booking-actions), so this is where the caller's identity is established.
//
// ⚠ This is a POST form action, NOT something a page render calls. `/handover`
// mutates during a GET render and is the standing example of why that is wrong:
// a prefetch, a bot or a browser preload can trigger it with no user intent,
// and it had to be excluded from the smoke test as a result. Settling a payout
// is money moving — it gets an explicit submit or nothing.

export type PaymentActionState = { error: string | null }

export async function confirmPayout(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const current = await getCurrentProfile()
  if (!current?.profile) return { error: 'Your session expired. Please log in again.' }

  const pickupId = formData.get('pickupId')
  const method = formData.get('method')

  if (typeof pickupId !== 'string' || pickupId.length === 0) {
    return { error: 'Missing pickup reference.' }
  }

  // Validated against the CUSTOMER-selectable list, not the full schema enum:
  // `cash` is a thing an agent records on site, and accepting it from a form
  // would let someone mark their own payout complete without money moving.
  if (typeof method !== 'string' || !isCustomerPaymentMethod(method)) {
    return { error: 'Choose how you want to be paid.' }
  }

  const result = await settlePayment({
    pickupId,
    vendorId: current.user.id,
    method,
  })

  if (!result.ok) return { error: result.error }

  // The screen re-reads the payment, the wallet balance changed, and the
  // dashboard shows both — so refresh all three rather than just this page.
  revalidatePath(`/payment/${pickupId}`)
  revalidatePath('/wallet')
  revalidatePath('/dashboard')

  return { error: null }
}
