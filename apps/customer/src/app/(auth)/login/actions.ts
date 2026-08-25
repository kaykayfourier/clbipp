'use server'

import { redirect } from 'next/navigation'
import { describeOtpError, sendEmailOtp, signIn } from '@clbipp/auth'
import { authCallbackUrl } from '../request-origin'

// Password login. Kept as the primary path deliberately: Supabase's built-in
// SMTP rate-limits at roughly 2–4 mails/hour, which is not enough to demo
// through, so OTP sits alongside this rather than replacing it (Plan v2 D2).
export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const { error } = await signIn(email, password)
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/dashboard')
}

// Passwordless login, step 1: mail a code, then hand off to /verify.
export async function requestOtp(formData: FormData) {
  const email = String(formData.get('otpEmail') ?? '').trim()
  if (!email) {
    redirect('/login?error=Enter+your+email+to+get+a+code.')
  }

  const { error } = await sendEmailOtp(email, await authCallbackUrl())
  if (error) {
    redirect(`/login?error=${encodeURIComponent(describeOtpError(error.message))}`)
  }

  redirect(`/verify?email=${encodeURIComponent(email)}`)
}
