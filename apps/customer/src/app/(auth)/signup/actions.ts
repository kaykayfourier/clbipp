'use server'

import { redirect } from 'next/navigation'
import { signUpWithProfile } from '@clbipp/auth'
import { signupFleetSchema, signupIndividualSchema } from '@clbipp/core'
import type { ZodError } from 'zod'

// Surface only the first problem. These are short forms and the alternative is
// a wall of red above a form the user then has to scroll back down through.
function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? 'Please check the details you entered.'
}

// Individual signup: auth-complete minimum, no business fields.
export async function signupIndividual(formData: FormData) {
  const parsed = signupIndividualSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
  })
  if (!parsed.success) {
    redirect(`/signup/individual?error=${encodeURIComponent(firstIssue(parsed.error))}`)
  }

  const { error } = await signUpWithProfile({
    ...parsed.data,
    vendorType: 'individual',
  })
  if (error) {
    redirect(`/signup/individual?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/dashboard')
}

// Fleet signup: auth basics + business text fields written to the profile row.
// "Contact name" comes in as fullName (no separate contact_name column).
export async function signupFleet(formData: FormData) {
  const parsed = signupFleetSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    companyName: formData.get('companyName'),
    eprRegId: formData.get('eprRegId'),
    gstNumber: formData.get('gstNumber'),
    panNumber: formData.get('panNumber'),
    businessAddress: formData.get('businessAddress'),
  })
  if (!parsed.success) {
    redirect(`/signup/fleet?error=${encodeURIComponent(firstIssue(parsed.error))}`)
  }

  const { error } = await signUpWithProfile({
    ...parsed.data,
    vendorType: 'fleet',
  })
  if (error) {
    redirect(`/signup/fleet?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/dashboard')
}
