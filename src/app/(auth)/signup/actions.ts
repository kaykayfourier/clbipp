'use server'

import { redirect } from 'next/navigation'
import { signUpWithProfile } from '@/lib/supabase/auth'

export async function signup(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '')
  // Only two valid values; coerce anything else to the minimal "individual".
  const vendorType = formData.get('vendorType') === 'fleet' ? 'fleet' : 'individual'

  const { error } = await signUpWithProfile({ email, password, fullName, vendorType })
  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/profile')
}
