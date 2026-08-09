'use server'

import { redirect } from 'next/navigation'
import { signIn } from '@clbipp/auth'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const { error } = await signIn(email, password)
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  // TODO: redirect to /dashboard once Person B ships it. Until then the
  // /profile harness is the post-login landing so the auth loop is testable.
  redirect('/profile')
}
