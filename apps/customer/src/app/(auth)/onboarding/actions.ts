'use server'

import { redirect } from 'next/navigation'
import { createProfileForCurrentUser, signOut } from '@clbipp/auth'
import { onboardingFleetSchema, onboardingIndividualSchema } from '@clbipp/core'
import type { ZodError } from 'zod'

// Same posture as signup/actions.ts: surface the first problem only. These are
// short forms and a wall of red above one is worse than a single clear line.
function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? 'Please check the details you entered.'
}

function backToForm(type: 'individual' | 'fleet', message: string): never {
  redirect(`/onboarding?type=${type}&error=${encodeURIComponent(message)}`)
}

/**
 * Finishes an OAuth account by writing its profile row (Batch 11).
 *
 * Google hands us an auth.users row and nothing else, and the middleware's role
 * gate treats a session with no profile as half-created. This is the step that
 * makes it whole — and vendor_type is the reason it can't be skipped: it decides
 * which business fields and which KYC apply, and no provider collects it.
 *
 * Note what is NOT read from the form: the user id and the email. Both come from
 * the session inside createProfileForCurrentUser. `role` is never sent by
 * anyone — the database defaults it, and `authenticated` has no INSERT privilege
 * on the column (supabase/grants.sql).
 */
export async function completeOnboarding(formData: FormData) {
  const type = formData.get('vendorType') === 'fleet' ? 'fleet' : 'individual'

  const raw = {
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    companyName: formData.get('companyName'),
    eprRegId: formData.get('eprRegId'),
    gstNumber: formData.get('gstNumber'),
    panNumber: formData.get('panNumber'),
    businessAddress: formData.get('businessAddress'),
  }

  const parsed =
    type === 'fleet'
      ? onboardingFleetSchema.safeParse(raw)
      : onboardingIndividualSchema.safeParse(raw)

  if (!parsed.success) backToForm(type, firstIssue(parsed.error))

  const { error } = await createProfileForCurrentUser({
    ...parsed.data,
    vendorType: type,
  })
  if (error) backToForm(type, error.message)

  redirect('/dashboard')
}

/**
 * The escape hatch. Someone who signed in with the wrong Google account is
 * otherwise stuck: the middleware sends every route back here until a profile
 * exists, so without this the only way out is clearing cookies.
 */
export async function abandonOnboarding() {
  await signOut()
  redirect('/login')
}
