'use server'

import { redirect } from 'next/navigation'
import { signUpWithProfile } from '@clbipp/auth'

// Individual signup: auth-complete minimum, no business fields.
export async function signupIndividual(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '')

  const { error } = await signUpWithProfile({
    email,
    password,
    fullName,
    vendorType: 'individual',
  })
  if (error) {
    redirect(`/signup/individual?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/profile')
}

// Fleet signup: auth basics + business text fields written to the profile row.
// "Contact name" comes in as fullName (no separate contact_name column).
export async function signupFleet(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '')
  const companyName = String(formData.get('companyName') ?? '')
  const eprRegId = String(formData.get('eprRegId') ?? '')
  const gstNumber = String(formData.get('gstNumber') ?? '')
  const panNumber = String(formData.get('panNumber') ?? '')
  const businessAddress = String(formData.get('businessAddress') ?? '')

  const { error } = await signUpWithProfile({
    email,
    password,
    fullName,
    vendorType: 'fleet',
    companyName,
    eprRegId,
    gstNumber,
    panNumber,
    businessAddress,
  })
  if (error) {
    redirect(`/signup/fleet?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/profile')
}
